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
