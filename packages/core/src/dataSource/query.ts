/**
 * @lynellf/tablekit-core/dataSource — `RowsQuery` serializer.
 *
 * Pure function: state + columns + capabilities → `RowsQuery`. Deterministic;
 * same input always produces byte-equal JSON (used by the §13 golden tests).
 *
 * `filterFn` name resolution: each `Column<TRow>.filterFn` may be a string
 * (registry name) or an inline function. The serializer emits the **name**
 * only; inline functions emit a one-shot dev warning AND fall back to the
 * column's `filterFn` as the default registry name (e.g., 'equals').
 */

import type { Column } from '../columns';
import { nameOfFilterFn } from '../registries/filtering';
import type { DataTableState } from '../types';
import type { BuildRowsQueryOptions, RowsQuery, SerializedFilter } from './types';

/**
 * Resolve a column's filterFn to its registry name, or undefined if unknown.
 * Dev warning fires when the column has an inline filterFn and the filter
 * capability is 'server' (the name cannot cross the wire).
 */
const resolveFilterFnName = <TRow>(
  col: Column<TRow, unknown>,
  warn: () => void,
): string | undefined => {
  const fn = col.def.filterFn;
  if (typeof fn === 'string') return fn;
  if (typeof fn === 'function') {
    const name = nameOfFilterFn(fn);
    if (name === undefined) {
      // Inline function with no registered name: warn once, fall back to 'equals'.
      warn();
      return 'equals';
    }
    return name;
  }
  // No filterFn set on the def: column doesn't participate in filtering.
  return undefined;
};

/** Module-level set for one-shot inline filterFn warnings (per-column-id). */
const _warnedInlineFilterColumns = new Set<string>();

/**
 * Build the outbound `RowsQuery` from the current state, columns, and capabilities.
 *
 * Concerns marked 'client' are still included in the outbound query but the
 * server is expected to ignore them; concerns marked 'server' must be honored.
 * `pagination` is included only when `capabilities.paginate === 'server'`.
 */
export const buildRowsQuery = <TRow>(
  state: DataTableState,
  columns: Array<Column<TRow, unknown>>,
  opts: BuildRowsQueryOptions,
): RowsQuery => {
  const { capabilities } = opts;
  const defaultFilterFn = opts.defaultFilterFn ?? 'equals';

  // Sorting: emit as-is. Spec §7.4: function names only; `SortItem = { id, desc }` is already name-only.
  const sorting = state.sorting;

  // Filters: resolve each filter's filterFn name. Omit `filterFn` when it
  // equals the default (saves bytes; semantics unchanged).
  const filters: SerializedFilter[] = state.columnFilters.flatMap((f) => {
    const col = columns.find((c) => c.id === f.id);
    if (!col) return []; // unknown column id; drop
    const filterFnName = resolveFilterFnName(col, () => {
      if (!_warnedInlineFilterColumns.has(col.id)) {
        _warnedInlineFilterColumns.add(col.id);
        warnInlineFilterFn(col.id);
      }
    });
    const item: SerializedFilter = { id: f.id, value: f.value };
    if (filterFnName !== undefined && filterFnName !== defaultFilterFn) {
      item.filterFn = filterFnName;
    }
    return [item];
  });

  // Pagination: include only when paginate is 'server'.
  const pagination: import('../types').PaginationState | undefined =
    capabilities.paginate === 'server' ? state.pagination : undefined;

  return { sorting, filters, ...(pagination !== undefined ? { pagination } : {}) };
};

/**
 * Dev warning: inline `filterFn` cannot cross the wire. One-shot per column id.
 * Production strips via `process.env.NODE_ENV === 'production'` check.
 */
const warnInlineFilterFn = (columnId: string): void => {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.warn(
    `[tablekit] Column "${columnId}" has an inline filterFn paired with capabilities.filter === 'server'. Register the filter with registerFilterFn(name, fn) and pass filterFn: name on the column def.`,
  );
};

/** Test-only: reset the one-shot inline filterFn warning set. */
export const __resetInlineFilterFnWarningForTests = (): void => {
  _warnedInlineFilterColumns.clear();
};
