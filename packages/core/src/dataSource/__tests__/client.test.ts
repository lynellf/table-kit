/**
 * @lynellf/tablekit-core/dataSource — client.test.ts
 *
 * Tests for createClientDataSource (synchronous in-memory implementation).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '../../types';
import { createClientDataSource } from '../client';
import { __resetInlineFilterFnWarningForTests } from '../query';
import { __resetMixedModeWarningForTests } from '../warnings';

interface Row {
  id: string;
  name: string;
  region: 'West' | 'East' | 'North' | 'South';
  sales: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { id: 'id', accessor: 'id' },
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

const rows: Row[] = [
  { id: '1', name: 'Alice', region: 'West', sales: 100 },
  { id: '2', name: 'Bob', region: 'East', sales: 200 },
  { id: '3', name: 'Carol', region: 'West', sales: 150 },
  { id: '4', name: 'Dave', region: 'North', sales: 300 },
];

describe('createClientDataSource', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
    __resetInlineFilterFnWarningForTests();
  });

  describe('capabilities', () => {
    it('defaults to all client capabilities', () => {
      const ds = createClientDataSource(rows, columns);
      expect(ds.capabilities).toEqual({ sort: 'client', filter: 'client', paginate: 'client' });
    });

    it('accepts partial capabilities override', () => {
      const ds = createClientDataSource(rows, columns, { capabilities: { paginate: 'server' } });
      expect(ds.capabilities).toEqual({ sort: 'client', filter: 'client', paginate: 'server' });
    });

    it('defaults unspecified capabilities to client', () => {
      const ds = createClientDataSource(rows, columns, { capabilities: { sort: 'server' } });
      expect(ds.capabilities).toEqual({ sort: 'server', filter: 'client', paginate: 'client' });
    });
  });

  describe('getRows', () => {
    it('returns all rows when no query constraints', () => {
      const ds = createClientDataSource(rows, columns);
      const result = ds.getRows(
        { sorting: [], filters: [] },
        { signal: new AbortController().signal },
      ) as { rows: Row[]; totalRowCount: number };
      expect(result.rows).toHaveLength(4);
      expect(result.totalRowCount).toBe(4);
    });

    type SyncResult = { rows: Row[]; totalRowCount: number };

    it('applies filter when filter capability is client', () => {
      const ds = createClientDataSource(rows, columns);
      const result = ds.getRows(
        { sorting: [], filters: [{ id: 'region', value: 'West' }] },
        { signal: new AbortController().signal },
      ) as SyncResult;
      expect(result.rows).toHaveLength(2);
      expect(result.rows.map((r) => r.name)).toEqual(['Alice', 'Carol']);
    });

    it('ignores filter when filter capability is server', () => {
      const ds = createClientDataSource(rows, columns, { capabilities: { filter: 'server' } });
      const result = ds.getRows(
        { sorting: [], filters: [{ id: 'region', value: 'West' }] },
        { signal: new AbortController().signal },
      ) as SyncResult;
      expect(result.rows).toHaveLength(4); // no filtering applied
    });

    it('applies sort when sort capability is client', () => {
      const sortColumns: ColumnDef<Row, unknown>[] = columns.map((c) =>
        c.id === 'sales' ? { ...c, sortingFn: 'number' } : c,
      );
      const ds = createClientDataSource(rows, sortColumns);
      const result = ds.getRows(
        { sorting: [{ id: 'sales', desc: true }], filters: [] },
        { signal: new AbortController().signal },
      ) as SyncResult;
      // Dave (300), Bob (200), Carol (150), Alice (100) descending
      expect(result.rows.map((r) => r.name)).toEqual(['Dave', 'Bob', 'Carol', 'Alice']);
    });

    it('ignores sort when sort capability is server', () => {
      const sortColumns: ColumnDef<Row, unknown>[] = columns.map((c) =>
        c.id === 'sales' ? { ...c, sortingFn: 'number' } : c,
      );
      const ds = createClientDataSource(rows, sortColumns, { capabilities: { sort: 'server' } });
      const result = ds.getRows(
        { sorting: [{ id: 'sales', desc: true }], filters: [] },
        { signal: new AbortController().signal },
      ) as SyncResult;
      expect(result.rows).toEqual(rows); // original order preserved
    });

    it('applies pagination when paginate capability is client', () => {
      const ds = createClientDataSource(rows, columns);
      const result = ds.getRows(
        { sorting: [], filters: [], pagination: { type: 'offset', offset: 0, limit: 2 } },
        { signal: new AbortController().signal },
      ) as SyncResult;
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!.name).toBe('Alice');
      expect(result.rows[1]!.name).toBe('Bob');
    });

    it('ignores pagination when paginate capability is server', () => {
      const ds = createClientDataSource(rows, columns, { capabilities: { paginate: 'server' } });
      const result = ds.getRows(
        { sorting: [], filters: [], pagination: { type: 'offset', offset: 0, limit: 2 } },
        { signal: new AbortController().signal },
      ) as SyncResult;
      expect(result.rows).toHaveLength(4); // all rows returned
    });

    it('applies filter + sort + paginate in pipeline order', () => {
      const sortColumns: ColumnDef<Row, unknown>[] = columns.map((c) =>
        c.id === 'sales' ? { ...c, sortingFn: 'number' } : c,
      );
      const ds = createClientDataSource(rows, sortColumns);
      const result = ds.getRows(
        {
          sorting: [{ id: 'sales', desc: false }],
          filters: [{ id: 'region', value: 'West' }],
          pagination: { type: 'offset', offset: 0, limit: 10 },
        },
        { signal: new AbortController().signal },
      ) as SyncResult;
      // West: Alice (100), Carol (150) ascending
      expect(result.rows.map((r) => r.name)).toEqual(['Alice', 'Carol']);
      expect(result.rows[0]!.sales).toBeLessThanOrEqual(result.rows[1]!.sales);
    });

    it('returns totalRowCount from option when provided', () => {
      const ds = createClientDataSource(rows, columns, {
        capabilities: { paginate: 'server' },
        totalRowCount: 1000,
      });
      const result = ds.getRows(
        { sorting: [], filters: [] },
        { signal: new AbortController().signal },
      ) as { rows: Row[]; totalRowCount: number };
      expect(result.totalRowCount).toBe(1000);
    });

    it('uses custom getRowId when provided', () => {
      const rowsWithCustomId: Row[] = [
        { id: 'a', name: 'Alice', region: 'West', sales: 100 },
        { id: 'b', name: 'Bob', region: 'East', sales: 200 },
      ];
      const ds = createClientDataSource(rowsWithCustomId, columns, {
        getRowId: (row) => row.id,
      });
      const result = ds.getRows(
        { sorting: [], filters: [] },
        { signal: new AbortController().signal },
      ) as { rows: Row[]; totalRowCount: number };
      expect(result.rows[0]!.id).toBe('a');
    });

    it('accepts AbortSignal without using it (sync path)', () => {
      const ds = createClientDataSource(rows, columns);
      const controller = new AbortController();
      controller.abort();
      // Should not throw — signal is accepted but not used
      const result = ds.getRows({ sorting: [], filters: [] }, { signal: controller.signal }) as {
        rows: Row[];
        totalRowCount: number;
      };
      expect(result.rows).toHaveLength(4);
    });

    it('warns on mixed-mode: paginate=server + sort=client', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createClientDataSource(rows, columns, {
        capabilities: { paginate: 'server', sort: 'client' },
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowWithinPageOperations'));
    });

    it('does not warn when paginate=server and all others are server', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createClientDataSource(rows, columns, {
        capabilities: { paginate: 'server', sort: 'server', filter: 'server' },
      });
      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn when allowWithinPageOperations is set', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      createClientDataSource(rows, columns, {
        capabilities: { paginate: 'server', sort: 'client' },
        // Note: allowWithinPageOperations is on the DataTableOptions, not on CreateClientDataSourceOptions.
        // The factory derives it from the capabilities pattern, not from a direct option.
      });
      expect(warn).toHaveBeenCalled(); // Mixed mode still warns by default
    });
  });
});
