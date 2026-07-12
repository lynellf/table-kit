/**
 * @lynellf/tablekit-react — React adapter.
 *
 * M1 public surface:
 *   - useDataTable hook (M0; now returns Announcer too)
 *   - ReactAnnouncer component (M1)
 *   - getReactAnnouncer() (M1)
 *   - Core type/value re-exports (so consumers can import from one place)
 */

export type { ReactElement } from 'react';

// ─── Virtualization hooks (M2 Phase 4) ─────────────────────────────────────
export { useScrollAdapter } from './useScrollAdapter';
export { useSizeObserver } from './useSizeObserver';
export type { SizeObserverOptions } from './useSizeObserver';
export { useRowVirtualizer } from './useRowVirtualizer';
export { useCenterVirtualizer } from './useCenterVirtualizer';

// ─── Resize hook (M2 Phase 3) ──────────────────────────────────────────────
export { useResizeHandle } from './useResizeHandle';

// ─── Keyboard nav hook (M2 Phase 5) ─────────────────────────────────────────
export { useKeyboardNav } from './useKeyboardNav';

// ─── Tab behavior (M6 Phase 2) ─────────────────────────────────────────────
export { useTabBehavior } from './useTabBehavior';

export const VERSION = '2.0.0' as const;

// ─── Hook ───────────────────────────────────────────────────────────────────
export { useDataTable } from './useDataTable';
export type { UseDataTableResult, UseDataTableOptions } from './useDataTable';

// ─── DataSource (M3 phase 3) ─────────────────────────────────────────────────
export { useDataSource } from './useDataSource';
export type { UseDataSourceResult } from './useDataSource';

// ─── Announcer (M1) ───────────────────────────────────────────────────────
// R5 fix: ReactAnnouncerProps is exported for useDataTable to pass the announcer prop
export { ReactAnnouncer } from './ReactAnnouncer';
export type { ReactAnnouncerProps } from './ReactAnnouncer';

// ─── Pivot (M4) ────────────────────────────────────────────────────────────
export { usePivotTable } from './usePivotTable';
export type { UsePivotTableOptions, UsePivotTableResult } from './usePivotTable';

export { resolveTreegridKeyAction, applyTreegridAction } from './usePivotKeyboardNav';
export type { PivotKeyboardAction } from './usePivotKeyboardNav';

// Re-export the pivot surface so consumers can import from one place.
export {
  VERSION as PIVOT_VERSION,
  createPivotTable,
  sumAggregator,
  countAggregator,
  minAggregator,
  maxAggregator,
  avgAggregator,
  builtInAggregators,
  getAggregator,
  registerAggregator,
  nameOfAggregator,
} from '@lynellf/tablekit-pivot';

export type {
  Aggregator,
  DEFAULT_PIVOT_STATE,
  FieldValue,
  RowPathKey,
  LeafColumnId,
  MeasureId,
  FieldRef,
  MeasureDef,
  PivotFilter,
  TotalsConfig,
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  PivotTableState,
  PivotQuery,
  PivotResult,
  PivotTableStatus,
  PivotRowNode,
  PivotColumnNode,
  PivotLeafColumn,
  AggregationEngine,
  PivotTableInstance,
  PivotTableOptions,
} from '@lynellf/tablekit-pivot';

// ─── i18n (M6 Phase 1) ──────────────────────────────────────────────────────
// Re-export defaultMessages so consumers can inspect keys and copy for override.
export { defaultMessages } from './messages';
export type { AnnouncerKey, MessagesMap } from './messages';

// ─── Re-export core surface for consumer convenience ─────────────────────────
export {
  VERSION as CORE_VERSION,
  createDataTable,
  Column,
  createColumns,
  resolveAccessor,
  BUILT_IN_SORTING_FNS,
  BUILT_IN_FILTER_FNS,
  builtInSortingFns,
  builtInFilterFns,
  getSortingFn,
  getFilterFn,
  registerSortingFn,
  registerFilterFn,
  identity,
  shallowEqual,
  assertNever,
  resolveUpdater,
  applySliceChange,
  isSliceControlled,
  mergeInitialState,
  controlledSliceKeys,
  stateChangedOnSlices,
  DEFAULT_STATE,
  // M1 additions
  filterRows,
  sortRows,
  toggleSortItem,
  paginateRows,
  computePageCount,
  buildRowModel,
  columnsForRowModel,
  moveColumn,
  toggleColumnVisibility,
  toggleAllColumnsVisibility,
  getFacetedUniqueValues,
  getFacetedMinMax,
  mergeProps,
  chainHandlers,
  shouldRunLibraryHandler,
  noopAnnouncer,
} from '@lynellf/tablekit-core';

export type {
  Updater,
  SortItem,
  ColumnFilterItem,
  PaginationState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnResizeSession,
  CellPosition,
  DataTableState,
  SortingFn,
  FilterFn,
  RegisteredSortingFn,
  RegisteredFilterFn,
  ColumnAccessor,
  ColumnDef,
  AccessorFn,
  RowIdAccessor,
  SliceChange,
  DataTableOptions,
  Unsubscribe,
  DataTableInstance,
  StateSliceKey,
  SliceCallbacks,
  SliceDispatchers,
  BuiltInSortingFn,
  BuiltInFilterFn,
  // M1 additions
  Row,
  Cell,
  CellContext,
  Header,
  HeaderGroup,
  HeaderContext,
  CellEventContext,
  CellEventHandler,
  HeaderEventHandler,
  RowEventHandler,
  InteractionOptions,
  InteractionSource,
  Announcer,
  // M6 phase 2
  TabBehavior,
} from '@lynellf/tablekit-core';
