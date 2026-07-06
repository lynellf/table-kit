/**
 * @lynellf/tablekit-pivot/pivotTable — `createPivotTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, plus pivot-specific accessors (`getResult`, `getVisibleRows`,
 * `getHeaderRows`, `getLeafColumns`) and treegrid prop getters.
 *
 * State slices (controlled/uncontrolled per slice):
 *  - pivot (PivotConfig)
 *  - expanded (Record<RowPathKey, boolean>)
 *  - pivotSorting (PivotSortingState)
 *  - columnPinning, columnSizing, columnSizingInfo, focusedCell (shared with DataTable)
 *
 * Uses the M4-widened state helpers from core.
 */

import { createMainThreadEngine } from '../engine';
import { buildPivotResult } from '../engine/treeBuilder';
import type {
  AggregationEngine,
  Announcer,
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

export const createPivotTable = <TRow>(
  options: PivotTableOptions<TRow>,
): PivotTableInstance<TRow> => {
  const _engine: AggregationEngine<TRow> = options.engine ?? createMainThreadEngine<TRow>();
  const announcer: Announcer = options.announcer ?? { announce: () => {} };

  // ─── Initial state ─────────────────────────────────────────────────────
  const resolvePivot = (opts: PivotTableOptions<TRow>): PivotConfig<TRow> => {
    if (typeof opts.pivot === 'function') return opts.pivot({ data: opts.data });
    return opts.pivot;
  };

  const initialPivot = resolvePivot(options);
  let state: PivotTableState = {
    ...DEFAULT_PIVOT_STATE,
    ...(options.initialState ?? {}),
    pivot: initialPivot as PivotConfig<unknown>,
  };
  if (options.state) {
    state = { ...state, ...options.state };
  }

  const listeners = new Set<() => void>();
  let suppressNotify = false;

  // ─── Engine query builder ──────────────────────────────────────────────
  const buildQuery = (): PivotQuery<TRow> => {
    const rowsFieldRef =
      state.pivot.rows.length > 0
        ? state.pivot.rows.map((r) => ({
            field: typeof r === 'string' ? r : (r as { field: string }).field,
          }))
        : [];
    const colsFieldRef =
      state.pivot.columns.length > 0
        ? state.pivot.columns.map((c) => ({
            field: typeof c === 'string' ? c : (c as { field: string }).field,
          }))
        : [];
    return {
      rows: options.data,
      rowsFieldRef,
      columnsFieldRef: colsFieldRef,
      measures: state.pivot.measures.map((m) => ({
        id: m.id,
        ...(m.field !== undefined ? { field: m.field } : {}),
        aggregator: typeof m.aggregator === 'string' ? m.aggregator : 'sum',
        ...(m.label !== undefined ? { label: m.label } : {}),
        ...(m.format !== undefined ? { format: m.format } : {}),
      })),
      filters: [],
      totals: state.pivot.totals ?? {},
      expandedPaths: Object.keys(state.expanded).filter((k) => state.expanded[k] === true),
      pivotSorting: state.pivotSorting,
    };
  };

  // ─── Derived accessors ────────────────────────────────────────────────
  let result: PivotResult<TRow> = buildPivotResult(buildQuery());

  const refreshResult = (): void => {
    result = buildPivotResult(buildQuery());
  };

  // ─── Notification ─────────────────────────────────────────────────────
  const notify = (): void => {
    if (suppressNotify) return;
    refreshResult();
    for (const listener of listeners) listener();
  };

  // ─── Slice dispatchers ─────────────────────────────────────────────────
  const setPivot = (updater: Updater<PivotConfig<TRow>>): void => {
    if (options.state && 'pivot' in options.state) {
      (options.onPivotChange as (u: Updater<PivotConfig<TRow>>) => void)?.(updater);
      return;
    }
    const prev = state.pivot;
    const next = (
      typeof updater === 'function'
        ? (updater as (old: PivotConfig<TRow>) => PivotConfig<TRow>)(prev)
        : updater
    ) as PivotConfig<unknown>;
    if (Object.is(prev, next)) return;
    state = { ...state, pivot: next };
    notify();
  };

  const setExpanded = (updater: Updater<PivotExpansionState>): void => {
    if (options.state && 'expanded' in options.state) {
      (options.onExpandedChange as (u: Updater<PivotExpansionState>) => void)?.(updater);
      return;
    }
    const prev = state.expanded;
    const next =
      typeof updater === 'function'
        ? (updater as (old: PivotExpansionState) => PivotExpansionState)(prev)
        : updater;
    if (Object.is(prev, next)) return;
    state = { ...state, expanded: next };
    notify();
  };

  const toggleExpanded = (path: PivotRowNode['path']): void => {
    const key = JSON.stringify(path);
    const wasExpanded = state.expanded[key] === true;
    const next: PivotExpansionState = { ...state.expanded, [key]: !wasExpanded };
    setExpanded(next);
    // Announcer: report the new state.
    if (wasExpanded) {
      announceExpansion(announcer, path, true, null);
    } else {
      // Expanding: count children via computeChildren.
      // Note: main-thread engine returns synchronously; worker/server may return Promise.
      // For announcement purposes, we just report the expansion without child count.
      announceExpansion(announcer, path, false, null);
    }
  };

  const setPivotSorting = (updater: Updater<PivotSortingState>): void => {
    if (options.state && 'pivotSorting' in options.state) {
      (options.onPivotSortingChange as (u: Updater<PivotSortingState>) => void)?.(updater);
      return;
    }
    const prev = state.pivotSorting;
    const next =
      typeof updater === 'function'
        ? (updater as (old: PivotSortingState) => PivotSortingState)(prev)
        : updater;
    if (Object.is(prev, next)) return;
    state = { ...state, pivotSorting: next };
    announceSorting(announcer, next);
    notify();
  };

  const announce = (message: string, politeness?: 'polite' | 'assertive'): void => {
    announcer.announce(message, politeness);
  };

  // ─── Public surface ─────────────────────────────────────────────────
  return {
    getState: () => state,
    setOptions: (next: PivotTableOptions<TRow>) => {
      suppressNotify = true;
      const prevPivot = state.pivot;
      const nextPivot = resolvePivot(next);
      state = {
        ...DEFAULT_PIVOT_STATE,
        ...(next.initialState ?? {}),
        pivot: nextPivot as PivotConfig<unknown>,
      };
      if (next.state) {
        state = { ...state, ...next.state };
      }
      suppressNotify = false;
      if (!Object.is(prevPivot, nextPivot) || options.data !== next.data) {
        notify();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getResult: () => result,
    getVisibleRows: () => getVisibleRows(result.rowRoot, state.expanded),
    getHeaderRows: () => getHeaderRows(result.columnRoot),
    getLeafColumns: () => result.leafColumns,

    setPivot,
    setExpanded,
    toggleExpanded,
    setPivotSorting,
    announce,

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
};
