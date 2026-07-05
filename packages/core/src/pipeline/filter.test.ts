import { describe, expect, it } from 'vitest';
import { createColumns } from '../columns';
import type { ColumnDef } from '../types';
import { DEFAULT_STATE } from '../types';
import { filterRows } from './filter';

interface Person {
  id: string;
  name: string;
  age: number;
  email: string;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableFiltering: true, filterFn: 'includesString' },
  { id: 'age', accessor: 'age', enableFiltering: true, filterFn: 'inNumberRange' },
  { id: 'email', accessor: 'email' as keyof Person & string },
];

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30, email: 'a@x.com' },
  { id: '2', name: 'Bob', age: 25, email: 'b@x.com' },
  { id: '3', name: 'Carol', age: 35, email: 'c@x.com' },
];

describe('filterRows', () => {
  it('returns input rows unchanged when no filters are active', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({ rows, filters: [], columns: cols });
    expect(out).toEqual(rows);
  });

  it('applies includesString filter', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'name', value: 'ali' }],
      columns: cols,
    });
    expect(out.map((r) => r.id)).toEqual(['1']);
  });

  it('applies inNumberRange filter', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'age', value: [20, 30] }],
      columns: cols,
    });
    expect(out.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('combines multiple filters with AND semantics', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [
        { id: 'name', value: 'o' }, // matches Bob + Carol
        { id: 'age', value: [30, 40] }, // matches Alice + Carol
      ],
      columns: cols,
    });
    expect(out.map((r) => r.id)).toEqual(['3']);
  });

  it('skips filters for columns without a filterFn declared', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'email', value: 'x' }], // email has no filterFn
      columns: cols,
    });
    expect(out).toEqual(rows);
  });

  it('skips filters for unknown column ids', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'ghost', value: 'x' }],
      columns: cols,
    });
    expect(out).toEqual(rows);
  });

  it('accepts inline filterFn on the column', () => {
    const inlineDefs: Array<ColumnDef<Person, unknown>> = [
      {
        id: 'age',
        accessor: 'age',
        enableFiltering: true,
        filterFn: (row, _id, v) => row.age > (v as number),
      },
    ];
    const cols = createColumns<Person>(inlineDefs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'age', value: 28 }],
      columns: cols,
    });
    expect(out.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('returns false (not throws) for wrong-typed filter values', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = filterRows({
      rows,
      filters: [{ id: 'name', value: 42 }], // includesString wants a string
      columns: cols,
    });
    expect(out).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const input = [...rows];
    filterRows({
      rows: input,
      filters: [{ id: 'name', value: 'ali' }],
      columns: cols,
    });
    expect(input).toEqual(rows);
  });
});
