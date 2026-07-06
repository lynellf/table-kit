/**
 * Phase 4 — getHeaderRows column hierarchy with colSpan.
 */

import { describe, expect, it } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  region: string;
  year: number;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', year: 2024, sales: 100 },
  { region: 'East', year: 2024, sales: 200 },
  { region: 'West', year: 2023, sales: 150 },
];

const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: {
    rows: ['region'],
    columns: ['year'],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r, i) => `${r.region}-${r.year}-${i}`,
};

describe('getHeaderRows', () => {
  it('emits one header row per column-hierarchy depth', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    // 1 column field → 1 header row.
    expect(headerRows).toHaveLength(1);
  });

  it('single header row has one entry per unique year + totals', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const yearEntries = headerRows[0]!;
    const yearLabels = yearEntries
      .map((e) => (e.node as { label?: unknown }).label)
      .sort();
    expect(yearLabels).toEqual([2023, 2024, '__total__']);
  });

  it('aria-colspan is the sum of leaf widths at branch nodes', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const entry = headerRows[0]!.find((e) => (e.node as { label?: unknown }).label === 2024);
    expect(entry?.colSpan).toBe(1); // single measure
  });
});
