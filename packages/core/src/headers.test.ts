import { describe, expect, it, vi } from 'vitest';
import { createColumns } from './columns';
import { buildHeaderGroups } from './headers';
import { DEFAULT_STATE } from './types';
import type { ColumnDef, DataTableState } from './types';

interface Person {
  id: string;
  name: string;
  age: number;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableSorting: true },
  { id: 'age', accessor: 'age', enableSorting: true },
];

const baseContext = () => ({
  instance: {
    toggleSorting: vi.fn(),
    getColumnCount: () => 2,
    getRowCount: () => 5,
    announce: vi.fn(),
  },
});

describe('buildHeaderGroups', () => {
  it('returns one header group containing one header per visible column', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.headers).toHaveLength(2);
    expect(group.headers.map((h) => h.id)).toEqual(['name', 'age']);
  });

  it('header.getHeaderProps emits role, aria-colindex, key', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    const header = group.headers[0]!;
    const props = header.getHeaderProps();
    expect(props.role).toBe('columnheader');
    expect(props['aria-colindex']).toBe(1);
    expect(props.key).toBe('name');
  });

  it('header.getHeaderProps emits aria-sort when sorted', () => {
    const state: DataTableState = {
      ...DEFAULT_STATE,
      sorting: [{ id: 'age', desc: true }],
    };
    const cols = createColumns<Person>(defs, state);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    const ageHeader = group.headers.find((h) => h.id === 'age')!;
    expect(ageHeader.getHeaderProps()['aria-sort']).toBe('descending');
  });

  it('header.getHeaderProps emits data-pinned when pinned', () => {
    const state: DataTableState = {
      ...DEFAULT_STATE,
      columnPinning: { left: ['name'], right: [] },
    };
    const cols = createColumns<Person>(defs, state);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    const header = group.headers[0]!;
    expect(header.getHeaderProps()['data-pinned']).toBe('left');
  });

  it('header.getSortToggleProps dispatches toggleSorting on click', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const ctx = baseContext();
    const groups = buildHeaderGroups<Person>(cols, ctx);
    const group = groups[0]!;
    const header = group.headers[0]!;
    const props = header.getSortToggleProps();
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(-1);
    (props.onClick as (e: unknown) => void)({ defaultPrevented: false });
    expect(ctx.instance.toggleSorting).toHaveBeenCalledWith('name', false);
  });

  it('header.getSortToggleProps does NOT dispatch when defaultPrevented', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const ctx = baseContext();
    const groups = buildHeaderGroups<Person>(cols, ctx);
    const group = groups[0]!;
    const header = group.headers[0]!;
    const props = header.getSortToggleProps();
    (props.onClick as (e: unknown) => void)({ defaultPrevented: true });
    expect(ctx.instance.toggleSorting).not.toHaveBeenCalled();
  });

  it('header.getSortToggleProps is inert for non-sortable columns', () => {
    const noSortDefs: Array<ColumnDef<Person, unknown>> = [{ id: 'name', accessor: 'name' }];
    const cols = createColumns<Person>(noSortDefs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    const header = group.headers[0]!;
    const props = header.getSortToggleProps();
    expect(props.role).toBeUndefined();
    expect(props['aria-hidden']).toBe(true);
  });

  it('consumerProps are merged into getHeaderProps output', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    const header = group.headers[0]!;
    const props = header.getHeaderProps({ className: 'my-header' });
    expect(props.className).toBe('my-header');
  });

  it('headerGroup.getRowProps emits role="row" and aria-rowindex=1', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    expect(group.getRowProps()).toEqual({ role: 'row', 'aria-rowindex': 1 });
  });

  it('headerGroup.getHeaderGroupProps emits role="rowgroup"', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const group = groups[0]!;
    expect(group.getHeaderGroupProps()).toEqual({ role: 'rowgroup' });
  });
});
