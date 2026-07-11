import { createDataTable } from '@lynellf/tablekit-core';
import { createClientDataSource } from '@lynellf/tablekit-core/dataSource';
import { type PivotResult, createPivotTable } from '@lynellf/tablekit-pivot';
import { createMainThreadEngine } from '@lynellf/tablekit-pivot/engine';
import { buildPivotQuery } from '@lynellf/tablekit-pivot/serialize';
import { usePivotTable } from '@lynellf/tablekit-react';
import { validateGridStructure } from '@lynellf/tablekit-react/validate';
import { createServerEngine } from '@lynellf/tablekit-worker/server';

interface Row {
  id: string;
  region: string;
  sales: number;
}

const rows: Row[] = [{ id: '1', region: 'West', sales: 10 }];
const pivot = createPivotTable({
  data: rows,
  pivot: {
    rows: ['region'],
    columns: [],
    measures: [{ id: 'sales', field: 'sales' }],
  },
});
const result: PivotResult<Row> = pivot.getResult();
const engine = createMainThreadEngine<Row>();
const query = buildPivotQuery(rows, pivot.getState().pivot, {}, [], {});
const columns = [{ id: 'region', accessor: (row: Row) => row.region }];
const table = createDataTable({ data: rows, columns });
const dataSource = createClientDataSource(rows, columns);
const serverEngine = createServerEngine({
  compute: async () => result,
  computeChildren: async () => [],
});

function typecheckReactSurface(): void {
  const hookResult = usePivotTable<Row>({
    data: rows,
    pivot: { rows: ['region'], columns: [], measures: [] },
  });
  void hookResult.pivot.getResult();
}

void engine.compute(query, { signal: new AbortController().signal });
void table.getState();
void dataSource;
void serverEngine;
void validateGridStructure;
void typecheckReactSurface;
