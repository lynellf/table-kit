import type { ColumnDef } from '@lynellf/tablekit-core';
import type { DataSource, RowsQuery } from '@lynellf/tablekit-core/dataSource';
import type {
  AggregationEngine,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { DataGrid, PivotGrid } from '@lynellf/tablekit-react';
import '@lynellf/tablekit-react/styles.css';
import { useMemo, useState } from 'react';

interface Person {
  id: string;
  name: string;
  age: number;
  city: string;
}

interface Sale {
  id: string;
  region: string;
  quarter: string;
  year: number;
  sales: number;
}

const people: Person[] = Array.from({ length: 200 }, (_, index) => ({
  id: String(index + 1),
  name: `Person ${String(index + 1).padStart(3, '0')}`,
  age: 20 + (index % 50),
  city: ['Austin', 'Chicago', 'New York', 'Seattle'][index % 4]!,
}));

const peopleColumns: Array<ColumnDef<Person, unknown>> = [
  {
    id: 'name',
    accessor: 'name',
    header: 'Name',
    enableSorting: true,
    enableFiltering: true,
    filterFn: 'includesString',
    size: 180,
  },
  { id: 'age', accessor: 'age', header: 'Age', enableSorting: true, size: 100 },
  { id: 'city', accessor: 'city', header: 'City', enableSorting: true, size: 160 },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `detail-${index}`,
    accessor: (row: Person) => `${row.city} ${index + 1}`,
    header: `Detail ${index + 1}`,
    size: 130,
  })),
];

const sales: Sale[] = [
  { id: '1', region: 'West', quarter: 'Q1', year: 2024, sales: 100 },
  { id: '2', region: 'West', quarter: 'Q2', year: 2024, sales: 200 },
  { id: '3', region: 'East', quarter: 'Q1', year: 2024, sales: 300 },
  { id: '4', region: 'East', quarter: 'Q2', year: 2023, sales: 400 },
];

const applyServerQuery = (query: RowsQuery): { rows: Person[]; totalRowCount: number } => {
  let result = people;
  for (const filter of query.filters) {
    if (filter.id === 'name') {
      const value = String(filter.value).toLowerCase();
      result = result.filter((row) => row.name.toLowerCase().includes(value));
    }
  }
  for (const sort of [...query.sorting].reverse()) {
    result = [...result].sort((left, right) => {
      const leftValue = left[sort.id as keyof Person];
      const rightValue = right[sort.id as keyof Person];
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
      });
      return sort.desc ? -comparison : comparison;
    });
  }
  const totalRowCount = result.length;
  if (query.pagination?.type === 'offset') {
    result = result.slice(
      query.pagination.offset,
      query.pagination.offset + query.pagination.limit,
    );
  }
  return { rows: result, totalRowCount };
};

const makeServerResult = (): PivotResult<Sale> => ({
  columnRoot: {
    id: 'root',
    path: [],
    label: undefined,
    colSpan: 1,
    leaves: [
      {
        id: '[]::sales',
        path: [],
        measureId: 'sales',
        isTotal: false,
        size: 120,
        header: 'Sales',
      },
    ],
  },
  leafColumns: [
    {
      id: '[]::sales',
      path: [],
      measureId: 'sales',
      isTotal: false,
      size: 120,
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
        values: { '[]::sales': 300 },
        rowTotals: { sales: 300 },
      },
      {
        key: '["East"]',
        path: ['East'],
        level: 1,
        label: 'East',
        hasChildren: false,
        childState: 'loaded',
        values: { '[]::sales': 700 },
        rowTotals: { sales: 700 },
      },
    ],
  },
  grandTotals: { '[]::sales': 1_000 },
});

const delayed = <T,>(value: T, delay: number, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(value), delay);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export const FunctionalParityApp = () => {
  const [eventLog, setEventLog] = useState<string[]>([]);
  const log = (entry: string) => setEventLog((current) => [...current.slice(-7), entry]);

  const serverSource = useMemo<DataSource<Person>>(
    () => ({
      capabilities: {
        sort: 'server',
        filter: 'server',
        paginate: 'server',
        pagination: 'offset',
      },
      getRows: (query, { signal }) => {
        const delay =
          query.sorting.length > 0
            ? 60
            : query.pagination?.type === 'offset' && query.pagination.offset > 0
              ? 500
              : 100;
        return delayed(applyServerQuery(query), delay, signal);
      },
    }),
    [],
  );

  const serverPivotEngine = useMemo<AggregationEngine<Sale>>(
    () => ({
      compute: (_query: PivotQuery<Sale>, { signal }) => delayed(makeServerResult(), 100, signal),
      computeChildren: (_path, _query, { signal }) => {
        const child: PivotRowNode<Sale> = {
          key: '["West","Q1"]',
          path: ['West', 'Q1'],
          level: 2,
          label: 'Q1',
          hasChildren: false,
          childState: 'loaded',
          values: { '[]::sales': 300 },
          rowTotals: { sales: 300 },
        };
        return delayed([child], 120, signal);
      },
    }),
    [],
  );

  return (
    <div className="parity-app">
      <header>
        <h1>Table Kit functional parity scenarios</h1>
        <p>Deterministic browser host for the public DataGrid and PivotGrid components.</p>
      </header>

      <main>
        <section className="scenario" data-testid="client-data-grid">
          <h2>Client DataGrid</h2>
          <DataGrid
            rows={people}
            columns={peopleColumns}
            getRowId={(row) => row.id}
            rowSelectionMode="multiple"
            height={240}
            width={720}
            rowHeight={32}
            pageSizeOptions={[25, 50, 100]}
            onCellClick={(event) => log(`cell-click:${event.rowId}:${event.columnId}`)}
            onRowClick={(event) => log(`row-click:${event.rowId}`)}
            onCellDoubleClick={(event) => log(`cell-double-click:${event.rowId}:${event.columnId}`)}
            onRowDoubleClick={(event) => log(`row-double-click:${event.rowId}`)}
          />
          <output className="event-log" data-testid="event-log">
            {eventLog.join('|')}
          </output>
        </section>

        <section className="scenario" data-testid="server-data-grid">
          <h2>Server DataGrid</h2>
          <DataGrid
            dataSource={serverSource}
            columns={peopleColumns.slice(0, 3)}
            getRowId={(row) => row.id}
            initialState={{ pagination: { pageIndex: 0, pageSize: 25 } }}
            height={240}
            width={720}
            rowHeight={32}
            pageSizeOptions={[25, 50]}
          />
        </section>

        <section className="scenario" data-testid="client-pivot-grid">
          <h2>Client PivotGrid</h2>
          <PivotGrid
            data={sales}
            pivot={{
              rows: ['region', 'quarter'],
              columns: ['year'],
              measures: [
                { id: 'sales_sum', field: 'sales', aggregator: 'sum', label: 'Sales' },
                { id: 'sales_avg', field: 'sales', aggregator: 'avg', label: 'Average' },
              ],
            }}
            getRowId={(row) => row.id}
            height={240}
            width={720}
            rowHeight={32}
          />
        </section>

        <section className="scenario" data-testid="server-pivot-grid">
          <h2>Server PivotGrid</h2>
          <PivotGrid
            data={sales}
            pivot={{
              rows: ['region', 'quarter'],
              columns: [],
              measures: [{ id: 'sales', field: 'sales', aggregator: 'sum', label: 'Sales' }],
            }}
            engine={serverPivotEngine}
            getRowId={(row) => row.id}
            height={240}
            width={720}
            rowHeight={32}
          />
        </section>
      </main>
    </div>
  );
};
