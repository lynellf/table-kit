import { useMemo, useState } from 'react';
import { DemoPanel } from './DemoPanel';
import { FunctionalParityApp } from './FunctionalParityApp';
import { PerfBadge } from './PerfBadge';
import { type SalesRow, generateSales } from './fakeSales';

const ROW_COUNTS = [1_000, 10_000, 50_000, 100_000];

const ReferenceApp = () => {
  const [rowCount, setRowCount] = useState(10_000);
  const data: SalesRow[] = useMemo(() => generateSales(rowCount), [rowCount]);
  const [computeTime, setComputeTime] = useState<number | null>(null);

  return (
    <div className="app">
      <header>
        <h1>@tablekit/pivot — M4 reference app</h1>
        <div className="controls">
          <label>
            Rows:
            <select value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}>
              {ROW_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <PerfBadge rowCount={rowCount} data={data} onMeasure={setComputeTime} />
        </div>
      </header>

      <main>
        <DemoPanel
          title="Pivot: region × quarter, sales sum + count"
          data={data}
          pivot={{
            rows: ['region', 'quarter'],
            columns: [],
            measures: [
              { id: 'sales_sum', field: 'sales' },
              { id: 'orders_count', field: 'orders', aggregator: 'count' },
            ],
            totals: { grandTotalRow: true, grandTotalColumn: true },
          }}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />

        <DemoPanel
          title="Pivot with sort-by-measure"
          data={data}
          pivot={{
            rows: ['region'],
            columns: [],
            measures: [{ id: 'sales_sum', field: 'sales' }],
            totals: { grandTotalRow: true, grandTotalColumn: true },
          }}
          initialPivotSorting={[{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }]}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />

        <DemoPanel
          title="Column hierarchy: year, measure: sales sum"
          data={data}
          pivot={{
            rows: ['region'],
            columns: ['year'],
            measures: [{ id: 'sales_sum', field: 'sales' }],
            totals: {
              grandTotalRow: true,
              grandTotalColumn: true,
              grandTotalColumnPosition: 'end',
            },
          }}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />
      </main>

      <footer>
        <p>
          Last pivot compute: <strong>{computeTime ?? '—'}</strong> ms. Spec §12 budget: ≤ ~200k
          source rows before docs recommend the worker engine (M5).
        </p>
      </footer>
    </div>
  );
};

export const App = () =>
  new URLSearchParams(window.location.search).has('functional-parity') ? (
    <FunctionalParityApp />
  ) : (
    <ReferenceApp />
  );
