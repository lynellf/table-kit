import { describe, expect, it } from 'vitest';
import { RowModelCache, buildMemoKey, memoKeysEqual } from './memo';
import type { DataTableOptions, DataTableState, Row } from '../types';

interface Person {
  id: string;
  name: string;
}

const baseOpts = (): DataTableOptions<Person> => ({
  data: [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ],
  columns: [{ id: 'name', accessor: 'name' }],
});

describe('buildMemoKey', () => {
  it('builds a key from the relevant fields', () => {
    const opts = baseOpts();
    const key = buildMemoKey({
      data: opts.data,
      columns: opts.columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    expect(key.data).toBe(opts.data);
    expect(key.sorting).toEqual([]);
  });
});

describe('memoKeysEqual', () => {
  it('returns false for null first arg', () => {
    const key = buildMemoKey({
      data: baseOpts().data,
      columns: baseOpts().columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    expect(memoKeysEqual(null, key)).toBe(false);
  });

  it('returns true when same key object is passed twice', () => {
    const data = baseOpts().data;
    const key = buildMemoKey({
      data,
      columns: baseOpts().columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    expect(memoKeysEqual(key, key)).toBe(true);
  });

  it('returns false when data identity changes', () => {
    const a = buildMemoKey({
      data: baseOpts().data,
      columns: baseOpts().columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    const b = buildMemoKey({
      data: [{ id: '99', name: 'Z' }],
      columns: baseOpts().columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    expect(memoKeysEqual(a, b)).toBe(false);
  });
});

describe('RowModelCache', () => {
  it('returns the same reference on a hit', () => {
    const cache = new RowModelCache<Person>();
    const opts = baseOpts();
    const state: DataTableState = {
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

    // Simulate building rows
    const rows: Row<Person>[] = [];
    cache.setCachedResult(opts.data as unknown as unknown[], state, rows);
    
    // Get memo key and verify cache hit
    const memoKey = cache.getMemoKey();
    expect(memoKey.cachedRows).toBe(rows);
    expect(memoKey.data).toBe(opts.data);
  });

  it('invalidate clears the cache', () => {
    const cache = new RowModelCache<Person>();
    const opts = baseOpts();
    const state: DataTableState = {
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

    const rows: Row<Person>[] = [];
    cache.setCachedResult(opts.data as unknown as unknown[], state, rows);
    cache.invalidate();
    
    const memoKey = cache.getMemoKey();
    expect(memoKey.cachedRows).toBeNull();
    expect(memoKey.data).toBeNull();
  });
});
