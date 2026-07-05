import {
  type AccessorFn,
  type CellPosition,
  type ColumnAccessor,
  type ColumnDef,
  type ColumnFilterItem,
  type ColumnPinningState,
  type ColumnResizeSession,
  DEFAULT_STATE,
  type DataTableInstance,
  type DataTableOptions,
  type DataTableState,
  type PaginationState,
  type Row,
  type RowIdAccessor,
  type SortItem,
  type SortingFn,
  type Updater,
} from './types';

// Compile-time assertion helpers. Each `assertType` is a runtime no-op whose
// only purpose is to force the type-checker to verify the supplied type.
declare const assertType: <T>(value: T) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Updater
// ─────────────────────────────────────────────────────────────────────────────

assertType<Updater<number>>(42);
assertType<Updater<number>>((old: number) => old + 1);

// ─────────────────────────────────────────────────────────────────────────────
// State slices
// ─────────────────────────────────────────────────────────────────────────────

assertType<SortItem>({ id: 'name', desc: false });
assertType<ColumnFilterItem>({ id: 'name', value: 'a' });
assertType<PaginationState>({ pageIndex: 0, pageSize: 25 });
assertType<ColumnPinningState>({ left: ['a'], right: ['b'] });
assertType<ColumnResizeSession>({
  columnId: 'a',
  startSize: 100,
  delta: 5,
  mode: 'onEnd',
});
assertType<CellPosition | null>({ rowId: 'r1', columnId: 'name' });
assertType<CellPosition | null>(null);

// DataTableState is a structural superset of every slice.
const sampleState: DataTableState = DEFAULT_STATE;
assertType<SortItem[]>(sampleState.sorting);
assertType<ColumnFilterItem[]>(sampleState.columnFilters);
assertType<PaginationState>(sampleState.pagination);
assertType<string[]>(sampleState.columnOrder);
assertType<Record<string, boolean>>(sampleState.columnVisibility);
assertType<ColumnPinningState>(sampleState.columnPinning);
assertType<Record<string, number>>(sampleState.columnSizing);
assertType<ColumnResizeSession | null>(sampleState.columnSizingInfo);
assertType<CellPosition | null>(sampleState.focusedCell);

// ─────────────────────────────────────────────────────────────────────────────
// ColumnDef + accessor
// ─────────────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  name: string;
  age: number;
}

const keyAccessor: ColumnAccessor<Person, string> = 'name';
assertType<ColumnAccessor<Person, string>>(keyAccessor);

const fnAccessor: ColumnAccessor<Person, number> = (row: Person) => row.age;
assertType<ColumnAccessor<Person, number>>(fnAccessor);

const def: ColumnDef<Person, string> = {
  id: 'name',
  accessor: 'name',
  size: 150,
  enableSorting: true,
  sortingFn: 'alphanumeric',
  meta: { custom: true },
};
assertType<ColumnDef<Person, string>>(def);

// AccessorFn return type is preserved through ColumnDef.
const inferred: AccessorFn<Person, string> | undefined =
  typeof def.accessor === 'function' ? def.accessor : undefined;
assertType<AccessorFn<Person, string> | undefined>(inferred);

// SortingFn signature is enforced.
const sortById: SortingFn<Person> = (a, b, _columnId) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
assertType<SortingFn<Person>>(sortById);

// RowIdAccessor is two-arg and returns string.
const idAccessor: RowIdAccessor<Person> = (row, _i) => row.id;
assertType<RowIdAccessor<Person>>(idAccessor);

// ─────────────────────────────────────────────────────────────────────────────
// Options + Instance
// ─────────────────────────────────────────────────────────────────────────────

const opts: DataTableOptions<Person> = {
  data: [],
  columns: [def],
  getRowId: idAccessor,
  state: { pagination: { pageIndex: 0, pageSize: 10 } },
  onSortingChange: (u) => {
    assertType<Updater<SortItem[]>>(u);
  },
  onStateChange: (u) => {
    assertType<Updater<DataTableState>>(u);
  },
};
assertType<DataTableOptions<Person>>(opts);

// Instance shape is stable.
declare const instance: DataTableInstance<Person>;
assertType<() => DataTableState>(instance.getState);
assertType<(next: DataTableOptions<Person>) => void>(instance.setOptions);
// M1: getRowModel() returns Row<Person>[] (not Person[])
assertType<() => Row<Person>[]>(instance.getRowModel);
