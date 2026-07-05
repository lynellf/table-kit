/** @jsxImportSource react */
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';

interface Row { id: string; name: string; }

// Promise-based data source
const source: DataSource<Row> = {
  capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
  getRows: () => Promise.resolve({ rows: [{ id: '1', name: 'Alice' }], totalRowCount: 1 }),
};

describe('async test', () => {
  it('works with async data source', async () => {
    function App() {
      const result = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return <div>status: {result.dataSourceState?.status}</div>;
    }
    const { container } = render(<App />);
    // Wait for the promise to resolve
    await waitFor(() => {
      expect(container.textContent).toContain('success');
    }, { timeout: 1000 });
  });
});
