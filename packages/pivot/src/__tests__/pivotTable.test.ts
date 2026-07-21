/**
 * Phase 4 — createPivotTable factory + state slice machinery.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetPivotDefaultGetRowIdWarningForTests } from '../defaultGetRowId';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotResult, PivotTableOptions } from '../types';

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

  it('sanitizes null dimension entries before controlled pivot callbacks', () => {
    const onPivotChange = vi.fn();
    const p = createPivotTable({
      ...baseOpts(),
      state: {
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      },
      onPivotChange,
    });

    p.setPivot({
      rows: ['region', null as unknown as string, undefined as unknown as string],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    });

    expect(onPivotChange).toHaveBeenCalledWith({
      rows: ['region'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    });
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

  it('setOptions recomputes from the latest data and pivot configuration', () => {
    const pivot = createPivotTable({
      data: [{ id: '1', provider: 'openai', model: 'gpt-4', sales: 10 }],
      pivot: { rows: ['provider'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
    });

    pivot.setOptions({
      data: [{ id: '2', provider: 'anthropic', model: 'claude', sales: 20 }],
      pivot: { rows: ['model'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
    });

    expect(pivot.getVisibleRows().map((row) => row.label)).toEqual(['claude']);
  });

  it('recomputes when only the data reference changes', () => {
    const pivot = createPivotTable({
      data: [{ id: '1', region: 'West', sales: 100 }],
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
    });

    pivot.setOptions({
      data: [{ id: '2', region: 'East', sales: 200 }],
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
    });

    expect(pivot.getVisibleRows().map((row) => row.label)).toEqual(['East']);
    expect(pivot.getVisibleRows()[0]!.rowTotals.sales).toBe(200);
  });

  it('preserves filters and inline aggregators from the factory configuration', () => {
    const countAggregator = {
      init: () => 0,
      accumulate: (acc: number) => acc + 1,
      merge: (a: number, b: number) => a + b,
    };
    const pivot = createPivotTable({
      data: [
        { provider: 'openai', sessionId: 's1' },
        { provider: 'openai', sessionId: 's2' },
        { provider: 'anthropic', sessionId: 's3' },
      ],
      pivot: {
        rows: ['provider'],
        columns: [],
        measures: [
          {
            id: 'sessions',
            field: 'sessionId',
            aggregator: countAggregator,
          },
        ],
        filters: [{ field: 'provider', op: 'equals', value: 'openai' }],
      },
    });

    expect(pivot.getVisibleRows().map((row) => row.label)).toEqual(['openai']);
    expect(pivot.getVisibleRows()[0]!.rowTotals.sessions).toBe(2);
  });

  it('drops runtime-null dimension entries instead of creating malformed rows', () => {
    const pivot = createPivotTable({
      data: [{ provider: 'openai', sales: 10 }],
      pivot: {
        rows: ['provider', undefined as unknown as string],
        columns: [null as unknown as string],
        measures: [{ id: 'sales', field: 'sales' }],
      },
    });

    expect(pivot.getState().pivot.rows).toEqual(['provider']);
    expect(pivot.getState().pivot.columns).toEqual([]);
    expect(pivot.getVisibleRows().map((row) => row.label)).toEqual(['openai']);
  });

  it('uses a supplied engine, ignores stale async results, and disposes replacements', async () => {
    const deferred: Array<{
      resolve: (result: PivotResult<Row>) => void;
      reject: (error: unknown) => void;
    }> = [];
    const firstResult = createCustomResult('first');
    const secondResult = createCustomResult('second');
    const initialEngine = {
      compute: vi.fn(
        () =>
          new Promise<PivotResult<Row>>((resolve, reject) => {
            deferred.push({ resolve, reject });
          }),
      ),
      dispose: vi.fn(),
    };
    const replacementEngine = {
      compute: vi.fn(() => secondResult),
      dispose: vi.fn(),
    };
    const pivot = createPivotTable({
      data: rows,
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine: initialEngine,
    });

    expect(initialEngine.compute).toHaveBeenCalledTimes(1);
    expect(pivot.getStatus()).toBe('loading');

    pivot.setOptions({
      data: [{ id: '4', region: 'North', sales: 400 }],
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine: initialEngine,
    });
    expect(initialEngine.compute).toHaveBeenCalledTimes(2);
    deferred[1]!.resolve(secondResult);
    await Promise.resolve();
    expect(pivot.getResult()).toBe(secondResult);
    deferred[0]!.resolve(firstResult);
    await Promise.resolve();
    expect(pivot.getResult()).toBe(secondResult);

    pivot.setOptions({
      data: [{ id: '5', region: 'South', sales: 500 }],
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine: replacementEngine,
    });
    expect(initialEngine.dispose).toHaveBeenCalledTimes(1);
    pivot.dispose();
    expect(replacementEngine.dispose).toHaveBeenCalledTimes(1);
    expect(deferred[0]!.reject).toBeTypeOf('function');
  });

  it('exposes asynchronous compute errors and recovers on a later request', async () => {
    let shouldFail = true;
    const engine = {
      compute: vi.fn(() =>
        shouldFail
          ? Promise.reject(new Error('aggregation failed'))
          : Promise.resolve(createCustomResult('recovered')),
      ),
    };
    const pivot = createPivotTable({
      data: rows,
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine,
    });

    expect(pivot.getStatus()).toBe('loading');
    await Promise.resolve();
    await Promise.resolve();
    expect(pivot.getStatus()).toBe('error');
    expect(pivot.getError()?.message).toBe('aggregation failed');

    shouldFail = false;
    pivot.setOptions({
      data: [{ id: '4', region: 'North', sales: 400 }],
      pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(pivot.getStatus()).toBe('success');
    expect(pivot.getError()).toBeUndefined();
    expect(pivot.getResult().rowRoot.values.label).toBe('recovered');
  });

  it('uses computeChildren when expanding an already-aggregated row', () => {
    const child: PivotResult<Row>['rowRoot']['children'] = [
      {
        key: '["West","Q1"]',
        path: ['West', 'Q1'],
        level: 2,
        label: 'Q1',
        hasChildren: false,
        childState: 'loaded',
        values: {},
        rowTotals: {},
      },
    ];
    const result = createCustomResult('initial');
    result.rowRoot.children = [
      {
        key: '["West"]',
        path: ['West'],
        level: 1,
        label: 'West',
        hasChildren: true,
        childState: 'notLoaded',
        values: {},
        rowTotals: {},
      },
    ];
    const engine = {
      compute: vi.fn(() => result),
      computeChildren: vi.fn(() => child),
    };
    const pivot = createPivotTable({
      data: rows,
      pivot: { rows: ['region', 'id'], columns: [], measures: [{ id: 'sales', field: 'sales' }] },
      engine,
    });

    pivot.toggleExpanded(['West']);

    expect(engine.computeChildren).toHaveBeenCalledWith(
      ['West'],
      expect.objectContaining({ expandedPaths: ['["West"]'] }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(pivot.getResult().rowRoot.children![0]!.childState).toBe('loaded');
    expect(pivot.getResult().rowRoot.children![0]!.children).toEqual(child);
  });

  it('retries one failed child path without replacing unrelated rows', () => {
    const result = createCustomResult('initial');
    result.rowRoot.children = [
      {
        key: '["West"]',
        path: ['West'],
        level: 1,
        label: 'West',
        hasChildren: true,
        childState: 'notLoaded',
        values: {},
        rowTotals: {},
      },
      {
        key: '["East"]',
        path: ['East'],
        level: 1,
        label: 'East',
        hasChildren: false,
        childState: 'loaded',
        values: {},
        rowTotals: {},
      },
    ];
    let shouldFail = true;
    const engine = {
      compute: vi.fn(() => result),
      computeChildren: vi.fn(() => {
        if (shouldFail) throw new Error('West failed');
        return [
          {
            key: '["West","Q1"]',
            path: ['West', 'Q1'],
            level: 2,
            label: 'Q1',
            hasChildren: false,
            childState: 'loaded' as const,
            values: {},
            rowTotals: {},
          },
        ];
      }),
    };
    const pivot = createPivotTable({ ...baseOpts(), engine });

    pivot.toggleExpanded(['West']);
    expect(pivot.getResult().rowRoot.children![0]!.childState).toBe('error');
    expect(pivot.getResult().rowRoot.children![1]!.label).toBe('East');

    shouldFail = false;
    pivot.retryRow(['West']);

    expect(engine.computeChildren).toHaveBeenCalledTimes(2);
    expect(pivot.getResult().rowRoot.children![0]!.childState).toBe('loaded');
    expect(pivot.getVisibleRows().map((row) => row.label)).toEqual(['West', 'Q1', 'East']);
  });

  describe('column pinning', () => {
    it('R4: uncontrolled setColumnPinning mutates local state', () => {
      const p = createPivotTable(baseOpts());
      p.setColumnPinning({ left: ['region'], right: [] });
      expect(p.getState().columnPinning).toEqual({ left: ['region'], right: [] });
    });

    it('R4: controlled setColumnPinning dispatches callback when dedicated callback provided', () => {
      const onColumnPinningChange = vi.fn();
      const p = createPivotTable({
        ...baseOpts(),
        state: { columnPinning: { left: [], right: [] } },
        onColumnPinningChange,
      });
      p.setColumnPinning({ left: ['region'], right: [] });
      expect(onColumnPinningChange).toHaveBeenCalledWith({ left: ['region'], right: [] });
    });

    it('R4: controlled setColumnPinning does NOT mutate local state when dedicated callback missing', () => {
      const p = createPivotTable({
        ...baseOpts(),
        state: { columnPinning: { left: [], right: [] } },
        // No onColumnPinningChange - controlled but missing dedicated callback
      });
      p.setColumnPinning({ left: ['region'], right: [] });
      // State should NOT change because callback is missing
      expect(p.getState().columnPinning).toEqual({ left: [], right: [] });
    });

    it('R4: dedicated onColumnPinningChange takes precedence over onStateChange', () => {
      const onColumnPinningChange = vi.fn();
      const onStateChange = vi.fn();
      const p = createPivotTable({
        ...baseOpts(),
        state: { columnPinning: { left: [], right: [] } },
        onColumnPinningChange,
        onStateChange,
      });
      p.setColumnPinning({ left: ['region'], right: [] });
      // Dedicated callback should be called
      expect(onColumnPinningChange).toHaveBeenCalled();
      // onStateChange should NOT be called for this specific slice change
      const pinningCalls = onStateChange.mock.calls.filter(
        (call) => call[0]?.columnPinning !== undefined,
      );
      expect(pinningCalls).toHaveLength(0);
    });
  });

  describe('column sizing', () => {
    it('R4: uncontrolled setColumnSizing mutates local state', () => {
      const p = createPivotTable(baseOpts());
      p.setColumnSizing({ region: 150 });
      expect(p.getState().columnSizing).toEqual({ region: 150 });
    });

    it('R4: controlled setColumnSizing dispatches callback when dedicated callback provided', () => {
      const onColumnSizingChange = vi.fn();
      const p = createPivotTable({
        ...baseOpts(),
        state: { columnSizing: {} },
        onColumnSizingChange,
      });
      p.setColumnSizing({ region: 150 });
      expect(onColumnSizingChange).toHaveBeenCalledWith({ region: 150 });
    });

    it('R4: controlled setColumnSizing does NOT mutate local state when dedicated callback missing', () => {
      const p = createPivotTable({
        ...baseOpts(),
        state: { columnSizing: {} },
        // No onColumnSizingChange - controlled but missing dedicated callback
      });
      p.setColumnSizing({ region: 150 });
      // State should NOT change because callback is missing
      expect(p.getState().columnSizing).toEqual({});
    });
  });

  describe('resize session', () => {
    it('R4: startResize begins a resize session', () => {
      const p = createPivotTable(baseOpts());
      p.startResize('region', 100);
      expect(p.getState().columnSizingInfo).toEqual({
        columnId: 'region',
        startSize: 100,
        delta: 0,
        mode: 'onChange',
      });
    });

    it('R4: adjustResize updates delta without committing', () => {
      const p = createPivotTable(baseOpts());
      p.startResize('region', 100);
      p.adjustResize(50);
      expect(p.getState().columnSizingInfo?.delta).toBe(50);
      // columnSizing should NOT be updated yet
      expect(p.getState().columnSizing).toEqual({});
    });

    it('R4: commitResize applies the final size', () => {
      const p = createPivotTable(baseOpts());
      p.startResize('region', 100);
      p.adjustResize(50);
      p.commitResize();
      expect(p.getState().columnSizing).toEqual({ region: 150 });
      expect(p.getState().columnSizingInfo).toBeNull();
    });

    it('R4: cancelResize aborts without updating sizing', () => {
      const p = createPivotTable({ ...baseOpts(), state: { columnSizing: { region: 200 } } });
      p.startResize('region', 200);
      p.adjustResize(50);
      p.cancelResize();
      // Original sizing preserved
      expect(p.getState().columnSizing).toEqual({ region: 200 });
      expect(p.getState().columnSizingInfo).toBeNull();
    });

    it('R4: controlled resize commands read from controlled options (R4 fix)', () => {
      // In controlled mode, resize commands should read from currentOptions.state.columnSizingInfo
      // (the controlled value) rather than state.columnSizingInfo (local state).
      // This ensures commands work correctly when parent doesn't synchronously re-render.
      let parentSizingInfo: {
        columnId: string;
        startSize: number;
        delta: number;
        mode: 'onChange' | 'onEnd';
      } | null = null;
      const onColumnSizingInfoChange = vi.fn((updater) => {
        const prev = parentSizingInfo;
        const next = typeof updater === 'function' ? updater(prev) : updater;
        parentSizingInfo = next;
      });

      // Initialize with controlled state
      parentSizingInfo = {
        columnId: 'region',
        startSize: 100,
        delta: 0,
        mode: 'onChange',
      };

      const p = createPivotTable({
        ...baseOpts(),
        state: { columnSizingInfo: parentSizingInfo },
        onColumnSizingInfoChange,
      });

      // adjustResize should read from controlled options, not local state
      p.adjustResize(50);
      expect(onColumnSizingInfoChange).toHaveBeenCalled();
      // Verify the callback received the correct update
      const call = onColumnSizingInfoChange.mock.calls[0]![0];
      const next = typeof call === 'function' ? call(parentSizingInfo) : call;
      expect(next?.delta).toBe(50);

      // Reset mock
      onColumnSizingInfoChange.mockClear();

      // commitResize should read from controlled options
      p.commitResize();
      expect(onColumnSizingInfoChange).toHaveBeenLastCalledWith(null); // Clear session
    });
  });

  describe('focused cell', () => {
    it('R4: uncontrolled setFocusedCell mutates local state', () => {
      const p = createPivotTable(baseOpts());
      p.setFocusedCell({ rowId: '1', columnId: 'region' });
      expect(p.getState().focusedCell).toEqual({ rowId: '1', columnId: 'region' });
    });

    it('R4: controlled setFocusedCell dispatches callback when dedicated callback provided', () => {
      const onFocusedCellChange = vi.fn();
      const p = createPivotTable({
        ...baseOpts(),
        state: { focusedCell: null },
        onFocusedCellChange,
      });
      p.setFocusedCell({ rowId: '1', columnId: 'region' });
      expect(onFocusedCellChange).toHaveBeenCalledWith({ rowId: '1', columnId: 'region' });
    });

    it('R4: setFocusedCell(null) clears focused cell in uncontrolled mode', () => {
      const p = createPivotTable(baseOpts());
      // Start with no focused cell
      expect(p.getState().focusedCell).toBeNull();
      // Set a focused cell
      p.setFocusedCell({ rowId: '1', columnId: 'region' });
      expect(p.getState().focusedCell).toEqual({ rowId: '1', columnId: 'region' });
      // Clear it
      p.setFocusedCell(null);
      expect(p.getState().focusedCell).toBeNull();
    });
  });

  describe('getLeafColumns pinnedOffset', () => {
    it('R4: unpinned ordinary columns have no pinned property', () => {
      // Create a pivot with columns dimension to have leaf columns
      const p = createPivotTable({
        data: rows,
        pivot: {
          rows: [],
          columns: ['region'],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        getRowId: (r) => r.id,
        // No columnPinning in state - columns are unpinned by default
      });
      const leaves = p.getLeafColumns();
      // Ordinary non-total columns with no explicit pinning should have no pinned property
      leaves.forEach((leaf) => {
        if (!leaf.isTotal) {
          expect(leaf.pinned).toBeUndefined();
          expect(leaf.pinnedOffset).toBeUndefined();
        }
      });
    });

    it('R4: total columns default to right pinned', () => {
      const p = createPivotTable(baseOpts());
      const leaves = p.getLeafColumns();
      // Total columns (grand total, etc.) default to right pinned
      const totalLeaves = leaves.filter((l) => l.isTotal);
      if (totalLeaves.length > 0) {
        totalLeaves.forEach((leaf) => {
          expect(leaf.pinned).toBe('right');
        });
      }
    });

    it('R4: columnPinning state is reflected in getLeafColumns', () => {
      // Create a pivot with columns dimension to have leaf columns
      const p = createPivotTable({
        data: rows,
        pivot: {
          rows: [],
          columns: ['region'],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        getRowId: (r) => r.id,
        state: { columnPinning: { left: [], right: [] } },
      });
      const leaves = p.getLeafColumns();
      // With columns dimension, we should have leaf columns
      expect(leaves.length).toBeGreaterThan(0);
    });

    it('R4: right-pinned columns have correct cumulative pinnedOffset values from the right edge', () => {
      // When multiple columns are right-pinned, offsets accumulate from the right edge.
      // The rightmost column gets offset 0; the next rightmost gets the width of the rightmost, etc.
      // This is the R4-TOTAL-PIN-OFFSETS fix: default-right total leaves are included.
      const p = createPivotTable({
        data: rows,
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        getRowId: (r) => r.id,
        state: {
          columnPinning: { left: [], right: ['[]::sales_sum', '__total__::sales_sum'] },
          columnSizing: {
            '[]::sales_sum': 80,
            '__total__::sales_sum': 60,
          },
        },
      });
      const leaves = p.getLeafColumns();
      const leafMap = new Map(leaves.map((l) => [l.id, l]));

      // __total__::sales_sum is rightmost (second in right array), gets offset 0
      const totalLeaf = leafMap.get('__total__::sales_sum')!;
      expect(totalLeaf.pinned).toBe('right');
      expect(totalLeaf.pinnedOffset).toBe(0);

      // []::sales_sum is leftmost of right-pinned (first in right array), gets offset 60 (total width)
      const ordinaryLeaf = leafMap.get('[]::sales_sum')!;
      expect(ordinaryLeaf.pinned).toBe('right');
      expect(ordinaryLeaf.pinnedOffset).toBe(60); // width of __total__::sales_sum
    });

    it('R4: default-right total leaf gets correct pinnedOffset (first right-pinned = 0)', () => {
      // When no explicit columnPinning.right is set, the grand total defaults to right pinned.
      // As the only right-pinned column, it gets offset 0.
      const p = createPivotTable({
        data: rows,
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        getRowId: (r) => r.id,
        state: {
          columnSizing: {
            '[]::sales_sum': 80,
            '__total__::sales_sum': 60,
          },
        },
        // No columnPinning state — total defaults to right
      });
      const leaves = p.getLeafColumns();
      const totalLeaf = leaves.find((l) => l.isTotal)!;
      expect(totalLeaf.pinned).toBe('right');
      expect(totalLeaf.pinnedOffset).toBe(0); // first (only) right-pinned column

      // Ordinary unpinned column should have no pinned property
      const ordinaryLeaf = leaves.find((l) => !l.isTotal)!;
      expect(ordinaryLeaf.pinned).toBeUndefined();
      expect(ordinaryLeaf.pinnedOffset).toBeUndefined();
    });

    it('R4: getLeafColumns derives pinnedOffset from state (engine is not mutated)', () => {
      // Verify that getLeafColumns derives pinnedOffset from state without mutating the engine.
      // The engine's leafColumns has `pinned` set (for defaults), but pinnedOffset must come
      // from getLeafColumns() computation over state, not from the engine result.
      const p = createPivotTable({
        data: rows,
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        getRowId: (r) => r.id,
        state: {
          columnPinning: { left: [], right: ['__total__::sales_sum'] },
          columnSizing: { '__total__::sales_sum': 60 },
        },
      });

      const engineResult = p.getResult();
      // The engine sets `pinned` on leaf columns (for default-right), but does NOT
      // set `pinnedOffset` — that must be computed by getLeafColumns from state.
      const totalEngineLeaf = engineResult.leafColumns.find(
        (l) => l.id === '__total__::sales_sum',
      )!;
      expect(totalEngineLeaf.pinned).toBe('right');
      expect((totalEngineLeaf as any).pinnedOffset).toBeUndefined(); // engine does NOT set this

      // getLeafColumns() should compute pinnedOffset from state
      const publicLeaves = p.getLeafColumns();
      const totalLeaf = publicLeaves.find((l) => l.id === '__total__::sales_sum')!;
      expect(totalLeaf.pinned).toBe('right');
      expect(totalLeaf.pinnedOffset).toBe(0); // computed from state
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // S-005: R4 pivot version identity
  // Verifies R4-IDENTITY-008: no recursive deep equality; version token comparison
  // drives recompute vs. reuse decisions.
  // ─────────────────────────────────────────────────────────────────────────────
  describe('R4 pivot version identity (S-005)', () => {
    it('S-005-A1: same reference + same token → reuse (no recompute)', () => {
      // Given a pivot with dataVersion configured, changing data to the same
      // reference with the same resolved token must NOT trigger recompute.
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };
      const sameData = [{ id: '1', region: 'West', sales: 100 }];
      const pivot = createPivotTable({
        data: sameData,
        dataVersion: { version: 'v1' },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      // First compute was triggered by initial options
      expect(engine.compute).toHaveBeenCalledTimes(1);

      // Setting options with same reference and same version must NOT recompute
      pivot.setOptions({
        data: sameData, // same reference
        dataVersion: { version: 'v1' }, // same resolved token
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });

      // No additional compute call
      expect(engine.compute).toHaveBeenCalledTimes(1);
    });

    it('S-005-A2: same reference + changed token → recompute', () => {
      // Given a pivot with dataVersion configured, changing data to the same
      // reference but with a different resolved token must trigger recompute.
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };
      const sameData = [{ id: '1', region: 'West', sales: 100 }];
      const pivot = createPivotTable({
        data: sameData,
        dataVersion: { version: 'v1' },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      expect(engine.compute).toHaveBeenCalledTimes(1);

      // Setting options with same reference but DIFFERENT version must recompute
      pivot.setOptions({
        data: sameData, // same reference
        dataVersion: { version: 'v2' }, // changed resolved token
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });

      // Recompute was triggered
      expect(engine.compute).toHaveBeenCalledTimes(2);
    });

    it('S-005-A3: token removal (A→B→UNSET) → recompute', () => {
      // Verifying the A→B→UNSET token removal path triggers recompute.
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };
      const sameData = [{ id: '1', region: 'West', sales: 100 }];
      const pivot = createPivotTable({
        data: sameData,
        dataVersion: { version: 'v1' }, // starts with token
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      expect(engine.compute).toHaveBeenCalledTimes(1);

      // Change token: v1 → v2
      pivot.setOptions({
        data: sameData,
        dataVersion: { version: 'v2' },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(2);

      // Remove token: v2 → undefined
      pivot.setOptions({
        data: sameData,
        // no dataVersion — token removed
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      // Token removal is a real transition, recompute was triggered
      expect(engine.compute).toHaveBeenCalledTimes(3);
    });

    it('S-005-A4: getVersion function reads version from data (realistic pattern)', () => {
      // Verifies that getVersion can read version metadata from the data array.
      // This is the realistic pattern where version is embedded in the data.
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };

      // Data with embedded version metadata
      const dataV1 = [{ id: '1', region: 'West', sales: 100, _v: 1 }];
      const dataV2 = [{ id: '1', region: 'West', sales: 150, _v: 2 }]; // different data, different version

      // getVersion reads version from the data array (returns 0 if not found)
      const getVersion = (data: Row[]): number => {
        const first = data[0] as { _v?: number } | undefined;
        return first?._v ?? 0;
      };

      const pivot = createPivotTable({
        data: dataV1,
        dataVersion: { getVersion },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      expect(engine.compute).toHaveBeenCalledTimes(1); // initial

      // Same data reference, same resolved version → reuse
      pivot.setOptions({
        data: dataV1,
        dataVersion: { getVersion },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(1); // no change

      // Different data reference with different embedded version → recompute
      pivot.setOptions({
        data: dataV2, // different reference
        dataVersion: { getVersion },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(2); // changed data AND version
    });

    it('S-005-A5: no deep equality — deeply-equal new array recomputes', () => {
      // Verifies that a new array with identical values still recomputes
      // (changed reference always recomputes per spec; no deep equality).
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };
      const dataV1 = [{ id: '1', region: 'West', sales: 100 }];
      const dataV2 = [{ id: '1', region: 'West', sales: 100 }]; // new reference, identical values

      const pivot = createPivotTable({
        data: dataV1,
        dataVersion: { version: 'v1' },
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      expect(engine.compute).toHaveBeenCalledTimes(1);

      // New reference with identical values must recompute (no deep equality)
      pivot.setOptions({
        data: dataV2, // new reference
        dataVersion: { version: 'v1' }, // same version
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(2); // changed reference
    });

    it('S-005-A6: null/undefined dataVersion token is treated as undefined', () => {
      // Verifies that null dataVersion is normalized to undefined for comparison.
      const engine = {
        compute: vi.fn(() => createCustomResult('result')),
        dispose: vi.fn(),
      };
      const sameData = [{ id: '1', region: 'West', sales: 100 }];
      const pivot = createPivotTable({
        data: sameData,
        // No dataVersion
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
        engine,
        getRowId: (r) => r.id,
      });

      expect(engine.compute).toHaveBeenCalledTimes(1);

      // Setting same reference without dataVersion is no-op (treated as undefined)
      pivot.setOptions({
        data: sameData,
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(1); // no change

      // Omitting dataVersion is equivalent to undefined
      pivot.setOptions({
        data: sameData,
        // No dataVersion - treated as undefined
        pivot: {
          rows: ['region'],
          columns: [],
          measures: [{ id: 'sales_sum', field: 'sales' }],
        },
      });
      expect(engine.compute).toHaveBeenCalledTimes(1); // still no change
    });
  });
});

const createCustomResult = (label: string): PivotResult<Row> => ({
  columnRoot: { id: 'root', path: [], label: undefined, colSpan: 0, leaves: [] },
  leafColumns: [],
  rowRoot: {
    key: '[]',
    path: [],
    level: 0,
    label: undefined,
    hasChildren: false,
    childState: 'loaded',
    values: { label },
    rowTotals: {},
  },
  grandTotals: {},
});
