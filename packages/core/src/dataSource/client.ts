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
import { defaultGetRowId } from '../columns';
import { filterRows } from '../pipeline/filter';
import { sortRows } from '../pipeline/sort';
import { paginateRows } from '../pipeline/paginate';
import { validateModeConfiguration } from './warnings';
import type {
  CreateClientDataSourceOptions,
  DataSource,
  DataSourceCapabilities,
  RowsQuery,
} from './types';
import type { ColumnDef, DataTableOptions } from '../types';

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
  const capabilities: DataSourceCapabilities = {
    sort: opts.capabilities?.sort ?? 'client',
    filter: opts.capabilities?.filter ?? 'client',
    paginate: opts.capabilities?.paginate ?? 'client',
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
      const state = {
        sorting: q.sorting,
        columnFilters: q.filters.map((f) => ({ id: f.id, value: f.value })),
        pagination: q.pagination ?? { pageIndex: 0, pageSize: 25 },
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
      if (capabilities.paginate === 'client' && q.pagination) {
        result = paginateRows({ rows: result, pagination: q.pagination });
      }

      return { rows: result, totalRowCount: opts.totalRowCount ?? rows.length };
    },
  };
};
