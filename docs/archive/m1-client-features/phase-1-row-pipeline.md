# Phase 1 — Row Pipeline (filter → sort → paginate)

**Goal:** Replace the M0 stub `getRowModel()` (which returned `options.data`) with a real pipeline that applies filter → sort → paginate in order, each stage skippable via the existing `manual*` flags on `DataTableOptions`. Derive `Row` and `Cell` objects from the pipeline output. Wire `autoResetPageIndex` so `setColumnFilters` dispatches reset `pageIndex` to 0 unless the consumer opts out.

After this phase:
- `getRowModel()` returns the **filtered, sorted, paginated** array of `Row<TRow>` objects.
- `manualSorting`, `manualFiltering`, `manualPagination` skip their respective stages.
- `Row<TRow>` exposes `id`, `index` (pipeline-output index), `original`, `getVisibleCells()`.
- `Cell<TRow, TValue>` exposes `id`, `row`, `column`, `getValue()`, `getContext()`.
- Pagination helpers (`nextPage`, `previousPage`, `setPageIndex`, `setPageSize`, `getCanPreviousPage`, `getCanNextPage`, `getPageCount`, `getRowCount`) are public dispatchers on the instance.
- `autoResetPageIndex` (default true) resets `pageIndex` to 0 on `setColumnFilters` dispatch; respects controlled pagination by routing through the slice callback.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/pipeline/filter.ts` | Pure `filterRows<TRow>(rows, filters, columns)` |
| `packages/core/src/pipeline/sort.ts` | Pure `sortRows<TRow>(rows, sorting, columns)` |
| `packages/core/src/pipeline/paginate.ts` | Pure `paginateRows<TRow>(rows, pagination)` |
| `packages/core/src/pipeline/rowModel.ts` | `buildRowModel<TRow>(opts) → Row<TRow>[]` orchestrating the three stages |
| `packages/core/src/pipeline/index.ts` | Barrel re-export |
| `packages/core/src/pipeline/*.test.ts` | Unit tests for each stage + orchestration |
| `packages/core/src/rows.ts` | `Row<TRow>`, `Cell<TRow, TValue>` derived classes |
| `packages/core/src/rows.test.ts` | Unit tests for row/cell derivation |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/types.ts` | Add `Row<TRow>`, `Cell<TRow, TValue>`, `autoResetPageIndex`, `enableMultiSort`, `sortDescFirst`, `enableSortingRemoval`, `rowCount`, `defaultSortUndefined` |
| `packages/core/src/createDataTable.ts` | Replace `getRowModel()` stub with pipeline build; add pagination dispatchers + autoResetPageIndex |
| `packages/core/src/index.ts` | Re-export new public surface (tree-shakeable subpaths from `pipeline/`) |

No package config changes.

---

## 3. File contents

### 3.1 `packages/core/src/pipeline/filter.ts`

```ts
/**
 * @lynellf/tablekit-core — filter pipeline stage.
 *
 * Pure function. Returns a new array containing the rows that pass every
 * active filter. Resolves each filter's `filterFn` via the registry
 * (`getFilterFn(name)`) when the column declares a name; uses the inline
 * function directly when the column declares one.
 *
 * Skipped when `options.manualFiltering === true`.
 */

import { getFilterFn } from '../registries/filtering';
import type { Column } from '../columns';
import type { ColumnFilterItem, FilterFn } from '../types';

type AnyRow = Record<string, unknown>;

export interface FilterStageOptions<TRow> {
  rows: TRow[];
  filters: ColumnFilterItem[];
  columns: Array<Column<TRow, unknown>>;
}

/**
 * Apply every filter in sequence. Order is preserved by `Array.filter`.
 * A filter that returns `true` keeps the row; `false` drops it.
 *
 * Rows without a matching column (e.g., the column was hidden or removed)
 * pass the filter (the filter is a no-op for unknown columns).
 *
 * Values that don't match the filter fn's expected type produce `false`
 * (the fn itself is responsible for the type check; see M0 built-ins).
 */
export const filterRows = <TRow>(opts: FilterStageOptions<TRow>): TRow[] => {
  if (opts.filters.length === 0) return opts.rows;

  // Build a column lookup once.
  const columnsById = new Map<string, Column<TRow, unknown>>();
  for (const col of opts.columns) columnsById.set(col.id, col);

  return opts.rows.filter((row) => {
    for (const filter of opts.filters) {
      const column = columnsById.get(filter.id);
      if (!column) continue; // unknown column → skip this filter
      const fn = resolveFilterFn<TRow>(column);
      if (!fn) continue; // column has no filterFn → skip
      const rowAsAny = row as unknown as AnyRow;
      if (!fn(rowAsAny, column.id, filter.value)) {
        return false;
      }
    }
    return true;
  });
};

/**
 * Resolve a column's filterFn to a callable. Returns `undefined` if the
 * column has no filterFn declared.
 */
const resolveFilterFn = <TRow>(
  column: Column<TRow, unknown>,
): FilterFn<AnyRow> | undefined => {
  const def = column.def;
  if (typeof def.filterFn === 'function') {
    return def.filterFn as FilterFn<AnyRow>;
  }
  if (typeof def.filterFn === 'string') {
    try {
      return getFilterFn<AnyRow>(def.filterFn);
    } catch {
      // Unknown registry name → treat as no filter.
      return undefined;
    }
  }
  return undefined;
};
```

### 3.2 `packages/core/src/pipeline/filter.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { filterRows } from './filter';
import { createColumns } from '../columns';
import type { ColumnDef, DataTableState } from '../types';
import { DEFAULT_STATE } from '../types';

interface Person {
  id: string;
  name: string;
  age: number;
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
      { id: 'age', accessor: 'age', enableFiltering: true, filterFn: (row, _id, v) => row.age > (v as number) },
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
```

### 3.3 `packages/core/src/pipeline/sort.ts`

```ts
/**
 * @lynellf/tablekit-core — sort pipeline stage.
 *
 * Pure function. Returns a new array sorted by the active `SortingState`.
 * Multi-sort: when multiple items are present, sort by index 0 first, then
 * index 1, etc. Stable sort (Array.prototype.sort is stable in ES2019+).
 *
 * Skipped when `options.manualSorting === true`.
 */

import { getSortingFn } from '../registries/sorting';
import type { Column } from '../columns';
import type { SortItem, SortingFn } from '../types';

type AnyRow = Record<string, unknown>;

export interface SortStageOptions<TRow> {
  rows: TRow[];
  sorting: SortItem[];
  columns: Array<Column<TRow, unknown>>;
}

const compareBySortItems = <TRow>(
  rows: TRow[],
  sorting: SortItem[],
  columnsById: Map<string, Column<TRow, unknown>>,
): TRow[] => {
  // Build comparator chain. Each SortItem contributes one comparator.
  // Array.prototype.sort is stable since ES2019.
  const comparators = sorting
    .map((item) => buildComparator(item, columnsById))
    .filter((c): c is Comparator<TRow> => c !== undefined);

  if (comparators.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
};

type Comparator<TRow> = (a: TRow, b: TRow) => number;

const buildComparator = <TRow>(
  item: SortItem,
  columnsById: Map<string, Column<TRow, unknown>>,
): Comparator<TRow> | undefined => {
  const column = columnsById.get(item.id);
  if (!column) return undefined;
  const fn = resolveSortingFn<TRow>(column);
  if (!fn) return undefined;
  const direction = item.desc ? -1 : 1;
  return (a, b) => direction * (fn(a as unknown as AnyRow, b as unknown as AnyRow, column.id) ?? 0);
};

const resolveSortingFn = <TRow>(
  column: Column<TRow, unknown>,
): SortingFn<AnyRow> | undefined => {
  const def = column.def;
  if (typeof def.sortingFn === 'function') {
    return def.sortingFn as SortingFn<AnyRow>;
  }
  if (typeof def.sortingFn === 'string') {
    try {
      return getSortingFn<AnyRow>(def.sortingFn);
    } catch {
      return undefined;
    }
  }
  // Default: pick a comparator that uses the accessor value.
  return undefined; // signal "no comparator"; treat as no-op for this column
};

/**
 * Public entry point.
 */
export const sortRows = <TRow>(opts: SortStageOptions<TRow>): TRow[] => {
  if (opts.sorting.length === 0) return opts.rows;

  const columnsById = new Map<string, Column<TRow, unknown>>();
  for (const col of opts.columns) columnsById.set(col.id, col);

  // Reject columns without a registered sortingFn when sort is requested for them.
  // Behavior: skip that column's contribution silently (it acts as a tie-breaker no-op).
  // Per spec §7.4: client resolution uses the column's sortingFn; if no fn, the column
  // is not sortable. We treat the sort item as a no-op for ranking (the row order
  // remains whatever the prior comparator or the original order produced).
  return compareBySortItems(opts.rows, opts.sorting, columnsById);
};

/**
 * Sort spec toggle helper. Given a column id and the current sorting state,
 * compute the next state per the toggle cycle:
 *   - none → asc (or desc if sortDescFirst)
 *   - asc  → desc
 *   - desc → none (if enableSortingRemoval) / asc (otherwise)
 *
 * Multi-sort: when `append` is true, append to the array instead of replacing.
 * The caller is responsible for plumbing `append` (Shift+click); this helper
 * just computes the next array.
 */
export const toggleSortItem = (
  sorting: SortItem[],
  columnId: string,
  opts: {
    sortDescFirst?: boolean;
    enableSortingRemoval?: boolean;
    append?: boolean;
  } = {},
): SortItem[] => {
  const sortDescFirst = opts.sortDescFirst ?? false;
  const enableSortingRemoval = opts.enableSortingRemoval ?? true;
  const append = opts.append ?? false;

  const idx = sorting.findIndex((s) => s.id === columnId);
  if (idx === -1) {
    // Not present → add at the end as asc (or desc).
    const next: SortItem = { id: columnId, desc: sortDescFirst };
    return append || sorting.length === 0 ? [...sorting, next] : [next];
  }
  const current = sorting[idx]!;
  if (!current.desc) {
    // asc → desc
    const nextArr = [...sorting];
    nextArr[idx] = { id: current.id, desc: true };
    return nextArr;
  }
  // desc → none (if removal enabled) / asc
  if (enableSortingRemoval) {
    const nextArr = [...sorting];
    nextArr.splice(idx, 1);
    return nextArr;
  }
  const nextArr = [...sorting];
  nextArr[idx] = { id: current.id, desc: false };
  return nextArr;
};
```

### 3.4 `packages/core/src/pipeline/sort.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { sortRows, toggleSortItem } from './sort';
import { createColumns } from '../columns';
import type { ColumnDef, DataTableState } from '../types';
import { DEFAULT_STATE } from '../types';

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
    const extended = [
      ...rows,
      { id: '4', name: 'Bob', age: 28 },
    ];
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
    expect(
      toggleSortItem([{ id: 'name', desc: false }], 'age', { append: true }),
    ).toEqual([
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
```

### 3.5 `packages/core/src/pipeline/paginate.ts`

```ts
/**
 * @lynellf/tablekit-core — pagination pipeline stage.
 *
 * Pure function. Returns a slice of the input rows.
 * Skipped when `options.manualPagination === true`.
 */

import type { PaginationState } from '../types';

export interface PaginateStageOptions<TRow> {
  rows: TRow[];
  pagination: PaginationState;
}

/**
 * Slice the rows array by `pagination.pageIndex` and `pagination.pageSize`.
 * Defensive against out-of-range pageIndex (clamps to last valid page).
 */
export const paginateRows = <TRow>(opts: PaginateStageOptions<TRow>): TRow[] => {
  const { rows, pagination } = opts;
  const { pageIndex, pageSize } = pagination;
  if (pageSize <= 0) return rows; // invalid pageSize → return all
  const start = pageIndex * pageSize;
  if (start >= rows.length) return [];
  return rows.slice(start, start + pageSize);
};

/**
 * Compute the page count for a given row total.
 * Returns 0 when rowCount is 0 (no pages).
 */
export const computePageCount = (rowCount: number, pageSize: number): number => {
  if (pageSize <= 0) return 0;
  if (rowCount <= 0) return 0;
  return Math.ceil(rowCount / pageSize);
};
```

### 3.6 `packages/core/src/pipeline/paginate.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { paginateRows, computePageCount } from './paginate';

const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i) }));

describe('paginateRows', () => {
  it('returns the first page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 0, pageSize: 10 } });
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ id: '0' });
    expect(out[9]).toEqual({ id: '9' });
  });

  it('returns a middle page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 1, pageSize: 10 } });
    expect(out.map((r) => r.id)).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19']);
  });

  it('returns the last partial page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 2, pageSize: 10 } });
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ id: '20' });
  });

  it('returns [] when pageIndex is beyond the data', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 99, pageSize: 10 } });
    expect(out).toEqual([]);
  });

  it('returns all rows when pageSize is invalid (<=0)', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 0, pageSize: 0 } });
    expect(out).toEqual(rows);
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    paginateRows({ rows: input, pagination: { pageIndex: 1, pageSize: 10 } });
    expect(input).toEqual(rows);
  });
});

describe('computePageCount', () => {
  it('returns 0 for empty data', () => {
    expect(computePageCount(0, 10)).toBe(0);
  });

  it('rounds up partial pages', () => {
    expect(computePageCount(25, 10)).toBe(3);
    expect(computePageCount(21, 10)).toBe(3);
    expect(computePageCount(20, 10)).toBe(2);
  });

  it('returns 0 for invalid pageSize', () => {
    expect(computePageCount(100, 0)).toBe(0);
    expect(computePageCount(100, -1)).toBe(0);
  });
});
```

### 3.7 `packages/core/src/pipeline/rowModel.ts`

```ts
/**
 * @lynellf/tablekit-core — row model orchestration.
 *
 * Wires the three pipeline stages together. Returns an array of `Row<TRow>`
 * derived from the input data.
 */

import { createColumns } from '../columns';
import type { Column } from '../columns';
import type { DataTableOptions } from '../types';
import type { Row } from '../rows';
import { filterRows } from './filter';
import { sortRows } from './sort';
import { paginateRows } from './paginate';

export interface BuildRowModelOptions<TRow> {
  data: TRow[];
  state: {
    sorting: DataTableOptions<TRow>['initialState'] extends infer S
      ? S extends { sorting?: infer X }
        ? X extends import('../types').SortItem[]
          ? X
          : never
        : never
      : never;
    columnFilters: DataTableOptions<TRow>['initialState'] extends infer S
      ? S extends { columnFilters?: infer X }
        ? X extends import('../types').ColumnFilterItem[]
          ? X
          : never
        : never
      : never;
    pagination: import('../types').PaginationState;
    columnOrder: string[];
    columnVisibility: Record<string, boolean>;
  };
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  rowCount?: number; // for manualPagination: logical total rows
  getRowId: (row: TRow, index: number) => string;
}

// (Above generic type is awkward; we use concrete types in the implementation
// because TypeScript cannot infer this from `state` alone. The signature below
// is simpler and matches how callers pass state.)

export interface BuildRowModelConcreteOptions<TRow> {
  data: TRow[];
  columns: Array<Column<TRow, unknown>>;
  state: import('../types').DataTableState;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
  rowCount?: number;
  getRowId: (row: TRow, index: number) => string;
}

/**
 * Build the row model. The pipeline runs in order: filter → sort → paginate.
 * Each stage is skipped when the corresponding `manual*` flag is true.
 *
 * Returns `Row<TRow>[]`. Each row carries its id (from getRowId), its index
 * in the final pipeline output, and a reference to its `original` data.
 */
export const buildRowModel = <TRow>(
  opts: BuildRowModelConcreteOptions<TRow>,
): Row<TRow>[] => {
  let rows: TRow[] = opts.data;
  const { columns, state } = opts;

  if (opts.manualFiltering !== true) {
    rows = filterRows({ rows, filters: state.columnFilters, columns });
  }
  if (opts.manualSorting !== true) {
    rows = sortRows({ rows, sorting: state.sorting, columns });
  }
  if (opts.manualPagination === true) {
    // Server mode: return the full filtered/sorted result, do NOT slice.
    // Caller is responsible for passing already-paginated data.
  } else {
    rows = paginateRows({ rows, pagination: state.pagination });
  }

  // Materialize Row objects.
  return rows.map((original, index) => ({
    id: opts.getRowId(original, index),
    index,
    original,
  }));
};

/**
 * Convenience: derive columns from defs + state. Used by callers that don't
 * already have a `Column[]`.
 */
export const columnsForRowModel = <TRow>(
  defs: Array<import('../types').ColumnDef<TRow, unknown>>,
  state: import('../types').DataTableState,
): Array<Column<TRow, unknown>> => createColumns(defs, state);
```

### 3.8 `packages/core/src/pipeline/rowModel.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildRowModel, columnsForRowModel } from './rowModel';
import type { ColumnDef, DataTableState } from '../types';
import { DEFAULT_STATE } from '../types';

interface Person {
  id: string;
  name: string;
  age: number;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableFiltering: true, filterFn: 'includesString', enableSorting: true, sortingFn: 'alphanumeric' },
  { id: 'age', accessor: 'age', enableFiltering: true, filterFn: 'inNumberRange', enableSorting: true, sortingFn: 'number' },
];

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
  { id: '3', name: 'Carol', age: 35 },
];

const idOf: (row: Person, i: number) => string = (r) => r.id;

describe('buildRowModel', () => {
  it('returns the input data wrapped in Row objects', () => {
    const cols = columnsForRowModel(defs, DEFAULT_STATE);
    const out = buildRowModel({
      data: rows,
      columns: cols,
      state: DEFAULT_STATE,
      getRowId: idOf,
    });
    expect(out).toHaveLength(3);
    expect(out[0]!.id).toBe('1');
    expect(out[0]!.original).toBe(rows[0]);
    expect(out[0]!.index).toBe(0);
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
    expect(out[0]!.original.name).toBe('Carol');
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
```

### 3.9 `packages/core/src/pipeline/index.ts`

```ts
export { filterRows } from './filter';
export { sortRows, toggleSortItem } from './sort';
export { paginateRows, computePageCount } from './paginate';
export { buildRowModel, columnsForRowModel } from './rowModel';
```

### 3.10 `packages/core/src/rows.ts`

```ts
/**
 * @lynellf/tablekit-core — Row and Cell derived types.
 *
 * Spec §4.4: derived objects exposed to renderers. `Row` carries
 * `id`, `index` (in the pipeline output), `original` (the source row),
 * and `getVisibleCells()`. `Cell` carries `id`, `row`, `column`,
 * `getValue()`, `getContext()`.
 *
 * Identity: rebuilt on every `buildRowModel()` call. Consumers must not hold
 * `Row`/`Cell` references across renders (same constraint M0 documents for
 * `Column`).
 */

import type { AccessorFn, CellPosition, ColumnDef, DataTableState } from './types';
import type { Column } from './columns';

export interface Row<TRow> {
  readonly id: string;
  /** Pipeline-output index (post-filter, post-sort, post-paginate). */
  readonly index: number;
  /** Reference to the original input row. */
  readonly original: TRow;
  /** Cells for the visible (non-hidden) leaf columns in order. */
  getVisibleCells(): Cell<TRow>[];
}

export interface Cell<TRow, TValue = unknown> {
  readonly id: string;
  readonly row: Row<TRow>;
  readonly column: Column<TRow, TValue>;
  getValue(): TValue;
  /** Context object passed to renderSlot(def.header/cell, ctx). */
  getContext(): CellContext<TRow, TValue>;
}

export interface CellContext<TRow, TValue = unknown> {
  table: unknown; // DataTable instance (cycle-resolved in phase 5)
  row: Row<TRow>;
  column: Column<TRow, TValue>;
  cell: Cell<TRow, TValue>;
  value: TValue;
  rowIndex: number;
  colIndex: number;
}

/**
 * Build a Cell from a Row + Column.
 *
 * The Cell is a fresh object every time — identity is not preserved across
 * `getVisibleCells()` calls. Consumers must read it in the render and not
 * hold references.
 */
export const buildCell = <TRow, TValue>(
  row: Row<TRow>,
  column: Column<TRow, TValue>,
  colIndex: number,
): Cell<TRow, TValue> => {
  const value = column.getValue(row.original, row.index);
  const cell: Cell<TRow, TValue> = {
    id: `${row.id}:${column.id}`,
    row,
    column,
    getValue: () => value,
    getContext: () => ({
      table: undefined, // populated by the instance in phase 5
      row,
      column,
      cell,
      value,
      rowIndex: row.index,
      colIndex,
    }),
  };
  return cell;
};

/**
 * Build the visible cells for a row, given the resolved columns and visibility.
 *
 * Hidden columns (columnVisibility[id] === false or column.isVisible === false)
 * are excluded from the output.
 */
export const buildVisibleCells = <TRow>(
  row: Row<TRow>,
  columns: Array<Column<TRow, unknown>>,
): Cell<TRow>[] => {
  const out: Cell<TRow>[] = [];
  let colIndex = 0;
  for (const col of columns) {
    if (!col.getIsVisible()) continue;
    out.push(buildCell(row, col, colIndex) as Cell<TRow>);
    colIndex += 1;
  }
  return out;
};
```

### 3.11 `packages/core/src/rows.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildVisibleCells, buildCell } from './rows';
import { createColumns } from './columns';
import type { ColumnDef } from './types';
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

const row = {
  id: '1',
  index: 0,
  original: person,
  getVisibleCells: () => [],
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
    expect(ctx.column.id).toBe('name');
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
    expect(cells.map((c) => c.column.id)).toEqual(['name', 'age', 'email']);
  });

  it('skips hidden columns', () => {
    const state = { ...DEFAULT_STATE, columnVisibility: { email: false } };
    const cols = createColumns<Person>(defs, state);
    const cells = buildVisibleCells(row, cols);
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => c.column.id)).toEqual(['name', 'age']);
  });

  it('assigns sequential colIndex in the visible order', () => {
    const state = { ...DEFAULT_STATE, columnOrder: ['email', 'name', 'age'] };
    const cols = createColumns<Person>(defs, state);
    const cells = buildVisibleCells(row, cols);
    expect(cells.map((c) => c.column.id)).toEqual(['email', 'name', 'age']);
    expect(cells.map((c) => c.getContext().colIndex)).toEqual([0, 1, 2]);
  });
});
```

### 3.12 `packages/core/src/types.ts` — additions

Add to `DataTableOptions<TRow>`:

```ts
  /** When true (default), filter changes reset pageIndex to 0. */
  autoResetPageIndex?: boolean;
  /** When true (default), sort items can be removed by clicking the third time. */
  enableSortingRemoval?: boolean;
  /** When true, the first sort click goes desc instead of asc. */
  sortDescFirst?: boolean;
  /** Total row count when manualPagination=true. Used for getRowCount + page count. */
  rowCount?: number;
  /** Announcer interface for sort/filter/pagination announcements. Defaults to noopAnnouncer. */
  announcer?: Announcer;
```

Add new types:

```ts
/** Announcer interface (spec §10). announce() is called from core on slice changes. */
export interface Announcer {
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
}
```

### 3.13 `packages/core/src/createDataTable.ts` — modifications

Replace `getRowModel()` body with pipeline build. Add pagination dispatchers. Wire `autoResetPageIndex`. Replace `applyChange` to wrap `setColumnFilters` so it auto-resets pageIndex.

Concrete changes (replacing the M0 implementations):

```ts
import { buildRowModel, columnsForRowModel, computePageCount, paginateRows } from './pipeline/rowModel';
import { buildVisibleCells } from './rows';
import type { Row } from './rows';
import { noopAnnouncer } from './announcer';
import type { Announcer } from './types';

// Inside the DataTable class, replace getRowModel:

  private rowModelCache: { key: unknown; rows: Row<TRow>[] } | null = null;

  getRowModel(): Row<TRow>[] {
    const columns = columnsForRowModel(this.options.columns, this.state);
    const key = {
      data: this.options.data,
      sorting: this.state.sorting,
      filters: this.state.columnFilters,
      pagination: this.state.pagination,
      columnOrder: this.state.columnOrder,
      columnVisibility: this.state.columnVisibility,
      manualSorting: this.options.manualSorting ?? false,
      manualFiltering: this.options.manualFiltering ?? false,
      manualPagination: this.options.manualPagination ?? false,
      rowCount: this.options.rowCount,
    };
    if (this.rowModelCache && shallowEqual(this.rowModelCache.key as object, key as object)) {
      return this.rowModelCache.rows;
    }
    const built = buildRowModel({
      data: this.options.data,
      columns,
      state: this.state,
      manualSorting: this.options.manualSorting,
      manualFiltering: this.options.manualFiltering,
      manualPagination: this.options.manualPagination,
      rowCount: this.options.rowCount,
      getRowId: this.options.getRowId ?? defaultGetRowId as (row: TRow, index: number) => string,
    });
    this.rowModelCache = { key, rows: built };
    return built;
  }

  // ─── Row derivation helpers (used by phase 5 for prop getters) ───────

  getHeaderGroups(): HeaderGroup<TRow>[] {
    // Phase 5 implements this in detail. Phase 1 stubs it as the column array
    // grouped by visibility (single-group layout).
    return [
      {
        id: 'header',
        headers: this.getVisibleColumns().map((col) => ({
          id: col.id,
          column: col,
          getHeaderProps: () => ({}), // phase 5 fills in
          getContext: () => ({ column: col, table: this, header: undefined as never }),
        })),
      },
    ];
  }

  getVisibleColumns(): Array<Column<TRow, unknown>> {
    return columnsForRowModel(this.options.columns, this.state).filter((c) => c.getIsVisible());
  }

  // ─── Pagination helpers ───────

  getCanPreviousPage(): boolean {
    return this.state.pagination.pageIndex > 0;
  }

  getCanNextPage(): boolean {
    const pageCount = this.getPageCount();
    return this.state.pagination.pageIndex < pageCount - 1;
  }

  getPageCount(): number {
    const pageSize = this.state.pagination.pageSize;
    if (this.options.manualPagination === true) {
      const total = this.options.rowCount ?? this.options.data.length;
      return computePageCount(total, pageSize);
    }
    // Client mode: derive from the post-filter, post-sort row count.
    const fullRowCount = this.getFullRowCount();
    return computePageCount(fullRowCount, pageSize);
  }

  getRowCount(): number {
    return this.options.rowCount ?? this.getFullRowCount();
  }

  private getFullRowCount(): number {
    // Internal: count rows after filter + sort, before paginate.
    const columns = columnsForRowModel(this.options.columns, this.state);
    let rows: TRow[] = this.options.data;
    if (this.options.manualFiltering !== true) {
      rows = filterRows({ rows, filters: this.state.columnFilters, columns });
    }
    if (this.options.manualSorting !== true) {
      rows = sortRows({ rows, sorting: this.state.sorting, columns });
    }
    return rows.length;
  }

  nextPage = (): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageIndex: p.pageIndex + 1 }));
  };

  previousPage = (): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }));
  };

  setPageIndex = (updater: Updater<number>): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageIndex: resolveUpdater(p.pageIndex, updater) }));
  };

  setPageSize = (updater: Updater<number>): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageSize: resolveUpdater(p.pageSize, updater) }));
  };
```

Modify `setColumnFilters` to auto-reset pagination:

```ts
setColumnFilters = (updater: ColumnFilterItem[] | ((old: ColumnFilterItem[]) => ColumnFilterItem[])): void => {
  this.applyChange('columnFilters', updater);
  // autoResetPageIndex (default true): reset pageIndex to 0 on filter change.
  if (this.options.autoResetPageIndex !== false) {
    if (isSliceControlled(this.options.state, 'pagination')) {
      // Route through the slice callback; consumer owns the slice.
      this.applyChange('pagination', (p) => ({ ...p, pageIndex: 0 }));
    } else {
      this.applyChange('pagination', (p) => ({ ...p, pageIndex: 0 }));
    }
  }
  // Announce filter result count.
  this.announce(`Filters applied. ${this.getFullRowCount()} rows.`);
};
```

Add announcer wiring:

```ts
private getAnnouncer(): Announcer {
  return this.options.announcer ?? noopAnnouncer;
}

private announce(message: string): void {
  this.getAnnouncer().announce(message, 'polite');
}
```

Note: the `getHeaderGroups` stub returns a structure that phase 5 replaces with the full implementation. Phase 1's job is to establish that the method exists and returns something iterable; phase 5 fills in the prop getters and context payloads.

### 3.14 `packages/core/src/index.ts` — additions

```ts
// ─── Row model (M1) ───────────────────────────────────────────────────────
export {
  filterRows,
  sortRows,
  toggleSortItem,
  paginateRows,
  computePageCount,
  buildRowModel,
  columnsForRowModel,
} from './pipeline';

// ─── Row/Cell types (M1) ──────────────────────────────────────────────────
export type { Row, Cell, CellContext } from './rows';

// ─── Announcer (M1) ───────────────────────────────────────────────────────
export { noopAnnouncer } from './announcer';
```

Note: tree-shakeable subpath exports are added in **phase 7** (which edits `package.json`'s `exports` map). Phase 1 only adds the root-level exports.

### 3.15 `packages/core/src/announcer.ts` (stub; phase 6 fills in)

```ts
/**
 * @lynellf/tablekit-core — default no-op announcer (M1 stub; phase 6 wires it).
 */

import type { Announcer } from './types';

export const noopAnnouncer: Announcer = {
  announce: () => {
    // default no-op
  },
};
```

---

## 4. Commands (in order)

```bash
# 1. Write all files above (use write tool, contents from §3).
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 1:
- All M0 tests still pass (103).
- ~30-40 new tests across `pipeline/*.test.ts` + `rows.test.ts`.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ pipeline > filter > ... (~9 tests)
#   ✓ pipeline > sort > ... (~12 tests)
#   ✓ pipeline > paginate > ... (~8 tests)
#   ✓ pipeline > rowModel > ... (~6 tests)
#   ✓ rows > ... (~5 tests)
```

M0 round-trip tests must still pass. The `getRowModel()` M0 test that asserts `table.getRowModel() === data` is **updated** to assert the new shape (an array of `Row<TRow>` objects, not the raw data). The old assertion is replaced by a new test that checks `getRowModel()` returns the same data (via `.original`) when no state is applied.

---

## 6. Out of scope for this phase

- `getHeaderGroups()` with prop getters and full context — phase 5.
- `moveColumn`, `toggleColumnVisibility`, `getVisibleColumns` — phases 2 and 3.
- Prop getters (`getGridProps`, `getCellProps`, etc.) — phase 5.
- `ReactAnnouncer` (live-region default) — phase 6.
- Tree-shakeable subpath exports in `package.json` — phase 7.
- `rowSelection` slice, `getFacetedUniqueValues` — phases 4 / v1.5.

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| `rowModelCache` invalidation when slice keys don't change by reference (e.g., consumer calls `setColumnFilters([])`) | Cache key uses `Object.is` semantics via `shallowEqual`. The cache short-circuits when the key is structurally identical to the previous one. No-op `setOptions` calls are also handled by the M0 short-circuit. |
| `autoResetPageIndex` when both `columnFilters` and `pagination` are controlled | Both slices route through their respective `on<Slice>Change` callbacks. The consumer receives two callback calls in a row. Documented in code; tested in phase 1. |
| `Row`/`Cell` identity instability | Documented in `rows.ts` docstrings; phase 5's prop getters rely on this. Same pattern as M0's `Column` identity. |
| `defaultGetRowId` fallback behavior in production | M0's warning is preserved. M1 does not change the fallback (still dev-warn + prod-quiet). M3 (server modes) adds the hard-error path. |
| `verbatimModuleSyntax` rejecting type-only imports in `pipeline/*.ts` | Use `import type` for type-only imports. Biome enforces. |
| `noUncheckedIndexedAccess` in `toggleSortItem` (`sorting[idx]`) | Use `sorting[idx]!` with a comment that the index came from `findIndex`. The `!` is safe because `findIndex` returns -1 (handled) or a valid index. |
| Pipeline stage ordering — `filter` then `sort` is the spec's order (§5.1) | Implemented as written. If a future revision needs different ordering, the function call sequence in `buildRowModel` is the only change. |