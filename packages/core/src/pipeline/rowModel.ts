/**
 * @lynellf/tablekit-core — row model orchestration.
 *
 * Wires the three pipeline stages together. Returns an array of row-like objects
 * (with id/index/original) from the input data. The full `Row` interface
 * (with getVisibleCells) is assembled by `createDataTable.ts` using
 * `buildVisibleCells` from `rows.ts`.
 */

import { createColumns } from '../columns';
import type { Column } from '../columns';
import type { DataTableState } from '../types';
import { filterRows } from './filter';
import { paginateRows } from './paginate';
import { sortRows } from './sort';

export interface BuildRowModelConcreteOptions<TRow> {
  data: TRow[];
  columns: Array<Column<TRow, unknown>>;
  state: DataTableState;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  rowCount?: number;
  getRowId: (row: TRow, index: number) => string;
}

export interface BuiltRow<TRow> {
  id: string;
  index: number;
  original: TRow;
}

/**
 * Build the row model. The pipeline runs in order: filter → sort → paginate.
 * Each stage is skipped when the corresponding `manual*` flag is true.
 *
 * Returns `BuiltRow<TRow>[]` — the minimal row shape (id, index, original).
 * The full `Row` interface with `getVisibleCells` is assembled by the
 * DataTable factory using `buildVisibleCells` from `rows.ts`.
 */
export const buildRowModel = <TRow>(opts: BuildRowModelConcreteOptions<TRow>): BuiltRow<TRow>[] => {
  let rows: TRow[] = opts.data;
  const { columns, state } = opts;

  if (opts.manualFiltering !== true) {
    rows = filterRows({ rows, filters: state.columnFilters, columns });
  }
  if (opts.manualSorting !== true) {
    rows = sortRows({ rows, sorting: state.sorting, columns });
  }
  if (opts.manualPagination === true) {
    // Server mode: return the full filtered/sorted result, do NOT slice.
  } else {
    rows = paginateRows({ rows, pagination: state.pagination });
  }

  return rows.map((original, index) => ({
    id: opts.getRowId(original, index),
    index,
    original,
  }));
};

/**
 * Convenience: derive columns from defs + state.
 */
export const columnsForRowModel = <TRow>(
  defs: Array<{ id: string }>,
  state: DataTableState,
): Array<Column<TRow, unknown>> =>
  createColumns(defs as Parameters<typeof createColumns<TRow>>[0], state);
