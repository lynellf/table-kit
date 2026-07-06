import type { DataSource } from '@lynellf/tablekit-core/dataSource';
/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDataTable } from '../useDataTable';

interface Row {
  id: string;
  name: string;
}

// Real Promise - no vitest mocks
const source: DataSource<Row> = {
  capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
  getRows: () => {
    console.log('getRows called');
    return Promise.resolve({ rows: [{ id: '1', name: 'Alice' }], totalRowCount: 1 });
  },
};

describe('async test', () => {
  it('renders with real Promise data source', () => {
    function App() {
      const result = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return <div>status: {result.dataSourceState?.status}</div>;
    }
    const { container } = render(<App />);
    console.log('render returned, text:', container.textContent);
    expect(container.textContent).toContain('status');
  });
});
