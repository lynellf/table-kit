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
    const yearLabels = yearEntries.map((e) => (e.node as { label?: unknown }).label).sort();
    expect(yearLabels).toEqual([2023, 2024, '__total__']);
  });

  it('aria-colspan is the sum of leaf widths at branch nodes', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const entry = headerRows[0]!.find((e) => (e.node as { label?: unknown }).label === 2024);
    expect(entry?.colSpan).toBe(1); // single measure
  });

  it('renders children at the next header depth for two column dimensions', () => {
    const p = createPivotTable({
      data: [
        { role: 'orchestrator', status: 'success', sales: 1 },
        { role: 'orchestrator', status: 'failed', sales: 2 },
        { role: 'implementer', status: 'success', sales: 3 },
      ],
      pivot: {
        rows: [],
        columns: ['role', 'status'],
        measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
        totals: { grandTotalColumn: false },
      },
    });

    const rows = p.getHeaderRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'orchestrator',
      'implementer',
    ]);
    expect(rows[1]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'success',
      'failed',
      'success',
      'failed',
    ]);
    expect(rows.flatMap((row) => row.map(({ colSpan }) => colSpan))).toEqual([2, 2, 1, 1, 1, 1]);
  });

  it('renders one level per field for three column dimensions', () => {
    const p = createPivotTable({
      data: [
        { role: 'orchestrator', status: 'success', environment: 'prod', sales: 1 },
        { role: 'orchestrator', status: 'success', environment: 'staging', sales: 2 },
      ],
      pivot: {
        rows: [],
        columns: ['role', 'status', 'environment'],
        measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
        totals: { grandTotalColumn: false },
      },
    });

    const rows = p.getHeaderRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'orchestrator',
    ]);
    expect(rows[1]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'success',
    ]);
    expect(rows[2]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'prod',
      'staging',
    ]);
  });

  it('keeps totals labeled without adding an extra hierarchy row', () => {
    const p = createPivotTable({
      data: [
        { role: 'orchestrator', status: 'success', sales: 1 },
        { role: 'orchestrator', status: 'failed', sales: 2 },
        { role: 'implementer', status: 'success', sales: 3 },
      ],
      pivot: {
        rows: [],
        columns: ['role', 'status'],
        measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
      },
    });

    const rows = p.getHeaderRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'orchestrator',
      'implementer',
      '__total__',
    ]);
    expect(rows[0]!.map(({ colSpan }) => colSpan)).toEqual([2, 2, 1]);
    expect(rows[1]!.map(({ node }) => ('label' in node ? node.label : undefined))).toEqual([
      'success',
      'failed',
      'success',
      'failed',
    ]);
  });
});
