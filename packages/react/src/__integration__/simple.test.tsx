/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';

interface Row { id: string; name: string; }

// Synchronous data source - no promises
const source: DataSource<Row> = {
  capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
  getRows: () => ({ rows: [{ id: '1', name: 'Alice' }], totalRowCount: 1 }),
};

describe('simple test', () => {
  it('renders without crashing with synchronous data source', () => {
    function App() {
      const result = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return <div>status: {result.dataSourceState?.status}</div>;
    }
    const { container } = render(<App />);
    expect(container.textContent).toContain('status');
  });
});
