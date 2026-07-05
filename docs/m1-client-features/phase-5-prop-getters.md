# Phase 5 — Prop Getters + Header Structure

**Goal:** Ship the M1 subset of the §6.1 prop getters (decision D4 — SUBSET). The M1 surface is sufficient for a consumer to render the prescribed DOM shape (§6.2) and produce a valid ARIA grid without virtualization, resize, or keyboard navigation. M2 extends.

After this phase:
- `table.getGridProps()` returns `role="grid"` + `aria-rowcount` + `aria-colcount` + `tabIndex={0}`.
- `table.getHeaderGroupProps()` returns `role="rowgroup"`.
- `headerGroup.getRowProps()` returns `role="row"` + `aria-rowindex={1}`.
- `header.getHeaderProps()` returns `role="columnheader"` + `aria-colindex` + `aria-sort` (when sorted) + `data-pinned`.
- `header.getSortToggleProps()` returns `role="button"` + `tabIndex={-1}` + `onClick` that calls `toggleSorting` for the column.
- `table.getBodyProps()` returns `role="rowgroup"`.
- `row.getRowProps()` returns `role="row"` + `aria-rowindex`.
- `cell.getCellProps()` returns `role="gridcell"` + `aria-colindex` + `data-pinned`.
- `table.getHeaderGroups()` returns the full header structure (bucketed by pinning).
- `row.getVisibleCells()` returns cells for visible columns only.
- `cell.getContext()` returns the full context object (`table`, `row`, `column`, `cell`, `value`, `rowIndex`, `colIndex`).
- Consumer-merge semantics: consumer handlers run first; `event.defaultPrevented` skips internal handlers.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/headers.ts` | `Header<TRow>`, `HeaderGroup<TRow>` derived types + `buildHeaderGroups` |
| `packages/core/src/headers.test.ts` | Unit tests for header structure derivation |
| `packages/core/src/propGetters.ts` | `mergeProps`, `chainHandlers`, `skipIfPrevented` utilities |
| `packages/core/src/propGetters.test.ts` | Unit tests for merge/skip semantics |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/rows.ts` | Replace `getContext().table` placeholder with the actual instance; populate `column` context |
| `packages/core/src/createDataTable.ts` | Replace phase 1's `getHeaderGroups()` stub with the full derivation; add prop getter methods on the instance; expose `getHeaderGroups`/`getRowModel` (already in phase 1) |
| `packages/core/src/columns.ts` | Add `getToggleSortingProps()` and `getHeaderProps()` method stubs (full impl lives in propGetters to keep `columns.ts` small) |
| `packages/core/src/index.ts` | Re-export `Header`, `HeaderGroup` |

No package config changes.

---

## 3. File contents

### 3.1 `packages/core/src/propGetters.ts`

```ts
/**
 * @lynellf/tablekit-core — prop getter utilities.
 *
 * Spec §6.1, §7.6: prop getters return plain `{ [attr]: value }` objects.
 * Consumer-provided props merge with library props; consumer handlers run
 * first; internal handlers respect `event.defaultPrevented`.
 *
 * This module is framework-free — it returns attribute maps + handler
 * intent names. The React adapter maps `onClick`/`onKeyDown` to React event
 * props. A future Vue adapter maps them to `@click`/`@keydown`. No DOM
 * coupling in core.
 */

/**
 * Shallow-merge a consumer's `props` into the library's `defaultProps`.
 *
 * Rules:
 *   - For non-function values, the consumer's value wins.
 *   - For function values (event handlers), both run; consumer first, then
 *     library. If the consumer calls `event.preventDefault()`, the library
 *     handler is skipped.
 *   - The result is a new object — no mutation.
 *
 * Note: `defaultPrevented` is checked at runtime by the adapter because the
 * `core` does not have access to the actual DOM event. We represent the
 * intent as a wrapped handler that the adapter unwraps.
 */
export const mergeProps = <T extends Record<string, unknown>>(
  defaultProps: T,
  consumerProps: Partial<T> | undefined,
): T => {
  if (!consumerProps) return defaultProps;
  const out: Record<string, unknown> = { ...defaultProps };
  for (const key of Object.keys(consumerProps) as Array<keyof T>) {
    const defaultValue = defaultProps[key];
    const consumerValue = consumerProps[key];
    if (typeof consumerValue === 'function' && typeof defaultValue === 'function') {
      // Chain: consumer first, library second. Library checks defaultPrevented.
      const consumerFn = consumerValue as (...args: unknown[]) => void;
      const libraryFn = defaultValue as (...args: unknown[]) => void;
      out[key as string] = (...args: unknown[]) => {
        consumerFn(...args);
        // The library handler is invoked by the adapter when defaultPrevented
        // is false. See the React adapter (`packages/react/src/useDataTable.ts`
        // in M1) for the dispatch logic. In core, we return a marker that
        // the adapter unwraps.
      };
      // Stash the library fn under a sidecar key; the adapter reads it.
      out[`__lib_${String(key)}`] = libraryFn;
    } else {
      out[key as string] = consumerValue;
    }
  }
  return out as T;
};

/**
 * Check whether an event was defaultPrevented. The core module doesn't have
 * access to the real DOM event, so we expose this helper that the React
 * adapter calls before invoking the library handler.
 *
 * The intent: the adapter dispatches `consumerHandler(event)` first; if
 * `event.defaultPrevented` is true, the adapter skips
 * `libraryHandler(event)`.
 *
 * This function exists as a documentation anchor and a place for future
 * cross-cutting concerns (e.g., logging). It returns `false` by default;
 * the adapter is the source of truth.
 */
export const shouldRunLibraryHandler = (event: { defaultPrevented?: boolean }): boolean => {
  return event.defaultPrevented !== true;
};

/**
 * Compose multiple event handlers into one. Runs each in order. Useful for
 * `mergeProps`-like chains where the consumer has multiple handlers.
 */
export const chainHandlers = <E = unknown>(
  ...handlers: Array<((event: E) => void) | undefined>
) => {
  return (event: E) => {
    for (const h of handlers) {
      if (h) h(event);
    }
  };
};
```

### 3.2 `packages/core/src/propGetters.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { mergeProps, chainHandlers, shouldRunLibraryHandler } from './propGetters';

describe('mergeProps', () => {
  it('returns defaults when no consumer props', () => {
    const out = mergeProps({ role: 'grid', 'aria-rowcount': 5 }, undefined);
    expect(out).toEqual({ role: 'grid', 'aria-rowcount': 5 });
  });

  it('overrides scalar values from consumer', () => {
    const out = mergeProps({ role: 'grid', 'aria-rowcount': 5 }, { 'aria-rowcount': 10 });
    expect(out).toEqual({ role: 'grid', 'aria-rowcount': 10 });
  });

  it('chains event handlers (consumer runs first)', () => {
    const consumer = vi.fn();
    const library = vi.fn();
    const out = mergeProps({ onClick: library }, { onClick: consumer });
    const handler = out.onClick as (...args: unknown[]) => void;
    handler({});
    expect(consumer).toHaveBeenCalledTimes(1);
    // Library is stashed under __lib_onClick (the adapter invokes it).
    expect((out as Record<string, unknown>).__lib_onClick).toBe(library);
  });

  it('does not mutate inputs', () => {
    const defaults = { role: 'grid' };
    const consumer = { 'aria-rowcount': 10 };
    mergeProps(defaults, consumer);
    expect(defaults).toEqual({ role: 'grid' });
    expect(consumer).toEqual({ 'aria-rowcount': 10 });
  });
});

describe('chainHandlers', () => {
  it('runs handlers in order', () => {
    const calls: string[] = [];
    const handler = chainHandlers(
      () => calls.push('a'),
      () => calls.push('b'),
      undefined,
      () => calls.push('c'),
    );
    handler({});
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('skips undefined handlers', () => {
    const calls: string[] = [];
    const handler = chainHandlers(undefined, () => calls.push('b'));
    handler({});
    expect(calls).toEqual(['b']);
  });
});

describe('shouldRunLibraryHandler', () => {
  it('returns true when defaultPrevented is false', () => {
    expect(shouldRunLibraryHandler({ defaultPrevented: false })).toBe(true);
  });

  it('returns false when defaultPrevented is true', () => {
    expect(shouldRunLibraryHandler({ defaultPrevented: true })).toBe(false);
  });

  it('returns true when defaultPrevented is undefined', () => {
    expect(shouldRunLibraryHandler({})).toBe(true);
  });
});
```

### 3.3 `packages/core/src/headers.ts`

```ts
/**
 * @lynellf/tablekit-core — header structure.
 *
 * Spec §6.1: `getHeaderGroups()` returns header groups; each group has rows;
 * each row has headers; each header exposes `getHeaderProps()`,
 * `getSortToggleProps()`, and a `column` reference.
 *
 * For M1: single header row (no column groups / no multi-row hierarchy).
 * M2 may extend for nested headers.
 */

import type { Column } from './columns';
import { mergeProps, chainHandlers } from './propGetters';

export interface Header<TRow, TValue = unknown> {
  readonly id: string;
  readonly column: Column<TRow, TValue>;
  readonly index: number; // position in the visible column list
  readonly isPlaceholder?: boolean;
  /** Sub-headers (always empty in M1; reserved for M2 nested headers). */
  readonly subHeaders: Header<TRow, TValue>[];
  getHeaderProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getSortToggleProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

export interface HeaderGroup<TRow> {
  readonly id: string;
  readonly headers: Header<TRow>[];
  /** Depth in the header hierarchy; M1 is always 0. */
  readonly depth: number;
  getRowProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getHeaderGroupProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Build the header groups for the given columns and instance.
 *
 * For M1: returns three groups (left-pinned, center, right-pinned) flattened
 * into a single header row. Phase 5 returns a single group; phase 7's
 * integration tests can pin the expected layout.
 *
 * `instance` is the DataTable instance — used by `getSortToggleProps` to
 * dispatch `toggleSorting`.
 */
export const buildHeaderGroups = <TRow>(
  visibleColumns: Array<Column<TRow, unknown>>,
  ctx: HeaderContext<TRow>,
): HeaderGroup<TRow>[] => {
  const headers: Header<TRow>[] = visibleColumns.map((col, index) => ({
    id: col.id,
    column: col as Column<TRow>,
    index,
    isPlaceholder: false,
    subHeaders: [],
    getHeaderProps: (consumerProps?: Record<string, unknown>) =>
      defaultHeaderProps<TRow>(col, index, ctx, consumerProps),
    getSortToggleProps: (consumerProps?: Record<string, unknown>) =>
      defaultSortToggleProps<TRow>(col, ctx, consumerProps),
  }));

  return [
    {
      id: 'header',
      headers,
      depth: 0,
      getRowProps: (consumerProps?: Record<string, unknown>) =>
        mergeProps(
          {
            role: 'row',
            'aria-rowindex': 1,
          },
          consumerProps,
        ),
      getHeaderGroupProps: (consumerProps?: Record<string, unknown>) =>
        mergeProps(
          {
            role: 'rowgroup',
          },
          consumerProps,
        ),
    },
  ];
};

/**
 * Context passed to header prop getters. Includes the instance so handlers
 * can dispatch state changes.
 */
export interface HeaderContext<TRow> {
  instance: {
    toggleSorting: (id: string, append?: boolean) => void;
    getColumnCount: () => number;
    getRowCount: () => number;
    announce: (message: string) => void;
  };
}

const defaultHeaderProps = <TRow>(
  col: Column<TRow, unknown>,
  colIndex: number,
  ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const isSorted = col.getIsSorted();
  const isPinned = col.getIsPinned();
  const props: Record<string, unknown> = {
    role: 'columnheader',
    'aria-colindex': colIndex + 1,
    key: col.id,
  };
  if (isSorted !== false) {
    props['aria-sort'] = isSorted === 'desc' ? 'descending' : 'ascending';
  }
  if (isPinned) {
    props['data-pinned'] = isPinned;
  }
  return mergeProps(props, consumerProps);
};

const defaultSortToggleProps = <TRow>(
  col: Column<TRow, unknown>,
  ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const canSort = col.getCanSort();
  if (!canSort) {
    // Not sortable → return an inert props object.
    return mergeProps(
      {
        'aria-hidden': true,
        tabIndex: -1,
      },
      consumerProps,
    );
  }
  const onClick = (...args: unknown[]) => {
    const event = args[0] as { defaultPrevented?: boolean } | undefined;
    if (event?.defaultPrevented) return;
    ctx.instance.toggleSorting(col.id, false);
    // Announce (M1 basic sort announcement).
    const sort = col.getIsSorted();
    ctx.instance.announce(
      sort === false
        ? `Sorted by ${col.id} ascending`
        : sort === 'asc'
          ? `Sorted by ${col.id} descending`
          : `Sorted by ${col.id} removed`,
    );
  };
  return mergeProps(
    {
      role: 'button',
      tabIndex: -1,
      onClick,
    },
    consumerProps,
  );
};
```

### 3.4 `packages/core/src/headers.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildHeaderGroups } from './headers';
import { createColumns } from './columns';
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
    expect(groups[0]!.headers).toHaveLength(2);
    expect(groups[0]!.headers.map((h) => h.id)).toEqual(['name', 'age']);
  });

  it('header.getHeaderProps emits role, aria-colindex, key', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const props = groups[0]!.headers[0]!.getHeaderProps();
    expect(props.role).toBe('columnheader');
    expect(props['aria-colindex']).toBe(1);
    expect(props.key).toBe('name');
  });

  it('header.getHeaderProps emits aria-sort when sorted', () => {
    const state: DataTableState = { ...DEFAULT_STATE, sorting: [{ id: 'age', desc: true }] };
    const cols = createColumns<Person>(defs, state);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const ageHeader = groups[0]!.headers.find((h) => h.id === 'age')!;
    expect(ageHeader.getHeaderProps()['aria-sort']).toBe('descending');
  });

  it('header.getHeaderProps emits data-pinned when pinned', () => {
    const state: DataTableState = {
      ...DEFAULT_STATE,
      columnPinning: { left: ['name'], right: [] },
    };
    const cols = createColumns<Person>(defs, state);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    expect(groups[0]!.headers[0]!.getHeaderProps()['data-pinned']).toBe('left');
  });

  it('header.getSortToggleProps dispatches toggleSorting on click', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const ctx = baseContext();
    const groups = buildHeaderGroups<Person>(cols, ctx);
    const props = groups[0]!.headers[0]!.getSortToggleProps();
    expect(props.role).toBe('button');
    expect(props.tabIndex).toBe(-1);
    (props.onClick as (e: unknown) => void)({ defaultPrevented: false });
    expect(ctx.instance.toggleSorting).toHaveBeenCalledWith('name', false);
  });

  it('header.getSortToggleProps does NOT dispatch when defaultPrevented', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const ctx = baseContext();
    const groups = buildHeaderGroups<Person>(cols, ctx);
    const props = groups[0]!.headers[0]!.getSortToggleProps();
    (props.onClick as (e: unknown) => void)({ defaultPrevented: true });
    expect(ctx.instance.toggleSorting).not.toHaveBeenCalled();
  });

  it('header.getSortToggleProps is inert for non-sortable columns', () => {
    const noSortDefs: Array<ColumnDef<Person, unknown>> = [{ id: 'name', accessor: 'name' }];
    const cols = createColumns<Person>(noSortDefs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const props = groups[0]!.headers[0]!.getSortToggleProps();
    expect(props.role).toBeUndefined();
    expect(props['aria-hidden']).toBe(true);
  });

  it('consumerProps are merged into getHeaderProps output', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    const props = groups[0]!.headers[0]!.getHeaderProps({ className: 'my-header' });
    expect(props.className).toBe('my-header');
  });

  it('headerGroup.getRowProps emits role="row" and aria-rowindex=1', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    expect(groups[0]!.getRowProps()).toEqual({ role: 'row', 'aria-rowindex': 1 });
  });

  it('headerGroup.getHeaderGroupProps emits role="rowgroup"', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const groups = buildHeaderGroups<Person>(cols, baseContext());
    expect(groups[0]!.getHeaderGroupProps()).toEqual({ role: 'rowgroup' });
  });
});
```

### 3.5 `packages/core/src/rows.ts` — context population

Update the `Cell.getContext()` to populate `table`:

```ts
import type { DataTableInstance } from './types';

export interface CellContext<TRow, TValue = unknown> {
  table: DataTableInstance<TRow> | undefined; // set by the instance when Cell is built
  row: Row<TRow>;
  column: Column<TRow, TValue>;
  cell: Cell<TRow, TValue>;
  value: TValue;
  rowIndex: number;
  colIndex: number;
}

export const buildCell = <TRow, TValue>(
  row: Row<TRow>,
  column: Column<TRow, TValue>,
  colIndex: number,
  table?: DataTableInstance<TRow>,
): Cell<TRow, TValue> => {
  const value = column.getValue(row.original, row.index);
  const cell: Cell<TRow, TValue> = {
    id: `${row.id}:${column.id}`,
    row,
    column,
    getValue: () => value,
    getContext: () => ({
      table,
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

export const buildVisibleCells = <TRow>(
  row: Row<TRow>,
  columns: Array<Column<TRow, unknown>>,
  table?: DataTableInstance<TRow>,
): Cell<TRow>[] => {
  const out: Cell<TRow>[] = [];
  let colIndex = 0;
  for (const col of columns) {
    if (!col.getIsVisible()) continue;
    out.push(buildCell(row, col, colIndex, table) as Cell<TRow>);
    colIndex += 1;
  }
  return out;
};
```

`Row.getVisibleCells()` is added:

```ts
export interface Row<TRow> {
  readonly id: string;
  readonly index: number;
  readonly original: TRow;
  getVisibleCells(): Cell<TRow>[];
  getRowProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}
```

The factory's `getRowModel()` builds `Row` objects with a `getVisibleCells` that captures the visible columns and table reference:

```ts
// In buildRowModel (pipeline/rowModel.ts):
return rows.map((original, index) => {
  const id = opts.getRowId(original, index);
  const row: Row<TRow> = {
    id,
    index,
    original,
    getVisibleCells: () => buildVisibleCells(row, opts.columns, opts.table),
    getRowProps: (consumerProps) => defaultRowProps(row, consumerProps),
  };
  return row;
});
```

Where `defaultRowProps`:

```ts
const defaultRowProps = <TRow>(
  row: Row<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  return mergeProps(
    {
      role: 'row',
      'aria-rowindex': row.index + 2, // header row is 1
      key: row.id,
    },
    consumerProps,
  );
};
```

And `Cell.getCellProps`:

```ts
// In Cell interface:
getCellProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
```

```ts
// In buildCell:
const cell: Cell<TRow, TValue> = {
  id: `${row.id}:${column.id}`,
  row,
  column,
  getValue: () => value,
  getContext: () => ({ ... }),
  getCellProps: (consumerProps?: Record<string, unknown>) => defaultCellProps(cell, consumerProps),
};

const defaultCellProps = <TRow, TValue>(
  cell: Cell<TRow, TValue>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const isPinned = cell.column.getIsPinned();
  const props: Record<string, unknown> = {
    role: 'gridcell',
    'aria-colindex': cell.getContext().colIndex + 1,
    key: cell.id,
  };
  if (isPinned) {
    props['data-pinned'] = isPinned;
  }
  return mergeProps(props, consumerProps);
};
```

### 3.6 `packages/core/src/createDataTable.ts` — getHeaderGroups + getGridProps + getBodyProps

Replace phase 1's `getHeaderGroups()` stub with the real implementation. Add prop getter methods on the instance:

```ts
  /**
   * Return the full header structure (one group per level — M1 has one).
   */
  getHeaderGroups(): HeaderGroup<TRow>[] {
    const visibleColumns = this.getVisibleColumns();
    return buildHeaderGroups<TRow>(visibleColumns, {
      instance: {
        toggleSorting: (id, append) => {
          // Delegate to the sort pipeline's toggleSortItem helper.
          const next = toggleSortItem(this.state.sorting, id, {
            sortDescFirst: this.options.sortDescFirst,
            enableSortingRemoval: this.options.enableSortingRemoval ?? true,
            append: append ?? false,
          });
          this.applyChange('sorting', next);
        },
        getColumnCount: () => this.getVisibleColumns().length,
        getRowCount: () => this.getRowCount(),
        announce: (msg) => this.announce(msg),
      },
    });
  }

  /**
   * Root grid prop getter. M1: emits role="grid" + aria-rowcount + aria-colcount.
   * M2: tabIndex=-1 (when keyboard nav lands).
   */
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    return mergeProps(
      {
        role: 'grid',
        'aria-rowcount': this.getRowCount() + 1, // +1 for header row
        'aria-colcount': this.getVisibleColumns().length,
        tabIndex: 0, // M1 placeholder; M2 will set this to -1 once roving tabindex lands
      },
      consumerProps,
    );
  }

  /**
   * Body rowgroup prop getter.
   */
  getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    return mergeProps({ role: 'rowgroup' }, consumerProps);
  }
```

### 3.7 `packages/core/src/columns.ts` — note

No changes to `Column` in this phase. The header prop getters live in `headers.ts`; the cell/row prop getters live in `rows.ts`. Keeping `columns.ts` small preserves the M0 invariant.

### 3.8 `packages/core/src/index.ts` — additions

```ts
// ─── Header types (M1) ─────────────────────────────────────────────────────
export type { Header, HeaderGroup, HeaderContext } from './headers';
```

---

## 4. Commands (in order)

```bash
# 1. Write all files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 5:
- All prior tests still pass.
- ~10 prop-getter utility tests + ~12 header structure tests + ~5 row/cell context tests pass.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ propGetters > ... (~10 tests)
#   ✓ headers > ... (~12 tests)
#   ✓ rows > ... (~7 tests, expanded from phase 1)
```

---

## 6. Out of scope for this phase

- `getResizeHandleProps()` — M2.
- `getRowVirtualizer()` / `positionStyle` on `row.getRowProps()` — M2.
- Keyboard handlers (`onKeyDown`) on cells/headers — M2.
- Roving `tabIndex={0}` on the focused cell — M2.
- Multi-level header groups (nested headers) — M2 (the field is reserved on `Header.subHeaders`).
- `validateGridStructure` — M6.
- `aria-busy` for async (loading) states — M3 (DataSource).

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| `mergeProps` chains event handlers but core doesn't have access to the real DOM event | The React adapter (phase 6 + 7) is the source of truth for `defaultPrevented`. The `__lib_<key>` sidecar key carries the library handler; the adapter invokes it conditionally. The `mergeProps` test pins the contract. |
| `Row.getVisibleCells()` captures the column array and table reference in a closure — if state changes between `getRowModel()` calls, the visible cells reflect the new state | This is intentional: `getRowModel()` is the snapshot; consumers re-derive on every render. Same constraint as M0's `Column`. |
| `Cell.getContext().table` is `undefined` when `buildCell` is called without a `table` argument (e.g., from a `Row` constructed in tests) | Tests must construct via `buildRowModel` (which supplies the table) or pass `table` explicitly. The `undefined` case is for `rows.test.ts` tests that don't need the instance. |
| `aria-rowcount` semantics with `manualPagination` | When `manualPagination=true`, `getRowCount()` returns `options.rowCount ?? data.length`. The grid emits that count + 1 (header). Consumers must pass `rowCount` for accurate semantics. Tested in phase 7. |
| Consumer-merge semantics with `event.defaultPrevented` in jsdom tests | The phase 6 + 7 React integration tests cover the full event dispatch path through jsdom. The unit tests in `propGetters.test.ts` cover the merge mechanics. |
| Prop getter return type is `Record<string, unknown>` — consumers lose type safety on `data-*` attributes | Phase 7's README documents the casting pattern (`{...cell.getCellProps() as React.HTMLAttributes<HTMLDivElement>}`). Type narrowing is a future enhancement. |