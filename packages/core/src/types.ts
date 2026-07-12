/**
 * @lynellf/tablekit-core — public type surface.
 *
 * Source-of-truth mapping to docs/initial-spec.md:
 *  - §4.1 Instances, §4.2 State model — controlled-slice contract
 *  - §4.3 Dependency-inversion seams — registry interfaces
 *  - §4.4 Data model — ColumnDef + derived Column shape
 *  - §5   Data layer — RowsQuery (Level 0)
 *  - §7.5 Keyboard navigation — focusedCell slice
 */

// ─────────────────────────────────────────────────────────────────────────────
// Updater
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A value-or-function that produces the next value of a state slice.
 *
 * Consumers may pass either:
 *   - A concrete value (replace the slice wholesale), or
 *   - A function `(old) => next` (derive from the previous slice).
 *
 * The function form is invoked synchronously by the engine when the slice is
 * uncontrolled. When the slice is controlled, the engine hands the updater
 * to the consumer via the slice-specific callback without invoking it.
 *
 * React state setters (`Dispatch<SetStateAction<T>>`) are also accepted,
 * since they follow the same value-or-function pattern (with void return).
 */
export type Updater<T> = T | ((old: T) => T) | ((prev: T) => void);

// ─────────────────────────────────────────────────────────────────────────────
// State slices
// ─────────────────────────────────────────────────────────────────────────────

/** Multi-sort spec. Order in the array = priority (index 0 is primary). */
export interface SortItem {
  id: string;
  desc: boolean;
}

/** Per-column filter spec. `value` is opaque to the core; the consumer's `filterFn` interprets it. */
export interface ColumnFilterItem {
  id: string;
  value: unknown;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

/** `columnPinning` slice. Order within each side is the pinned display order. */
export interface ColumnPinningState {
  left: string[];
  right: string[];
}

/** `columnSizing` slice: id → measured width in px. */
export type ColumnSizingState = Record<string, number>;

/** Transient session for an in-progress resize. Null when no resize is active. */
export interface ColumnResizeSession {
  columnId: string;
  startSize: number;
  delta: number;
  mode: 'onChange' | 'onEnd';
}

/** `focusedCell` slice. Null when no cell has focus. */
export interface CellPosition {
  rowId: string;
  columnId: string;
}

/**
 * DataTable state model.
 *
 * Each slice is independently controllable (§4.2). Slice keys listed here are
 * the contract surface; new slices must be appended (never reordered) to keep
 * key identity stable across the v1 line.
 */
export interface DataTableState {
  sorting: SortItem[];
  columnFilters: ColumnFilterItem[];
  pagination: PaginationState;
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: ColumnPinningState;
  columnSizing: ColumnSizingState;
  columnSizingInfo: ColumnResizeSession | null;
  focusedCell: CellPosition | null;
}

/** Default starting values for every slice when the consumer passes no `initialState`. */
export const DEFAULT_STATE: DataTableState = {
  sorting: [],
  columnFilters: [],
  pagination: { pageIndex: 0, pageSize: 25 },
  columnOrder: [],
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry types (sorting / filtering)
// ─────────────────────────────────────────────────────────────────────────────

/** Comparator over the values produced by a column's accessor. */
export type SortingFn<TRow> = (rowA: TRow, rowB: TRow, columnId: string) => number;

/** Predicate applied to a column value. Returns true to keep the row. */
export type FilterFn<TRow> = (row: TRow, columnId: string, filterValue: unknown) => boolean;

/** Built-in or consumer-registered sorting function, addressable by name. */
export type RegisteredSortingFn<TRow> = SortingFn<TRow>;

/** Built-in or consumer-registered filtering function, addressable by name. */
export type RegisteredFilterFn<TRow> = FilterFn<TRow>;

// ─────────────────────────────────────────────────────────────────────────────
// ColumnDef + accessor resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * String accessor = keyof TRow. Function accessor = custom resolver.
 * Opacity: `header` and `cell` are `unknown` to the core; the React adapter
 * supplies the render bridge (`renderSlot` analogue).
 */
export type ColumnAccessor<TRow, TValue> =
  | (keyof TRow & string)
  | ((row: TRow, rowIndex: number) => TValue);

export interface ColumnDef<TRow, TValue = unknown> {
  id: string;
  accessor?: ColumnAccessor<TRow, TValue>;
  header?: unknown;
  cell?: unknown;
  size?: number;
  minSize?: number;
  maxSize?: number;
  /** When true, the column participates in sort state. Default: false. */
  enableSorting?: boolean;
  /** Registry name OR inline comparator. */
  sortingFn?: string | SortingFn<TRow>;
  /** When true, the column participates in filter state. Default: false. */
  enableFiltering?: boolean;
  /** Registry name OR inline predicate. */
  filterFn?: string | FilterFn<TRow>;
  /** Default behavior for `undefined` values during sort. */
  sortUndefined?: 'first' | 'last';
  /** Consumer escape hatch. Flows through to derived `Column.meta`. */
  meta?: Record<string, unknown>;
}

/** Resolved value the column exposes to consumers (e.g., cell renderers). */
export type AccessorFn<TRow, TValue> = (row: TRow, rowIndex: number) => TValue;

// ─────────────────────────────────────────────────────────────────────────────
// Row identity
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve a stable id for a row. Required for server modes (M3) and pivot (M4). */
export type RowIdAccessor<TRow> = (row: TRow, index: number) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Options (factory input)
// ─────────────────────────────────────────────────────────────────────────────

/** Per-slice onChange callback signature. Slice-keyed to keep the contract narrow. */
export type SliceChange<T> = (updater: Updater<T>) => void;

/**
 * `createDataTable` options.
 *
 * Controlled vs uncontrolled per slice:
 *   - If `state[K]` is provided, slice K is controlled and `on[K]Change` MUST be supplied.
 *   - If `state[K]` is absent and `initialState[K]` is provided, slice K is uncontrolled seeded.
 *   - If neither is provided, slice K is uncontrolled and starts at `DEFAULT_STATE[K]`.
 *
 * Global `onStateChange` fires after slice-specific callbacks, in the same
 * microtask, only when state actually changed.
 */
export interface DataTableOptions<TRow> {
  data: TRow[];
  columns: Array<ColumnDef<TRow, unknown>>;
  getRowId?: RowIdAccessor<TRow>;
  initialState?: Partial<DataTableState>;
  state?: Partial<DataTableState>;
  onSortingChange?: SliceChange<SortItem[]>;
  onColumnFiltersChange?: SliceChange<ColumnFilterItem[]>;
  onPaginationChange?: SliceChange<PaginationState>;
  onColumnOrderChange?: SliceChange<string[]>;
  onColumnVisibilityChange?: SliceChange<Record<string, boolean>>;
  onColumnPinningChange?: SliceChange<ColumnPinningState>;
  onColumnSizingChange?: SliceChange<ColumnSizingState>;
  onColumnSizingInfoChange?: SliceChange<ColumnResizeSession | null>;
  onFocusedCellChange?: SliceChange<CellPosition | null>;
  onStateChange?: SliceChange<DataTableState>;
  // ─────── Feature flags (M1+ behavior) ───────
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  /** When true (default), filter changes reset pageIndex to 0. */
  autoResetPageIndex?: boolean;
  /** When true (default), sort items can be removed by clicking the third time. */
  enableSortingRemoval?: boolean;
  /** When true, the first sort click goes desc instead of asc. */
  sortDescFirst?: boolean;
  /** Total row count when manualPagination=true. */
  rowCount?: number;
  /** Announcer interface for sort/filter/pagination announcements. */
  announcer?: Announcer;
  /**
   * M3 phase 1: when true, suppresses the mixed-mode trap warning when
   * `manualPagination === true` and client-side sort/filter is active.
   * Indicates the consumer understands the within-page-only effect.
   */
  allowWithinPageOperations?: boolean;
  // ─────── Interaction events (M1; spec §7.6) ───────
  onCellClick?: import('./events').CellEventHandler<TRow>;
  onCellDoubleClick?: import('./events').CellEventHandler<TRow>;
  onCellContextMenu?: import('./events').CellEventHandler<TRow>;
  onCellActivate?: import('./events').CellEventHandler<TRow>;
  onCellFocusChange?: import('./events').CellEventHandler<TRow>;
  onRowClick?: import('./events').RowEventHandler<TRow>;
  onRowDoubleClick?: import('./events').RowEventHandler<TRow>;
  onHeaderClick?: import('./events').HeaderEventHandler<TRow>;
  // ─────── Keyboard navigation (M2 Phase 5) ───────
  navigationMode?: 'cell' | 'row' | 'none';
  /**
   * M6 phase 2: how Tab behaves inside the grid.
   * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
   * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
   */
  tabBehavior?: TabBehavior;
  // ─────── DataSource (M3) ───────────────────────────────────────────────────
  /**
   * M3 phase 4: number of placeholder rows to render while the data source
   * is loading and no fresh data is available. Defaults to
   * `state.pagination.pageSize`. Set to 0 to disable placeholder rows.
   */
  placeholderRows?: number;
  // ─────── Data identity (v2.0.0) ───────────────────────────────────────────────
  /**
   * Data version escape hatch for mutable data patterns.
   *
   * By default, the engine treats data as immutable: same reference = no update.
   * When data is mutated in-place (common in live-updating datasets), consumers
   * can provide a version token to signal that the data changed even if the
   * array reference is unchanged.
   *
   * `dataVersion` can be:
   * - A static version token (string or number)
   * - A function that derives the version from the current data array
   *
   * @example
   * ```ts
   * // Static token
   * dataVersion: { version: 1 }
   *
   * // Derived version
   * dataVersion: { getVersion: (data) => data.length }
   * ```
   */
  dataVersion?: {
    /** Static version token. */
    version?: string | number;
    /** Derive version token from data. */
    getVersion?: (data: TRow[]) => string | number;
  };
}

/**
 * M6 phase 2: tab behavior option. Default 'exit' is APG-conformant.
 * 'cells' is opt-in for products that need Tab-through-cells.
 */
export type TabBehavior = 'exit' | 'cells';

// ─────────────────────────────────────────────────────────────────────────────
// Row + Cell model (M1)
// ─────────────────────────────────────────────────────────────────────────────

// Type-only imports - these are erased at runtime.
import type { Column as ColumnClass } from './columns';
import type { HeaderGroup } from './headers';

/** Context object passed to renderSlot(def.header/cell, ctx). */
export interface CellContext<TRow, TValue = unknown> {
  table: unknown;
  row: Row<TRow>;
  column: ColumnClass<TRow, TValue>;
  cell: Cell<TRow, TValue>;
  value: TValue;
  rowIndex: number;
  colIndex: number;
}

/**
 * Derived cell object. Built lazily per row from `buildVisibleCells`.
 * Identity is rebuilt on every `getRowModel()` call; consumers must not hold
 * `Cell` references across renders.
 */
export interface Cell<TRow, TValue = unknown> {
  readonly id: string;
  readonly row: Row<TRow>;
  readonly column: ColumnClass<TRow, TValue>;
  getValue(): TValue;
  getContext(): CellContext<TRow, TValue>;
  /** Returns prop getter for this cell. */
  getCellProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Derived row object. Built by `buildRowModel`. Identity is rebuilt on every
 * `getRowModel()` call; consumers must not hold `Row` references across renders.
 */
export interface Row<TRow> {
  readonly id: string;
  /** Pipeline-output index (post-filter, post-sort, post-paginate). */
  readonly index: number;
  /** Reference to the original input row. */
  readonly original: TRow;
  /** True for skeleton/placeholder rows rendered during loading states (M3 phase 4). */
  readonly isPlaceholder?: boolean;
  getVisibleCells(): Cell<TRow>[];
  /** Returns prop getter for this row. */
  getRowProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance
// ─────────────────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

/** Announcer interface (spec §10). announce() is called from core on slice changes. */
export interface Announcer {
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
}

/**
 * Public instance shape.
 *
 * M1 adds `getRowModel()` returning `Row<TRow>[]` and pagination helpers.
 */
export interface DataTableInstance<TRow> {
  /** Returns the current state snapshot. */
  getState(): DataTableState;
  /** Replace the entire options object. Called by React adapter on each render. */
  setOptions(next: DataTableOptions<TRow>): void;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): Unsubscribe;
  /** Returns the filtered, sorted, paginated array of Row objects. */
  getRowModel(): Row<TRow>[];

  // ─── Announcer (M1 + M3) ─────────────────────────────────────────────────────
  /** Announce a message via the live-region. Used by useDataSource on success. */
  announce(message: string, politeness?: 'polite' | 'assertive'): void;

  // ─── Pagination helpers (M1) ─────────────────────────────────────────────
  getCanPreviousPage(): boolean;
  getCanNextPage(): boolean;
  getPageCount(): number;
  getRowCount(): number;
  nextPage(): void;
  previousPage(): void;
  setPageIndex(updater: number | ((old: number) => number)): void;
  setPageSize(updater: number | ((old: number) => number)): void;

  // ─── Slice dispatchers ───────────────────────────────────────────────
  setSorting(updater: SortItem[] | ((old: SortItem[]) => SortItem[])): void;
  setColumnFilters(
    updater: ColumnFilterItem[] | ((old: ColumnFilterItem[]) => ColumnFilterItem[]),
  ): void;
  setPagination(updater: PaginationState | ((old: PaginationState) => PaginationState)): void;
  setColumnOrder(updater: string[] | ((old: string[]) => string[])): void;
  setColumnVisibility(
    updater: Record<string, boolean> | ((old: Record<string, boolean>) => Record<string, boolean>),
  ): void;
  setColumnPinning(
    updater: ColumnPinningState | ((old: ColumnPinningState) => ColumnPinningState),
  ): void;
  setColumnSizing(
    updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState),
  ): void;
  setColumnSizingInfo(
    updater:
      | ColumnResizeSession
      | null
      | ((old: ColumnResizeSession | null) => ColumnResizeSession | null),
  ): void;
  setFocusedCell(
    updater: CellPosition | null | ((old: CellPosition | null) => CellPosition | null),
  ): void;

  // ─── Column ordering (M1) ─────────────────────────────────────────────
  moveColumn(id: string, to: number | 'left' | 'right' | 'center' | false): void;

  // ─── Column visibility (M1) ─────────────────────────────────────────
  toggleColumnVisibility(columnId: string): void;
  toggleAllColumnsVisibility(next?: boolean): void;

  // ─── State reset (Phase 1 F0.1) ───────────────────────────────────────
  /** Reset all state slices to their initial values. Respects controlled slices. */
  resetState(): void;
  /** Reset a specific state slice to its initial value. Respects controlled slices. */
  resetSlice(slice: keyof DataTableState): void;

  // ─── Column resolution helpers (M1) ─────────────────────────────────
  getVisibleColumns(): Array<ColumnClass<TRow, unknown>>;
  getLeftLeafColumns(): Array<ColumnClass<TRow, unknown>>;
  getCenterLeafColumns(): Array<ColumnClass<TRow, unknown>>;
  getRightLeafColumns(): Array<ColumnClass<TRow, unknown>>;

  // ─── Header structure + prop getters (M1) ─────────────────────────
  getHeaderGroups(): HeaderGroup<TRow>[];
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;

  // ─── Virtualization (M2) ─────────────────────────────────────────────────
  /** @internal */
  __setScrollState(scrollOffset: number, viewportSize: number): void;
  /** @internal */
  __setColumnScrollState(scrollOffset: number, viewportSize: number): void;
  getRowVirtualizer(): import('./virtualization/types').RowVirtualizerResult<TRow>;
  getCenterVirtualizer(): import('./virtualization/types').ColumnVirtualizerResult;

  // ─── DataSource (M3) ─────────────────────────────────────────────────────
  /** @internal Read the data source state. Used by the React hook. */
  __getDataSourceState(): import('./dataSource/types').DataSourceState<TRow>;
  /** @internal Write the data source state. Used by the React hook. */
  __setDataSourceState(state: import('./dataSource/types').DataSourceState<TRow>): void;
  /** @internal Build a RowsQuery from current state + capabilities. Used by the React hook. */
  __buildRowsQuery(
    capabilities: import('./dataSource/types').DataSourceCapabilities,
    cursor?: import('./dataSource/types').CursorSelection,
    dataVersion?: string | number,
  ): import('./dataSource/types').RowsQuery;
  /** @internal Prune invalid column IDs from state slices when columns change. */
  __pruneColumnIds(validColumnIds: Set<string>): void;
  /** @internal R3-MANUAL-CAPABILITY-OVERLAY: Apply data-source capability flags. */
  __applyCapabilityOverlay(overlay: {
    manualSorting: boolean;
    manualFiltering: boolean;
    manualPagination: boolean;
  }): void;

  // ─── Data identity (v2.0.0) ─────────────────────────────────────────────────
  /**
   * Returns the current data version token.
   * Used by mutable integrations to signal that data changed even if the
   * array reference is unchanged.
   * @returns The current version token, or undefined if no dataVersion is configured.
   */
  getDataVersion(): string | number | undefined;
}
