/**
 * @lynellf/tablekit-core/dataSource — synchronous client data source.
 *
 * Spec §5.2: "createClientDataSource(rows, opts?) // resolves everything
 * synchronously in-memory." The factory wires the M2 pipeline (`filterRows`,
 * `sortRows`, `paginateRows`) into the `DataSource<TRow>` interface, honoring
 * the `capabilities` field.
 *
 * Mixed capabilities are legal (spec §5.3): a `'server'` paginate capability
 * + `'client'` sort/filter is the mixed-mode trap. The factory applies client
 * sort/filter to the in-memory rows first, then returns the resulting slice;
 * consumers wiring a real server source are responsible for the warning check
 * (the `useDataSource` hook re-runs `validateModeConfiguration` in phase 3).
 */

import { createColumns } from '../columns';
import type { Column } from '../columns';
import { filterRows } from '../pipeline/filter';
import { paginateRows } from '../pipeline/paginate';
import { sortRows } from '../pipeline/sort';
import type { ColumnDef, DataTableOptions } from '../types';
import type {
  CreateClientDataSourceOptions,
  DataSource,
  DataSourceCapabilities,
  RowsQuery,
} from './types';
import { validateModeConfiguration } from './warnings';

/**
 * Build a synchronous client-side `DataSource<TRow>` from a static rows array.
 *
 * The factory honors `capabilities`:
 *   - `capabilities.sort === 'client'` (default): apply sortRows.
 *   - `capabilities.filter === 'client'` (default): apply filterRows.
 *   - `capabilities.paginate === 'client'` (default): apply paginateRows.
 *   - `capabilities.paginate === 'server'`: return the full filtered/sorted
 *     result set (no slice); consumer is expected to set `totalRowCount` via
 *     the `totalRowCount` option (otherwise defaults to `rows.length`).
 *
 * The `signal` argument is accepted for API symmetry with server sources but
 * is not used in the synchronous path.
 */
export const createClientDataSource = <TRow>(
  rows: TRow[],
  columns: Array<ColumnDef<TRow, unknown>>,
  opts: CreateClientDataSourceOptions<TRow> = {},
): DataSource<TRow> => {
  // R2 fix: Preserve pagination strategy from capabilities.
  const capabilities: DataSourceCapabilities = {
    sort: opts.capabilities?.sort ?? 'client',
    filter: opts.capabilities?.filter ?? 'client',
    paginate: opts.capabilities?.paginate ?? 'client',
    pagination: opts.capabilities?.pagination ?? 'offset',
  };

  // One-shot dev warning on the mixed-mode trap (when paginate='server').
  if (capabilities.paginate === 'server') {
    const syntheticOptions: DataTableOptions<TRow> = {
      data: rows,
      columns,
      manualPagination: true,
      manualSorting: capabilities.sort === 'server',
      manualFiltering: capabilities.filter === 'server',
    };
    validateModeConfiguration(syntheticOptions);
  }

  return {
    capabilities,
    getRows: (
      q: RowsQuery,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _ctx: { signal: AbortSignal },
    ): { rows: TRow[]; totalRowCount: number } => {
      // Build column instances from defs.
      // v2.0.0: pagination is now PaginationWire discriminated union.
      // For offset strategy: convert offset/limit to pageIndex/pageSize.
      // For cursor strategy: client-side pagination doesn't apply; use default.
      const paginationState = (() => {
        if (!q.pagination) return { pageIndex: 0, pageSize: 25 };
        if (q.pagination.type === 'offset') {
          return {
            pageIndex: Math.floor(q.pagination.offset / q.pagination.limit),
            pageSize: q.pagination.limit,
          };
        }
        // Cursor strategy: client-side pagination doesn't apply
        return { pageIndex: 0, pageSize: 25 };
      })();

      const state = {
        sorting: q.sorting,
        columnFilters: q.filters.map((f) => ({ id: f.id, value: f.value })),
        pagination: paginationState,
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      };

      let result: TRow[] = rows;
      const resolvedColumns: Array<Column<TRow, unknown>> = createColumns(columns, state);

      // Filter (when 'client')
      if (capabilities.filter === 'client') {
        result = filterRows({
          rows: result,
          filters: state.columnFilters,
          columns: resolvedColumns,
        });
      }

      // Sort (when 'client')
      if (capabilities.sort === 'client') {
        result = sortRows({
          rows: result,
          sorting: state.sorting,
          columns: resolvedColumns,
        });
      }

      // Paginate (when 'client') — otherwise return full slice + totalRowCount.
      // v2.0.0: Only paginate for offset strategy. Cursor pagination doesn't apply client-side.
      if (capabilities.paginate === 'client' && q.pagination?.type === 'offset') {
        result = paginateRows({ rows: result, pagination: paginationState });
      }

      return { rows: result, totalRowCount: opts.totalRowCount ?? rows.length };
    },
  };
};
