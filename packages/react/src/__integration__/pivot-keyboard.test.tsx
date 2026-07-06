/**
 * Phase 5 — treegrid keyboard navigation (spec §7.5 conformance).
 */

import { createPivotTable } from '@lynellf/tablekit-pivot';
/** @jsxImportSource react */
import { describe, expect, it } from 'vitest';
import { applyTreegridAction, resolveTreegridKeyAction } from '../usePivotKeyboardNav';

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

const createPivotTableDirectly = () => {
  return createPivotTable<Row>({
    data: rows,
    pivot: {
      rows: ['region', 'product'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    },
    getRowId: (r) => r.id,
  });
};

describe('treegrid keyboard navigation', () => {
  it('ArrowRight on a collapsed row-header expands it', () => {
    const pivot = createPivotTableDirectly();
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowRight');
    expect(action?.kind).toBe('expand');
    if (action) applyTreegridAction(pivot, action, '["West"]');
    expect(pivot.getState().expanded['["West"]']).toBe(true);
  });

  it('ArrowRight on an expanded row-header focuses first child', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowRight');
    expect(action?.kind).toBe('focusFirstChild');
    const newKey = action ? applyTreegridAction(pivot, action, '["West"]') : null;
    expect(newKey).toBe('["West","A"]');
  });

  it('ArrowLeft on an expanded row-header collapses it', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowLeft');
    expect(action?.kind).toBe('collapse');
    if (action) applyTreegridAction(pivot, action, '["West"]');
    expect(pivot.getState().expanded['["West"]']).toBe(false);
  });

  it('ArrowLeft on a collapsed row-header focuses parent', () => {
    const pivot = createPivotTableDirectly();
    // First expand West to make its children visible
    pivot.setExpanded({ '["West"]': true });
    // Now simulate being focused on a leaf row and pressing ArrowLeft
    // This should return focusParent action
    const action = resolveTreegridKeyAction(pivot, '["West","A"]', 'ArrowLeft');
    // Leaf rows don't have children, so ArrowLeft should always return focusParent
    expect(action).not.toBeNull();
    expect(action?.kind).toBe('focusParent');
  });

  it('ArrowRight on a leaf row-header returns null (no children)', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West","A"]', 'ArrowRight');
    expect(action).toBeNull();
  });
});
