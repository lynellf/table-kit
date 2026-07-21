import type {
  AggregationEngine,
  PivotConfig,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PivotGrid } from './PivotGrid';

interface Sale {
  id: string;
  region: string;
  quarter: string;
  year: number;
  sales: number;
}

const sales: Sale[] = [
  { id: '1', region: 'West', quarter: 'Q1', year: 2024, sales: 100 },
  { id: '2', region: 'West', quarter: 'Q2', year: 2024, sales: 200 },
  { id: '3', region: 'East', quarter: 'Q1', year: 2024, sales: 300 },
  { id: '4', region: 'East', quarter: 'Q2', year: 2023, sales: 400 },
];

const config: PivotConfig<Sale> = {
  rows: ['region', 'quarter'],
  columns: ['year'],
  measures: [
    { id: 'sales_sum', field: 'sales', aggregator: 'sum', label: 'Sales' },
    { id: 'sales_avg', field: 'sales', aggregator: 'avg', label: 'Average' },
  ],
  filters: [{ field: 'year', op: 'equals', value: 2024 }],
};

afterEach(cleanup);

const createServerResult = (): PivotResult<Sale> => ({
  columnRoot: {
    id: 'root',
    path: [],
    label: undefined,
    colSpan: 1,
    leaves: [
      {
        id: '[]::sales_sum',
        path: [],
        measureId: 'sales_sum',
        isTotal: false,
        size: 100,
        header: 'Sales',
      },
    ],
  },
  leafColumns: [
    {
      id: '[]::sales_sum',
      path: [],
      measureId: 'sales_sum',
      isTotal: false,
      size: 100,
      header: 'Sales',
    },
  ],
  rowRoot: {
    key: '[]',
    path: [],
    level: 0,
    label: undefined,
    hasChildren: true,
    childState: 'loaded',
    values: {},
    rowTotals: {},
    children: [
      {
        key: '["West"]',
        path: ['West'],
        level: 1,
        label: 'West',
        hasChildren: true,
        childState: 'notLoaded',
        values: { '[]::sales_sum': 300 },
        rowTotals: { sales_sum: 300 },
      },
      {
        key: '["East"]',
        path: ['East'],
        level: 1,
        label: 'East',
        hasChildren: false,
        childState: 'loaded',
        values: { '[]::sales_sum': 700 },
        rowTotals: { sales_sum: 700 },
      },
    ],
  },
  grandTotals: { '[]::sales_sum': 1_000 },
});

describe('PivotGrid', () => {
  it('renders filtered aggregation, generated headers, totals, and expansion ARIA', async () => {
    render(<PivotGrid data={sales} pivot={config} getRowId={(row) => row.id} height={260} />);

    expect(screen.getByRole('treegrid')).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').some((header) => header.textContent === '2024'),
    ).toBe(true);
    expect(screen.getByRole('row', { name: /Grand total/ }).textContent).toContain('600');

    const westRow = screen.getByRole('row', { name: /West/ });
    expect(westRow.textContent).toContain('300');
    const toggle = within(westRow).getByRole('button', { name: 'Expand West' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(await screen.findByRole('row', { name: /Q1/ })).toBeTruthy();
    expect(
      within(screen.getByRole('row', { name: /West/ }))
        .getByRole('button')
        .getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.click(within(screen.getByRole('row', { name: /West/ })).getByRole('button'));
    await waitFor(() => expect(screen.queryByRole('row', { name: /Q1/ })).toBeNull());
    expect(
      within(screen.getByRole('row', { name: /West/ }))
        .getByRole('button')
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('isolates a server child error and retries only that path', async () => {
    let attempt = 0;
    const child: PivotRowNode<Sale> = {
      key: '["West","Q1"]',
      path: ['West', 'Q1'],
      level: 2,
      label: 'Q1',
      hasChildren: false,
      childState: 'loaded',
      values: { '[]::sales_sum': 300 },
      rowTotals: { sales_sum: 300 },
    };
    const engine: AggregationEngine<Sale> = {
      compute: vi.fn(() => createServerResult()),
      computeChildren: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('West failed');
        return [child];
      }),
    };
    render(<PivotGrid data={sales} pivot={config} engine={engine} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand West' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'West failedRetry');
    expect(screen.getByRole('row', { name: /East/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry West' }));
    expect(await screen.findByRole('row', { name: /Q1/ })).toBeTruthy();
    expect(engine.computeChildren).toHaveBeenCalledTimes(2);
    expect(engine.computeChildren).toHaveBeenLastCalledWith(
      ['West'],
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('renders a root error in the treegrid layout and retries the root query', async () => {
    let attempt = 0;
    const engine: AggregationEngine<Sale> = {
      compute: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Root failed');
        return createServerResult();
      }),
    };

    render(<PivotGrid data={sales} pivot={config} engine={engine} getRowId={(row) => row.id} />);

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Unable to aggregate rows: Root failedRetry',
    );
    expect(screen.getByRole('treegrid')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('row', { name: /West/ })).toBeTruthy();
    expect(engine.compute).toHaveBeenCalledTimes(2);
  });

  it('bounds row and column DOM by the viewport and overscan', async () => {
    const wideData = Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      region: `Region ${String(index).padStart(2, '0')}`,
      quarter: 'Q1',
      year: 2000 + index,
      sales: index,
    }));
    render(
      <PivotGrid
        data={wideData}
        pivot={{
          rows: ['region'],
          columns: ['year'],
          measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
          totals: { grandTotalColumn: false },
        }}
        getRowId={(row) => row.id}
        height={120}
        width={260}
        rowHeight={20}
        rowHeaderWidth={120}
        overscanRows={1}
        overscanColumns={1}
      />,
    );

    expect(document.querySelectorAll('.tk-pivot-row').length).toBeLessThanOrEqual(9);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(9);

    const firstCell = document.querySelector<HTMLElement>('[data-pivot-cell-id]');
    firstCell?.focus();
    await waitFor(() => expect(firstCell?.getAttribute('tabindex')).toBe('0'));

    const treegrid = screen.getByRole('treegrid');
    Object.defineProperty(treegrid, 'scrollTop', { configurable: true, value: 500 });
    Object.defineProperty(treegrid, 'scrollLeft', { configurable: true, value: 2_000 });
    fireEvent.scroll(treegrid);
    await waitFor(() =>
      expect(document.querySelectorAll('.tk-pivot-row').length).toBeLessThanOrEqual(12),
    );
    expect(firstCell?.isConnected).toBe(true);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(9);
  });

  it('freezes generated column groups atomically around a center-only virtual window', async () => {
    const wideData = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      region: `Region ${String(index).padStart(2, '0')}`,
      quarter: 'Q1',
      year: 2000 + index,
      sales: index,
    }));
    render(
      <PivotGrid
        data={wideData}
        pivot={{
          rows: ['region'],
          columns: ['year'],
          measures: [
            { id: 'sales', field: 'sales', aggregator: 'sum', label: 'Sales' },
            { id: 'average', field: 'sales', aggregator: 'avg', label: 'Average' },
          ],
        }}
        initialState={{
          columnPinning: {
            left: ['[2005]::sales'],
            right: ['[2001]::sales'],
          },
        }}
        getRowId={(row) => row.id}
        height={140}
        width={900}
        rowHeight={20}
        rowHeaderWidth={120}
        overscanRows={1}
        overscanColumns={1}
      />,
    );

    const treegrid = screen.getByRole('treegrid');
    const rowHeader = document.querySelector<HTMLElement>('.tk-pivot-row-header');
    const leftGroupHeader = screen.getByRole('columnheader', { name: '2005' });
    const rightGroupHeader = screen.getByRole('columnheader', { name: '2001' });
    const promotedLeftCell = document.querySelector<HTMLElement>(
      '[data-pivot-cell-id][data-column-id="[2005]::average"]',
    );
    const promotedRightCell = document.querySelector<HTMLElement>(
      '[data-pivot-cell-id][data-column-id="[2001]::average"]',
    );

    expect(rowHeader?.style.left).toBe('0px');
    expect(leftGroupHeader.dataset.pinned).toBe('left');
    expect(leftGroupHeader.style.left).toBe('120px');
    expect(rightGroupHeader.dataset.pinned).toBe('right');
    expect(rightGroupHeader.style.left).toBe('500px');
    expect(promotedLeftCell?.dataset.pinned).toBe('left');
    expect(promotedRightCell?.dataset.pinned).toBe('right');

    const firstLeftCell = document.querySelector<HTMLElement>(
      '[data-pivot-cell-id][data-column-id="[2005]::sales"]',
    );
    firstLeftCell?.focus();
    fireEvent.keyDown(treegrid, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement?.dataset.columnId).toBe('[2005]::average'));

    Object.defineProperty(treegrid, 'scrollLeft', { configurable: true, value: 1_500 });
    fireEvent.scroll(treegrid);

    expect(rowHeader?.style.left).toBe('1500px');
    expect(leftGroupHeader.style.left).toBe('1620px');
    expect(rightGroupHeader.style.left).toBe('2000px');
    expect(screen.getAllByRole('columnheader', { name: '2005' })).toHaveLength(1);
    expect(screen.getAllByRole('columnheader', { name: '2001' })).toHaveLength(1);
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[data-pivot-cell-id]')).filter(
        (cell) => cell.dataset.pivotCellId === '["Region 00"]:[2005]::average',
      ),
    ).toHaveLength(1);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(20);
  });

  it('rejects opposite pinned sides within one generated column group', () => {
    expect(() =>
      render(
        <PivotGrid
          data={sales}
          pivot={config}
          getRowId={(row) => row.id}
          initialState={{
            columnPinning: {
              left: ['[2024]::sales_sum'],
              right: ['[2024]::sales_avg'],
            },
          }}
        />,
      ),
    ).toThrowError('PivotGrid column group [2024] cannot be pinned to both left and right.');
  });
});
