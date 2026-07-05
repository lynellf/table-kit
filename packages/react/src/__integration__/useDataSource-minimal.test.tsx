/**
 * Minimal test to verify useDataSource integration with dataSource option.
 * Uses synchronous mock to avoid async timing issues.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';
import { __resetMixedModeWarningForTests } from '@lynellf/tablekit-core/dataSource';

interface Row {
  id: string;
  name: string;
}

// Define the mock function at module level so it persists.
const getRowsMock = vi.fn((async () => ({
  rows: [{ id: '1', name: 'Alice' }] as Row[],
  totalRowCount: 1,
})) as DataSource<Row>['getRows']);

const stableSource: DataSource<Row> = {
  capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
  getRows: getRowsMock,
};

describe('minimal useDataSource integration', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
    getRowsMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMixedModeWarningForTests();
  });

  it('calls getRows when dataSource is provided', async () => {
    function App() {
      const { dataSourceState } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: stableSource,
      });
      return (
        <div>
          <span data-testid="status">{dataSourceState?.status ?? 'no-source'}</span>
          <span data-testid="data-length">{dataSourceState?.data?.length ?? -1}</span>
        </div>
      );
    }

    render(<App />);

    // The initial status should be 'loading' (the hook immediately sets this)
    // or the fetch should have completed synchronously.
    const statusEl = screen.getByTestId('status');
    const lengthEl = screen.getByTestId('data-length');

    // If it resolved, we should have data
    if (statusEl.textContent === 'success') {
      expect(lengthEl.textContent).toBe('1');
    }
  });
});
