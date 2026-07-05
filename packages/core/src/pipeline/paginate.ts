/**
 * @lynellf/tablekit-core — pagination pipeline stage.
 *
 * Pure function. Returns a slice of the input rows.
 * Skipped when `options.manualPagination === true`.
 */

import type { PaginationState } from '../types';

export interface PaginateStageOptions<TRow> {
  rows: TRow[];
  pagination: PaginationState;
}

/**
 * Slice the rows array by `pagination.pageIndex` and `pagination.pageSize`.
 * Defensive against out-of-range pageIndex (clamps to last valid page).
 */
export const paginateRows = <TRow>(opts: PaginateStageOptions<TRow>): TRow[] => {
  const { rows, pagination } = opts;
  const { pageIndex, pageSize } = pagination;
  if (pageSize <= 0) return rows; // invalid pageSize → return all
  const start = pageIndex * pageSize;
  if (start >= rows.length) return [];
  return rows.slice(start, start + pageSize);
};

/**
 * Compute the page count for a given row total.
 * Returns 0 when rowCount is 0 (no pages).
 */
export const computePageCount = (rowCount: number, pageSize: number): number => {
  if (pageSize <= 0) return 0;
  if (rowCount <= 0) return 0;
  return Math.ceil(rowCount / pageSize);
};
