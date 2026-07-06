/**
 * Phase 6 — buildPivotQuery + validatePivotQuery tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPivotQuery } from '../serialize/query';
import { __resetInlineLeakWarningForTests, validatePivotQuery } from '../serialize/warnings';
import type { PivotConfig, PivotExpansionState, PivotSortingState, TotalsConfig } from '../types';

interface Row {
  region: string;
  sales: number;
}

const data: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
];

const baseConfig = (): PivotConfig<Row> => ({
  rows: ['region'],
  columns: [],
  measures: [{ id: 'sales_sum', field: 'sales' }],
});

const baseExpanded = (): PivotExpansionState => ({});
const baseSorting = (): PivotSortingState => [];
const baseTotals = (): TotalsConfig => ({});

beforeEach(() => {
  __resetInlineLeakWarningForTests();
});

describe('buildPivotQuery', () => {
  it('empty query (no rows, no columns, no measures, no expansion, no sorting)', () => {
    const q = buildPivotQuery(data, { rows: [], columns: [], measures: [] }, baseExpanded(), baseSorting(), baseTotals());
    expect(q.rowsFieldRef).toEqual([]);
    expect(q.columnsFieldRef).toEqual([]);
    expect(q.measures).toEqual([]);
    expect(q.filters).toEqual([]);
    expect(q.expandedPaths).toEqual([]);
    expect(q.pivotSorting).toEqual([]);
  });

  it('pivot-only (rows + measures)', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), baseTotals());
    expect(q.rowsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.measures).toEqual([{ id: 'sales_sum', field: 'sales', aggregator: 'sum', label: undefined, format: undefined }]);
  });

  it('expanded-only', () => {
    const q = buildPivotQuery(data, baseConfig(), { '["West"]': true }, baseSorting(), baseTotals());
    expect(q.expandedPaths).toEqual(['["West"]']);
  });

  it('sorting-only', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), [{ level: 0, by: 'label', desc: true }], baseTotals());
    expect(q.pivotSorting).toEqual([{ level: 0, by: 'label', desc: true }]);
  });

  it('totals-only (grandTotalRow + grandTotalColumn defaults)', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), { grandTotalRow: true, grandTotalColumn: true });
    expect(q.totals).toEqual({ grandTotalRow: true, grandTotalColumn: true });
  });

  it('all combined', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: ['region'],
      measures: [{ id: 'sales_sum', field: 'sales' }, { id: 'count', aggregator: 'count' }],
      filters: [{ field: 'region', op: 'equals', value: 'West' }],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    };
    const expanded: PivotExpansionState = { '["West"]': true };
    const sorting: PivotSortingState = [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }];
    const totals: TotalsConfig = { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' };
    const q = buildPivotQuery(data, config, expanded, sorting, totals);
    expect(q.rowsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.columnsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.measures).toHaveLength(2);
    expect(q.filters).toEqual([{ field: 'region', op: 'equals', value: 'West' }]);
    expect(q.expandedPaths).toEqual(['["West"]']);
    expect(q.pivotSorting).toEqual([{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }]);
    expect(q.totals).toEqual({ grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' });
  });

  it('serialize: true strips inline accessors + predicates', () => {
    const config: PivotConfig<Row> = {
      rows: [{ field: 'region', accessor: (r) => r.region }],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales', accessor: (r) => r.sales }],
      filters: [{ predicate: (r) => r.region === 'West' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals(), { serialize: true });
    expect(q.inlineAccessors).toBeUndefined();
    expect(q.filters).toEqual([]); // inline predicate stripped
  });
});

describe('validatePivotQuery', () => {
  it('does not warn for registry-name-only queries', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once when inline accessors are present', () => {
    const config: PivotConfig<Row> = {
      rows: [{ field: 'region', accessor: (r) => r.region }],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).toHaveBeenCalledTimes(1);
    validatePivotQuery(q); // one-shot
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('warns when inline predicates are present', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [{ predicate: (r) => r.region === 'West' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
