import type { DataSource, RowsQuery, RowsResult } from '@lynellf/tablekit-core/dataSource';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import type { DataGridHandle } from './DataGrid';

interface Person {
  id: string;
  name: string;
  age: number;
}

const people: Person[] = Array.from({ length: 40 }, (_, index) => ({
  id: String(index + 1),
  name: `Person ${String(index + 1).padStart(2, '0')}`,
  age: 20 + index,
}));

const columns = [
  {
    id: 'name',
    accessor: 'name' as const,
    header: 'Name',
    enableSorting: true,
    enableFiltering: true,
    filterFn: 'includesString',
    size: 160,
  },
  {
    id: 'age',
    accessor: 'age' as const,
    header: 'Age',
    enableSorting: true,
    sortingFn: 'basic',
    size: 100,
  },
];

afterEach(cleanup);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('DataGrid', () => {
  it('renders a client grid and exposes loaded selection through its handle', () => {
    const ref = createRef<DataGridHandle<Person>>();
    const onRowClick = vi.fn();

    render(
      <DataGrid
        ref={ref}
        rows={people}
        columns={columns}
        getRowId={(row) => row.id}
        rowSelectionMode="multiple"
        height={240}
        rowHeight={32}
        onRowClick={onRowClick}
      />,
    );

    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeTruthy();

    const firstSelection = screen.getByRole('checkbox', { name: 'Select row 1' });
    fireEvent.click(firstSelection);

    expect(ref.current?.getSelectedRowIds()).toEqual(['1']);
    expect(ref.current?.getSelectedRows()).toEqual([people[0]]);

    fireEvent.click(screen.getByText('Person 01'));
    expect(onRowClick).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: '1', row: people[0] }),
    );
  });

  it('applies client filter, sort, and pagination and resets query operations to page one', async () => {
    const ref = createRef<DataGridHandle<Person>>();
    render(
      <DataGrid
        ref={ref}
        rows={people}
        columns={columns}
        getRowId={(row) => row.id}
        initialState={{ pagination: { pageIndex: 2, pageSize: 5 } }}
        rowSelectionMode="multiple"
        defaultRowSelection={{ '11': true }}
      />,
    );

    expect(screen.getByText('Person 11')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort name' }));
    await waitFor(() => expect(screen.getByText('Page 1 of 8')).toBeTruthy());
    expect(await screen.findByText('Person 01')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter name' }), {
      target: { value: 'Person 2' },
    });
    await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeTruthy());
    expect(await screen.findByText('Person 20')).toBeTruthy();
    expect(ref.current?.getSelectedRowIds()).toEqual(['11']);
    expect(ref.current?.getSelectedRows()).toEqual([people[10]]);
  });

  it('renders empty state inside the persistent grid and pagination layout', () => {
    render(<DataGrid rows={[]} columns={columns} getRowId={(row) => row.id} />);

    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getByText('No rows to display.')).toBeTruthy();
    expect(screen.getByLabelText('Pagination')).toBeTruthy();
  });

  it('bounds row and column DOM while retaining the logically focused cell', async () => {
    const wideColumns = Array.from({ length: 30 }, (_, index) => ({
      id: `column-${index}`,
      accessor: (row: Person) => `${row.name}-${index}`,
      header: `Column ${index}`,
      size: 100,
    }));
    render(
      <DataGrid
        rows={people}
        columns={wideColumns}
        getRowId={(row) => row.id}
        height={120}
        width={220}
        rowHeight={20}
        overscanRows={1}
        overscanColumns={1}
      />,
    );

    expect(document.querySelectorAll('.tk-grid-row').length).toBeLessThanOrEqual(9);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(5);

    const firstCell = screen.getByText('Person 01-0').closest<HTMLElement>('[role="gridcell"]');
    firstCell?.focus();
    await waitFor(() => expect(firstCell?.getAttribute('tabindex')).toBe('0'));

    const grid = screen.getByRole('grid');
    Object.defineProperty(grid, 'scrollTop', { configurable: true, value: 400 });
    Object.defineProperty(grid, 'scrollLeft', { configurable: true, value: 1_500 });
    fireEvent.scroll(grid);

    expect(screen.getByText('Person 01-0')).toBeTruthy();
    expect(document.querySelectorAll('.tk-grid-row').length).toBeLessThanOrEqual(10);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(7);
  });

  it('freezes pinned columns around a center-only virtual window without duplicate cells', async () => {
    const wideColumns = Array.from({ length: 30 }, (_, index) => ({
      id: `column-${index}`,
      accessor: (row: Person) => `${row.name}-${index}`,
      header: `Column ${index}`,
      size: 100,
    }));
    render(
      <DataGrid
        rows={people}
        columns={wideColumns}
        getRowId={(row) => row.id}
        initialState={{
          columnPinning: { left: ['column-5'], right: ['column-2'] },
        }}
        rowSelectionMode="multiple"
        height={120}
        width={360}
        rowHeight={20}
        overscanRows={1}
        overscanColumns={1}
      />,
    );

    const grid = screen.getByRole('grid');
    const selectionHeader = screen.getByRole('columnheader', { name: 'Row selection' });
    const leftHeader = screen.getByRole('columnheader', { name: 'Column 5' });
    const rightHeader = screen.getByRole('columnheader', { name: 'Column 2' });

    expect(selectionHeader.style.left).toBe('0px');
    expect(leftHeader.dataset.pinned).toBe('left');
    expect(leftHeader.style.left).toBe('44px');
    expect(rightHeader.dataset.pinned).toBe('right');
    expect(rightHeader.style.left).toBe('260px');
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(7);

    const firstLeftCell = screen.getByText('Person 01-5').closest<HTMLElement>('[role="gridcell"]');
    firstLeftCell?.focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-cell-id')).toBe('1:column-0'),
    );

    Object.defineProperty(grid, 'scrollLeft', { configurable: true, value: 1_500 });
    fireEvent.scroll(grid);

    expect(selectionHeader.style.left).toBe('1500px');
    expect(leftHeader.style.left).toBe('1544px');
    expect(rightHeader.style.left).toBe('1760px');
    expect(screen.getAllByRole('columnheader', { name: 'Column 5' })).toHaveLength(1);
    expect(screen.getAllByRole('columnheader', { name: 'Column 2' })).toHaveLength(1);
    expect(document.querySelectorAll('[data-cell-id="1:column-5"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-cell-id="1:column-2"]')).toHaveLength(1);
    expect(screen.getAllByRole('columnheader').length).toBeLessThanOrEqual(9);
  });

  it('publishes cell and row event context in browser click and double-click order', () => {
    const order: string[] = [];
    const onCellClick = vi.fn(() => order.push('cell-click'));
    const onCellDoubleClick = vi.fn(() => order.push('cell-double-click'));
    const onRowClick = vi.fn(() => order.push('row-click'));
    const onRowDoubleClick = vi.fn(() => order.push('row-double-click'));
    render(
      <DataGrid
        rows={people}
        columns={columns}
        getRowId={(row) => row.id}
        onCellClick={onCellClick}
        onCellDoubleClick={onCellDoubleClick}
        onRowClick={onRowClick}
        onRowDoubleClick={onRowDoubleClick}
      />,
    );

    const cell = screen.getByText('Person 01');
    fireEvent.click(cell);
    fireEvent.click(cell);
    fireEvent.doubleClick(cell);

    expect(order).toEqual([
      'cell-click',
      'row-click',
      'cell-click',
      'row-click',
      'cell-double-click',
      'row-double-click',
    ]);
    expect(onCellClick).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: '1', row: people[0], columnId: 'name', value: 'Person 01' }),
    );
  });

  it('uses exact offset queries, aborts stale work, and preserves successful rows on error', async () => {
    const requests: Array<{
      query: RowsQuery;
      signal: AbortSignal;
      result: ReturnType<typeof deferred<RowsResult<Person>>>;
    }> = [];
    const source: DataSource<Person> = {
      capabilities: {
        sort: 'server',
        filter: 'server',
        paginate: 'server',
        pagination: 'offset',
      },
      getRows: (query, { signal }) => {
        const result = deferred<RowsResult<Person>>();
        requests.push({ query, signal, result });
        return result.promise;
      },
    };

    render(
      <DataGrid
        dataSource={source}
        columns={columns}
        getRowId={(row) => row.id}
        initialState={{ pagination: { pageIndex: 0, pageSize: 10 } }}
      />,
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.getByRole('grid').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelectorAll('[data-placeholder="true"]')).toHaveLength(10);
    expect(screen.getByText('Loading rows…')).toBeTruthy();
    expect(screen.getByLabelText('Pagination')).toBeTruthy();
    expect(requests[0]?.query).toEqual({
      filters: [],
      sorting: [],
      pagination: { type: 'offset', offset: 0, limit: 10 },
    });
    await act(async () => {
      requests[0]?.result.resolve({ rows: [people[0]!], totalRowCount: 40 });
      await requests[0]?.result.promise;
    });
    expect(await screen.findByText('Person 01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.query.pagination).toEqual({ type: 'offset', offset: 10, limit: 10 });
    expect(screen.getByText('Person 01')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sort name' }));
    await waitFor(() =>
      expect(
        requests.some(
          ({ query }) =>
            query.sorting.length === 1 &&
            query.pagination?.type === 'offset' &&
            query.pagination.offset === 0,
        ),
      ).toBe(true),
    );
    expect(requests[1]?.signal.aborted).toBe(true);
    const latest = requests.at(-1);
    expect(latest?.query).toEqual({
      filters: [],
      sorting: [{ id: 'name', desc: false }],
      pagination: { type: 'offset', offset: 0, limit: 10 },
    });

    await act(async () => {
      for (const request of requests.slice(1, -1)) {
        request.result.resolve({ rows: [people[10]!], totalRowCount: 40 });
      }
      latest?.result.reject(new Error('latest request failed'));
      await Promise.allSettled(requests.slice(1).map(({ result }) => result.promise));
    });

    expect(screen.getByText('Person 01')).toBeTruthy();
    expect(screen.queryByText('Person 11')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('latest request failed');
  });
});
