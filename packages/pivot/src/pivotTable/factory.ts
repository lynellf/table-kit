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
  CellPosition,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  FieldRef,
  MaybePromise,
  OnChangeFn,
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

// R5-PIVOT-GLOBAL-006: Module-level global announcer for direct pivot consumers.
// This mirrors the pattern in @lynellf/tablekit-core/announcer.
// When ReactAnnouncer sets the global via setGlobalAnnouncer, direct pivot consumers
// (without the React hook) also benefit from announcements.
// Exported for test setup; consumers should use setGlobalPivotAnnouncer.
let _globalPivotAnnouncer: Announcer = noopAnnouncer;
export const setGlobalPivotAnnouncer = (a: Announcer): void => {
  _globalPivotAnnouncer = a;
};
const getGlobalPivotAnnouncer = (): Announcer => _globalPivotAnnouncer;

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

// R4-IDENTITY-008 fix: Removed recursive sameValue/sameData deep comparison.
// Data identity is reference-based by default per spec. For mutable data with version
// tokens, version token comparison will be added separately. No deep row equality.

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

const dispatchCallback = <T>(callback: OnChangeFn<T> | undefined, updater: Updater<T>): void => {
  callback?.(updater);
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
  // R5-PIVOT-GLOBAL-006 fix: Use explicit instance announcer first, getGlobalPivotAnnouncer only
  // when no instance announcer is supplied. This matches DataTable's announcer ownership
  // contract and allows direct pivot consumers to rely on the permitted global fallback.
  let announcer: Announcer = options.announcer ?? getGlobalPivotAnnouncer();
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

  // F0.3: Implement inert pivot state slices.
  // These slices were declared in PivotTableState but lacked complete setters.

  const setColumnPinning = (updater: Updater<ColumnPinningState>): void => {
    // R4-CALLBACK-006 fix: Determine controlledness by own-property presence in options.state.
    // - controlled+dedicated: dispatch raw updater only through dedicated callback
    // - controlled+missing: do NOT mutate local state or synthesize whole-state updater
    // - uncontrolled+dedicated: update local state AND notify dedicated callback with raw updater
    // - uncontrolled+aggregate: update local state AND notify onStateChange
    const isControlled =
      currentOptions.state &&
      Object.prototype.hasOwnProperty.call(currentOptions.state, 'columnPinning');

    if (isControlled) {
      // Controlled slice: only dispatch to dedicated callback, do not mutate local state
      if (currentOptions.onColumnPinningChange) {
        dispatchCallback(currentOptions.onColumnPinningChange, updater);
      }
      // If no dedicated callback, silently do nothing (controlled consumer must provide callback)
      return;
    }

    // Uncontrolled: apply locally
    const previous = state.columnPinning;
    const next =
      typeof updater === 'function'
        ? (updater as (old: ColumnPinningState) => ColumnPinningState)(previous)
        : updater;
    if (Object.is(previous, next)) return;

    // R4 fix: Notify dedicated callback with the RAW updater (not the resolved value)
    // so the observer receives functional-updater identity preservation.
    if (currentOptions.onColumnPinningChange) {
      dispatchCallback(currentOptions.onColumnPinningChange, updater);
    }
    // Always notify aggregate onStateChange for uncontrolled slices
    commitLocalState({ ...state, columnPinning: next });
  };

  const setColumnSizing = (updater: Updater<ColumnSizingState>): void => {
    // R4-CALLBACK-006 fix: Same controlledness logic as setColumnPinning.
    const isControlled =
      currentOptions.state &&
      Object.prototype.hasOwnProperty.call(currentOptions.state, 'columnSizing');

    if (isControlled) {
      if (currentOptions.onColumnSizingChange) {
        dispatchCallback(currentOptions.onColumnSizingChange, updater);
      }
      return;
    }

    const previous = state.columnSizing;
    const next =
      typeof updater === 'function'
        ? (updater as (old: ColumnSizingState) => ColumnSizingState)(previous)
        : updater;
    if (Object.is(previous, next)) return;

    if (currentOptions.onColumnSizingChange) {
      dispatchCallback(currentOptions.onColumnSizingChange, updater);
    }
    commitLocalState({ ...state, columnSizing: next });
  };

  const setColumnSizingInfo = (updater: Updater<ColumnResizeSession | null>): void => {
    // R4-CALLBACK-006 fix: Same controlledness logic as setColumnPinning.
    const isControlled =
      currentOptions.state &&
      Object.prototype.hasOwnProperty.call(currentOptions.state, 'columnSizingInfo');

    if (isControlled) {
      if (currentOptions.onColumnSizingInfoChange) {
        dispatchCallback(currentOptions.onColumnSizingInfoChange, updater);
      }
      return;
    }

    const previous = state.columnSizingInfo;
    const next =
      typeof updater === 'function'
        ? (updater as (old: ColumnResizeSession | null) => ColumnResizeSession | null)(previous)
        : updater;
    if (Object.is(previous, next)) return;

    // R4 fix: Notify dedicated callback with the RAW updater (not the resolved value)
    if (currentOptions.onColumnSizingInfoChange) {
      dispatchCallback(currentOptions.onColumnSizingInfoChange, updater);
    }
    commitLocalState({ ...state, columnSizingInfo: next });
  };

  // F0.3: Resize session command methods.
  // These provide a higher-level API for resize interactions.

  const startResize = (columnId: string, startSize: number): void => {
    const session: ColumnResizeSession = {
      columnId,
      startSize,
      delta: 0,
      mode: 'onChange',
    };
    setColumnSizingInfo(session);
  };

  // R4 fix: In controlled mode, read the session from controlled options, not local state.
  // This ensures commands work correctly when parent doesn't synchronously re-render.
  const getEffectiveColumnSizingInfo = (): ColumnResizeSession | null | undefined => {
    const isControlled =
      currentOptions.state &&
      Object.prototype.hasOwnProperty.call(currentOptions.state, 'columnSizingInfo');
    return isControlled ? currentOptions.state?.columnSizingInfo : state.columnSizingInfo;
  };

  const adjustResize = (delta: number): void => {
    const session = getEffectiveColumnSizingInfo();
    if (!session) return;
    setColumnSizingInfo({
      ...session,
      delta,
      mode: 'onChange',
    });
  };

  const commitResize = (): void => {
    const session = getEffectiveColumnSizingInfo();
    if (!session) return;
    const { columnId, startSize, delta } = session;
    const newWidth = Math.max(0, startSize + delta);
    // Update columnSizing with the new width
    setColumnSizing((prev) => ({ ...prev, [columnId]: newWidth }));
    // Clear the resize session
    setColumnSizingInfo(null);
  };

  const cancelResize = (): void => {
    const session = getEffectiveColumnSizingInfo();
    if (!session) return;
    setColumnSizingInfo(null);
  };

  const setFocusedCell = (updater: Updater<CellPosition | null>): void => {
    // R4-CALLBACK-006 fix: Same controlledness logic as setColumnPinning.
    const isControlled =
      currentOptions.state &&
      Object.prototype.hasOwnProperty.call(currentOptions.state, 'focusedCell');

    if (isControlled) {
      if (currentOptions.onFocusedCellChange) {
        dispatchCallback(currentOptions.onFocusedCellChange, updater);
      }
      return;
    }

    const previous = state.focusedCell;
    const next =
      typeof updater === 'function'
        ? (updater as (old: CellPosition | null) => CellPosition | null)(previous)
        : updater;
    if (Object.is(previous, next)) return;

    if (currentOptions.onFocusedCellChange) {
      dispatchCallback(currentOptions.onFocusedCellChange, updater);
    }
    commitLocalState({ ...state, focusedCell: next });
  };

  const setOptions = (next: PivotTableOptions<TRow>): void => {
    if (disposed) return;
    const previousOptions = currentOptions;
    const previousState = state;
    const previousEngine = engine;

    // R5-PIVOT-GLOBAL-006 fix: Use instance announcer first, global as fallback.
    announcer = next.announcer ?? getGlobalPivotAnnouncer();

    // Determine the engine to use:
    // - If next.options explicitly provides an engine, use it
    // - Otherwise, preserve the engine from previousOptions if it had one
    // - Otherwise, create a new default engine
    const explicitEngine = next.engine;
    const inheritedEngine = previousOptions.engine;
    const nextEngine =
      explicitEngine ?? (inheritedEngine !== undefined ? engine : createMainThreadEngine<TRow>());
    const engineChanged = nextEngine !== previousEngine;
    if (engineChanged) {
      activeController?.abort();
      requestToken += 1;
      previousEngine.dispose?.();
      engine = nextEngine;
    }

    // Update currentOptions to include the resolved engine.
    // This ensures subsequent setOptions calls that don't specify engine
    // can inherit the existing engine rather than creating a new one.
    currentOptions = explicitEngine ? next : { ...next, engine };

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

    // R4-IDENTITY-008 fix: Use reference comparison instead of deep equality.
    // Same reference = no change; different reference = changed (triggers recompute).
    const dataChanged = previousOptions.data !== next.data;
    // R4-R7 fix: Resolve dataVersion token for proper comparison.
    // Compare resolved tokens, not object references, to support getVersion patterns.
    const resolveDataVersion = (dv: unknown, data: TRow[]): string | number | undefined => {
      if (!dv) return undefined;
      const version = dv as {
        version?: string | number;
        getVersion?: (data: TRow[]) => string | number;
      };
      if (version.getVersion) {
        return version.getVersion(data);
      }
      return version.version;
    };
    const prevVersion = resolveDataVersion(previousOptions.dataVersion, previousOptions.data);
    const nextVersion = resolveDataVersion(next.dataVersion, next.data);
    const dataVersionChanged = prevVersion !== nextVersion && !Object.is(prevVersion, nextVersion);
    const pivotChanged = !Object.is(previousState.pivot, nextState.pivot);
    const expandedChanged = !Object.is(previousState.expanded, nextState.expanded);
    const sortingChanged = !Object.is(previousState.pivotSorting, nextState.pivotSorting);
    if (
      engineChanged ||
      dataChanged ||
      dataVersionChanged ||
      pivotChanged ||
      expandedChanged ||
      sortingChanged
    ) {
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
    getLeafColumns: () => {
      // R4-LEAF-007: Apply columnSizing widths and derive effective pinning.
      // 1. Consult state.columnPinning for explicit left/right membership
      // 2. Total columns default to 'right' unless explicitly overridden
      // 3. Add cumulative pinned offsets (0 for first pinned, sum of preceding widths)
      // 4. No engine result mutation

      const leftPinned = new Set(state.columnPinning.left);
      const rightPinned = new Set(state.columnPinning.right);

      // First pass: determine effective pinned side for each leaf
      const leafPinnedSides = result.leafColumns.map((leaf) => {
        // Explicit state pinning takes precedence for ordinary leaves
        if (leftPinned.has(leaf.id)) return 'left' as const;
        if (rightPinned.has(leaf.id)) return 'right' as const;
        // Total columns default to 'right' unless explicitly set
        if (leaf.isTotal) return leaf.pinned ?? 'right';
        // Ordinary leaves with no explicit pinning remain unpinned
        return leaf.pinned;
      });

      // Second pass: compute cumulative pinned offsets.
      // For LEFT-pinned columns: offset is the sum of widths of all preceding
      // left-pinned columns in leaf order (first left-pinned = 0, next = width of first, etc.)
      //
      // For RIGHT-pinned columns (R4 fix): offset is accumulated from the RIGHT EDGE
      // in pin-array order. The rightmost column gets offset 0, the next rightmost
      // gets the width of the rightmost, etc.
      // We need to include ALL effective right-pinned leaves (including default-right totals).
      const result2: Array<PivotLeafColumn<TRow>> = [];
      let leftOffset = 0;

      // Build ordered list of ALL effective right-pinned leaves.
      // This includes: explicit state.columnPinning.right members + default-right total leaves.
      // State pin-array order is preserved for explicit members.
      const explicitRightIds = new Set(state.columnPinning.right);
      const allRightPinned: string[] = [...state.columnPinning.right];
      // Add default-right total leaves not already in the state pin array
      for (let i = 0; i < result.leafColumns.length; i++) {
        const leaf = result.leafColumns[i]!;
        const pinned = leafPinnedSides[i];
        if (pinned === 'right' && !explicitRightIds.has(leaf.id)) {
          allRightPinned.push(leaf.id);
        }
      }

      // Compute right offsets: iterate the combined list in REVERSE order (right edge first)
      const rightOffsets = new Map<string, number>();
      let rightAccumulator = 0;
      // Process from LAST (rightmost) to FIRST
      for (let i = allRightPinned.length - 1; i >= 0; i--) {
        const colId = allRightPinned[i]!;
        // Find the leaf width
        const leaf = result.leafColumns.find((l) => l.id === colId);
        const width = leaf ? (state.columnSizing[leaf.id] ?? leaf.size) : 0;
        rightOffsets.set(colId, rightAccumulator);
        rightAccumulator += width;
      }

      for (let i = 0; i < result.leafColumns.length; i++) {
        const leaf = result.leafColumns[i]!;
        const pinned = leafPinnedSides[i];
        const width = state.columnSizing[leaf.id] ?? leaf.size;

        // Use exact-optional-property semantics: only include pinned/pinnedOffset if defined
        const result3: PivotLeafColumn<TRow> = {
          id: leaf.id,
          path: leaf.path,
          measureId: leaf.measureId,
          isTotal: leaf.isTotal,
          size: width,
          header: leaf.header,
        };
        if (pinned !== undefined) {
          let pinnedOffset: number;
          if (pinned === 'left') {
            pinnedOffset = leftOffset;
            leftOffset += width;
          } else {
            // R4 fix: Use the precomputed right-edge offset from pin-array order
            pinnedOffset = rightOffsets.get(leaf.id) ?? 0;
          }
          result3.pinned = pinned;
          result3.pinnedOffset = pinnedOffset;
        }
        result2.push(result3);
      }

      return result2;
    },
    setPivot,
    setExpanded,
    toggleExpanded,
    retryRow: requestChildren,
    retry: requestCompute,
    setPivotSorting,
    // F0.3: Implemented previously inert pivot state slices.
    setColumnPinning,
    setColumnSizing,
    setColumnSizingInfo,
    // F0.3: Resize session command methods.
    startResize,
    adjustResize,
    commitResize,
    cancelResize,
    setFocusedCell,
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
      makeToggleExpandedProps(row, consumerProps, toggleExpanded, state.expanded[row.key] === true),
    getFooterProps: (consumerProps?: Record<string, unknown>): Record<string, unknown> | null =>
      getFooterProps(consumerProps, state, result),
    getTotalsColumnProps: (leaf: PivotLeafColumn<TRow>, consumerProps?: Record<string, unknown>) =>
      getTotalsColumnProps(leaf, consumerProps),
  };

  requestCompute();
  return instance;
};
