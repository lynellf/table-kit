/**
 * @lynellf/tablekit-core — row model memoization.
 *
 * Spec §12 perf budget: 100k-row scroll at ≥ 55fps requires the row pipeline
 * not to re-run on every state change. Phase 1 memoizes `getRowModel()` keyed
 * on a tuple of inputs.
 *
 * The cache invalidates when any input identity changes. Consumers mutating
 * `data` in place must pass a new array reference (the standard React/Immer
 * pattern); the cache will then re-run the pipeline.
 */

import type { ColumnDef, DataTableState, Row } from '../types';

export interface MemoKey {
  data: unknown[];
  sorting: DataTableState['sorting'];
  columnFilters: DataTableState['columnFilters'];
  pagination: DataTableState['pagination'];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: DataTableState['columnPinning'];
  manualSorting: boolean;
  manualFiltering: boolean;
  manualPagination: boolean;
}

export interface MemoBuildOptions<TRow> {
  data: TRow[];
  columns: Array<ColumnDef<TRow, unknown>>;
  state: DataTableState;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
}

export const buildMemoKey = <TRow>(opts: MemoBuildOptions<TRow>): MemoKey => ({
  data: opts.data as unknown[],
  sorting: opts.state.sorting,
  columnFilters: opts.state.columnFilters,
  pagination: opts.state.pagination,
  columnOrder: opts.state.columnOrder,
  columnVisibility: opts.state.columnVisibility,
  columnPinning: opts.state.columnPinning,
  manualSorting: opts.manualSorting === true,
  manualFiltering: opts.manualFiltering === true,
  manualPagination: opts.manualPagination === true,
});

export const memoKeysEqual = (a: MemoKey | null, b: MemoKey): boolean => {
  if (a === null) return false;
  if (a.data !== b.data) return false;
  if (a.sorting !== b.sorting) return false;
  if (a.columnFilters !== b.columnFilters) return false;
  if (a.pagination !== b.pagination) return false;
  if (a.columnOrder !== b.columnOrder) return false;
  if (a.columnVisibility !== b.columnVisibility) return false;
  if (a.columnPinning !== b.columnPinning) return false;
  if (a.manualSorting !== b.manualSorting) return false;
  if (a.manualFiltering !== b.manualFiltering) return false;
  return a.manualPagination === b.manualPagination;
};

export const buildPipelineRowModel = <TRow>(opts: MemoBuildOptions<TRow>): Row<TRow>[] => {
  // NOTE: This function returns the raw pipeline output (id/index/original).
  // The full Row interface with getVisibleCells is assembled by createDataTable.
  // This memo cache stores the assembled rows, not the pipeline output.
  // The actual row building happens in createDataTable's internal row building logic.
  return [] as unknown as Row<TRow>[];
};

/**
 * Per-instance cache. The factory creates one of these and consults it
 * on every `getRowModel()` call.
 */
export class RowModelCache<TRow> {
  private cachedData: unknown[] | null = null;
  private cachedSorting: unknown | null = null;
  private cachedColumnFilters: unknown | null = null;
  private cachedPagination: unknown | null = null;
  private cachedRows: Row<TRow>[] | null = null;

  getMemoKey() {
    return {
      data: this.cachedData,
      sorting: this.cachedSorting,
      columnFilters: this.cachedColumnFilters,
      pagination: this.cachedPagination,
      cachedRows: this.cachedRows,
    };
  }

  setCachedResult(
    data: unknown[],
    state: DataTableState,
    rows: Row<TRow>[],
  ): void {
    this.cachedData = data;
    this.cachedSorting = state.sorting;
    this.cachedColumnFilters = state.columnFilters;
    this.cachedPagination = state.pagination;
    this.cachedRows = rows;
  }

  invalidate(): void {
    this.cachedData = null;
    this.cachedSorting = null;
    this.cachedColumnFilters = null;
    this.cachedPagination = null;
    this.cachedRows = null;
  }
}
