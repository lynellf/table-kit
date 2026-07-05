/**
 * @lynellf/tablekit-core — `createDataTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, `getRowModel`. M1 adds the filter→sort→paginate pipeline,
 * pagination helpers, and `autoResetPageIndex`.
 */

import { noopAnnouncer } from './announcer';
import { defaultGetRowId } from './columns';
import type { Column } from './columns';
import { createColumns } from './columns';
import { buildHeaderGroups } from './headers';
import type { HeaderContext } from './headers';
import { moveColumn } from './ordering';
import { filterRows } from './pipeline/filter';
import { computePageCount, paginateRows } from './pipeline/paginate';
import { sortRows, toggleSortItem } from './pipeline/sort';
import { mergeProps } from './propGetters';
import { buildVisibleCells } from './rows';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  stateChangedOnSlices,
} from './state';
import type { SliceDispatchers } from './state';
import type {
  Announcer,
  Cell,
  CellPosition,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  PaginationState,
  Row,
  Row as RowInterface,
} from './types';
import {
  toggleAllColumnsVisibility,
  toggleColumnVisibility as toggleColumnVisibilityHelper,
} from './visibility';

type SliceChangeKey =
  | 'sorting'
  | 'columnFilters'
  | 'pagination'
  | 'columnOrder'
  | 'columnVisibility'
  | 'columnPinning'
  | 'columnSizing'
  | 'columnSizingInfo'
  | 'focusedCell';

/**
 * Implementation class. Public surface is the `DataTableInstance<TRow>`
 * interface; the class is not exported.
 */
class DataTable<TRow> implements DataTableInstance<TRow> {
  private options: DataTableOptions<TRow>;
  private state: DataTableState;
  private listeners: Set<() => void> = new Set();

  constructor(options: DataTableOptions<TRow>) {
    this.options = options;
    this.state = mergeInitialState(options.initialState, options.state);
  }

  getState(): DataTableState {
    return this.state;
  }

  setOptions(next: DataTableOptions<TRow>): void {
    if (Object.is(next, this.options)) return;
    const prevState = this.state;
    this.options = next;
    this.state = mergeInitialState(next.initialState, next.state);
    // Notify listeners if state actually changed (e.g., initialState change).
    if (
      stateChangedOnSlices(prevState, this.state, [
        'sorting',
        'columnFilters',
        'pagination',
        'columnOrder',
        'columnVisibility',
        'columnPinning',
        'columnSizing',
        'columnSizingInfo',
        'focusedCell',
      ])
    ) {
      this.notify();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Row model (M1: filter → sort → paginate pipeline) ─────────────────────

  getRowModel(): Row<TRow>[] {
    const columns = this.getResolvedColumns();
    const { state, options } = this;
    let rows: TRow[] = options.data;

    if (options.manualFiltering !== true) {
      rows = filterRows({ rows, filters: state.columnFilters, columns });
    }
    if (options.manualSorting !== true) {
      rows = sortRows({ rows, sorting: state.sorting, columns });
    }
    if (options.manualPagination !== true) {
      rows = paginateRows({ rows, pagination: state.pagination });
    }

    const getRowId = options.getRowId ?? (defaultGetRowId as (row: TRow, index: number) => string);
    const visibleColumns = this.getVisibleColumns();

    return rows.map((original, index) => {
      const id = getRowId(original, index);
      // Build the row in two steps to avoid the closure reference to an
      // object that doesn't exist yet. The `getVisibleCells` function is
      // attached after `base` is assigned, so `base` is in scope.
      const base: RowInterface<TRow> = {
        id,
        index,
        original,
        // eslint-disable-next-line @typescript-eslint/no-empty-object-style
        getVisibleCells: () => [],
        getRowProps: () => ({}),
      };
      // Now attach the real getVisibleCells using the same reference.
      // biome-ignore lint/suspicious/noExplicitAny: intentional type manipulation to build self-referential row object
      (base as any).getVisibleCells = () =>
        buildVisibleCells(base, visibleColumns, this) as Cell<TRow>[];
      // Attach the real getRowProps.
      // biome-ignore lint/suspicious/noExplicitAny: intentional type manipulation to build self-referential row object
      (base as any).getRowProps = (consumerProps?: Record<string, unknown>) =>
        mergeProps(
          {
            role: 'row',
            'aria-rowindex': base.index + 2, // header row is 1
            key: base.id,
          },
          consumerProps,
        );
      return base;
    }) as Row<TRow>[];
  }

  // ─── Column resolution helpers ─────────────────────────────────────────────

  private getResolvedColumns(): Array<Column<TRow, unknown>> {
    return createColumns(this.options.columns, this.state);
  }

  getVisibleColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsVisible());
  }

  getLeftLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'left');
  }

  getCenterLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === false);
  }

  getRightLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'right');
  }

  // ─── Column visibility (M1 Phase 3) ─────────────────────────────────────────

  /**
   * Toggle a single column's visibility.
   */
  toggleColumnVisibility = (columnId: string): void => {
    const next = toggleColumnVisibilityHelper(this.state.columnVisibility, columnId);
    if (Object.is(next, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', next);
  };

  /**
   * Toggle all columns at once.
   */
  toggleAllColumnsVisibility = (next?: boolean): void => {
    const allIds = this.options.columns.map((c) => c.id);
    const out = toggleAllColumnsVisibility(this.state.columnVisibility, allIds, next);
    if (Object.is(out, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', out);
  };

  // ─── Pagination helpers (M1) ────────────────────────────────────────────────

  getCanPreviousPage(): boolean {
    return this.state.pagination.pageIndex > 0;
  }

  getCanNextPage(): boolean {
    return this.state.pagination.pageIndex < this.getPageCount() - 1;
  }

  getPageCount(): number {
    const { pageSize } = this.state.pagination;
    if (this.options.manualPagination === true) {
      const total = this.options.rowCount ?? this.options.data.length;
      return computePageCount(total, pageSize);
    }
    const fullRowCount = this.getFullRowCount();
    return computePageCount(fullRowCount, pageSize);
  }

  getRowCount(): number {
    if (this.options.manualPagination === true) {
      return this.options.rowCount ?? this.options.data.length;
    }
    return this.getFullRowCount();
  }

  private getFullRowCount(): number {
    const columns = this.getResolvedColumns();
    let rows: TRow[] = this.options.data;
    if (this.options.manualFiltering !== true) {
      rows = filterRows({ rows, filters: this.state.columnFilters, columns });
    }
    if (this.options.manualSorting !== true) {
      rows = sortRows({ rows, sorting: this.state.sorting, columns });
    }
    return rows.length;
  }

  nextPage = (): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageIndex: p.pageIndex + 1 }));
  };

  previousPage = (): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageIndex: Math.max(0, p.pageIndex - 1),
    }));
  };

  setPageIndex = (updater: number | ((old: number) => number)): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageIndex:
        typeof updater === 'function' ? (updater as (old: number) => number)(p.pageIndex) : updater,
    }));
  };

  setPageSize = (updater: number | ((old: number) => number)): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageSize:
        typeof updater === 'function' ? (updater as (old: number) => number)(p.pageSize) : updater,
    }));
  };

  // ─── Column ordering (M1 Phase 2) ──────────────────────────────────────────

  /**
   * Move a column to a new index or side. Per spec §8.3: re-pins when crossing
   * pinning boundaries.
   *
   * Applies `columnOrder` and (if changed) `columnPinning` through their
   * respective dispatchers. Controlled-slice semantics are honored.
   */
  moveColumn = (id: string, to: number | 'left' | 'right' | 'center' | false): void => {
    const visibleIds = this.getVisibleColumns().map((c) => c.id);
    const result = moveColumn(
      {
        columnOrder: this.state.columnOrder,
        columnPinning: this.state.columnPinning,
        columnVisibility: this.state.columnVisibility,
      },
      visibleIds,
      id,
      to,
    );
    if (result.columnOrder) {
      this.applyChange('columnOrder', result.columnOrder);
    }
    if (result.columnPinning) {
      this.applyChange('columnPinning', result.columnPinning);
    }
  };

  // ─── Announcer (M1) ────────────────────────────────────────────────────────

  private getAnnouncer(): Announcer {
    return this.options.announcer ?? noopAnnouncer;
  }

  private announce(message: string): void {
    this.getAnnouncer().announce(message, 'polite');
  }

  // ─── Header structure + prop getters (M1 Phase 5) ─────────────────────────────

  /**
   * Build the header context for prop getters.
   */
  private getHeaderContext(): HeaderContext<TRow> {
    return {
      instance: {
        toggleSorting: (id: string, append?: boolean) => {
          const next = toggleSortItem(this.state.sorting, id, {
            append: append ?? false,
          });
          this.applyChange('sorting', next);
        },
        getColumnCount: () => this.getVisibleColumns().length,
        getRowCount: () => this.getRowCount(),
        announce: (msg: string) => this.announce(msg),
      },
    };
  }

  /**
   * Return the full header structure (one group per level — M1 has one).
   */
  getHeaderGroups() {
    const visibleColumns = this.getVisibleColumns();
    return buildHeaderGroups<TRow>(visibleColumns, this.getHeaderContext());
  }

  /**
   * Root grid prop getter. M1: emits role="grid" + aria-rowcount + aria-colcount.
   */
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    return mergeProps(
      {
        role: 'grid',
        'aria-rowcount': this.getRowCount() + 1, // +1 for header row
        'aria-colcount': this.getVisibleColumns().length,
        tabIndex: 0,
      },
      consumerProps,
    );
  }

  /**
   * Body rowgroup prop getter.
   */
  getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    return mergeProps({ role: 'rowgroup' }, consumerProps);
  }

  // ─── State change application ───────────────────────────────────────────────

  /**
   * Resolve a slice change. For controlled slices, hand the updater to the
   * slice callback (consumer owns state). For uncontrolled slices, apply
   * locally, then notify listeners, then fire `onStateChange` if the consumer
   * asked for it.
   */
  private applyChange<K extends keyof DataTableState>(
    slice: K,
    updater: DataTableState[K] | ((old: DataTableState[K]) => DataTableState[K]),
  ): void {
    const controlled = isSliceControlled(this.options.state, slice);
    if (controlled) {
      // Hand the raw updater to the consumer; do not mutate internal state.
      const cb = this.sliceCallback(slice);
      if (cb) {
        (cb as (u: unknown) => void)(updater);
      }
      return;
    }
    const prev = this.state;
    const next = applySliceChange(prev, slice, updater);
    if (Object.is(prev, next)) return;
    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }

  private sliceCallback<K extends keyof DataTableState>(
    slice: K,
  ): ((updater: unknown) => void) | undefined {
    const CB: Record<SliceChangeKey, string> = {
      sorting: 'onSortingChange',
      columnFilters: 'onColumnFiltersChange',
      pagination: 'onPaginationChange',
      columnOrder: 'onColumnOrderChange',
      columnVisibility: 'onColumnVisibilityChange',
      columnPinning: 'onColumnPinningChange',
      columnSizing: 'onColumnSizingChange',
      columnSizingInfo: 'onColumnSizingInfoChange',
      focusedCell: 'onFocusedCellChange',
    };
    const o = this.options as unknown as Record<string, unknown>;
    return o[CB[slice as SliceChangeKey]] as ((updater: unknown) => void) | undefined;
  }

  private notifySliceAndAggregate(prev: DataTableState, next: DataTableState): void {
    if (this.options.onStateChange) {
      if (
        stateChangedOnSlices(
          prev,
          next,
          controlledSliceKeys(this.options.state).length === 0
            ? [
                'sorting',
                'columnFilters',
                'pagination',
                'columnOrder',
                'columnVisibility',
                'columnPinning',
                'columnSizing',
                'columnSizingInfo',
                'focusedCell',
              ]
            : (Object.keys(this.options.state as object) as Array<keyof DataTableState>),
        )
      ) {
        this.options.onStateChange(next);
      }
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ─── Public slice dispatchers ───────

  setSorting = (
    updater:
      | DataTableState['sorting']
      | ((old: DataTableState['sorting']) => DataTableState['sorting']),
  ): void => {
    this.applyChange('sorting', updater);
  };
  setColumnFilters = (
    updater: ColumnFilterItem[] | ((old: ColumnFilterItem[]) => ColumnFilterItem[]),
  ): void => {
    this.applyChange('columnFilters', updater);
    // autoResetPageIndex (default true): reset pageIndex to 0 on filter change.
    // Route through the controlled-slice-aware method.
    this.resetPaginationOnFilterChange();
    // Announce filter result count.
    this.announce(`Filters applied. ${this.getFullRowCount()} rows.`);
  };

  /**
   * autoResetPageIndex logic. When pagination is uncontrolled, apply the reset
   * locally (fires onStateChange). When pagination is controlled, invoke the
   * slice callback only (consumer owns the slice).
   */
  private resetPaginationOnFilterChange(): void {
    if (this.options.autoResetPageIndex === false) return;
    const prev = this.state;
    const next: DataTableState = {
      ...prev,
      pagination: { ...prev.pagination, pageIndex: 0 },
    };
    if (Object.is(prev.pagination.pageIndex, 0)) return; // already at 0
    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }
  setPagination = (
    updater: PaginationState | ((old: PaginationState) => PaginationState),
  ): void => {
    this.applyChange('pagination', updater);
  };
  setColumnOrder = (updater: string[] | ((old: string[]) => string[])): void => {
    this.applyChange('columnOrder', updater);
  };
  setColumnVisibility = (
    updater: Record<string, boolean> | ((old: Record<string, boolean>) => Record<string, boolean>),
  ): void => {
    this.applyChange('columnVisibility', updater);
  };
  setColumnPinning = (
    updater: ColumnPinningState | ((old: ColumnPinningState) => ColumnPinningState),
  ): void => {
    this.applyChange('columnPinning', updater);
  };
  setColumnSizing = (
    updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState),
  ): void => {
    this.applyChange('columnSizing', updater);
  };
  setColumnSizingInfo = (
    updater:
      | ColumnResizeSession
      | null
      | ((old: ColumnResizeSession | null) => ColumnResizeSession | null),
  ): void => {
    this.applyChange('columnSizingInfo', updater);
  };
  setFocusedCell = (
    updater: CellPosition | null | ((old: CellPosition | null) => CellPosition | null),
  ): void => {
    this.applyChange('focusedCell', updater);
  };
}

/**
 * Public factory.
 */
export const createDataTable = <TRow>(options: DataTableOptions<TRow>): DataTableInstance<TRow> => {
  const instance = new DataTable<TRow>(options);
  return instance as DataTableInstance<TRow> & SliceDispatchers;
};

export { defaultGetRowId };
export type { Column };
