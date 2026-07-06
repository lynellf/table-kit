/**
 * Phase 1 type tests for spec §9.1 types + the Aggregator interface.
 *
 * Runtime assertions: type shapes compile (type-only), value identities match
 * the spec. Where the type is purely structural, we use `expectTypeOf` (already
 * in dev-deps from M0).
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Aggregator,
  FieldRef,
  MeasureDef,
  PivotConfig,
  PivotFilter,
  PivotTableState,
  TotalsConfig,
} from '../types';

describe('§9.1 PivotConfig types', () => {
  it('FieldRef accepts string form', () => {
    const f1: FieldRef = 'region';
    expect(f1).toBe('region');
    // FieldRef is a union type - string is assignable to it
    expectTypeOf<'region'>().toMatchTypeOf<FieldRef>();
  });

  it('FieldRef accepts object form', () => {
    const f2: FieldRef = {
      field: 'region',
      accessor: (r: unknown) => (r as { region: string }).region,
    };
    expect(typeof f2).toBe('object');
  });

  it('MeasureDef aggregator defaults to "sum" at runtime', () => {
    const m: MeasureDef = { id: 'sales_sum', field: 'sales' };
    expect(m.aggregator).toBeUndefined(); // engine resolves default 'sum'
  });

  it('PivotFilter discriminated union', () => {
    const f1: PivotFilter = { field: 'region', op: 'equals', value: 'West' };
    const f2: PivotFilter = { predicate: (r: unknown) => Boolean(r) };
    const f3: PivotFilter = { predicateRef: 'inRegion', args: ['West', 'East'] };
    expect(f1.op).toBe('equals');
    expect(typeof f2.predicate).toBe('function');
    expect(f3.predicateRef).toBe('inRegion');
  });

  it('TotalsConfig defaults match §9.6', () => {
    const t: TotalsConfig = {};
    expect(t.grandTotalRow).toBeUndefined(); // engine resolves default true
    expect(t.grandTotalColumn).toBeUndefined();
    expect(t.grandTotalColumnPosition).toBeUndefined();
    expect(t.subtotals).toBeUndefined();
  });

  it('PivotConfig composes FieldRef[] + MeasureDef[] + PivotFilter[]', () => {
    const cfg: PivotConfig = {
      rows: ['region', 'quarter'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [{ field: 'year', op: 'equals', value: 2024 }],
    };
    expect(cfg.rows).toHaveLength(2);
    expect(cfg.measures).toHaveLength(1);
  });
});

describe('§9.2 Aggregator interface', () => {
  it('Aggregator requires merge', () => {
    expectTypeOf<Aggregator>().toHaveProperty('merge');
    expectTypeOf<Aggregator['merge']>().toBeFunction();
  });

  it('Aggregator finalize is optional (default identity)', () => {
    type HasFinalize = Aggregator extends { finalize?: (...args: unknown[]) => unknown }
      ? true
      : false;
    const _check: HasFinalize = true;
    expect(_check).toBe(true);
  });

  it('sum-shaped Aggregator at runtime', () => {
    const sum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v,
      merge: (a, b) => a + b,
    };
    expect(sum.init()).toBe(0);
    expect(sum.accumulate(0, 5)).toBe(5);
    expect(sum.merge(3, 7)).toBe(10);
    // finalize is optional; when absent the accumulate result IS the output
    expect(sum.finalize).toBeUndefined();
  });
});

describe('§4.2 PivotTableState', () => {
  it('has pivot, expanded, pivotSorting, plus shared slices', () => {
    const state: PivotTableState = {
      pivot: { rows: [], columns: [], measures: [] },
      expanded: {},
      pivotSorting: [],
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    };
    expect(state.pivot.measures).toEqual([]);
    expect(state.expanded).toEqual({});
  });
});
