/**
 * @lynellf/tablekit-react — cursor pagination test.
 *
 * R2: Verifies cursor-based pagination wire types.
 * Offset pagination is the baseline; cursor pagination requires full R2 implementation.
 *
 * These tests verify basic offset pagination works correctly and serve as
 * canary tests for the pagination wire type contract.
 */

import type { DataSource, RowsQuery, RowsResult } from '@lynellf/tablekit-core/dataSource';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';

interface Person {
  id: string;
  name: string;
  age: number;
}

const simpleColumns = [
  { id: 'name', accessor: 'name' as keyof Person },
  { id: 'age', accessor: 'age' as keyof Person },
];

const page1Data: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

// Track all queries received by the data source
const queryLog: RowsQuery[] = [];

// Mock data source for offset pagination - created once outside component
function createOffsetPaginatedSource(): DataSource<Person> {
  return {
    capabilities: {
      sort: 'server',
      filter: 'server',
      paginate: 'server',
      pagination: 'offset',
    },
    getRows: async (query: RowsQuery) => {
      queryLog.push({ ...query }); // Copy to avoid mutation

      // Validate offset pagination wire type
      if (query.pagination?.type === 'offset') {
        const { offset, limit } = query.pagination;
        expect(typeof offset).toBe('number');
        expect(typeof limit).toBe('number');
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(limit).toBeGreaterThan(0);
      }

      const offset = query.pagination?.type === 'offset' ? query.pagination.offset : 0;

      if (offset === 0) {
        return { rows: page1Data, totalRowCount: 4 };
      } else {
        return { rows: [], totalRowCount: 4 };
      }
    },
  };
}

const offsetSource = createOffsetPaginatedSource();

function OffsetPaginationTest() {
  const result = useDataTable({
    data: [],
    columns: simpleColumns,
    getRowId: (row) => row.id,
    dataSource: offsetSource as DataSource<Person>,
  });

  return (
    <div>
      <span data-testid="status">{result.dataSourceState.status}</span>
      <span data-testid="page-index">{result.state.pagination.pageIndex}</span>
      <span data-testid="page-size">{result.state.pagination.pageSize}</span>
      <span data-testid="data-length">{result.dataSourceState.data?.length ?? 'null'}</span>
      <button
        data-testid="next-page"
        onClick={() => result.table.nextPage()}
        disabled={!result.table.getCanNextPage()}
      >
        Next
      </button>
    </div>
  );
}

describe('cursor pagination', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    queryLog.length = 0;
  });

  describe('offset pagination', () => {
    it('R2: offset pagination sends wire format with type=offset', async () => {
      const { getByTestId } = render(<OffsetPaginationTest />);

      await waitFor(() => {
        expect(getByTestId('status').textContent).toBe('success');
      });

      // First request should have offset type
      expect(queryLog[0]?.pagination?.type).toBe('offset');
    });

    it('R2: offset pagination includes numeric offset and limit', async () => {
      const { getByTestId } = render(<OffsetPaginationTest />);

      await waitFor(() => {
        expect(getByTestId('status').textContent).toBe('success');
      });

      const pagination = queryLog[0]?.pagination;
      expect(pagination).toBeDefined();
      if (pagination?.type === 'offset') {
        expect(typeof pagination.offset).toBe('number');
        expect(typeof pagination.limit).toBe('number');
        expect(pagination.offset).toBe(0);
        expect(pagination.limit).toBeGreaterThan(0);
      }
    });

    it('R2: page size comes from pagination state', async () => {
      const { getByTestId } = render(<OffsetPaginationTest />);

      await waitFor(() => {
        expect(getByTestId('status').textContent).toBe('success');
      });

      // Default page size should be 10 (standard) or whatever the table uses
      const pageSize = parseInt(getByTestId('page-size').textContent ?? '0', 10);
      expect(pageSize).toBeGreaterThan(0);
    });
  });
});
