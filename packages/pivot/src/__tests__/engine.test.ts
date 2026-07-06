/**
 * Phase 3 — engine compute tests.
 *
 * Covers: small dataset with various hierarchies (row × column × measure combinations),
 * multi-measure, default 'sum' aggregator, column-root with no columns, row-root with no rows.
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface SalesRow {
  region: string;
  quarter: string;
  year: number;
  sales: number;
  orders: number;
}

const rows: SalesRow[] = [
  { region: 'West', quarter: 'Q1', year: 2024, sales: 100, orders: 5 },
  { region: 'West', quarter: 'Q2', year: 2024, sales: 150, orders: 7 },
  { region: 'East', quarter: 'Q1', year: 2024, sales: 200, orders: 9 },
  { region: 'East', quarter: 'Q2', year: 2024, sales: 250, orders: 12 },
  { region: 'West', quarter: 'Q3', year: 2024, sales: 180, orders: 8 },
];

describe('createMainThreadEngine', () => {
  it('computes a row hierarchy (region) with sum of sales', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2); // West, East
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.rowTotals.sales_sum).toBe(430); // 100+150+180
    const east = result.rowRoot.children!.find((c) => c.label === 'East')!;
    expect(east.rowTotals.sales_sum).toBe(450); // 200+250
    expect(result.grandTotals['__total__::sales_sum']).toBe(880);
  });

  it('default aggregator is "sum" when MeasureDef.aggregator is omitted', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const q: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const r = engine.compute(q, { signal: new AbortController().signal });
    expect(r.rowRoot.rowTotals.sales_sum).toBe(880);
  });

  it('two-level row hierarchy (region × quarter)', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'quarter' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2);
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.hasChildren).toBe(true);
    expect(west.children).toBeUndefined(); // not expanded
    expect(west.childState).toBe('notLoaded');
  });

  it('column hierarchy + multi-measure', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [{ field: 'year' }],
      measures: [
        { id: 'sales_sum', field: 'sales' },
        { id: 'orders_count', field: 'orders', aggregator: 'count' },
      ],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.columnRoot.children).toBeDefined();
    const year2024 = result.columnRoot.children!.find((c) => c.label === 2024);
    expect(year2024?.colSpan).toBe(2); // two measures
  });

  it('no rows → empty root with no children', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.hasChildren).toBe(false);
    expect(result.rowRoot.children).toBeUndefined();
  });

  it('no row hierarchy → aggregated at the root', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toBeUndefined();
    expect(result.rowRoot.rowTotals.sales_sum).toBe(880);
  });
});
