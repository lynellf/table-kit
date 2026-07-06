import type { DataSource } from '@lynellf/tablekit-core/dataSource';
/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDataTable } from '../useDataTable';

interface Row {
  id: string;
  name: string;
}

// Promise-based data source
const source: DataSource<Row> = {
  capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
  getRows: () => Promise.resolve({ rows: [{ id: '1', name: 'Alice' }], totalRowCount: 1 }),
};

describe('async test', () => {
  it('renders with async data source (no waitFor)', () => {
    function App() {
      const result = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return <div>status: {result.dataSourceState?.status}</div>;
    }
    const { container } = render(<App />);
    // Don't wait - just check initial state
    expect(container.textContent).toContain('status');
  });
});
