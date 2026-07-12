/**
 * @fixture/tablekit-core-consumer
 *
 * Minimal consumer fixture that verifies the core public surface
 * is importable from packed artifacts.
 */

import { VERSION, createDataTable } from '@lynellf/tablekit-core';
import type {
  Announcer,
  ColumnFilterItem,
  ColumnSizingState,
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  PaginationState,
  SortItem,
} from '@lynellf/tablekit-core';

// Verify version
const _version: string = VERSION;

// Basic factory usage
interface Row {
  id: string;
  name: string;
  age: number;
}

const options: DataTableOptions<Row> = {
  data: [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ],
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age', enableSorting: true },
  ],
};

const table: DataTableInstance<Row> = createDataTable(options);
const state: DataTableState = table.getState();

// Verify state slices
const _sorting: SortItem[] = state.sorting;
const _filters: ColumnFilterItem[] = state.columnFilters;
const _pagination: PaginationState = state.pagination;
const _sizing: ColumnSizingState = state.columnSizing;

// Verify methods exist
table.setOptions(options);
table.subscribe(() => {});
const _unsubscribe = table.subscribe(() => {});

// Verify reset methods
table.resetSlice('sorting');
table.resetState();

// Verify announcer
const _announcer: Announcer = { announce: () => {} };
table.announce('test message');

console.log('✓ Core public surface verified');
console.log('✓ Fixture imports resolved from packed artifacts');
