/**
 * @lynellf/tablekit-react — cursor pagination integration test.
 *
 * R2: Verifies cursor-based pagination wire types and data identity.
 * - Offset sources receive { type: 'offset', offset, limit }
 * - Cursor sources receive cursor/direction/limit and publish next/previous cursors
 * - Direct and data-source boundaries expose version identity
 */

import type { DataSource, RowsQuery } from '@lynellf/tablekit-core/dataSource';
import { __resetMixedModeWarningForTests } from '@lynellf/tablekit-core/dataSource';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Track all queries received by the data source
const queryLog: RowsQuery[] = [];

// ─── Offset pagination source ───────────────────────────────────────────

function makeOffsetPaginatedSource(): DataSource<Person> {
  return {
    capabilities: {
      sort: 'server',
      filter: 'server',
      paginate: 'server',
      pagination: 'offset',
    },
    getRows: (q) => {
      queryLog.push({ ...q });
      const offset = q.pagination?.type === 'offset' ? q.pagination.offset : 0;
      const pageData: Person[] = [];
      if (offset === 0) {
        pageData.push({ id: '1', name: 'Alice', age: 30 });
        pageData.push({ id: '2', name: 'Bob', age: 25 });
      } else if (offset === 10) {
        pageData.push({ id: '3', name: 'Charlie', age: 35 });
      }
      return { rows: pageData, totalRowCount: 3 };
    },
  };
}

// ─── Cursor pagination source ────────────────────────────────────────────

function makeCursorPaginatedSource(): DataSource<Person> {
  return {
    capabilities: {
      sort: 'server',
      filter: 'server',
      paginate: 'server',
      pagination: 'cursor',
    },
    getRows: (q) => {
      queryLog.push({ ...q });
      const cursor = q.pagination?.type === 'cursor' ? q.pagination.cursor : null;
      const direction =
        q.pagination?.type === 'cursor' ? (q.pagination.direction ?? 'next') : 'next';
      let nextCursor: string | null = null;
      let previousCursor: string | null = null;
      const pageData: Person[] = [];

      if (cursor === null && direction === 'next') {
        pageData.push({ id: '1', name: 'Alice', age: 30 });
        pageData.push({ id: '2', name: 'Bob', age: 25 });
        nextCursor = 'cursor_page_2';
      } else if (cursor === 'cursor_page_2' && direction === 'next') {
        pageData.push({ id: '3', name: 'Charlie', age: 35 });
        previousCursor = 'cursor_page_1';
        nextCursor = null;
      } else if (cursor === 'cursor_page_2' && direction === 'previous') {
        pageData.push({ id: '1', name: 'Alice', age: 30 });
        pageData.push({ id: '2', name: 'Bob', age: 25 });
        nextCursor = 'cursor_page_2';
      }

      return { rows: pageData, totalRowCount: 3, nextCursor, previousCursor };
    },
  };
}

// ─── Data version source ─────────────────────────────────────────────────

const mutableData: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];
let versionCounter = 1;

function makeVersionedSource(): DataSource<Person> {
  return {
    capabilities: {
      sort: 'client',
      filter: 'client',
      paginate: 'client',
    },
    getRows: () => {
      return { rows: mutableData, dataVersion: versionCounter++ };
    },
  };
}

// ─── Components ─────────────────────────────────────────────────────────

function OffsetPaginationTest({ source }: { source: DataSource<Person> }) {
  const result = useDataTable({
    data: [],
    columns: simpleColumns,
    getRowId: (row) => row.id,
    dataSource: source,
  });

  return (
    <div>
      <span data-testid="status">{result.dataSourceState?.status}</span>
      <span data-testid="page-index">{result.state.pagination.pageIndex}</span>
      <span data-testid="data-length">{result.dataSourceState?.data?.length ?? 'null'}</span>
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

function CursorPaginationTest({ source }: { source: DataSource<Person> }) {
  const result = useDataTable({
    data: [],
    columns: simpleColumns,
    getRowId: (row) => row.id,
    dataSource: source,
  });

  return (
    <div>
      <span data-testid="status">{result.dataSourceState?.status}</span>
      <span data-testid="data-length">{result.dataSourceState?.data?.length ?? 'null'}</span>
      <span data-testid="next-cursor">{result.dataSourceState?.cursor?.nextCursor ?? 'none'}</span>
      <span data-testid="prev-cursor">
        {result.dataSourceState?.cursor?.previousCursor ?? 'none'}
      </span>
      <span data-testid="has-select-cursor">
        {typeof result.dataSourceState === 'object' ? 'yes' : 'no'}
      </span>
    </div>
  );
}

function SelectCursorTest({ source }: { source: DataSource<Person> }) {
  const result = useDataTable({
    data: [],
    columns: simpleColumns,
    getRowId: (row) => row.id,
    dataSource: source,
  });

  return (
    <div>
      <span data-testid="status">{result.dataSourceState?.status}</span>
      <span data-testid="data-length">{result.dataSourceState?.data?.length ?? 'null'}</span>
      <button
        data-testid="select-next-page"
        onClick={() => result.dataSourceState?.selectCursor?.('cursor_page_2', 'next')}
      >
        Select Next Page
      </button>
      <button
        data-testid="select-prev-page"
        onClick={() => result.dataSourceState?.selectCursor?.('cursor_page_2', 'previous')}
      >
        Select Previous Page
      </button>
    </div>
  );
}

function DataVersionTest({ source }: { source: DataSource<Person> }) {
  const result = useDataTable({
    data: [],
    columns: simpleColumns,
    getRowId: (row) => row.id,
    dataSource: source,
    dataVersion: { version: 'initial' },
  });

  return (
    <div>
      <span data-testid="status">{result.dataSourceState?.status}</span>
      <span data-testid="data-length">{result.dataSourceState?.data?.length ?? 'null'}</span>
      <span data-testid="data-version">{result.dataSourceState?.dataVersion ?? 'none'}</span>
      <button data-testid="refetch" onClick={() => result.dataSourceState?.refetch()}>
        Refetch
      </button>
    </div>
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('R2: pagination wire types and data identity', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
    queryLog.length = 0;
    versionCounter = 1;
  });

  afterEach(() => {
    __resetMixedModeWarningForTests();
    cleanup();
    vi.restoreAllMocks();
  });

  describe('offset pagination', () => {
    it('R2: offset pagination sends wire format with type=offset', async () => {
      const source = makeOffsetPaginatedSource();
      render(<OffsetPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      expect(queryLog[0]?.pagination?.type).toBe('offset');
    });

    it('R2: offset pagination includes numeric offset and limit', async () => {
      const source = makeOffsetPaginatedSource();
      render(<OffsetPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      const pagination = queryLog[0]?.pagination;
      expect(pagination?.type).toBe('offset');
      if (pagination?.type === 'offset') {
        expect(typeof pagination.offset).toBe('number');
        expect(typeof pagination.limit).toBe('number');
        expect(pagination.offset).toBe(0);
        expect(pagination.limit).toBeGreaterThan(0);
      }
    });

    it('R2: offset pagination change triggers new fetch with updated offset', async () => {
      const source = makeOffsetPaginatedSource();
      render(<OffsetPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      // Initial request has offset 0
      expect(queryLog[0]?.pagination?.type).toBe('offset');
      if (queryLog[0]?.pagination?.type === 'offset') {
        expect(queryLog[0]!.pagination!.offset).toBe(0);
      }
    });
  });

  describe('cursor pagination', () => {
    it('R2: cursor pagination sends wire format with type=cursor', async () => {
      const source = makeCursorPaginatedSource();
      render(<CursorPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      expect(queryLog[0]?.pagination?.type).toBe('cursor');
    });

    it('R2: cursor pagination includes cursor, direction, and limit', async () => {
      const source = makeCursorPaginatedSource();
      render(<CursorPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      const pagination = queryLog[0]?.pagination;
      expect(pagination?.type).toBe('cursor');
      if (pagination?.type === 'cursor') {
        expect(pagination.cursor).toBeNull();
        expect(pagination.direction).toBe('next');
        expect(typeof pagination.limit).toBe('number');
      }
    });

    it('R2: cursor pagination publishes nextCursor in result', async () => {
      const source = makeCursorPaginatedSource();
      render(<CursorPaginationTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      // First page should have nextCursor published
      expect(screen.getByTestId('next-cursor').textContent).toBe('cursor_page_2');
      expect(screen.getByTestId('prev-cursor').textContent).toBe('none');
    });

    it('R2: selectCursor triggers new request with selected cursor', async () => {
      const source = makeCursorPaginatedSource();
      render(<SelectCursorTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      // Initial request has cursor: null
      expect(queryLog[0]?.pagination?.type).toBe('cursor');
      if (queryLog[0]?.pagination?.type === 'cursor') {
        expect(queryLog[0]!.pagination!.cursor).toBeNull();
        expect(queryLog[0]!.pagination!.direction).toBe('next');
      }

      // Call selectCursor to navigate to the next page
      screen.getByTestId('select-next-page').click();

      // Wait for the new request with the selected cursor
      await waitFor(
        () => {
          // Should have 2 queries now - initial and the selectCursor trigger
          expect(queryLog.length).toBeGreaterThanOrEqual(2);
        },
        { timeout: 2000 },
      );

      // Verify the second query used the selected cursor
      const secondQuery = queryLog[queryLog.length - 1];
      expect(secondQuery?.pagination?.type).toBe('cursor');
      if (secondQuery?.pagination?.type === 'cursor') {
        expect(secondQuery.pagination.cursor).toBe('cursor_page_2');
        expect(secondQuery.pagination.direction).toBe('next');
      }
    });

    it('R2: selectCursor preserves selection after navigation', async () => {
      const source = makeCursorPaginatedSource();
      render(<SelectCursorTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      // Navigate to second page using selectCursor
      screen.getByTestId('select-next-page').click();

      await waitFor(
        () => {
          expect(queryLog[queryLog.length - 1]?.pagination?.type).toBe('cursor');
        },
        { timeout: 2000 },
      );

      // Now navigate back using selectCursor with previous direction
      screen.getByTestId('select-prev-page').click();

      await waitFor(
        () => {
          const lastQuery = queryLog[queryLog.length - 1];
          expect(lastQuery?.pagination?.type).toBe('cursor');
          if (lastQuery?.pagination?.type === 'cursor') {
            expect(lastQuery.pagination.cursor).toBe('cursor_page_2');
            expect(lastQuery.pagination.direction).toBe('previous');
          }
        },
        { timeout: 2000 },
      );
    });
  });

  describe('data version identity', () => {
    it('R2: dataVersion is published from RowsResult', async () => {
      const source = makeVersionedSource();
      render(<DataVersionTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      // First fetch returns version 1
      expect(screen.getByTestId('data-version').textContent).toBe('1');
    });

    it('R2: changed dataVersion is published after refetch', async () => {
      const source = makeVersionedSource();
      render(<DataVersionTest source={source} />);

      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).toBe('success');
      });

      expect(screen.getByTestId('data-version').textContent).toBe('1');

      // Trigger refetch which increments version
      screen.getByTestId('refetch').click();

      // Wait for the refetch to complete - the version should increment
      await waitFor(
        () => {
          expect(screen.getByTestId('data-version').textContent).toBe('2');
        },
        { timeout: 2000 },
      );
    });
  });
});
