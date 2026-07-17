/**
 * @fixture/tablekit-react-consumer
 *
 * Minimal consumer fixture that verifies the react public surface
 * is importable from packed artifacts.
 */

import { DataGrid, PivotGrid, ReactAnnouncer } from '@lynellf/tablekit-react';
import type { DataGridProps, PivotGridProps, UseDataTableOptions } from '@lynellf/tablekit-react';
import React from 'react';

interface Row {
  id: string;
  name: string;
  age: number;
}

// Verify hook options type
const _options: UseDataTableOptions<Row> = {
  data: [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ],
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age', enableSorting: true },
  ],
};

// Verify announcer component can be rendered
const _Announcer = React.createElement(ReactAnnouncer, { announcer: { announce: () => {} } });

const _dataGridProps: DataGridProps<Row> = {
  rows: _options.data,
  columns: _options.columns,
  getRowId: (row: Row) => row.id,
};

const _pivotGridProps: PivotGridProps<Row> = {
  data: _options.data,
  pivot: {
    rows: ['name'],
    columns: [],
    measures: [{ id: 'age_sum', field: 'age', aggregator: 'sum' }],
  },
  getRowId: (row: Row) => row.id,
};

const _DataGrid = React.createElement(DataGrid<Row>, _dataGridProps);
const _PivotGrid = React.createElement(PivotGrid<Row>, _pivotGridProps);

void _Announcer;
void _DataGrid;
void _PivotGrid;

// Note: In a real React app, useDataTable would be called inside a component.
// This fixture verifies the types resolve correctly.

console.log('✓ React public surface verified');
console.log('✓ Fixture imports resolved from packed artifacts');
