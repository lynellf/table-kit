/**
 * Phase 3 — totals behavior (spec §9.6).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
  { region: 'North', sales: 300 },
];

describe('totals', () => {
  it('grand-total row equals sum across all level-0 groups', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    expect(result.grandTotals['__total__::sales_sum']).toBe(600);
  });

  it('grand-total column appended at end by default', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    const lastLeaf = result.leafColumns[result.leafColumns.length - 1]!;
    expect(lastLeaf.isTotal).toBe(true);
    expect(lastLeaf.pinned).toBe('right');
  });

  it('grandTotalColumnPosition = "start" prepends totals', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'start' },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    const firstLeaf = result.leafColumns[0]!;
    expect(firstLeaf.isTotal).toBe(true);
  });

  it('grandTotalColumn: false omits the totals column', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalColumn: false },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    expect(result.leafColumns.find((l: { isTotal: boolean }) => l.isTotal)).toBeUndefined();
    expect(Object.keys(result.grandTotals)).toHaveLength(0);
  });

  it('multi-measure: one totals leaf per measure', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [
        { id: 'sales_sum', field: 'sales', aggregator: 'sum' },
        { id: 'count', aggregator: 'count' },
      ],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    const totalsLeaves = result.leafColumns.filter((l: { isTotal: boolean }) => l.isTotal);
    expect(totalsLeaves).toHaveLength(2);
    expect(totalsLeaves.map((l: { measureId: string }) => l.measureId).sort()).toEqual([
      'count',
      'sales_sum',
    ]);
  });
});
