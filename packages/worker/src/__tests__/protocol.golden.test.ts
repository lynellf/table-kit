/**
 * Protocol serialization golden tests.
 *
 * Verifies the wire protocol shape and that serialization
 * correctly strips non-transferable fields.
 */

import type { PivotQuery, WirePivotQuery } from '@lynellf/tablekit-pivot';
import { describe, expect, it } from 'vitest';
import type { WorkerRequest, WorkerResponse } from '../protocol';
import { serializeQuery } from '../serialization/serializeQuery';

describe('protocol serialization', () => {
  it('serializeQuery strips rows and inlineAccessors', () => {
    const q: PivotQuery = {
      // biome-disable-next-line lint/suspicious/noExplicitAny -- Test requires flexible type
      rows: [{ a: 1 }] as any,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
      inlineAccessors: {
        // biome-disable-next-line lint/suspicious/noExplicitAny -- Test requires flexible type
        rows: [{ field: 'region', accessor: (r: any) => r.region.toUpperCase() }],
      } as any,
    };

    const wire = serializeQuery(q);

    expect(wire).not.toHaveProperty('rows');
    expect(wire).not.toHaveProperty('inlineAccessors');
    expect(wire.rowsFieldRef).toEqual([{ field: 'region' }]);
  });

  it('serializeQuery strips inline predicates at the worker boundary', () => {
    const q: PivotQuery<{ region: string }> = {
      rows: [{ region: 'West' }],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [],
      filters: [{ predicate: (row) => row.region === 'West' }],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };

    expect(serializeQuery(q).filters).toEqual([]);
  });

  it('WirePivotQuery is structurally compatible with Omit<PivotQuery, rows | inlineAccessors>', () => {
    // Compile-time structural check: WirePivotQuery can be assigned to the expected shape
    const _assignability: WirePivotQuery = {
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    } as WirePivotQuery;

    expect(_assignability).toBeDefined();
  });

  it('golden: top-level pivot config', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const wire = serializeQuery(q);

    expect(wire).toEqual({
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    });
  });

  it('golden: pivot with row + column hierarchy', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }, { field: 'category' }],
      columnsFieldRef: [{ field: 'quarter' }],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const wire = serializeQuery(q);

    expect(wire.rowsFieldRef).toHaveLength(2);
    expect(wire.columnsFieldRef).toHaveLength(1);
    expect(wire.rowsFieldRef[0]).toEqual({ field: 'region' });
    expect(wire.columnsFieldRef[0]).toEqual({ field: 'quarter' });
  });

  it('golden: pivot with 2 measures (sum + count)', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [
        { id: 'rev', field: 'revenue', aggregator: 'sum' },
        { id: 'cnt', aggregator: 'count' },
      ],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const wire = serializeQuery(q);

    expect(wire.measures).toHaveLength(2);
    expect(wire.measures[0].id).toBe('rev');
    expect(wire.measures[1].id).toBe('cnt');
  });

  it('golden: pivot with global filters', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [
        { field: 'region', operator: 'eq', value: 'North' },
        { field: 'revenue', operator: 'gte', value: 1000 },
      ],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const wire = serializeQuery(q);

    expect(wire.filters).toHaveLength(2);
    expect(wire.filters[0]).toEqual({ field: 'region', operator: 'eq', value: 'North' });
    expect(wire.filters[1]).toEqual({ field: 'revenue', operator: 'gte', value: 1000 });
  });

  it('golden: pivot with expanded paths', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }, { field: 'category' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [
        { rowKey: 'North' },
        { rowKey: 'North', children: [{ rowKey: 'Electronics' }] },
      ],
      pivotSorting: [],
    };

    const wire = serializeQuery(q);

    expect(wire.expandedPaths).toHaveLength(2);
    expect(wire.expandedPaths[0]).toEqual({ rowKey: 'North' });
  });

  it('golden: pivot with pivot sorting', () => {
    const q: PivotQuery = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [
        { field: 'region', direction: 'asc' },
        { measureId: 'rev', direction: 'desc' },
      ],
    };

    const wire = serializeQuery(q);

    expect(wire.pivotSorting).toHaveLength(2);
    expect(wire.pivotSorting[0]).toEqual({ field: 'region', direction: 'asc' });
    expect(wire.pivotSorting[1]).toEqual({ measureId: 'rev', direction: 'desc' });
  });
});

describe('WorkerRequest type coverage', () => {
  it('setRows request has correct shape', () => {
    const request: WorkerRequest = {
      type: 'setRows',
      requestId: 1,
      rows: [{ a: 1 }],
    };

    expect(request.type).toBe('setRows');
    expect(request.requestId).toBe(1);
    expect(request.rows).toEqual([{ a: 1 }]);
  });

  it('compute request has correct shape', () => {
    const request: WorkerRequest = {
      type: 'compute',
      requestId: 2,
      query: {
        rowsFieldRef: [],
        columnsFieldRef: [],
        measures: [],
        filters: [],
        totals: { grandTotalRow: true },
        expandedPaths: [],
        pivotSorting: [],
      },
    };

    expect(request.type).toBe('compute');
    expect(request.requestId).toBe(2);
    expect(request.query).toBeDefined();
  });

  it('computeChildren request has correct shape', () => {
    const request: WorkerRequest = {
      type: 'computeChildren',
      requestId: 3,
      path: ['North', 'Electronics'],
      query: {
        rowsFieldRef: [],
        columnsFieldRef: [],
        measures: [],
        filters: [],
        totals: { grandTotalRow: true },
        expandedPaths: [],
        pivotSorting: [],
      },
    };

    expect(request.type).toBe('computeChildren');
    expect(request.path).toEqual(['North', 'Electronics']);
  });
});

describe('WorkerResponse type coverage', () => {
  it('setRows:ok response', () => {
    const response: WorkerResponse = {
      type: 'setRows:ok',
      requestId: 1,
    };

    expect(response.type).toBe('setRows:ok');
  });

  it('compute:ok response', () => {
    const response: WorkerResponse = {
      type: 'compute:ok',
      requestId: 2,
      result: {
        rows: [],
        grandTotals: { values: {} },
      },
    };

    expect(response.type).toBe('compute:ok');
    expect(response.result).toBeDefined();
  });

  it('error response', () => {
    const response: WorkerResponse = {
      type: 'error',
      requestId: 3,
      error: {
        name: 'ValidationError',
        message: 'Invalid query',
      },
    };

    expect(response.type).toBe('error');
    expect(response.error.message).toBe('Invalid query');
  });
});
