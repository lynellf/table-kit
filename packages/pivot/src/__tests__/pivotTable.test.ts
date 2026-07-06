/**
 * Phase 4 — createPivotTable factory + state slice machinery.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPivotDefaultGetRowIdWarningForTests } from '../defaultGetRowId';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  id: string;
  region: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', sales: 100 },
  { id: '2', region: 'East', sales: 200 },
  { id: '3', region: 'West', sales: 150 },
];

const baseOpts = (): PivotTableOptions<Row> => ({
  data: rows,
  pivot: {
    rows: ['region'],
    columns: [],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r) => r.id,
});

beforeEach(() => {
  __resetPivotDefaultGetRowIdWarningForTests();
});

describe('createPivotTable', () => {
  it('returns initial state with pivot config from options', () => {
    const p = createPivotTable(baseOpts());
    expect(p.getState().pivot.rows[0]).toBe('region');
    expect(p.getState().expanded).toEqual({});
  });

  it('uncontrolled pivot.setPivot mutates local state', () => {
    const p = createPivotTable(baseOpts());
    p.setPivot((old) => ({ ...old, rows: ['id'] }));
    expect(p.getState().pivot.rows[0]).toBe('id');
  });

  it('controlled pivot.setPivot dispatches callback', () => {
    const onPivotChange = vi.fn();
    const p = createPivotTable({
      ...baseOpts(),
      state: {
        ...baseOpts().state,
        pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] },
      },
      onPivotChange,
    });
    p.setPivot((old) => ({ ...old, rows: ['id'] }));
    expect(onPivotChange).toHaveBeenCalled();
  });

  it('toggleExpanded flips the expanded slice and announces', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.toggleExpanded(['West']);
    expect(p.getState().expanded['["West"]']).toBe(true);
    expect(announcer.announce).toHaveBeenCalledWith(
      expect.stringContaining('Expanded West'),
      'polite',
    );
  });

  it('toggleExpanded collapses an already-expanded path', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.toggleExpanded(['West']);
    p.toggleExpanded(['West']);
    expect(p.getState().expanded['["West"]']).toBe(false);
    expect(announcer.announce).toHaveBeenLastCalledWith(
      expect.stringContaining('Collapsed'),
      'polite',
    );
  });

  it('setPivotSorting triggers notify and announces', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.setPivotSorting([{ level: 0, by: 'label', desc: true }]);
    expect(p.getState().pivotSorting).toHaveLength(1);
    expect(announcer.announce).toHaveBeenCalledWith(expect.stringContaining('Sorted'), 'polite');
  });

  it('subscribe notifies on slice change', () => {
    const p = createPivotTable(baseOpts());
    const listener = vi.fn();
    const unsub = p.subscribe(listener);
    p.setExpanded({ '["West"]': true });
    expect(listener).toHaveBeenCalled();
    unsub();
    p.setExpanded({ '["West"]': false });
    expect(listener).toHaveBeenCalledTimes(1); // not called again after unsub
  });
});
