/**
 * Phase 3 — lazy expansion semantics (spec §9.5).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  product: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', product: 'A', sales: 10 },
  { region: 'West', product: 'B', sales: 20 },
  { region: 'East', product: 'A', sales: 30 },
  { region: 'East', product: 'B', sales: 40 },
];

describe('lazy expansion', () => {
  it('expandedPaths = [] → only level-0 materialized', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2); // West, East
    for (const region of result.rowRoot.children!) {
      expect(region.hasChildren).toBe(true);
      expect(region.children).toBeUndefined();
      expect(region.childState).toBe('notLoaded');
    }
  });

  it('expandedPaths = ["West"] → West children materialized, East still not', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: ['["West"]'],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.children).toHaveLength(2); // West's children (A, B) are materialized
    expect(west.childState).toBe('loaded');
    for (const product of west.children!) {
      expect(product.hasChildren).toBe(false); // leaf level
      // Grandchildren of expanded paths are still aggregated (not enumerated)
      // per spec §9.5 — unless their own path is in expandedPaths.
      expect(product.childState).toBe('notLoaded');
    }
    const east = result.rowRoot.children!.find((c) => c.label === 'East')!;
    expect(east.children).toBeUndefined();
    expect(east.childState).toBe('notLoaded');
  });

  it('computeChildren materializes children of a single path', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const children = await engine.computeChildren!(['West'], q, { signal: new AbortController().signal });
    expect(children).toHaveLength(2);
    expect(children.map((c) => String(c.label)).sort()).toEqual(['A', 'B']);
  });

  it('aggregated values are still present for unexpanded nodes', async () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(q, { signal: new AbortController().signal });
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.rowTotals.sales_sum).toBe(30); // 10 + 20 (children NOT enumerated, but aggregated)
  });
});
