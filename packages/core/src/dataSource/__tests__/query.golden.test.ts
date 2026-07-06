import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createColumns } from '../../columns';
import type { DataTableState } from '../../types';
import type { ColumnDef } from '../../types';
import { buildRowsQuery } from '../query';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, `fixtures/rowsQuery/${name}.json`), 'utf8').trim();

const baseState: DataTableState = {
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

const baseColumns: Array<ColumnDef<unknown, unknown>> = [
  { id: 'name', accessor: (row: unknown) => String((row as { name: string }).name) },
  {
    id: 'region',
    accessor: (row: unknown) => String((row as { region: string }).region),
    enableFiltering: true,
    filterFn: 'equalsString',
  },
  {
    id: 'sales',
    accessor: (row: unknown) => (row as { sales: number }).sales,
    enableSorting: true,
    enableFiltering: true,
    filterFn: 'inNumberRange',
  },
];

describe('RowsQuery serialization golden tests (spec §13)', () => {
  it('empty state → empty query', () => {
    const out = buildRowsQuery(baseState, [], {
      capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
    });
    expect(JSON.stringify(out)).toBe(fixture('01-empty'));
  });

  it('sort by name asc → sort + empty filters', () => {
    const state = { ...baseState, sorting: [{ id: 'name', desc: false }] };
    const out = buildRowsQuery(state, [], {
      capabilities: { sort: 'server', filter: 'client', paginate: 'client' },
    });
    expect(JSON.stringify(out)).toBe(fixture('02-sort-asc'));
  });

  it('multi-sort → two sort items', () => {
    const state = {
      ...baseState,
      sorting: [
        { id: 'region', desc: false },
        { id: 'sales', desc: true },
      ],
    };
    const out = buildRowsQuery(state, [], {
      capabilities: { sort: 'server', filter: 'client', paginate: 'client' },
    });
    expect(JSON.stringify(out)).toBe(fixture('03-multi-sort'));
  });

  it('range filter → filter with array value, no filterFn', () => {
    const state = {
      ...baseState,
      columnFilters: [{ id: 'sales', value: [100, 500] }],
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const out = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    expect(JSON.stringify(out)).toBe(fixture('04-filter-range'));
  });

  it('paginated query → all three sections', () => {
    const state = {
      ...baseState,
      sorting: [{ id: 'name', desc: false }],
      columnFilters: [{ id: 'region', value: 'West' }],
      pagination: { pageIndex: 2, pageSize: 25 },
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const out = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    });
    expect(JSON.stringify(out)).toBe(fixture('05-paginated'));
  });
});
