/**
 * Phase 3 — §12 advisory perf bench (main-thread engine).
 *
 * Runs re-pivot on synthetic datasets of 50k / 100k / 200k rows × 2-level row hierarchy
 * × 2-level column hierarchy × 2 measures (sum + count). Logs timing.
 *
 * Budget reference (spec §12): "Pivot, main thread: ≤ ~200k source rows before docs
 * recommend worker engine." This bench measures where the budget is consumed; results
 * are logged but do not gate CI.
 */

import { bench, describe } from 'vitest';
import { createMainThreadEngine } from '../src/engine/mainThread';
import type { PivotQuery } from '../src/types';

const generateRows = (n: number) => {
  const regions = ['West', 'East', 'North', 'South'];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const years = [2022, 2023, 2024];
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    region: regions[i % regions.length]!,
    quarter: quarters[Math.floor(i / regions.length) % quarters.length]!,
    year: years[i % years.length]!,
    sales: Math.floor(Math.random() * 1000),
    orders: Math.floor(Math.random() * 50),
  }));
};

interface BenchRow {
  id: number;
  region: string;
  quarter: string;
  year: number;
  sales: number;
  orders: number;
}

describe('main-thread re-pivot bench', () => {
  for (const n of [50_000, 100_000, 200_000]) {
    const rows = generateRows(n) as BenchRow[];
    const query: PivotQuery<BenchRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'quarter' }],
      columnsFieldRef: [{ field: 'year' }],
      measures: [
        { id: 'sales_sum', field: 'sales' },
        { id: 'orders_count', field: 'orders', aggregator: 'count' },
      ],
      filters: [],
      totals: {},
      expandedPaths: ['["West"]'],
      pivotSorting: [],
    };
    bench(`re-pivot ${n.toLocaleString()} rows × region × quarter × year × 2 measures`, () => {
      const engine = createMainThreadEngine<BenchRow>();
      engine.compute(query, { signal: new AbortController().signal });
    });
  }
});
