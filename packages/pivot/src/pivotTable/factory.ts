/**
 * @lynellf/tablekit-pivot/pivotTable — `createPivotTable` factory.
 *
 * The factory owns state and orchestration; aggregation semantics live behind
 * the `AggregationEngine` interface. Computes are cancellable so a slow engine
 * cannot replace a newer result after data, configuration, or engine changes.
 */

import { createMainThreadEngine } from '../engine';
import { rowPathKeyOf } from '../engine/treeBuilder';
import { buildPivotQuery } from '../serialize/query';
import type {
  AggregationEngine,
  Announcer,
  FieldRef,
  MaybePromise,
  PivotColumnNode,
  PivotConfig,
  PivotExpansionState,
  PivotLeafColumn,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  PivotSortingState,
  PivotTableInstance,
  PivotTableOptions,
  PivotTableState,
  Updater,
} from '../types';
import { DEFAULT_PIVOT_STATE } from '../types';
import { announceExpansion, announceSorting } from './announcer';
import { getHeaderRows } from './headerRows';
import {
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getTotalsColumnProps,
  getToggleExpandedProps as makeToggleExpandedProps,
} from './propGetters';
import { getVisibleRows } from './visibleRows';

const noopAnnouncer: Announcer = { announce: () => {} };

const isFieldRef = <TRow>(value: unknown): value is FieldRef<TRow> => {
  if (typeof value === 'string') return true;
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { field?: unknown }).field === 'string';
};

const normalizePivotConfig = <TRow>(value: PivotConfig<TRow>): PivotConfig<TRow> => {
  const config = value && typeof value === 'object' ? value : ({} as PivotConfig<TRow>);
  const rows = Array.isArray(config.rows)
    ? config.rows.filter((field): field is FieldRef<TRow> => isFieldRef<TRow>(field))
    : [];
  const columns = Array.isArray(config.columns)
    ? config.columns.filter((field): field is FieldRef<TRow> => isFieldRef<TRow>(field))
    : [];
  const measures = Array.isArray(config.measures)
    ? config.measures.filter(
        (measure): measure is PivotConfig<TRow>['measures'][number] =>
          !!measure && typeof measure === 'object' && typeof measure.id === 'string',
      )
    : [];
  const filters = Array.isArray(config.filters)
    ? config.filters.filter((filter) => filter !== null && filter !== undefined)
    : undefined;
  return {
    ...config,
    rows,
    columns,
    measures,
    ...(filters ? { filters } : {}),
  };
};

const sameFieldRef = (left: FieldRef<unknown>, right: FieldRef<unknown>): boolean => {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return (
    left.field === right.field &&
    left.accessor === right.accessor &&
    left.label === right.label &&
    left.sortComparator === right.sortComparator
  );
};

const samePivotConfig = (left: PivotConfig<unknown>, right: PivotConfig<unknown>): boolean => {
  if (left.rows.length !== right.rows.length || left.columns.length !== right.columns.length) {
    return false;
  }
  if (!left.rows.every((field, index) => sameFieldRef(field, right.rows[index]!))) return false;
  if (!left.columns.every((field, index) => sameFieldRef(field, right.columns[index]!)))
    return false;
  if (left.measures.length !== right.measures.length) return false;
  for (let index = 0; index < left.measures.length; index += 1) {
    const a = left.measures[index]!;
    const b = right.measures[index]!;
    if (
      a.id !== b.id ||
      a.field !== b.field ||
      a.accessor !== b.accessor ||
      a.aggregator !== b.aggregator ||
      a.label !== b.label ||
      a.format !== b.format
    ) {
      return false;
    }
  }
  const leftFilters = left.filters ?? [];
  const rightFilters = right.filters ?? [];
  if (leftFilters.length !== rightFilters.length) return false;
  if (
    !leftFilters.every((filter, index) => {
      const other = rightFilters[index];
      if (filter === other) return true;
      if (!filter || !other || typeof filter !== 'object' || typeof other !== 'object')
        return false;
      const leftPredicate = (filter as { predicate?: unknown }).predicate;
      const rightPredicate = (other as { predicate?: unknown }).predicate;
      if (leftPredicate || rightPredicate) return leftPredicate === rightPredicate;
      return JSON.stringify(filter) === JSON.stringify(other);
    })
  ) {
    return false;
  }
  const leftTotals = left.totals ?? {};
  const rightTotals = right.totals ?? {};
  return (
    leftTotals.grandTotalRow === rightTotals.grandTotalRow &&
    leftTotals.grandTotalColumn === rightTotals.grandTotalColumn &&
    leftTotals.grandTotalColumnPosition === rightTotals.grandTotalColumnPosition &&
    leftTotals.subtotals === rightTotals.subtotals
  );
};

const sameValue = (
  left: unknown,
  right: unknown,
  seen: Map<object, object> = new Map(),
): boolean => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftPrototype = Object.getPrototypeOf(left);
  const rightPrototype = Object.getPrototypeOf(right);
  if (leftPrototype !== rightPrototype) return false;
  const mapped = seen.get(left);
  if (mapped) return mapped === right;
  seen.set(left, right);
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index], seen));
  }
  if (leftPrototype !== Object.prototype && leftPrototype !== null) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const equal =
      Object.hasOwn(right, key) &&
      sameValue(left[key as keyof typeof left], right[key as keyof typeof right], seen);
    return equal;
  });
};

const sameData = <TRow>(left: TRow[], right: TRow[]): boolean => sameValue(left, right);

const emptyResult = <TRow>(): PivotResult<TRow> => ({
  columnRoot: { id: '[]', path: [], label: undefined, colSpan: 0, leaves: [] },
  leafColumns: [],
  rowRoot: {
    key: '[]',
    path: [],
    level: 0,
    label: undefined,
    hasChildren: false,
    childState: 'loaded',
    values: {},
    rowTotals: {},
  },
  grandTotals: {},
});

const isPromiseLike = <T>(value: MaybePromise<T>): value is Promise<T> =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as { then?: unknown }).then === 'function';

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const updateRowNode = <TRow>(
  node: PivotRowNode<TRow>,
  targetKey: string,
  update: (node: PivotRowNode<TRow>) => PivotRowNode<TRow>,
): { node: PivotRowNode<TRow>; found: boolean } => {
  if (node.key === targetKey) return { node: update(node), found: true };
  if (!node.children) return { node, found: false };

  let found = false;
  const children = node.children.map((child) => {
    if (found) return child;
    const updated = updateRowNode(child, targetKey, update);
    found = updated.found;
    return updated.node;
  });
  return found ? { node: { ...node, children }, found: true } : { node, found: false };
};

const removeNodeError = <TRow>(node: PivotRowNode<TRow>): PivotRowNode<TRow> => {
  const { error: _ignoredError, ...withoutError } = node;
  return withoutError;
};

const dispatchCallback = <T>(callback: Updater<T> | undefined, updater: Updater<T>): void => {
  (callback as ((value: Updater<T>) => void) | undefined)?.(updater);
};

const normalizePivotUpdater = <TRow>(
  updater: Updater<PivotConfig<TRow>>,
): Updater<PivotConfig<TRow>> =>
  typeof updater === 'function'
    ? (old) =>
        normalizePivotConfig((updater as (previous: PivotConfig<TRow>) => PivotConfig<TRow>)(old))
    : normalizePivotConfig(updater);

export const createPivotTable = <TRow>(
  options: PivotTableOptions<TRow>,
): PivotTableInstance<TRow> => {
  let currentOptions = options;
  let engine: AggregationEngine<TRow> = options.engine ?? createMainThreadEngine<TRow>();
  let announcer: Announcer = options.announcer ?? noopAnnouncer;
  let state: PivotTableState = {
    ...DEFAULT_PIVOT_STATE,
    ...(options.initialState ?? {}),
    pivot: normalizePivotConfig(resolvePivot(options)) as unknown as PivotTableState['pivot'],
  };
  if (options.state) state = { ...state, ...options.state };
  state = {
    ...state,
    pivot: normalizePivotConfig(
      state.pivot as unknown as PivotConfig<TRow>,
    ) as unknown as PivotTableState['pivot'],
  };

  const listeners = new Set<() => void>();
  let result = emptyResult<TRow>();
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let error: Error | undefined;
  let activeController: AbortController | null = null;
  let requestToken = 0;
  let disposed = false;

  function resolvePivot(opts: PivotTableOptions<TRow>): PivotConfig<TRow> {
    const configured =
      typeof opts.pivot === 'function' ? opts.pivot({ data: opts.data }) : opts.pivot;
    return normalizePivotConfig(configured);
  }

  const buildQuery = (): PivotQuery<TRow> =>
    buildPivotQuery(
      currentOptions.data,
      state.pivot as unknown as PivotConfig<TRow>,
      state.expanded,
      state.pivotSorting,
      (state.pivot as unknown as PivotConfig<TRow>).totals ?? {},
    );

  const emit = (): void => {
    // Result/status changes must invalidate useSyncExternalStore snapshots even
    // when no state slice changed.
    state = { ...state };
    for (const listener of listeners) listener();
  };

  const beginRequest = (): { controller: AbortController; token: number } => {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const token = ++requestToken;
    return { controller, token };
  };

  const requestCompute = (): void => {
    if (disposed) return;
    const { controller, token } = beginRequest();
    let computed: MaybePromise<PivotResult<TRow>>;
    try {
      computed = engine.compute(buildQuery(), { signal: controller.signal });
    } catch (cause) {
      if (token !== requestToken || disposed) return;
      activeController = null;
      status = 'error';
      error = toError(cause);
      emit();
      return;
    }

    if (isPromiseLike(computed)) {
      status = 'loading';
      error = undefined;
      emit();
      void Promise.resolve(computed).then(
        (nextResult) => {
          if (token !== requestToken || controller.signal.aborted || disposed) return;
          result = nextResult;
          status = 'success';
          error = undefined;
          activeController = null;
          emit();
        },
        (cause: unknown) => {
          if (token !== requestToken || controller.signal.aborted || disposed) return;
          status = 'error';
          error = toError(cause);
          activeController = null;
          emit();
        },
      );
      return;
    }

    if (token !== requestToken || controller.signal.aborted || disposed) return;
    result = computed;
    status = 'success';
    error = undefined;
    activeController = null;
    emit();
  };

  const requestChildren = (path: PivotRowNode<TRow>['path']): void => {
    if (disposed || !engine.computeChildren) {
      requestCompute();
      return;
    }

    const targetKey = rowPathKeyOf(path);
    const target = (() => {
      const visit = (node: PivotRowNode<TRow>): PivotRowNode<TRow> | undefined => {
        if (node.key === targetKey) return node;
        for (const child of node.children ?? []) {
          const found = visit(child);
          if (found) return found;
        }
        return undefined;
      };
      return visit(result.rowRoot);
    })();
    if (!target) {
      requestCompute();
      return;
    }

    const { controller, token } = beginRequest();
    let children: MaybePromise<PivotRowNode<TRow>[]>;
    try {
      children = engine.computeChildren(path, buildQuery(), { signal: controller.signal });
    } catch (cause) {
      if (token !== requestToken || disposed) return;
      activeController = null;
      const updated = updateRowNode(result.rowRoot, targetKey, (node) => ({
        ...node,
        childState: 'error',
        error: toError(cause),
      }));
      if (updated.found) result = { ...result, rowRoot: updated.node };
      status = 'error';
      error = toError(cause);
      emit();
      return;
    }

    const complete = (nextChildren: PivotRowNode<TRow>[]): void => {
      if (token !== requestToken || controller.signal.aborted || disposed) return;
      const updated = updateRowNode(result.rowRoot, targetKey, (node) =>
        removeNodeError({ ...node, children: nextChildren, childState: 'loaded' }),
      );
      if (!updated.found) {
        requestCompute();
        return;
      }
      result = { ...result, rowRoot: updated.node };
      status = 'success';
      error = undefined;
      activeController = null;
      emit();
    };

    if (isPromiseLike(children)) {
      const loading = updateRowNode(result.rowRoot, targetKey, (node) =>
        removeNodeError({ ...node, childState: 'loading' }),
      );
      if (loading.found) result = { ...result, rowRoot: loading.node };
      status = 'loading';
      error = undefined;
      emit();
      void Promise.resolve(children).then(complete, (cause: unknown) => {
        if (token !== requestToken || controller.signal.aborted || disposed) return;
        const updated = updateRowNode(result.rowRoot, targetKey, (node) => ({
          ...node,
          childState: 'error',
          error: toError(cause),
        }));
        if (updated.found) result = { ...result, rowRoot: updated.node };
        status = 'error';
        error = toError(cause);
        activeController = null;
        emit();
      });
    } else {
      complete(children);
    }
  };

  const commitLocalState = (next: PivotTableState, compute = true): void => {
    if (Object.is(state, next)) return;
    state = next;
    dispatchCallback(currentOptions.onStateChange, next);
    if (compute) requestCompute();
    else emit();
  };

  const setPivot = (updater: Updater<PivotConfig<TRow>>): void => {
    if (currentOptions.state && 'pivot' in currentOptions.state) {
      dispatchCallback(currentOptions.onPivotChange, normalizePivotUpdater(updater));
      return;
    }
    const previous = state.pivot as unknown as PivotConfig<TRow>;
    const next = normalizePivotConfig(
      typeof updater === 'function'
        ? (updater as (old: PivotConfig<TRow>) => PivotConfig<TRow>)(previous)
        : updater,
    );
    if (Object.is(previous, next)) return;
    commitLocalState({ ...state, pivot: next as unknown as PivotTableState['pivot'] });
  };

  const setExpanded = (updater: Updater<PivotExpansionState>): void => {
    if (currentOptions.state && 'expanded' in currentOptions.state) {
      dispatchCallback(currentOptions.onExpandedChange, updater);
      return;
    }
    const previous = state.expanded;
    const next =
      typeof updater === 'function'
        ? (updater as (old: PivotExpansionState) => PivotExpansionState)(previous)
        : updater;
    if (Object.is(previous, next)) return;
    commitLocalState({ ...state, expanded: next });
  };

  const toggleExpanded = (path: PivotRowNode['path']): void => {
    const key = rowPathKeyOf(path);
    const wasExpanded = state.expanded[key] === true;
    const nextExpanded: PivotExpansionState = { ...state.expanded, [key]: !wasExpanded };
    if (currentOptions.state && 'expanded' in currentOptions.state) {
      dispatchCallback(currentOptions.onExpandedChange, nextExpanded);
    } else {
      state = { ...state, expanded: nextExpanded };
      dispatchCallback(currentOptions.onStateChange, state);
      if (!wasExpanded && engine.computeChildren) requestChildren(path);
      else requestCompute();
    }
    announceExpansion(announcer, path, wasExpanded, null);
  };

  const setPivotSorting = (updater: Updater<PivotSortingState>): void => {
    if (currentOptions.state && 'pivotSorting' in currentOptions.state) {
      dispatchCallback(currentOptions.onPivotSortingChange, updater);
      return;
    }
    const previous = state.pivotSorting;
    const next =
      typeof updater === 'function'
        ? (updater as (old: PivotSortingState) => PivotSortingState)(previous)
        : updater;
    if (Object.is(previous, next)) return;
    state = { ...state, pivotSorting: next };
    dispatchCallback(currentOptions.onStateChange, state);
    announceSorting(announcer, next);
    requestCompute();
  };

  const setOptions = (next: PivotTableOptions<TRow>): void => {
    if (disposed) return;
    const previousOptions = currentOptions;
    const previousState = state;
    const previousEngine = engine;
    currentOptions = next;
    announcer = next.announcer ?? noopAnnouncer;

    const nextEngine =
      next.engine ??
      (previousOptions.engine === undefined ? engine : createMainThreadEngine<TRow>());
    const engineChanged = nextEngine !== previousEngine;
    if (engineChanged) {
      activeController?.abort();
      requestToken += 1;
      previousEngine.dispose?.();
      engine = nextEngine;
    }

    const resolvedPivot = resolvePivot(next);
    const previousPivot = previousState.pivot as unknown as PivotConfig<TRow>;
    const effectivePivot = samePivotConfig(
      previousPivot as unknown as PivotConfig<unknown>,
      resolvedPivot as unknown as PivotConfig<unknown>,
    )
      ? previousPivot
      : resolvedPivot;
    let nextState: PivotTableState = {
      ...state,
      pivot: effectivePivot as unknown as PivotTableState['pivot'],
    };
    if (!next.state && previousOptions.state && 'pivot' in previousOptions.state) {
      nextState = { ...nextState, pivot: previousState.pivot };
    }
    if (next.state) nextState = { ...nextState, ...next.state };
    if (nextState.pivot) {
      const normalizedPivot = normalizePivotConfig(nextState.pivot as unknown as PivotConfig<TRow>);
      nextState = {
        ...nextState,
        pivot: samePivotConfig(
          previousPivot as unknown as PivotConfig<unknown>,
          normalizedPivot as unknown as PivotConfig<unknown>,
        )
          ? previousState.pivot
          : (normalizedPivot as unknown as PivotTableState['pivot']),
      };
    }

    const stateChanged = (Object.keys(DEFAULT_PIVOT_STATE) as Array<keyof PivotTableState>).some(
      (key) => !Object.is(previousState[key], nextState[key]),
    );
    if (stateChanged) state = nextState;

    const dataChanged = !sameData(previousOptions.data, next.data);
    const pivotChanged = !Object.is(previousState.pivot, nextState.pivot);
    const expandedChanged = !Object.is(previousState.expanded, nextState.expanded);
    const sortingChanged = !Object.is(previousState.pivotSorting, nextState.pivotSorting);
    if (engineChanged || dataChanged || pivotChanged || expandedChanged || sortingChanged) {
      requestCompute();
    } else if (stateChanged) {
      emit();
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    activeController?.abort();
    requestToken += 1;
    activeController = null;
    engine.dispose?.();
    listeners.clear();
  };

  const instance: PivotTableInstance<TRow> = {
    getState: () => state,
    setOptions,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getResult: () => result,
    getStatus: () => status,
    getError: () => error,
    getVisibleRows: () => getVisibleRows(result.rowRoot, state.expanded),
    getHeaderRows: () => getHeaderRows(result.columnRoot),
    getLeafColumns: () => result.leafColumns,
    setPivot,
    setExpanded,
    toggleExpanded,
    setPivotSorting,
    announce: (message: string, politeness?: 'polite' | 'assertive') =>
      announcer.announce(message, politeness),
    dispose,
    getGridProps: (consumerProps?: Record<string, unknown>) =>
      getGridProps(consumerProps, state, result),
    getBodyProps: (consumerProps?: Record<string, unknown>) =>
      getBodyProps(consumerProps, state, result),
    getRowProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      getRowProps(row, consumerProps, state),
    getRowHeaderProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      getRowHeaderProps(row, consumerProps),
    getHeaderProps: (
      node: PivotColumnNode | PivotLeafColumn,
      consumerProps?: Record<string, unknown>,
    ) => getHeaderProps(node, consumerProps),
    getToggleExpandedProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      makeToggleExpandedProps(row, consumerProps, toggleExpanded),
    getFooterProps: (consumerProps?: Record<string, unknown>): Record<string, unknown> | null =>
      getFooterProps(consumerProps, state, result),
    getTotalsColumnProps: (leaf: PivotLeafColumn<TRow>, consumerProps?: Record<string, unknown>) =>
      getTotalsColumnProps(leaf, consumerProps),
  };

  requestCompute();
  return instance;
};
