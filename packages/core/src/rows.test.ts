import { describe, expect, it } from 'vitest';
import { createColumns } from './columns';
import type { Column } from './columns';
import { buildCell, buildVisibleCells } from './rows';
import type { ColumnDef, Row } from './types';
import { DEFAULT_STATE } from './types';

interface Person {
  id: string;
  name: string;
  age: number;
  email: string;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name' },
  { id: 'age', accessor: 'age' },
  { id: 'email', accessor: 'email' },
];

const person: Person = { id: '1', name: 'Alice', age: 30, email: 'a@x.com' };

const row: Row<Person> = {
  id: '1',
  index: 0,
  original: person,
  getVisibleCells: () => [],
  getRowProps: () => ({}),
};

describe('buildCell', () => {
  it('produces id "{rowId}:{columnId}"', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const cell = buildCell(row, cols[0]!, 0);
    expect(cell.id).toBe('1:name');
  });

  it('getValue returns the column value', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const cell = buildCell(row, cols[1]!, 1);
    expect(cell.getValue()).toBe(30);
  });

  it('getContext carries row, column, value, indices', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const cell = buildCell(row, cols[0]!, 0);
    const ctx = cell.getContext();
    expect(ctx.row).toBe(row);
    expect((ctx.column as Column<Person>).id).toBe('name');
    expect(ctx.value).toBe('Alice');
    expect(ctx.rowIndex).toBe(0);
    expect(ctx.colIndex).toBe(0);
    expect(ctx.cell).toBe(cell);
  });
});

describe('buildVisibleCells', () => {
  it('returns one cell per visible column', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const cells = buildVisibleCells(row, cols);
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => (c.column as Column<Person>).id)).toEqual(['name', 'age', 'email']);
  });

  it('skips hidden columns', () => {
    const state = { ...DEFAULT_STATE, columnVisibility: { email: false } };
    const cols = createColumns<Person>(defs, state);
    const cells = buildVisibleCells(row, cols);
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => (c.column as Column<Person>).id)).toEqual(['name', 'age']);
  });

  it('assigns sequential colIndex in the visible order', () => {
    const state = { ...DEFAULT_STATE, columnOrder: ['email', 'name', 'age'] };
    const cols = createColumns<Person>(defs, state);
    const cells = buildVisibleCells(row, cols);
    expect(cells.map((c) => (c.column as Column<Person>).id)).toEqual(['email', 'name', 'age']);
    expect(cells.map((c) => c.getContext().colIndex)).toEqual([0, 1, 2]);
  });
});
