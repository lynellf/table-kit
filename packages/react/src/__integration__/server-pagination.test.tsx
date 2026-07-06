/**
 * @lynellf/tablekit-react — server-pagination.test.tsx
 *
 * Integration test: server pagination with aria-busy + placeholder rows.
 * Uses synchronous data sources for reliability.
 */

import type { DataSource } from '@lynellf/tablekit-core/dataSource';
import { __resetMixedModeWarningForTests } from '@lynellf/tablekit-core/dataSource';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';

interface Row {
  id: string;
  name: string;
}

const ALL_ROWS: Row[] = Array.from({ length: 100 }, (_, i) => ({
  id: String(i + 1),
  name: `Person ${i + 1}`,
}));

const SERVER_ROWS = ALL_ROWS.slice(0, 25);

describe('server pagination integration', () => {
  // Clean up after each test to prevent DOM pollution
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    __resetMixedModeWarningForTests();
  });

  beforeEach(() => {
    __resetMixedModeWarningForTests();
  });

  it('renders data from synchronous server source', async () => {
    const source: DataSource<Row> = {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
      getRows: () => ({ rows: SERVER_ROWS, totalRowCount: ALL_ROWS.length }),
    };

    function App() {
      const { table, dataSourceState } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return (
        <div data-testid="app-root">
          <span data-testid="status">{dataSourceState?.status}</span>
          <span data-testid="count">{dataSourceState?.data?.length ?? -1}</span>
          <div {...table.getGridProps()} data-testid="grid">
            <div {...table.getBodyProps()}>
              {table.getRowModel().map((r) => (
                <div key={r.id}>{(r.original as Row).name}</div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    render(<App />);

    // Wait for the fetch to complete (it's deferred via setTimeout)
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
    });

    expect(screen.getByTestId('count').textContent).toBe('25');
    expect(screen.getByTestId('grid').getAttribute('aria-busy')).not.toBe('true');
    expect(screen.getByTestId('grid').getAttribute('aria-invalid')).not.toBe('true');
  });

  it('renders correct number of rows with placeholderRows option', async () => {
    const source: DataSource<Row> = {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
      getRows: () => ({ rows: SERVER_ROWS.slice(0, 5), totalRowCount: ALL_ROWS.length }),
    };

    function App() {
      const { table, dataSourceState } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
        placeholderRows: 5,
      });
      return (
        <div data-testid="app-root">
          <span data-testid="status">{dataSourceState?.status}</span>
          <div {...table.getBodyProps()}>
            {table.getRowModel().map((r) => {
              const pr = r as unknown as { isPlaceholder?: boolean };
              return (
                <div key={r.id} {...r.getRowProps()}>
                  {pr.isPlaceholder ? 'placeholder' : String((r.original as Row).name)}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    render(<App />);

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
    });

    const rows = screen.getAllByRole('row');
    // 5 rows returned from the server (not 25 because we limited it)
    expect(rows).toHaveLength(5);
    // No placeholder rows because data arrived synchronously
    const placeholders = rows.filter((r) => r.getAttribute('data-placeholder') === 'true');
    expect(placeholders).toHaveLength(0);
  });

  it('aria-busy is absent when no data source', () => {
    function App() {
      const { table } = useDataTable({
        data: ALL_ROWS.slice(0, 5),
        columns: [{ id: 'name', accessor: 'name' }],
      });
      return (
        <div data-testid="app-root">
          <div {...table.getGridProps()} data-testid="grid" />
        </div>
      );
    }

    render(<App />);

    // Use getByTestId to get the first grid only
    expect(screen.getByTestId('grid').getAttribute('aria-busy')).toBeNull();
    expect(screen.getByTestId('grid').getAttribute('data-loading')).toBeNull();
  });

  it('aria-busy is absent when data source status is success', async () => {
    const source: DataSource<Row> = {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
      getRows: () => ({ rows: SERVER_ROWS, totalRowCount: ALL_ROWS.length }),
    };

    function App() {
      const { table } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return (
        <div data-testid="app-root">
          <div {...table.getGridProps()} data-testid="grid" />
        </div>
      );
    }

    render(<App />);

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(screen.getByTestId('grid').getAttribute('aria-busy')).not.toBe('true');
    });

    // Use getByTestId to get the first grid only
    expect(screen.getByTestId('grid').getAttribute('aria-busy')).not.toBe('true');
  });

  it('body emits aria-busy when status is success (no busy)', async () => {
    const source: DataSource<Row> = {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
      getRows: () => ({ rows: SERVER_ROWS, totalRowCount: ALL_ROWS.length }),
    };

    function App() {
      const { table } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return (
        <div data-testid="app-root">
          <div {...table.getBodyProps()} data-testid="body" />
        </div>
      );
    }

    render(<App />);

    // Wait for the fetch to complete
    await waitFor(() => {
      expect(screen.getByTestId('body').getAttribute('aria-busy')).not.toBe('true');
    });

    expect(screen.getByTestId('body').getAttribute('aria-busy')).not.toBe('true');
    expect(screen.getByTestId('body').getAttribute('data-loading')).toBeNull();
  });
});
