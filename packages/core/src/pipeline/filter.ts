/**
 * @lynellf/tablekit-core — filter pipeline stage.
 *
 * Pure function. Returns a new array containing the rows that pass every
 * active filter. Resolves each filter's `filterFn` via the registry
 * (`getFilterFn(name)`) when the column declares a name; uses the inline
 * function directly when the column declares one.
 *
 * Skipped when `options.manualFiltering === true`.
 */

import type { Column } from '../columns';
import { getFilterFn } from '../registries/filtering';
import type { ColumnFilterItem, FilterFn } from '../types';

type AnyRow = Record<string, unknown>;

export interface FilterStageOptions<TRow> {
  rows: TRow[];
  filters: ColumnFilterItem[];
  columns: Array<Column<TRow, unknown>>;
}

/**
 * Apply every filter in sequence. Order is preserved by `Array.filter`.
 * A filter that returns `true` keeps the row; `false` drops it.
 *
 * Rows without a matching column (e.g., the column was hidden or removed)
 * pass the filter (the filter is a no-op for unknown columns).
 *
 * Values that don't match the filter fn's expected type produce `false`
 * (the fn itself is responsible for the type check; see M0 built-ins).
 */
export const filterRows = <TRow>(opts: FilterStageOptions<TRow>): TRow[] => {
  if (opts.filters.length === 0) return opts.rows;

  // Build a column lookup once.
  const columnsById = new Map<string, Column<TRow, unknown>>();
  for (const col of opts.columns) columnsById.set(col.id, col);

  return opts.rows.filter((row) => {
    for (const filter of opts.filters) {
      const column = columnsById.get(filter.id);
      if (!column) continue; // unknown column → skip this filter
      const fn = resolveFilterFn<TRow>(column);
      if (!fn) continue; // column has no filterFn → skip
      const rowAsAny = row as unknown as AnyRow;
      if (!fn(rowAsAny, column.id, filter.value)) {
        return false;
      }
    }
    return true;
  });
};

/**
 * Resolve a column's filterFn to a callable. Returns `undefined` if the
 * column has no filterFn declared.
 */
const resolveFilterFn = <TRow>(column: Column<TRow, unknown>): FilterFn<AnyRow> | undefined => {
  const def = column.def;
  if (typeof def.filterFn === 'function') {
    return def.filterFn as FilterFn<AnyRow>;
  }
  if (typeof def.filterFn === 'string') {
    try {
      return getFilterFn<AnyRow>(def.filterFn);
    } catch {
      // Unknown registry name → treat as no filter.
      return undefined;
    }
  }
  return undefined;
};
