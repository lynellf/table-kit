/**
 * Regression coverage for applying changed pivot/data options after mount.
 */

/** @jsxImportSource react */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { usePivotTable } from '../usePivotTable';

interface Row {
  id: string;
  provider: string;
  model: string;
  sales: number;
}

const firstRows: Row[] = [
  { id: '1', provider: 'openai', model: 'gpt-4', sales: 10 },
  { id: '2', provider: 'anthropic', model: 'claude', sales: 20 },
];

const secondRows: Row[] = [{ id: '3', provider: 'mistral', model: 'large', sales: 30 }];

const Harness = () => {
  const [expandedConfig, setExpandedConfig] = useState(false);
  const [useSecondRows, setUseSecondRows] = useState(false);
  const data = useSecondRows ? secondRows : firstRows;
  const { pivot } = usePivotTable<Row>({
    data,
    pivot: {
      rows: expandedConfig ? ['provider', 'model'] : ['provider'],
      columns: [],
      measures: [{ id: 'sales', field: 'sales' }],
    },
    getRowId: (row) => row.id,
  });

  return (
    <>
      <button type="button" onClick={() => setExpandedConfig(true)}>
        Add model dimension
      </button>
      <button type="button" onClick={() => pivot.toggleExpanded(['openai'])}>
        Expand openai
      </button>
      <button type="button" onClick={() => setUseSecondRows(true)}>
        Replace data
      </button>
      <div data-testid="visible-rows">
        {pivot
          .getVisibleRows()
          .map((row) => `${String(row.label)}:${String(row.hasChildren)}`)
          .join('|')}
      </div>
    </>
  );
};

describe('usePivotTable option updates', () => {
  it('applies config changes and replacement data after mount', async () => {
    render(<Harness />);
    expect(screen.getByTestId('visible-rows').textContent).toContain('openai:false');

    fireEvent.click(screen.getByRole('button', { name: 'Add model dimension' }));
    await waitFor(() => {
      expect(screen.getByTestId('visible-rows').textContent).toContain('openai:true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Expand openai' }));
    await waitFor(() => {
      expect(screen.getByTestId('visible-rows').textContent).toContain('gpt-4:false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Replace data' }));
    await waitFor(() => {
      expect(screen.getByTestId('visible-rows').textContent).toContain('mistral:true');
    });
  });
});
