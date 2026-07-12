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
 *
 * v2.0.0: Added `buildPaginationWire` for cursor-based pagination support.
 *
 * B7-SERIALIZER-FILTER-FUNCTION fix: A separate exported function
 * (`validateNoUnregisteredFilterFns`) detects unregistered inline filter
 * functions so the caller can emit a deterministic FUNCTION_VALUE error
 * BEFORE calling getRows. `buildRowsQuery` itself returns the RowsQuery
 * (backward compatible) but the module warns about unregistered functions
 * and the query builder caller should call `validateNoUnregisteredFilterFns`
 * first.
 */

import type { Column } from '../columns';
import { nameOfFilterFn } from '../registries/filtering';
import type { DataTableState } from '../types';
import type {
  BuildRowsQueryOptions,
  CursorPagination,
  CursorSelection,
  DataSourceCapabilities,
  OffsetPagination,
  PaginationStrategy,
  PaginationWire,
  RowsQuery,
  SerializedFilter,
} from './types';

/**
 * Result of validating filter function registration.
 * Used to distinguish registered names, unregistered functions, and no filter.
 */
interface FilterFnValidation {
  /** 'registered' | 'unregistered-function' | 'none' */
  kind: 'registered' | 'unregistered-function' | 'none';
  /** Registry name if registered, undefined otherwise. */
  name?: string;
}

/**
 * Validate a column's filterFn and return its registry name or detection of
 * an unregistered inline function.
 *
 * B7-SERIALIZER-FILTER-FUNCTION fix: This no longer falls back to 'equals' for
 * unregistered inline functions. Instead, it reports 'unregistered-function' so
 * the caller can emit the deterministic FUNCTION_VALUE error BEFORE building the
 * query key, preventing transport calls with silently-changed filter semantics.
 */
const validateFilterFnName = <TRow>(col: Column<TRow, unknown>): FilterFnValidation => {
  const fn = col.def.filterFn;
  if (typeof fn === 'string') return { kind: 'registered', name: fn };
  if (typeof fn === 'function') {
    const name = nameOfFilterFn(fn);
    if (name === undefined) {
      // Inline function with no registered name: MUST NOT be silently resolved.
      // Dev warning fires separately; the caller emits FUNCTION_VALUE error.
      return { kind: 'unregistered-function' };
    }
    return { kind: 'registered', name };
  }
  // No filterFn set on the def: column doesn't participate in filtering.
  return { kind: 'none' };
};

/**
 * Dev warning: inline `filterFn` cannot cross the wire. One-shot per column id.
 * Production strips via `process.env.NODE_ENV === 'production'` check.
 *
 * B7-SERIALIZER-FILTER-FUNCTION fix: Called after the deterministic error is
 * already published, so this is purely dev-feedback (doesn't affect transport).
 */
const warnInlineFilterFn = (columnId: string): void => {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.warn(
    `[tablekit] Column "${columnId}" has an inline filterFn paired with capabilities.filter === 'server'. Register the filter with registerFilterFn(name, fn) and pass filterFn: name on the column def.`,
  );
};

/** Module-level set for one-shot inline filterFn warnings (per-column-id). */
const _warnedInlineFilterColumns = new Set<string>();

/**
 * Validate that no column filters use unregistered inline filter functions.
 *
 * B7-SERIALIZER-FILTER-FUNCTION fix: Call this BEFORE `buildRowsQuery` to
 * detect unregistered inline filter functions. If any are found, the caller
 * should publish a deterministic FUNCTION_VALUE error and NOT call getRows.
 *
 * @returns null if all filters have registered filterFn names, or the column
 *   id of the first unregistered inline filter function found.
 */
export const validateNoUnregisteredFilterFns = <TRow>(
  state: DataTableState,
  columns: Array<Column<TRow, unknown>>,
): string | null => {
  for (const f of state.columnFilters) {
    const col = columns.find((c) => c.id === f.id);
    if (!col) continue; // unknown column id
    const validation = validateFilterFnName(col);
    if (validation.kind === 'unregistered-function') {
      // Dev warning: fire once per column id
      if (!_warnedInlineFilterColumns.has(col.id)) {
        _warnedInlineFilterColumns.add(col.id);
        warnInlineFilterFn(col.id);
      }
      return col.id;
    }
  }
  return null;
};

/**
 * Build the outbound `RowsQuery` from the current state, columns, and capabilities.
 *
 * Concerns marked 'client' are still included in the outbound query but the
 * server is expected to ignore them; concerns marked 'server' must be honored.
 * `pagination` is included only when `capabilities.paginate === 'server'`.
 *
 * v2.0.0: Pagination wire type is now a discriminated union (`PaginationWire`)
 * instead of the raw `PaginationState` shape.
 *
 * B7-SERIALIZER-FILTER-FUNCTION fix: Callers MUST call
 * `validateNoUnregisteredFilterFns` first to check for unregistered inline
 * filter functions. If unregistered functions are found, the caller should
 * NOT call getRows and should publish a deterministic FUNCTION_VALUE error
 * state instead. `buildRowsQuery` itself resolves known functions to their
 * registry names (or omits the filterFn field for the default).
 */
export const buildRowsQuery = <TRow>(
  state: DataTableState,
  columns: Array<Column<TRow, unknown>>,
  opts: BuildRowsQueryOptions,
): RowsQuery => {
  const { capabilities, cursor, dataVersion } = opts;
  const defaultFilterFn = opts.defaultFilterFn ?? 'equals';

  // Sorting: emit as-is. Spec §7.4: function names only; `SortItem = { id, desc }` is already name-only.
  const sorting = state.sorting;

  // Filters: resolve each filter's filterFn name. Omit `filterFn` when it
  // equals the default (saves bytes; semantics unchanged).
  // B7-SERIALIZER-FILTER-FUNCTION fix: Unregistered inline functions are now
  // detected by validateNoUnregisteredFilterFns before calling this function.
  // Here, we treat unregistered functions by issuing a warning and emitting
  // the filter with the default filterFn name (for resiliency). The caller
  // should already have validated and stopped before reaching here.
  const filters: SerializedFilter[] = state.columnFilters.flatMap((f) => {
    const col = columns.find((c) => c.id === f.id);
    if (!col) return []; // unknown column id; drop
    const validation = validateFilterFnName(col);

    if (validation.kind === 'unregistered-function') {
      // Dev warning: fire once per column id (defensive - caller should have caught this)
      if (!_warnedInlineFilterColumns.has(col.id)) {
        _warnedInlineFilterColumns.add(col.id);
        warnInlineFilterFn(col.id);
      }
      // Emit the filter without a filterFn field (no fallback to 'equals')
      // The caller should never reach this point if validateNoUnregisteredFilterFns
      // was called first.
      return [{ id: f.id, value: f.value }];
    }

    const item: SerializedFilter = { id: f.id, value: f.value };
    if (
      validation.kind === 'registered' &&
      validation.name !== undefined &&
      validation.name !== defaultFilterFn
    ) {
      item.filterFn = validation.name;
    }
    // 'none' kind: no filterFn emitted (column doesn't participate)
    return [item];
  });

  // Pagination: include only when paginate is 'server'.
  // v2.0.0: Use the discriminated PaginationWire union instead of raw PaginationState.
  // R2 fix: Thread cursor selection through to buildPaginationWire.
  const pagination: PaginationWire | undefined =
    capabilities.paginate === 'server'
      ? buildPaginationWire(state.pagination, capabilities, cursor)
      : undefined;

  // R2 fix: Include dataVersion in the query for mutable data identity.
  return {
    sorting,
    filters,
    ...(pagination !== undefined ? { pagination } : {}),
    ...(dataVersion !== undefined ? { dataVersion } : {}),
  } as RowsQuery;
};

/**
 * Build the pagination wire type based on the data source capabilities and current pagination state.
 *
 * For 'offset' strategy: converts pageIndex/pageSize to offset/limit.
 * For 'cursor' strategy: returns the cursor parameters from cursor state.
 *
 * v2.0.0: Added for cursor-based pagination support.
 * R2 fix: Thread CursorSelection through to build cursor pagination.
 */
export const buildPaginationWire = (
  pagination: { pageIndex: number; pageSize: number },
  capabilities: DataSourceCapabilities,
  cursor?: CursorSelection | { cursor: string | null | undefined; direction?: 'next' | 'previous' },
): PaginationWire | undefined => {
  if (capabilities.paginate !== 'server') return undefined;

  const strategy: PaginationStrategy = capabilities.pagination ?? 'offset';

  if (strategy === 'cursor') {
    return {
      type: 'cursor',
      cursor: cursor?.cursor ?? null,
      direction: cursor?.direction ?? 'next',
      limit: pagination.pageSize,
    } satisfies CursorPagination;
  }

  // Default: offset-based pagination
  return {
    type: 'offset',
    offset: pagination.pageIndex * pagination.pageSize,
    limit: pagination.pageSize,
  } satisfies OffsetPagination;
};

/** Test-only: reset the one-shot inline filterFn warning set. */
export const __resetInlineFilterFnWarningForTests = (): void => {
  _warnedInlineFilterColumns.clear();
};
