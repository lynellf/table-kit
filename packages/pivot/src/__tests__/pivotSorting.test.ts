/**
 * Phase 3 — pivot sorting application (spec §9.7).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', sales: 300 },
  { region: 'East', sales: 100 },
  { region: 'North', sales: 200 },
];

describe('pivot sorting', () => {
  it('by: "label" ascending (default order)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'label', desc: false }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['East', 'North', 'West']);
  });

  it('by: "label" descending', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'label', desc: true }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'North', 'East']);
  });

  it('by: "measure" ascending (sort by sales_sum)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: false }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['East', 'North', 'West']);
  });

  it('by: "measure" descending', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'North', 'East']);
  });

  it('no sorting → insertion order (alphabetical by first-seen)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'East', 'North']);
  });
});
