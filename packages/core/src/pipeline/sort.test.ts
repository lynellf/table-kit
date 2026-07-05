import { describe, expect, it } from 'vitest';
import { createColumns } from '../columns';
import type { ColumnDef } from '../types';
import { DEFAULT_STATE } from '../types';
import { sortRows, toggleSortItem } from './sort';

interface Person {
  id: string;
  name: string;
  age: number;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableSorting: true, sortingFn: 'alphanumeric' },
  { id: 'age', accessor: 'age', enableSorting: true, sortingFn: 'number' },
];

const rows: Person[] = [
  { id: '1', name: 'Charlie', age: 30 },
  { id: '2', name: 'Alice', age: 25 },
  { id: '3', name: 'Bob', age: 35 },
];

describe('sortRows', () => {
  it('returns input rows unchanged when sorting is empty', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = sortRows({ rows, sorting: [], columns: cols });
    expect(out).toEqual(rows);
  });

  it('sorts ascending by alphanumeric', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = sortRows({
      rows,
      sorting: [{ id: 'name', desc: false }],
      columns: cols,
    });
    expect(out.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('sorts descending by number', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const out = sortRows({
      rows,
      sorting: [{ id: 'age', desc: true }],
      columns: cols,
    });
    expect(out.map((r) => r.age)).toEqual([35, 30, 25]);
  });

  it('applies multi-sort with priority by index', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    // Add a fourth row with same name as Bob to exercise the secondary sort.
    const extended = [...rows, { id: '4', name: 'Bob', age: 28 }];
    const out = sortRows({
      rows: extended,
      sorting: [
        { id: 'name', desc: false },
        { id: 'age', desc: false },
      ],
      columns: cols,
    });
    expect(out.map((r) => `${r.name}-${r.age}`)).toEqual([
      'Alice-25',
      'Bob-28', // Bob-28 before Bob-35 (ascending secondary)
      'Bob-35',
      'Charlie-30',
    ]);
  });

  it('does not mutate the input array', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const input = [...rows];
    sortRows({
      rows: input,
      sorting: [{ id: 'name', desc: false }],
      columns: cols,
    });
    expect(input).toEqual(rows);
  });

  it('ignores sort items for columns without a sortingFn', () => {
    const cols = createColumns<Person>(
      [{ id: 'name', accessor: 'name', enableSorting: true }], // no sortingFn
      DEFAULT_STATE,
    );
    const out = sortRows({
      rows,
      sorting: [{ id: 'name', desc: false }],
      columns: cols,
    });
    expect(out).toEqual(rows);
  });
});

describe('toggleSortItem', () => {
  it('none → asc (default)', () => {
    expect(toggleSortItem([], 'name')).toEqual([{ id: 'name', desc: false }]);
  });

  it('asc → desc', () => {
    expect(toggleSortItem([{ id: 'name', desc: false }], 'name')).toEqual([
      { id: 'name', desc: true },
    ]);
  });

  it('desc → none (default: enableSortingRemoval)', () => {
    expect(toggleSortItem([{ id: 'name', desc: true }], 'name')).toEqual([]);
  });

  it('desc → asc when enableSortingRemoval=false', () => {
    expect(
      toggleSortItem([{ id: 'name', desc: true }], 'name', { enableSortingRemoval: false }),
    ).toEqual([{ id: 'name', desc: false }]);
  });

  it('none → desc when sortDescFirst=true', () => {
    expect(toggleSortItem([], 'name', { sortDescFirst: true })).toEqual([
      { id: 'name', desc: true },
    ]);
  });

  it('appends to existing sort list when append=true', () => {
    expect(toggleSortItem([{ id: 'name', desc: false }], 'age', { append: true })).toEqual([
      { id: 'name', desc: false },
      { id: 'age', desc: false },
    ]);
  });

  it('replaces when append=false and other columns are sorted', () => {
    expect(toggleSortItem([{ id: 'name', desc: false }], 'age')).toEqual([
      { id: 'age', desc: false },
    ]);
  });
});
