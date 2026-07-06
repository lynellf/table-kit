# Phase 7 — Public Surface + Integration Tests + API Freeze

**Goal:** Finalize the M1 public surface: edit `packages/core/package.json` to add tree-shakeable subpath exports, update both `index.ts` files with the final M1 surface, update the README files, and ship the **feature integration tests** that prove the spec's M1 exit criterion. Produce the **Level 0 API freeze manifest** (`api-freeze.md`) that records every public export of both packages so subsequent milestones (M2+) cannot break the surface.

After this phase:
- `pnpm verify` exits 0 from a fresh clone.
- The M1 exit criteria from §14 are satisfied: **feature integration tests** + **Level 0 API frozen**.
- All M0 + M1 tests pass (~230-240 total).
- Bundle sizes are measured and logged.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `docs/m1-client-features/api-freeze.md` | List of every public export from `@lynellf/tablekit-core` and `@lynellf/tablekit-react` at M1 freeze |
| `packages/core/src/integration.test.ts` | End-to-end tests combining sort + filter + paginate + ordering + visibility + events |
| `packages/react/src/integration.test.tsx` | End-to-end tests rendering the prescribed DOM shape with RTL + jsdom; verifies ARIA attributes + interaction events + announcer |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/package.json` | Add `exports` map entries for subpaths (`./sorting`, `./filtering`, `./pagination`, `./faceting`, `./pipeline`) |
| `packages/core/src/index.ts` | Final M1 surface re-exports |
| `packages/react/src/index.ts` | Final M1 surface re-exports |
| `README.md` | Update quick-start with a M1 example |
| `packages/core/README.md` | Update quick-start with a M1 example |

---

## 3. File contents

### 3.1 `packages/core/package.json` — subpath exports

Add the following to the `exports` map (alongside the existing `.` entry):

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/tablekit-core.es.js"
    },
    "./sorting": {
      "types": "./dist/sorting.d.ts",
      "import": "./dist/sorting.es.js"
    },
    "./filtering": {
      "types": "./dist/filtering.d.ts",
      "import": "./dist/filtering.es.js"
    },
    "./pagination": {
      "types": "./dist/pagination.d.ts",
      "import": "./dist/pagination.es.js"
    },
    "./faceting": {
      "types": "./dist/faceting.d.ts",
      "import": "./dist/faceting.es.js"
    },
    "./pipeline": {
      "types": "./dist/pipeline/index.d.ts",
      "import": "./dist/pipeline/index.es.js"
    }
  }
}
```

Each subpath entry resolves to its own ESM bundle. The bundler (Vite library mode) needs per-entry configs in `vite.config.ts`. Update `packages/core/vite.config.ts`:

```ts
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { dependencies = {} } = require('./package.json');

const baseConfig = {
  target: 'es2022',
  sourcemap: true,
  emptyOutDir: true,
  cssCodeSplit: false,
  rollupOptions: {
    external: [...Object.keys(dependencies)],
    output: { inlineDynamicImports: true },
  },
};

export default defineConfig({
  build: {
    ...baseConfig,
    outDir: resolve(__dirname, 'dist'),
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TableKitCore',
      formats: ['es'],
      fileName: () => 'tablekit-core.es.js',
    },
  },
});

// In addition, the build script must run `vite build --config vite.subpaths.config.ts`
// to produce the subpath bundles. See §3.2.
```

Add `packages/core/vite.subpaths.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const entries: Record<string, string> = {
  sorting: 'src/registries/sorting.ts',
  filtering: 'src/registries/filtering.ts',
  pagination: 'src/pipeline/paginate.ts',
  faceting: 'src/faceting.ts',
  pipeline: 'src/pipeline/index.ts',
};

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false, // preserve the main bundle
    cssCodeSplit: false,
    lib: {
      entry: entries,
      formats: ['es'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
```

The `build` script in `packages/core/package.json` runs both:

```json
{
  "scripts": {
    "build": "vite build && vite build --config vite.subpaths.config.ts"
  }
}
```

Note: this changes the build output structure (sub-bundles appear alongside `tablekit-core.es.js`). The main `index.d.ts` and `tablekit-core.es.js` paths are unchanged; the subpaths are additive.

### 3.2 `packages/core/src/index.ts` — final M1 surface

Replace the M0-only file with the M1 surface:

```ts
/**
 * @lynellf/tablekit-core — framework-free headless table state engine.
 *
 * M1 public surface:
 *   - Factory (M0): createDataTable, defaultGetRowId
 *   - Column model (M0): Column, createColumns, resolveAccessor
 *   - Registries (M0): getSortingFn, getFilterFn, registerSortingFn, registerFilterFn
 *   - State engine helpers (M0): resolveUpdater, applySliceChange, etc.
 *   - Utils (M0): identity, shallowEqual, assertNever
 *   - Pipeline (M1): filterRows, sortRows, toggleSortItem, paginateRows, computePageCount
 *   - Column helpers (M1): moveColumn, toggleColumnVisibility, toggleAllColumnsVisibility
 *   - Row model helpers (M1): getPageCount, getRowCount, getCanPreviousPage, getCanNextPage
 *   - Faceting (M1): getFacetedUniqueValues, getFacetedMinMax
 *   - Announcer (M1): noopAnnouncer
 *   - Types (M0 + M1): all public types including InteractionOptions, Announcer, Row, Cell, etc.
 *
 * Not yet exported (later milestones):
 *   - Virtualization (M2)
 *   - Resize handles (M2)
 *   - Keyboard nav (M2)
 *   - DataSource (M3)
 *   - PivotTable (M4)
 *   - Worker engine (M5)
 *   - Full announcer polish + validator (M6)
 */

export const VERSION = '0.2.0' as const;

// ─── Factory (M0) ──────────────────────────────────────────────────────────
export { createDataTable, defaultGetRowId } from './createDataTable';

// ─── Column model (M0) ─────────────────────────────────────────────────────
export { Column, createColumns, resolveAccessor } from './columns';

// ─── Registries (M0) ───────────────────────────────────────────────────────
export {
  BUILT_IN_SORTING_FNS,
  BUILT_IN_FILTER_FNS,
  builtInSortingFns,
  builtInFilterFns,
  getSortingFn,
  getFilterFn,
  registerSortingFn,
  registerFilterFn,
  type BuiltInSortingFn,
  type BuiltInFilterFn,
} from './registries';

// ─── State engine helpers (M0) ──────────────────────────────────────────────
export {
  resolveUpdater,
  applySliceChange,
  isSliceControlled,
  mergeInitialState,
  controlledSliceKeys,
  stateChangedOnSlices,
  type StateSliceKey,
  type SliceCallbacks,
  type SliceDispatchers,
} from './state';

// ─── Utils (M0) ────────────────────────────────────────────────────────────
export { identity, shallowEqual, assertNever } from './utils';

// ─── Pipeline (M1) ──────────────────────────────────────────────────────────
export {
  filterRows,
  sortRows,
  toggleSortItem,
  paginateRows,
  computePageCount,
  buildRowModel,
  columnsForRowModel,
} from './pipeline';

// ─── Column helpers (M1) ───────────────────────────────────────────────────
export { moveColumn } from './ordering';
export { toggleColumnVisibility, toggleAllColumnsVisibility } from './visibility';

// ─── Faceting (M1) ─────────────────────────────────────────────────────────
export { getFacetedUniqueValues, getFacetedMinMax } from './faceting';

// ─── Announcer (M1) ────────────────────────────────────────────────────────
export { noopAnnouncer } from './announcer';

// ─── Row + Cell types (M1) ─────────────────────────────────────────────────
export type { Row, Cell, CellContext } from './rows';

// ─── Header types (M1) ─────────────────────────────────────────────────────
export type { Header, HeaderGroup, HeaderContext } from './headers';

// ─── Event types (M1) ──────────────────────────────────────────────────────
export type {
  CellEventContext,
  CellEventHandler,
  HeaderEventHandler,
  RowEventHandler,
  InteractionOptions,
  InteractionSource,
} from './events';

// ─── Public types (M0 + M1) ────────────────────────────────────────────────
export type {
  Updater,
  SortItem,
  ColumnFilterItem,
  PaginationState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnResizeSession,
  CellPosition,
  DataTableState,
  SortingFn,
  FilterFn,
  RegisteredSortingFn,
  RegisteredFilterFn,
  ColumnAccessor,
  ColumnDef,
  AccessorFn,
  RowIdAccessor,
  SliceChange,
  DataTableOptions,
  Unsubscribe,
  DataTableInstance,
  Announcer,
} from './types';

export { DEFAULT_STATE } from './types';
```

The `VERSION` bump from `0.1.0` to `0.2.0` reflects the M1 surface expansion. Documented in the commit message; npm does not auto-publish from this repo (M0's `prepare-for-npm` plan set up manual publishing).

### 3.3 `packages/react/src/index.ts` — final M1 surface

```ts
/**
 * @lynellf/tablekit-react — React adapter.
 *
 * M1 public surface:
 *   - useDataTable hook (M0; now returns Announcer too)
 *   - ReactAnnouncer component (M1)
 *   - getReactAnnouncer() (M1)
 *   - Core re-exports (so consumers can import everything from one place)
 */

export type { ReactElement } from 'react';

export const VERSION = '0.2.0' as const;

// ─── Hook ───────────────────────────────────────────────────────────────────
export { useDataTable } from './useDataTable';
export type { UseDataTableResult } from './useDataTable';

// ─── Announcer (M1) ────────────────────────────────────────────────────────
export { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';

// ─── Re-export core surface ─────────────────────────────────────────────────
export {
  VERSION as CORE_VERSION,
  // ...all core exports as in M0 ...
} from '@lynellf/tablekit-core';

// ...plus all the M1 additions: moveColumn, toggleColumnVisibility, etc.
```

(Full export list is a superset of M0's `packages/react/src/index.ts` plus the M1 additions. Implementation: copy M0's export block and add the M1 entries.)

### 3.4 `packages/core/src/integration.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createDataTable } from './createDataTable';
import type { ColumnDef } from './types';
import { DEFAULT_STATE } from './types';

interface Person {
  id: string;
  name: string;
  age: number;
  role: string;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableSorting: true, sortingFn: 'alphanumeric', enableFiltering: true, filterFn: 'includesString' },
  { id: 'age', accessor: 'age', enableSorting: true, sortingFn: 'number', enableFiltering: true, filterFn: 'inNumberRange' },
  { id: 'role', accessor: 'role', enableFiltering: true, filterFn: 'equalsString' },
];

const baseRows: Person[] = [
  { id: '1', name: 'Alice', age: 30, role: 'eng' },
  { id: '2', name: 'Bob', age: 25, role: 'pm' },
  { id: '3', name: 'Carol', age: 35, role: 'eng' },
  { id: '4', name: 'Dave', age: 28, role: 'designer' },
  { id: '5', name: 'Eve', age: 40, role: 'eng' },
];

describe('M1 integration: combined features', () => {
  it('filter then sort then paginate yields correct row model', () => {
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      initialState: {
        columnFilters: [{ id: 'role', value: 'eng' }], // Alice, Carol, Eve
        sorting: [{ id: 'age', desc: true }], // Eve, Carol, Alice
        pagination: { pageIndex: 0, pageSize: 2 }, // Eve, Carol
      },
    });

    const model = table.getRowModel();
    expect(model.map((r) => r.original.name)).toEqual(['Eve', 'Carol']);

    // Page 2: Alice
    table.setPagination((p) => ({ ...p, pageIndex: 1 }));
    expect(table.getRowModel().map((r) => r.original.name)).toEqual(['Alice']);

    // Clear filter: all 5 rows
    table.setColumnFilters([]);
    expect(table.getRowCount()).toBe(5);
  });

  it('column ordering re-pins when crossing boundary', () => {
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      initialState: {
        columnOrder: ['name', 'age', 'role'],
        columnPinning: { left: ['name'], right: [] },
      },
    });
    table.moveColumn('age', 'right');
    const state = table.getState();
    expect(state.columnPinning).toEqual({ left: ['name'], right: ['age'] });
  });

  it('visibility hides a column from the rendered header structure', () => {
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      initialState: { columnVisibility: { role: false } },
    });
    const groups = table.getHeaderGroups();
    expect(groups[0]!.headers.map((h) => h.id)).toEqual(['name', 'age']);
  });

  it('autoResetPageIndex resets pageIndex on filter change (uncontrolled)', () => {
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      initialState: { pagination: { pageIndex: 1, pageSize: 2 } },
    });
    table.setColumnFilters([{ id: 'role', value: 'eng' }]);
    expect(table.getState().pagination.pageIndex).toBe(0);
  });

  it('autoResetPageIndex routes through callback when pagination is controlled', () => {
    const onPaginationChange = vi.fn();
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      state: { pagination: { pageIndex: 1, pageSize: 2 } },
      onPaginationChange,
    });
    table.setColumnFilters([{ id: 'role', value: 'eng' }]);
    expect(onPaginationChange).toHaveBeenCalled();
  });

  it('cell click invokes onCellClick with the correct context', () => {
    const onCellClick = vi.fn();
    const table = createDataTable<Person>({
      data: baseRows,
      columns: defs,
      onCellClick,
    });
    const row = table.getRowModel()[0]!;
    const cell = row.getVisibleCells()[1]!; // age column
    cell.getCellProps().onClick?.(new Event('click'));
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const ctx = onCellClick.mock.calls[0]![0];
    expect(ctx.column.id).toBe('age');
    expect(ctx.row.original.name).toBe('Alice');
  });
});
```

### 3.5 `packages/react/src/integration.test.tsx`

```tsx
/** @jsxImportSource react */
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDataTable } from './useDataTable';
import { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';
import type { ColumnDef, DataTableState, SortItem } from '@lynellf/tablekit-core';

interface Person {
  id: string;
  name: string;
  age: number;
}

const defs: Array<ColumnDef<Person, unknown>> = [
  { id: 'name', accessor: 'name', enableSorting: true },
  { id: 'age', accessor: 'age', enableSorting: true },
];

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

const Grid = ({
  onCellClick,
}: {
  onCellClick?: (ctx: unknown) => void;
}) => {
  const { table, state, Announcer } = useDataTable({
    data: rows,
    columns: defs,
    onCellClick: onCellClick
      ? (ctx, _e) => onCellClick(ctx)
      : undefined,
  });
  return (
    <>
      <Announcer />
      <div data-testid="grid" {...table.getGridProps()}>
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} {...hg.getHeaderGroupProps()}>
            <div {...hg.getRowProps()}>
              {hg.headers.map((h) => (
                <div key={h.id} {...h.getHeaderProps()}>
                  <button type="button" {...h.getSortToggleProps()}>
                    Sort
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div {...table.getBodyProps()}>
          {table.getRowModel().map((row) => (
            <div key={row.id} {...row.getRowProps()}>
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} {...cell.getCellProps()}>
                  {String(cell.getValue())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div data-testid="sorting">{JSON.stringify(state.sorting)}</div>
    </>
  );
};

describe('M1 integration: react adapter', () => {
  it('renders the prescribed ARIA grid structure', () => {
    render(<Grid />);
    const grid = screen.getByTestId('grid');
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('aria-rowcount')).toBeTruthy();
    expect(grid.getAttribute('aria-colcount')).toBeTruthy();
  });

  it('renders header rowgroup + header row + columnheader cells', () => {
    render(<Grid />);
    const columnheaders = document.querySelectorAll('[role="columnheader"]');
    expect(columnheaders.length).toBe(2);
    const rowgroups = document.querySelectorAll('[role="rowgroup"]');
    expect(rowgroups.length).toBeGreaterThanOrEqual(2);
  });

  it('renders body rows + gridcells', () => {
    render(<Grid />);
    const rows = document.querySelectorAll('[role="row"]');
    expect(rows.length).toBeGreaterThanOrEqual(2); // header + body rows
    const cells = document.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBe(4); // 2 rows × 2 cells
  });

  it('clicking the sort toggle changes sorting state', () => {
    render(<Grid />);
    expect(screen.getByTestId('sorting').textContent).toBe('[]');
    const sortButtons = screen.getAllByRole('button');
    act(() => {
      sortButtons[0]!.click();
    });
    expect(screen.getByTestId('sorting').textContent).toBe(
      JSON.stringify([{ id: 'name', desc: false }]),
    );
  });

  it('cell click fires onCellClick with the correct context', () => {
    const onCellClick = vi.fn();
    render(<Grid onCellClick={onCellClick} />);
    const cells = document.querySelectorAll('[role="gridcell"]');
    act(() => {
      (cells[0] as HTMLElement).click();
    });
    expect(onCellClick).toHaveBeenCalledTimes(1);
    const ctx = onCellClick.mock.calls[0]![0];
    expect(ctx.column.id).toBe('name');
    expect(ctx.value).toBe('Alice');
  });

  it('renders ReactAnnouncer and announces via getReactAnnouncer', () => {
    render(<Grid />);
    expect(screen.getByTestId('tablekit-announcer')).toBeTruthy();
    const announcer = getReactAnnouncer();
    act(() => {
      announcer.announce('test announcement');
    });
    expect(screen.getByTestId('tablekit-announcer').textContent).toBe('test announcement');
  });
});
```

### 3.6 `docs/m1-client-features/api-freeze.md`

```markdown
# M1: API Freeze Manifest

**Date:** <date>
**Status:** FROZEN
**Milestone:** M1 (DataTable client features)

This document records every public export of `@lynellf/tablekit-core` and
`@lynellf/tablekit-react` at the M1 freeze. Subsequent milestones (M2+) MAY
add new exports but MUST NOT rename, remove, or change the signature of any
name listed here.

The freeze is enforced by:
1. **Type tests** in `packages/core/src/types.test-d.ts` and
   `packages/react/src/types.test-d.ts` (compile-time assertions).
2. **API surface tests** that import every name in this manifest and assert
   it exists.
3. **Code review** by the reviewer role on any post-M1 change that touches
   the public surface.

## `@lynellf/tablekit-core`

### Root exports

| Name | Kind | Notes |
| --- | --- | --- |
| `VERSION` | const | Bumped to `0.2.0` at M1 |
| `createDataTable` | function | M0 |
| `defaultGetRowId` | function | M0 |
| `Column` | class | M0 |
| `createColumns` | function | M0 |
| `resolveAccessor` | function | M0 |
| `BUILT_IN_SORTING_FNS` | const | M0 |
| `BUILT_IN_FILTER_FNS` | const | M0 |
| `builtInSortingFns` | const | M0 |
| `builtInFilterFns` | const | M0 |
| `getSortingFn` | function | M0 |
| `getFilterFn` | function | M0 |
| `registerSortingFn` | function | M0 |
| `registerFilterFn` | function | M0 |
| `resolveUpdater` | function | M0 |
| `applySliceChange` | function | M0 |
| `isSliceControlled` | function | M0 |
| `mergeInitialState` | function | M0 |
| `controlledSliceKeys` | function | M0 |
| `stateChangedOnSlices` | function | M0 |
| `identity` | function | M0 |
| `shallowEqual` | function | M0 |
| `assertNever` | function | M0 |
| `filterRows` | function | M1 |
| `sortRows` | function | M1 |
| `toggleSortItem` | function | M1 |
| `paginateRows` | function | M1 |
| `computePageCount` | function | M1 |
| `buildRowModel` | function | M1 |
| `columnsForRowModel` | function | M1 |
| `moveColumn` | function | M1 |
| `toggleColumnVisibility` | function | M1 |
| `toggleAllColumnsVisibility` | function | M1 |
| `getFacetedUniqueValues` | function | M1 |
| `getFacetedMinMax` | function | M1 |
| `noopAnnouncer` | const | M1 |
| `DEFAULT_STATE` | const | M0 |

### Public types

| Name | Kind |
| --- | --- |
| `Updater<T>` | type |
| `SortItem` | interface |
| `ColumnFilterItem` | interface |
| `PaginationState` | interface |
| `ColumnPinningState` | interface |
| `ColumnSizingState` | type |
| `ColumnResizeSession` | interface |
| `CellPosition` | interface |
| `DataTableState` | interface |
| `SortingFn<TRow>` | type |
| `FilterFn<TRow>` | type |
| `RegisteredSortingFn<TRow>` | type |
| `RegisteredFilterFn<TRow>` | type |
| `ColumnAccessor<TRow, TValue>` | type |
| `ColumnDef<TRow, TValue>` | interface |
| `AccessorFn<TRow, TValue>` | type |
| `RowIdAccessor<TRow>` | type |
| `SliceChange<T>` | type |
| `DataTableOptions<TRow>` | interface |
| `Unsubscribe` | type |
| `DataTableInstance<TRow>` | interface |
| `Announcer` | interface (M1) |
| `Row<TRow>` | interface (M1) |
| `Cell<TRow, TValue>` | interface (M1) |
| `CellContext<TRow, TValue>` | interface (M1) |
| `Header<TRow, TValue>` | interface (M1) |
| `HeaderGroup<TRow>` | interface (M1) |
| `HeaderContext<TRow>` | interface (M1) |
| `CellEventContext<TRow, TValue>` | interface (M1) |
| `CellEventHandler<TRow, TValue>` | type (M1) |
| `HeaderEventHandler<TRow, TValue>` | type (M1) |
| `RowEventHandler<TRow>` | type (M1) |
| `InteractionOptions<TRow>` | interface (M1) |
| `InteractionSource` | type (M1) |
| `StateSliceKey` | type (M0) |
| `SliceCallbacks` | type (M0) |
| `SliceDispatchers` | interface (M0) |
| `BuiltInSortingFn` | type (M0) |
| `BuiltInFilterFn` | type (M0) |

### Subpath exports (`@lynellf/tablekit-core/<subpath>`)

| Subpath | Exports |
| --- | --- |
| `./sorting` | `sortRows`, `toggleSortItem`, `getSortingFn`, `registerSortingFn`, `BUILT_IN_SORTING_FNS`, `builtInSortingFns`, `BuiltInSortingFn` |
| `./filtering` | `getFilterFn`, `registerFilterFn`, `BUILT_IN_FILTER_FNS`, `builtInFilterFns`, `BuiltInFilterFn` |
| `./pagination` | `paginateRows`, `computePageCount` |
| `./faceting` | `getFacetedUniqueValues`, `getFacetedMinMax` |
| `./pipeline` | `filterRows`, `sortRows`, `toggleSortItem`, `paginateRows`, `computePageCount`, `buildRowModel`, `columnsForRowModel` |

## `@lynellf/tablekit-react`

### Root exports

| Name | Kind | Notes |
| --- | --- | --- |
| `VERSION` | const | Bumped to `0.2.0` at M1 |
| `useDataTable` | function | M0 (returns `{ table, state, Announcer }` in M1) |
| `ReactAnnouncer` | function component | M1 |
| `getReactAnnouncer` | function | M1 |
| All re-exports from `@lynellf/tablekit-core` | various | M0 + M1 |

### Public types

| Name | Kind |
| --- | --- |
| `ReactElement` | type (from react) |
| `UseDataTableResult<TRow>` | interface (extended in M1) |
```

### 3.7 README files

Update root `README.md` with an M1 example:

```diff
 ```ts
 import { createDataTable } from '@lynellf/tablekit-core';

 const table = createDataTable({ data, columns });
 table.getState();       // current state snapshot
 table.subscribe(() => { /* re-render */ });
+table.toggleSorting('age');          // M1
+table.setColumnFilters([{ id: 'name', value: 'ali' }]); // M1
+table.nextPage();                     // M1
+const sorted = table.getRowModel();   // M1
 ```

Add a section "## M1 features":

```markdown
## M1 features

- **Sorting** (client-side; multi-sort): `table.setSorting([{ id, desc }])`,
  `table.toggleSorting(id)`. Built-in sorting functions:
  `alphanumeric`, `text`, `number`, `datetime`, `basic`. Custom: register via
  `registerSortingFn(name, fn)`.
- **Filtering** (client-side): `table.setColumnFilters([{ id, value }])`.
  Built-in filter functions: `includesString`, `equalsString`, `equals`,
  `inNumberRange`, `arrIncludes`.
- **Pagination** (client-side): `table.nextPage()`, `table.previousPage()`,
  `table.setPageIndex(i)`, `table.setPageSize(n)`. Helpers:
  `table.getPageCount()`, `table.getCanPreviousPage()`,
  `table.getCanNextPage()`, `table.getRowCount()`.
- **Column ordering**: `table.moveColumn(id, to)` (numeric index or
  `'left' | 'right' | 'center' | false`).
- **Column visibility**: `table.toggleColumnVisibility(id)`,
  `table.toggleAllColumnsVisibility(next?)`, `table.getVisibleColumns()`.
- **Prop getters** for rendering: `table.getGridProps()`,
  `table.getHeaderGroupProps()`, `table.getBodyProps()`,
  `header.getHeaderProps()`, `header.getSortToggleProps()`,
  `row.getRowProps()`, `cell.getCellProps()`, `cell.getContext()`.
- **Interaction events**: `onCellClick`, `onCellDoubleClick`,
  `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`,
  `onRowDoubleClick`, `onHeaderClick`.
- **Faceting helpers**: `column.getFacetedUniqueValues(rows)`,
  `column.getFacetedMinMax(rows)`.
- **Announcer**: `table.setOptions({ announcer })` to inject a custom
  announcer. Default is no-op; the React adapter provides `ReactAnnouncer`.
```

Update `packages/core/README.md` similarly.

---

## 4. Commands (in order)

```bash
# 1. Update package.json + vite configs.
pnpm install

# 2. Update both index.ts files.
# 3. Write integration tests.
# 4. Write api-freeze.md.
# 5. Update README files.

# 6. Verify
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify

# 7. Bundle size check
gzip -c packages/core/dist/tablekit-core.es.js | wc -c    # core gzip
gzip -c packages/react/dist/tablekit-react.es.js | wc -c  # react gzip
echo $(( $(gzip -c packages/core/dist/tablekit-core.es.js | wc -c) + $(gzip -c packages/react/dist/tablekit-react.es.js | wc -c) ))
# Logged in implementation commit message.
```

Expected after phase 7:
- All M0 + M1 tests pass (~230-240 total).
- 9 + 7 + 4 + 6 + 8 + 12 + 10 + 10 + 6 + 7 + 6 + 10 + 5 + 4 + 10 + 6 ≈ ~110-130 M1-specific tests.
- `pnpm verify` exit 0.
- Bundle sizes measured and documented.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
pnpm --filter @lynellf/tablekit-react test
# Expected: all M0 + M1 tests green
# Test files: ~14-16 (was 9 at M0)
# Tests: ~230-240 (was 103 at M0)

pnpm verify
# Expected: exit 0

node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m).sort()))"
# Expected: list of all M0 + M1 exports per api-freeze.md
```

---

## 6. Out of scope for this plan

- M2+ features (virtualization, resize, keyboard nav).
- Full announcer polish.
- PivotTable.
- Worker engine.
- DataSource.

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| Subpath exports split the bundle into multiple files; consumers using `@lynellf/tablekit-core/sorting` may miss the main entry | The root `.` export includes `sortRows` and `toggleSortItem` directly. Subpaths are tree-shakeable, so consumers using only the main entry still get the full surface. Consumers using subpaths get a smaller bundle. |
| `build` script now runs Vite twice (main + subpaths); CI might time out | The two builds run in sequence; each is fast (~5s). Total build time stays under 30s. |
| `api-freeze.md` is a markdown file; future contributors may not read it | The post-M1 reviewer (reviewer role) is responsible for checking that any change to the public surface matches the freeze manifest. Documented in the freeze file. |
| `VERSION` bump from `0.1.0` to `0.2.0` requires npm publish coordination | The `prepare-for-npm` plan set up manual publishing; M1 publishes `0.2.0` to both packages. The npm publish step is manual and gated on the implementer's commit message. |
| Bundle size exceeds §12's ~15kB target | The implementation commit message logs the measured size. If significantly over (~20kB), the reviewer flags it as a §12 guardrail concern. Tree-shaking and subpath exports minimize the default-imports case. |