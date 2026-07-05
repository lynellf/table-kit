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

export const VERSION = '0.2.0' as const;

// ─── Hook ───────────────────────────────────────────────────────────────────
export { useDataTable } from './useDataTable';
export type { UseDataTableResult } from './useDataTable';

// ─── Announcer (M1) ───────────────────────────────────────────────────────
export { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';

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
} from '@lynellf/tablekit-core';
