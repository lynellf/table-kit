/**
 * Phase 4 — getVisibleRows DFS flatten honoring expanded.
 */

import { describe, expect, it } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  id: string;
  region: string;
  product: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', product: 'A', sales: 10 },
  { id: '2', region: 'West', product: 'B', sales: 20 },
  { id: '3', region: 'East', product: 'A', sales: 30 },
];

const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: {
    rows: ['region', 'product'],
    columns: [],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r) => r.id,
};

describe('getVisibleRows', () => {
  it('returns only level-0 when nothing is expanded', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(2); // West, East
  });

  it('returns expanded subtree when path is expanded', () => {
    const p = createPivotTable(opts);
    p.setExpanded({ '["West"]': true });
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(4); // West, A, B, East
    const labels = visible.map((r) => r.label);
    expect(labels).toEqual(['West', 'A', 'B', 'East']);
  });

  it('expanded but hasChildren=false is a leaf', () => {
    const p = createPivotTable({
      ...opts,
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] },
    });
    p.setExpanded({ '["West"]': true });
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(2);
  });
});
