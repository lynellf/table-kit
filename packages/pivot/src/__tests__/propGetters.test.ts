/**
 * Phase 4 — treegrid prop getter shape.
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
  { id: '1', region: 'West', product: 'A', sales: 100 },
  { id: '2', region: 'West', product: 'B', sales: 150 },
  { id: '3', region: 'East', product: 'A', sales: 200 },
];

// Two-level row hierarchy so West/East have children (level 1 groups have children at level 2)
const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: {
    rows: ['region', 'product'],
    columns: [],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r) => r.id,
};

describe('getGridProps', () => {
  it('emits role="treegrid" + aria-rowcount + aria-colcount', () => {
    const p = createPivotTable(opts);
    const props = p.getGridProps();
    expect(props.role).toBe('treegrid');
    expect(props['aria-rowcount']).toBeGreaterThan(0);
    expect(props['aria-colcount']).toBeGreaterThan(0);
  });
});

describe('getRowProps', () => {
  it('emits role="row" + aria-rowindex + aria-level', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const row = visible[0]!;
    const props = p.getRowProps(row);
    expect(props.role).toBe('row');
    expect(props['aria-rowindex']).toBe(1);
    expect(props['aria-level']).toBe(1);
  });

  it('emits aria-expanded on rows with children', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    for (const row of visible) {
      const props = p.getRowProps(row);
      if (row.hasChildren) {
        expect(props['aria-expanded']).toBeDefined();
      }
    }
  });
});

describe('getRowHeaderProps', () => {
  it('emits role="rowheader"', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const props = p.getRowHeaderProps(visible[0]!);
    expect(props.role).toBe('rowheader');
  });
});

describe('getHeaderProps', () => {
  it('emits role="columnheader" + aria-colspan', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const entry = headerRows[0]![0]!;
    const props = p.getHeaderProps(entry.node);
    expect(props.role).toBe('columnheader');
    expect(props['aria-colspan']).toBeGreaterThanOrEqual(1);
  });
});

describe('getToggleExpandedProps', () => {
  it('emits role="button" + aria-expanded + onClick', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    console.log(
      'visible rows:',
      visible.map((r) => ({ label: r.label, hasChildren: r.hasChildren, level: r.level })),
    );
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    expect(rowWithChildren).toBeDefined();
    const props = p.getToggleExpandedProps(rowWithChildren);
    expect(props.role).toBe('button');
    expect(props['aria-expanded']).toBeDefined();
    expect(typeof props.onClick).toBe('function');
  });

  it('onClick toggles expansion', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    const props = p.getToggleExpandedProps(rowWithChildren);
    (props.onClick as (e: { defaultPrevented?: boolean }) => void)({ defaultPrevented: false });
    expect(p.getState().expanded[rowWithChildren.key]).toBe(true);
  });

  it('onClick is skipped when defaultPrevented', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    const props = p.getToggleExpandedProps(rowWithChildren);
    (props.onClick as (e: { defaultPrevented?: boolean }) => void)({ defaultPrevented: true });
    expect(p.getState().expanded[rowWithChildren.key]).toBeUndefined();
  });
});

describe('getFooterProps', () => {
  it('returns null when grandTotalRow is false', () => {
    const p = createPivotTable({
      ...opts,
      pivot: { ...opts.pivot, totals: { grandTotalRow: false } },
    });
    expect(p.getFooterProps()).toBeNull();
  });

  it('emits role="rowgroup" + data-total="row" when enabled', () => {
    const p = createPivotTable(opts);
    const props = p.getFooterProps();
    expect(props?.role).toBe('rowgroup');
    expect(props?.['data-total']).toBe('row');
  });
});

describe('getTotalsColumnProps', () => {
  it('emits data-total="column" for totals leaves', () => {
    const p = createPivotTable(opts);
    const totalsLeaf = p.getLeafColumns().find((l) => l.isTotal)!;
    const props = p.getTotalsColumnProps(totalsLeaf);
    expect(props['data-total']).toBe('column');
  });

  it('returns empty merge for non-totals leaves', () => {
    const p = createPivotTable(opts);
    const regularLeaf = p.getLeafColumns().find((l) => !l.isTotal)!;
    const props = p.getTotalsColumnProps(regularLeaf);
    expect(props['data-total']).toBeUndefined();
  });
});
