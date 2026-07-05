/**
 * @lynellf/tablekit-react — abort-stale.test.tsx
 *
 * Integration test: state changes trigger re-fetch for server sources.
 * Uses plain functions (no vi.fn()) for reliability.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';
import { __resetMixedModeWarningForTests } from '@lynellf/tablekit-core/dataSource';
import { useState } from 'react';

interface Row {
  id: string;
  name: string;
}

// Track calls with a module-level array (persists across renders)
const getRowsCalls: Array<{ pagination?: { pageIndex: number; pageSize: number }; timestamp: number }> = [];

function makeServerSource(): DataSource<Row> {
  return {
    capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    getRows: (q) => {
      getRowsCalls.push({ pagination: q.pagination, timestamp: Date.now() });
      return { rows: [{ id: '1', name: 'Alice' }], totalRowCount: 1 };
    },
  };
}

describe('abort-stale integration', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
    getRowsCalls.length = 0;
  });

  afterEach(() => {
    __resetMixedModeWarningForTests();
  });

  it('triggers a re-fetch when pagination state changes', async () => {
    const source = makeServerSource();

    function App() {
      const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
      const { table, dataSourceState } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
        state: { pagination },
        onPaginationChange: setPagination,
      });
      return (
        <div>
          <span data-testid="status">{dataSourceState?.status}</span>
          <button
            data-testid="next-page"
            onClick={() => {
              console.log('Click handler, current pagination:', pagination);
              setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
            }}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      );
    }

    render(<App />);

    // Wait for the initial fetch to complete
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
    });

    console.log('Before click, calls:', getRowsCalls.length);
    console.log('Before click, pagination in last call:', getRowsCalls[getRowsCalls.length - 1]?.pagination);

    // Clear calls from initial setup
    const initialCount = getRowsCalls.length;

    // Trigger page change
    await act(async () => {
      console.log('Clicking button...');
      screen.getByTestId('next-page').click();
      console.log('Button clicked, waiting...');
      // Wait longer for the setTimeout in the subscription to fire
      await new Promise((r) => setTimeout(r, 100));
      console.log('After wait, calls:', getRowsCalls.length);
    });

    console.log('After click, all calls:');
    getRowsCalls.slice(initialCount).forEach((call, i) => {
      console.log(`  Call ${i}:`, JSON.stringify(call.pagination));
    });

    // Check if any call has the new pagination
    const hasNewPagination = getRowsCalls.slice(initialCount).some(
      (call) => call.pagination?.pageIndex === 1,
    );
    expect(hasNewPagination).toBe(true);
  });
});
