/**
 * @lynellf/tablekit-core/dataSource — query.test.ts
 *
 * Unit tests for buildRowsQuery (RowsQuery serialization).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createColumns } from '../../columns';
import type { DataTableState } from '../../types';
import type { ColumnDef } from '../../types';
import {
  __resetInlineFilterFnWarningForTests,
  buildPaginationWire,
  buildRowsQuery,
} from '../query';

describe('buildRowsQuery', () => {
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
    rowSelection: {},
  };

  const baseColumns: ColumnDef<Record<string, unknown>, unknown>[] = [
    { id: 'name', accessor: 'name' },
    { id: 'region', accessor: 'region', enableFiltering: true, filterFn: 'equalsString' },
    {
      id: 'sales',
      accessor: 'sales',
      enableSorting: true,
      enableFiltering: true,
      filterFn: 'inNumberRange',
    },
  ];

  it('empty state returns empty sorting + filters + no pagination', () => {
    const q = buildRowsQuery(baseState, [], {
      capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
    });
    expect(q.sorting).toEqual([]);
    expect(q.filters).toEqual([]);
    expect(q.pagination).toBeUndefined();
  });

  it('includes sorting regardless of capability', () => {
    const state = { ...baseState, sorting: [{ id: 'name', desc: false }] };
    const q = buildRowsQuery(state, [], {
      capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
    });
    expect(q.sorting).toEqual([{ id: 'name', desc: false }]);
  });

  it('sorting is included when capability is server', () => {
    const state = { ...baseState, sorting: [{ id: 'name', desc: true }] };
    const q = buildRowsQuery(state, [], {
      capabilities: { sort: 'server', filter: 'client', paginate: 'client' },
    });
    expect(q.sorting).toEqual([{ id: 'name', desc: true }]);
  });

  it('multi-sort: includes all sort items', () => {
    const state = {
      ...baseState,
      sorting: [
        { id: 'region', desc: false },
        { id: 'sales', desc: true },
      ],
    };
    const q = buildRowsQuery(state, [], {
      capabilities: { sort: 'server', filter: 'client', paginate: 'client' },
    });
    expect(q.sorting).toHaveLength(2);
    expect(q.sorting[0]).toEqual({ id: 'region', desc: false });
    expect(q.sorting[1]).toEqual({ id: 'sales', desc: true });
  });

  it('includes pagination when paginate is server', () => {
    const q = buildRowsQuery(baseState, [], {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
    });
    // v2.0.0: Pagination is now PaginationWire discriminated union
    expect(q.pagination).toEqual({ type: 'offset', offset: 0, limit: 25 });
  });

  it('omits pagination when paginate is client', () => {
    const q = buildRowsQuery(baseState, [], {
      capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
    });
    expect(q.pagination).toBeUndefined();
  });

  it('includes filters with id + value', () => {
    const state = {
      ...baseState,
      columnFilters: [{ id: 'region', value: 'West' }],
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const q = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    expect(q.filters).toEqual([{ id: 'region', value: 'West', filterFn: 'equalsString' }]);
  });

  it('omits filterFn when it matches the default', () => {
    const columns: ColumnDef<Record<string, unknown>, unknown>[] = [
      { id: 'id', accessor: 'id', filterFn: 'equals' },
    ];
    const state = {
      ...baseState,
      columnFilters: [{ id: 'id', value: '1' }],
    };
    const resolvedColumns = createColumns(columns, state);
    const q = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    expect(q.filters[0]).toEqual({ id: 'id', value: '1' });
    expect(q.filters[0]).not.toHaveProperty('filterFn');
  });

  it('includes filterFn when it differs from the default', () => {
    const state = {
      ...baseState,
      columnFilters: [{ id: 'region', value: 'West' }],
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const q = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    expect(q.filters[0]).toHaveProperty('filterFn', 'equalsString');
  });

  it('skips unknown column ids in filters', () => {
    const state = {
      ...baseState,
      columnFilters: [{ id: 'unknown-col', value: 'foo' }],
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const q = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    expect(q.filters).toEqual([]);
  });

  afterEach(() => {
    __resetInlineFilterFnWarningForTests();
    vi.restoreAllMocks();
  });

  it('warns once when an inline filterFn is paired with server capability', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const inlineColumns: ColumnDef<Record<string, unknown>, unknown>[] = [
      {
        id: 'name',
        accessor: 'name',
        filterFn: (row: Record<string, unknown>) => String(row.name).startsWith('A'),
      },
    ];
    const state = {
      ...baseState,
      columnFilters: [{ id: 'name', value: null }],
    };
    const resolvedColumns = createColumns(inlineColumns, state);

    buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });
    buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'client', filter: 'server', paginate: 'client' },
    });

    // Once per column id (not once per call) — module-level Set persists across calls
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('inline filterFn'));
  });

  it('output is deterministic (stable JSON)', () => {
    const state = {
      ...baseState,
      sorting: [{ id: 'name', desc: false }],
      columnFilters: [{ id: 'region', value: 'West' }],
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const q1 = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    });
    const q2 = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    });
    expect(JSON.stringify(q1)).toBe(JSON.stringify(q2));
  });

  it('full query with all sections', () => {
    const state = {
      ...baseState,
      sorting: [{ id: 'name', desc: false }],
      columnFilters: [{ id: 'region', value: 'West' }],
      pagination: { pageIndex: 2, pageSize: 25 },
    };
    const resolvedColumns = createColumns(baseColumns, state);
    const q = buildRowsQuery(state, resolvedColumns, {
      capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    });
    expect(q.sorting).toEqual([{ id: 'name', desc: false }]);
    expect(q.filters).toEqual([{ id: 'region', value: 'West', filterFn: 'equalsString' }]);
    // v2.0.0: Pagination is now PaginationWire discriminated union
    expect(q.pagination).toEqual({ type: 'offset', offset: 50, limit: 25 });
  });

  // ─── Cursor pagination (R2) ─────────────────────────────────────────────────

  describe('R2: cursor pagination', () => {
    it('returns cursor pagination wire with default cursor when strategy is cursor', () => {
      const result = buildPaginationWire(
        { pageIndex: 0, pageSize: 25 },
        { sort: 'server', filter: 'server', paginate: 'server', pagination: 'cursor' },
      );
      expect(result).toEqual({
        type: 'cursor',
        cursor: null,
        direction: 'next',
        limit: 25,
      });
    });

    it('returns cursor pagination wire with provided cursor and direction', () => {
      const result = buildPaginationWire(
        { pageIndex: 0, pageSize: 25 },
        { sort: 'server', filter: 'server', paginate: 'server', pagination: 'cursor' },
        { cursor: 'abc123', direction: 'next' as const },
      );
      expect(result).toEqual({
        type: 'cursor',
        cursor: 'abc123',
        direction: 'next',
        limit: 25,
      });
    });

    it('returns cursor pagination wire with previous direction', () => {
      const result = buildPaginationWire(
        { pageIndex: 0, pageSize: 10 },
        { sort: 'server', filter: 'server', paginate: 'server', pagination: 'cursor' },
        { cursor: 'xyz789', direction: 'previous' as const },
      );
      expect(result).toEqual({
        type: 'cursor',
        cursor: 'xyz789',
        direction: 'previous',
        limit: 10,
      });
    });

    it('returns offset pagination wire when strategy is offset (default)', () => {
      const result = buildPaginationWire(
        { pageIndex: 3, pageSize: 25 },
        { sort: 'server', filter: 'server', paginate: 'server' },
      );
      expect(result).toEqual({
        type: 'offset',
        offset: 75,
        limit: 25,
      });
    });

    it('returns undefined when paginate is client', () => {
      const result = buildPaginationWire(
        { pageIndex: 0, pageSize: 25 },
        { sort: 'server', filter: 'server', paginate: 'client' },
      );
      expect(result).toBeUndefined();
    });
  });
});
