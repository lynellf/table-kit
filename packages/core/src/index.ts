/**
 * @lynellf/tablekit-core — framework-free headless table state engine.
 *
 * M1 public surface:
 *   - Factory (M0): createDataTable, defaultGetRowId
 *   - Column model (M0): Column, createColumns, resolveAccessor
 *   - Registries (M0): getSortingFn, getFilterFn, registerSortingFn, registerFilterFn
 *   - State engine helpers (M0): resolveUpdater, applySliceChange, etc.
 *   - Utils (M0): identity, shallowEqual, assertNever
 *   - Pipeline (M1): filterRows, sortRows, toggleSortItem, paginateRows, computePageCount
 *   - Column helpers (M1): moveColumn, toggleColumnVisibility
 *   - Pagination helpers (M1): getPageCount, getRowCount, getCanPreviousPage, getCanNextPage
 *   - Faceting (M1): getFacetedUniqueValues, getFacetedMinMax
 *   - Announcer (M1): noopAnnouncer
 *   - Types (M0 + M1): all public types including Announcer, Row, Cell, etc.
 *
 * Not yet exported (later milestones):
 *   - Virtualization (M2)
 *   - Resize handles (M2)
 *   - Keyboard nav (M2)
 *   - DataSource (M3)
 *   - PivotTable (M4)
 *   - Worker engine (M5)
 *   - Full announcer polish + validator (M6)
 */

export const VERSION = '0.2.0' as const;

// ─── Factory (M0) ──────────────────────────────────────────────────────────
export { createDataTable, defaultGetRowId } from './createDataTable';

// ─── Column model (M0) ─────────────────────────────────────────────────────
export { Column, createColumns, resolveAccessor } from './columns';

// ─── Registries (M0) ───────────────────────────────────────────────────────
export {
  BUILT_IN_SORTING_FNS,
  BUILT_IN_FILTER_FNS,
  builtInSortingFns,
  builtInFilterFns,
  getSortingFn,
  getFilterFn,
  registerSortingFn,
  registerFilterFn,
  type BuiltInSortingFn,
  type BuiltInFilterFn,
} from './registries';

// ─── State engine helpers (M0) ──────────────────────────────────────────────
export {
  resolveUpdater,
  applySliceChange,
  isSliceControlled,
  mergeInitialState,
  controlledSliceKeys,
  stateChangedOnSlices,
  type StateSliceKey,
  type SliceCallbacks,
  type SliceDispatchers,
} from './state';

// ─── Utils (M0) ────────────────────────────────────────────────────────────
export { identity, shallowEqual, assertNever } from './utils';

// ─── Pipeline (M1) ──────────────────────────────────────────────────────────
export {
  filterRows,
  sortRows,
  toggleSortItem,
  paginateRows,
  computePageCount,
  buildRowModel,
  columnsForRowModel,
} from './pipeline';

// ─── Column ordering (M1 Phase 2) ───────────────────────────────────────────
export { moveColumn } from './ordering';

// ─── Column visibility (M1 Phase 3) ─────────────────────────────────────────
export { toggleColumnVisibility, toggleAllColumnsVisibility } from './visibility';

// ─── Faceting helpers (M1 Phase 4) ─────────────────────────────────────────
export { getFacetedUniqueValues, getFacetedMinMax } from './faceting';

// ─── Prop getter utilities (M1 Phase 5) ─────────────────────────────────────
export { mergeProps, chainHandlers, shouldRunLibraryHandler } from './propGetters';

// ─── Header types (M1 Phase 5) ─────────────────────────────────────────────
export type { Header, HeaderGroup, HeaderContext } from './headers';

// ─── Event types (M1 Phase 6) ──────────────────────────────────────────────
export type {
  CellEventContext,
  CellEventHandler,
  HeaderEventHandler,
  RowEventHandler,
  InteractionOptions,
  InteractionSource,
} from './events';

// ─── Row + Cell types (M1) ─────────────────────────────────────────────────
export type { Row, Cell, CellContext } from './types';

// ─── Announcer (M1) ────────────────────────────────────────────────────────
export { noopAnnouncer } from './announcer';

// ─── Public types (M0 + M1) ────────────────────────────────────────────────
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
  Announcer,
} from './types';

export { DEFAULT_STATE } from './types';
