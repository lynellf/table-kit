/**
 * @lynellf/tablekit-react — mixed-mode-warning.test.tsx
 *
 * Integration test: mixed-mode warning fires without allowWithinPageOperations.
 */

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';
import { __resetMixedModeWarningForTests } from '@lynellf/tablekit-core/dataSource';

interface Row {
  id: string;
  name: string;
}

describe('mixed-mode warning integration', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMixedModeWarningForTests();
  });

  it('warns when server pagination is mixed with client sort/filter', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source: DataSource<Row> = {
      capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
      getRows: () => ({ rows: [], totalRowCount: 0 }),
    };

    function App() {
      useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return null;
    }

    render(<App />);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('allowWithinPageOperations'),
    );
    warn.mockRestore();
  });
});
