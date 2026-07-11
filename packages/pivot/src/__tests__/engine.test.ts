/**
 * Phase 3 — engine compute tests.
 *
 * Covers: small dataset with various hierarchies (row × column × measure combinations),
 * multi-measure, default 'sum' aggregator, column-root with no columns, row-root with no rows.
 */

import { describe, expect, it } from 'vitest';
import { __registerCoreFilterFn, createMainThreadEngine } from '../engine';
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
  it('computes a row hierarchy (region) with sum of sales', async () => {
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
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2); // West, East
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.rowTotals.sales_sum).toBe(430); // 100+150+180
    const east = result.rowRoot.children!.find((c) => c.label === 'East')!;
    expect(east.rowTotals.sales_sum).toBe(450); // 200+250
    expect(result.grandTotals['__total__::sales_sum']).toBe(880);
  });

  it('default aggregator is "sum" when MeasureDef.aggregator is omitted', async () => {
    const engine = createMainThreadEngine<SalesRow>();
    const q: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const r = await engine.compute(q, { signal: new AbortController().signal });
    expect(r.rowRoot.rowTotals.sales_sum).toBe(880);
  });

  it('two-level row hierarchy (region × quarter)', async () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'quarter' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2);
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.hasChildren).toBe(true);
    expect(west.children).toBeUndefined(); // not expanded
    expect(west.childState).toBe('notLoaded');
  });

  it('column hierarchy + multi-measure', async () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [{ field: 'year' }],
      measures: [
        { id: 'sales_sum', field: 'sales', aggregator: 'sum' },
        { id: 'orders_count', field: 'orders', aggregator: 'count' },
      ],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result.columnRoot.children).toBeDefined();
    const year2024 = result.columnRoot.children!.find((c) => c.label === 2024);
    expect(year2024?.colSpan).toBe(2); // two measures
  });

  it('no rows → empty root with no children', async () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.hasChildren).toBe(false);
    expect(result.rowRoot.children).toBeUndefined();
  });

  it('no row hierarchy → aggregated at the root', async () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toBeUndefined();
    expect(result.rowRoot.rowTotals.sales_sum).toBe(880);
  });

  it('aggregates each row-group and column-path intersection independently', async () => {
    const engine = createMainThreadEngine<{
      provider: string;
      role: string;
      status: string;
      cost: number;
    }>();
    const data = [
      { provider: 'openai', role: 'orchestrator', status: 'success', cost: 10 },
      { provider: 'openai', role: 'implementer', status: 'failed', cost: 20 },
      { provider: 'anthropic', role: 'orchestrator', status: 'success', cost: 30 },
    ];
    const result = await engine.compute(
      {
        rows: data,
        rowsFieldRef: [{ field: 'provider' }],
        columnsFieldRef: [{ field: 'role' }, { field: 'status' }],
        measures: [{ id: 'cost', field: 'cost', aggregator: 'sum' }],
        filters: [],
        totals: { grandTotalRow: true, grandTotalColumn: true },
        expandedPaths: [],
        pivotSorting: [],
      },
      { signal: new AbortController().signal },
    );

    const openai = result.rowRoot.children!.find((row) => row.label === 'openai')!;
    expect(openai.values['["orchestrator","success"]::cost']).toBe(10);
    expect(openai.values['["implementer","failed"]::cost']).toBe(20);
    expect(openai.values['["orchestrator","failed"]::cost']).toBe(0);
    expect(openai.rowTotals.cost).toBe(30);
    expect(result.grandTotals['["orchestrator","success"]::cost']).toBe(40);
    expect(result.grandTotals['["implementer","failed"]::cost']).toBe(20);
    expect(result.grandTotals['__total__::cost']).toBe(60);
  });

  it('applies declarative filters before grouping, columns, and totals', async () => {
    const engine = createMainThreadEngine<{
      provider: string;
      role: string;
      cost: number;
      active: boolean;
    }>();
    const data = [
      { provider: 'openai', role: 'orchestrator', cost: 10, active: true },
      { provider: 'openai', role: 'implementer', cost: 20, active: false },
      { provider: 'anthropic', role: 'orchestrator', cost: 30, active: true },
    ];
    const baseQuery: PivotQuery<(typeof data)[number]> = {
      rows: data,
      rowsFieldRef: [{ field: 'provider' }],
      columnsFieldRef: [{ field: 'role' }],
      measures: [{ id: 'cost', field: 'cost', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const cases = [
      {
        filter: { field: 'provider', op: 'equals' as const, value: 'openai' },
        total: 30,
        groups: ['openai'],
      },
      {
        filter: { field: 'provider', op: 'in' as const, value: ['anthropic'] },
        total: 30,
        groups: ['anthropic'],
      },
      {
        filter: { field: 'provider', op: 'notIn' as const, value: ['anthropic'] },
        total: 30,
        groups: ['openai'],
      },
      {
        filter: { field: 'cost', op: 'range' as const, value: [15, 30] },
        total: 50,
        groups: ['openai', 'anthropic'],
      },
      {
        filter: { field: 'role', op: 'contains' as const, value: 'orch' },
        total: 40,
        groups: ['openai', 'anthropic'],
      },
    ];

    for (const { filter, total, groups } of cases) {
      const result = await engine.compute(
        { ...baseQuery, filters: [filter] },
        { signal: new AbortController().signal },
      );
      expect(result.rowRoot.rowTotals.cost).toBe(total);
      expect(result.grandTotals['__total__::cost']).toBe(total);
      expect(result.rowRoot.children!.map((row) => row.label)).toEqual(groups);
    }
  });

  it('combines filters with AND and distinguishes null, undefined, and missing values', async () => {
    type FilterRow = {
      id: number;
      active: boolean;
      tags: string[];
      marker?: string | null | undefined;
    };
    const engine = createMainThreadEngine<FilterRow>();
    const data: FilterRow[] = [
      { id: 1, active: true, tags: ['pivot'], marker: null },
      { id: 2, active: true, tags: ['table'], marker: undefined },
      { id: 3, active: false, tags: ['pivot'] },
    ];
    const baseQuery: PivotQuery<FilterRow> = {
      rows: data,
      rowsFieldRef: [{ field: 'id' }],
      columnsFieldRef: [],
      measures: [{ id: 'count', aggregator: 'count' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const andResult = await engine.compute(
      {
        ...baseQuery,
        filters: [
          { field: 'active', op: 'equals', value: true },
          { field: 'tags', op: 'contains', value: 'pivot' },
        ],
      },
      { signal: new AbortController().signal },
    );
    expect(andResult.rowRoot.children!.map((row) => row.label)).toEqual([1]);
    expect(andResult.grandTotals['__total__::count']).toBe(1);

    const nullResult = await engine.compute(
      { ...baseQuery, filters: [{ field: 'marker', op: 'equals', value: null }] },
      { signal: new AbortController().signal },
    );
    expect(nullResult.rowRoot.children!.map((row) => row.label)).toEqual([1]);

    const missingResult = await engine.compute(
      { ...baseQuery, filters: [{ field: 'marker', op: 'equals', value: undefined }] },
      { signal: new AbortController().signal },
    );
    expect(missingResult.rowRoot.children!.map((row) => row.label)).toEqual([2, 3]);

    __registerCoreFilterFn('activeRows', (row) => (row as FilterRow).active);
    const registryResult = await engine.compute(
      { ...baseQuery, filters: [{ predicateRef: 'activeRows' }] },
      { signal: new AbortController().signal },
    );
    expect(registryResult.rowRoot.children!.map((row) => row.label)).toEqual([1, 2]);
  });

  it('supports inline field accessors and aggregators in a main-thread query', async () => {
    const engine = createMainThreadEngine<{ provider: string; sessionId: string }>();
    const data = [
      { provider: 'openai', sessionId: 's1' },
      { provider: 'openai', sessionId: 's2' },
    ];
    const countAggregator = {
      init: () => 0,
      accumulate: (acc: number) => acc + 1,
      merge: (a: number, b: number) => a + b,
    };
    const result = await engine.compute(
      {
        rows: data,
        rowsFieldRef: [{ field: 'provider' }],
        columnsFieldRef: [],
        measures: [{ id: 'sessions', field: 'sessionId', aggregator: 'sum' }],
        filters: [],
        totals: { grandTotalRow: true, grandTotalColumn: true },
        expandedPaths: [],
        pivotSorting: [],
        inlineAccessors: {
          measures: [{ id: 'sessions', accessor: (row) => row.sessionId }],
          aggregators: { sessions: countAggregator },
        },
      },
      { signal: new AbortController().signal },
    );

    expect(result.rowRoot.children![0]!.rowTotals.sessions).toBe(2);
    expect(result.grandTotals['__total__::sessions']).toBe(2);
  });

  it('does not reuse cached results across different inline predicates', async () => {
    const engine = createMainThreadEngine<{ id: number; sales: number }>();
    const data = [
      { id: 1, sales: 10 },
      { id: 2, sales: 20 },
    ];
    const baseQuery: PivotQuery<(typeof data)[number]> = {
      rows: data,
      rowsFieldRef: [{ field: 'id' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales', field: 'sales', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const first = await engine.compute(
      { ...baseQuery, filters: [{ predicate: (row) => row.id === 1 }] },
      { signal: new AbortController().signal },
    );
    const second = await engine.compute(
      { ...baseQuery, filters: [{ predicate: (row) => row.id === 2 }] },
      { signal: new AbortController().signal },
    );

    expect(first.grandTotals['__total__::sales']).toBe(10);
    expect(second.grandTotals['__total__::sales']).toBe(20);
  });
});
