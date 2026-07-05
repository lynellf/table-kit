import { describe, expect, it } from 'vitest';
import type { ColumnDef, DataTableState } from '../types';
import { DEFAULT_STATE } from '../types';
import { buildRowModel, columnsForRowModel } from './rowModel';

interface Person {
  id: string;
  name: string;
  age: number;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  {
    id: 'name',
    accessor: 'name',
    enableFiltering: true,
    filterFn: 'includesString',
    enableSorting: true,
    sortingFn: 'alphanumeric',
  },
  {
    id: 'age',
    accessor: 'age',
    enableFiltering: true,
    filterFn: 'inNumberRange',
    enableSorting: true,
    sortingFn: 'number',
  },
];

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
  { id: '3', name: 'Carol', age: 35 },
];

const idOf: (row: Person, i: number) => string = (r) => r.id;

describe('buildRowModel', () => {
  it('returns the input data wrapped in row objects', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state: DEFAULT_STATE,
      getRowId: idOf,
    });
    expect(out).toHaveLength(3);
    expect(out[0]?.id).toBe('1');
    expect(out[0]?.original).toBe(rows[0]);
    expect(out[0]?.index).toBe(0);
  });

  it('applies filter then sort then paginate in order', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const state: DataTableState = {
      ...DEFAULT_STATE,
      columnFilters: [{ id: 'name', value: 'o' }], // matches Bob + Carol
      sorting: [{ id: 'age', desc: true }], // Carol (35) first, then Bob (25)
      pagination: { pageIndex: 0, pageSize: 1 }, // only Carol on page 1
    };
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state,
      getRowId: idOf,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.original.name).toBe('Carol');
  });

  it('skips filtering when manualFiltering=true', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const state: DataTableState = {
      ...DEFAULT_STATE,
      columnFilters: [{ id: 'name', value: 'X' }], // matches nothing
    };
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state,
      manualFiltering: true,
      getRowId: idOf,
    });
    expect(out).toHaveLength(3);
  });

  it('skips sorting when manualSorting=true', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const state: DataTableState = {
      ...DEFAULT_STATE,
      sorting: [{ id: 'name', desc: true }], // would reverse order
    };
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state,
      manualSorting: true,
      getRowId: idOf,
    });
    expect(out.map((r) => r.original.name)).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('skips pagination when manualPagination=true (returns full result)', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const state: DataTableState = {
      ...DEFAULT_STATE,
      pagination: { pageIndex: 0, pageSize: 1 }, // would yield 1 row
    };
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state,
      manualPagination: true,
      getRowId: idOf,
    });
    expect(out).toHaveLength(3);
  });

  it('returns [] when filter eliminates all rows', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const state: DataTableState = {
      ...DEFAULT_STATE,
      columnFilters: [{ id: 'name', value: 'zzz' }],
    };
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state,
      getRowId: idOf,
    });
    expect(out).toEqual([]);
  });
});
