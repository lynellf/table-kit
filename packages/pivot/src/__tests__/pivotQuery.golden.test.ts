/**
 * Phase 6 — PivotQuery serialization golden tests (spec §13).
 *
 * Snapshot tests against committed JSON fixtures. Changes to PivotQuery
 * shape require updating the fixtures (intentional break-the-glass).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPivotQuery } from '../serialize/query';
import type {
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  TotalsConfig,
} from '../types';

interface Row {
  region: string;
  sales: number;
}

const data: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
];

const fixturesDir = resolve(__dirname, 'fixtures', 'pivotQuery');

const load = (name: string) =>
  JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8')) as Record<string, unknown>;

const buildAndSerialize = (
  config: PivotConfig<Row>,
  expanded: PivotExpansionState,
  sorting: PivotSortingState,
  totals: TotalsConfig,
) => {
  const q = buildPivotQuery(data, config, expanded, sorting, totals, { serialize: true });
  // Strip `rows` (the dataset) from serialization since the fixtures don't include it.
  const { rows: _rows, ...rest } = q;
  return JSON.parse(JSON.stringify(rest));
};

describe('pivotQuery.golden', () => {
  it('empty fixture', () => {
    const config: PivotConfig<Row> = { rows: [], columns: [], measures: [] };
    const result = buildAndSerialize(config, {}, [], {});
    expect(result).toEqual(load('empty.json'));
  });

  it('pivot-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [], {});
    expect(result).toEqual(load('pivot-only.json'));
  });

  it('expanded-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, { '["West"]': true }, [], {});
    expect(result).toEqual(load('expanded-only.json'));
  });

  it('sorting-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [{ level: 0, by: 'label', desc: true }], {});
    expect(result).toEqual(load('sorting-only.json'));
  });

  it('totals-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [], { grandTotalRow: true, grandTotalColumn: true });
    expect(result).toEqual(load('totals-only.json'));
  });

  it('all-combined fixture', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }, { id: 'count', aggregator: 'count' }],
      filters: [{ field: 'region', op: 'equals', value: 'West' }],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    };
    const result = buildAndSerialize(
      config,
      { '["West"]': true },
      [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }],
      { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    );
    expect(result).toEqual(load('all-combined.json'));
  });
});
