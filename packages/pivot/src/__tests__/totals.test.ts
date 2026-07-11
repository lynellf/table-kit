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
    expect(result.grandTotals['[]::sales_sum']).toBe(600);
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

  it('populates grand totals for regular column leaves as well as the total column', async () => {
    const engine = createMainThreadEngine<{ region: string; role: string; sales: number }>();
    const q: PivotQuery<{ region: string; role: string; sales: number }> = {
      rows: [
        { region: 'West', role: 'orchestrator', sales: 10 },
        { region: 'East', role: 'orchestrator', sales: 20 },
        { region: 'West', role: 'implementer', sales: 30 },
      ],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [{ field: 'role' }],
      measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });

    expect(result.grandTotals).toEqual({
      '["orchestrator"]::sales': 30,
      '["implementer"]::sales': 30,
      '__total__::sales': 60,
    });
  });

  it('keeps grand-total row and grand-total column independent', async () => {
    const engine = createMainThreadEngine<{ role: string; sales: number }>();
    const base: PivotQuery<{ role: string; sales: number }> = {
      rows: [
        { role: 'orchestrator', sales: 10 },
        { role: 'implementer', sales: 20 },
      ],
      rowsFieldRef: [],
      columnsFieldRef: [{ field: 'role' }],
      measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };

    const rowOnly = await engine.compute(
      { ...base, totals: { grandTotalRow: true, grandTotalColumn: false } },
      { signal: new AbortController().signal },
    );
    expect(rowOnly.leafColumns.every((leaf) => !leaf.isTotal)).toBe(true);
    expect(rowOnly.grandTotals).toEqual({
      '["orchestrator"]::sales': 10,
      '["implementer"]::sales': 20,
    });

    const columnOnly = await engine.compute(
      { ...base, totals: { grandTotalRow: false, grandTotalColumn: true } },
      { signal: new AbortController().signal },
    );
    expect(columnOnly.grandTotals).toEqual({});
    expect(columnOnly.rowRoot.values['__total__::sales']).toBe(30);
  });
});
