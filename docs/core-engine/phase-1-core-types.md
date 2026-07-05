# Phase 1 — Core Types

**Goal:** Land the complete public type surface for `@lynellf/tablekit-core`. No runtime behavior in this phase — only types and a small `utils.ts` of pure helpers consumed by later phases. Type tests pin the surface so unintentional breakage fails `pnpm typecheck`.

After this phase, `pnpm typecheck` and `pnpm test` remain green, and `types.test-d.ts` compiles against `types.ts`.

---

## 1. Files created in this phase

| File                                                                  | Purpose                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/core/src/types.ts`                                          | All public types (state slices, options, instance, registries) |
| `packages/core/src/types.test-d.ts`                                   | Type-level assertions (compile-fail on regression)          |
| `packages/core/src/utils.ts`                                          | Small pure helpers: `identity`, `shallowEqual`, `assertNever` |
| `packages/core/src/utils.test.ts`                                     | Unit tests for utils                                         |

No edits to `package.json`, `tsconfig.json`, or any tooling file in this phase.

---

## 2. File contents

### 2.1 `packages/core/src/utils.ts`

```ts
/**
 * @lynellf/tablekit-core — pure helpers used across modules.
 * No side effects, no DOM, no React.
 */

/** Identity function. Used as default for `getRowId` and `id`-generation in dev. */
export const identity = <T>(value: T): T => value;

/**
 * Shallow-equal two objects by their own enumerable keys.
 * Returns true when both have identical keys with strictly-equal values.
 * Used by the state engine to short-circuit `onStateChange` when nothing changed.
 */
export const shallowEqual = <T extends object>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  const aKeys = Object.keys(a) as Array<keyof T>;
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
};

/**
 * Exhaustiveness helper. Causes a compile error if a discriminated union
 * is not handled in full.
 *
 * Usage:
 *   switch (mode) {
 *     case 'a': return ...;
 *     case 'b': return ...;
 *     default: return assertNever(mode);
 *   }
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
};
```

### 2.2 `packages/core/src/utils.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { assertNever, identity, shallowEqual } from './utils';

describe('utils', () => {
  describe('identity', () => {
    it('returns its argument unchanged', () => {
      const obj = { a: 1 };
      expect(identity(obj)).toBe(obj);
      expect(identity(42)).toBe(42);
      expect(identity('x')).toBe('x');
      expect(identity(null)).toBe(null);
    });
  });

  describe('shallowEqual', () => {
    it('returns true for the same reference', () => {
      const obj = { a: 1 };
      expect(shallowEqual(obj, obj)).toBe(true);
    });

    it('returns true for structurally equal objects', () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('returns false when a value differs', () => {
      expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('returns false when key sets differ', () => {
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('returns false when a key is missing from the other object', () => {
      const left = Object.create(null);
      left.a = 1;
      expect(shallowEqual(left as { a: number }, { a: 1 })).toBe(false);
    });
  });

  describe('assertNever', () => {
    it('throws on unreachable branch', () => {
      expect(() => assertNever(undefined as never)).toThrowError(/Unexpected value/);
    });
  });
});
```

### 2.3 `packages/core/src/types.ts`

Public types. Each block has a brief docstring citing the spec section it implements. No runtime code is emitted from this file beyond what TS erases.

```ts
/**
 * @lynellf/tablekit-core — public type surface.
 *
 * Source-of-truth mapping to docs/initial-spec.md:
 *  - §4.1 Instances, §4.2 State model — controlled-slice contract
 *  - §4.3 Dependency-inversion seams — registry interfaces
 *  - §4.4 Data model — ColumnDef + derived Column shape
 *  - §5   Data layer — RowsQuery (Level 0)
 *  - §7.5 Keyboard navigation — focusedCell slice
 */

// ─────────────────────────────────────────────────────────────────────────────
// Updater
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A value-or-function that produces the next value of a state slice.
 *
 * Consumers may pass either:
 *   - A concrete value (replace the slice wholesale), or
 *   - A function `(old) => next` (derive from the previous slice).
 *
 * The function form is invoked synchronously by the engine when the slice is
 * uncontrolled. When the slice is controlled, the engine hands the updater
 * to the consumer via the slice-specific callback without invoking it.
 */
export type Updater<T> = T | ((old: T) => T);

// ─────────────────────────────────────────────────────────────────────────────
// State slices
// ─────────────────────────────────────────────────────────────────────────────

/** Multi-sort spec. Order in the array = priority (index 0 is primary). */
export interface SortItem {
  id: string;
  desc: boolean;
}

/** Per-column filter spec. `value` is opaque to the core; the consumer's `filterFn` interprets it. */
export interface ColumnFilterItem {
  id: string;
  value: unknown;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

/** `columnPinning` slice. Order within each side is the pinned display order. */
export interface ColumnPinningState {
  left: string[];
  right: string[];
}

/** `columnSizing` slice: id → measured width in px. */
export type ColumnSizingState = Record<string, number>;

/** Transient session for an in-progress resize. Null when no resize is active. */
export interface ColumnResizeSession {
  columnId: string;
  startSize: number;
  delta: number;
  mode: 'onChange' | 'onEnd';
}

/** `focusedCell` slice. Null when no cell has focus. */
export interface CellPosition {
  rowId: string;
  columnId: string;
}

/**
 * DataTable state model.
 *
 * Each slice is independently controllable (§4.2). Slice keys listed here are
 * the contract surface; new slices must be appended (never reordered) to keep
 * key identity stable across the v1 line.
 */
export interface DataTableState {
  sorting: SortItem[];
  columnFilters: ColumnFilterItem[];
  pagination: PaginationState;
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: ColumnPinningState;
  columnSizing: ColumnSizingState;
  columnSizingInfo: ColumnResizeSession | null;
  focusedCell: CellPosition | null;
}

/** Default starting values for every slice when the consumer passes no `initialState`. */
export const DEFAULT_STATE: DataTableState = {
  sorting: [],
  columnFilters: [],
  pagination: { pageIndex: 0, pageSize: 25 },
  columnOrder: [],
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry types (sorting / filtering)
// ─────────────────────────────────────────────────────────────────────────────

/** Comparator over the values produced by a column's accessor. */
export type SortingFn<TRow> = (rowA: TRow, rowB: TRow, columnId: string) => number;

/** Predicate applied to a column value. Returns true to keep the row. */
export type FilterFn<TRow> = (row: TRow, columnId: string, filterValue: unknown) => boolean;

/** Built-in or consumer-registered sorting function, addressable by name. */
export type RegisteredSortingFn<TRow> = SortingFn<TRow>;

/** Built-in or consumer-registered filtering function, addressable by name. */
export type RegisteredFilterFn<TRow> = FilterFn<TRow>;

// ─────────────────────────────────────────────────────────────────────────────
// ColumnDef + accessor resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * String accessor = keyof TRow. Function accessor = custom resolver.
 * Opacity: `header` and `cell` are `unknown` to the core; the React adapter
 * supplies the render bridge (`renderSlot` analogue).
 */
export type ColumnAccessor<TRow, TValue> =
  | (keyof TRow & string)
  | ((row: TRow, rowIndex: number) => TValue);

export interface ColumnDef<TRow, TValue = unknown> {
  id: string;
  accessor?: ColumnAccessor<TRow, TValue>;
  header?: unknown;
  cell?: unknown;
  size?: number;
  minSize?: number;
  maxSize?: number;
  /** When true, the column participates in sort state. Default: false. */
  enableSorting?: boolean;
  /** Registry name OR inline comparator. */
  sortingFn?: string | SortingFn<TRow>;
  /** When true, the column participates in filter state. Default: false. */
  enableFiltering?: boolean;
  /** Registry name OR inline predicate. */
  filterFn?: string | FilterFn<TRow>;
  /** Default behavior for `undefined` values during sort. */
  sortUndefined?: 'first' | 'last';
  /** Consumer escape hatch. Flows through to derived `Column.meta`. */
  meta?: Record<string, unknown>;
}

/** Resolved value the column exposes to consumers (e.g., cell renderers). */
export type AccessorFn<TRow, TValue> = (row: TRow, rowIndex: number) => TValue;

// ─────────────────────────────────────────────────────────────────────────────
// Row identity
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve a stable id for a row. Required for server modes (M3) and pivot (M4). */
export type RowIdAccessor<TRow> = (row: TRow, index: number) => string;

// ─────────────────────────────────────────────────────────────────────────────
// Options (factory input)
// ─────────────────────────────────────────────────────────────────────────────

/** Per-slice onChange callback signature. Slice-keyed to keep the contract narrow. */
export type SliceChange<T> = (updater: Updater<T>) => void;

/**
 * `createDataTable` options.
 *
 * Controlled vs uncontrolled per slice:
 *   - If `state[K]` is provided, slice K is controlled and `on[K]Change` MUST be supplied.
 *   - If `state[K]` is absent and `initialState[K]` is provided, slice K is uncontrolled seeded.
 *   - If neither is provided, slice K is uncontrolled and starts at `DEFAULT_STATE[K]`.
 *
 * Global `onStateChange` fires after slice-specific callbacks, in the same
 * microtask, only when state actually changed. The semantics depend on
 * whether any slice is controlled:
 *
 *   - **When at least one slice is controlled** (`options.state` contains a
 *     slice key), `onStateChange` fires **only when a *controlled* slice
 *     changed**. Mutations to uncontrolled slices do not trigger it — the
 *     consumer does not own those, so notifying them would be noise.
 *   - **When no slice is controlled** (no `state` keys), `onStateChange`
 *     fires on any slice change.
 *
 * In both cases, the callback receives the full new `DataTableState`
 * (not a partial slice update) so consumers can route the aggregate
 * through Redux, Zustand, XState, URL params, etc. Shallow slice equality
 * is used to short-circuit when the updater produces the same value.
 *
 * Implementation: see `state.ts → stateChangedOnSlices` for the predicate,
 * and `createDataTable.ts → notifySliceAndAggregate` for the call site.
 */
export interface DataTableOptions<TRow> {
  data: TRow[];
  columns: Array<ColumnDef<TRow, unknown>>;
  getRowId?: RowIdAccessor<TRow>;
  initialState?: Partial<DataTableState>;
  state?: Partial<DataTableState>;
  onSortingChange?: SliceChange<SortItem[]>;
  onColumnFiltersChange?: SliceChange<ColumnFilterItem[]>;
  onPaginationChange?: SliceChange<PaginationState>;
  onColumnOrderChange?: SliceChange<string[]>;
  onColumnVisibilityChange?: SliceChange<Record<string, boolean>>;
  onColumnPinningChange?: SliceChange<ColumnPinningState>;
  onColumnSizingChange?: SliceChange<ColumnSizingState>;
  onColumnSizingInfoChange?: SliceChange<ColumnResizeSession | null>;
  onFocusedCellChange?: SliceChange<CellPosition | null>;
  onStateChange?: SliceChange<DataTableState>;
  // ─────── Feature flags (M1+ behavior; defaults set here so the surface is stable) ───────
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Instance
// ─────────────────────────────────────────────────────────────────────────────

export type Unsubscribe = () => void;

/**
 * Public instance shape. Intentionally narrow in M0 — only what the contract
 * in §4.1 requires. New methods (getRowModel, getHeaderGroups, prop getters,
 * virtualizers) land in later milestones without removing or renaming these.
 */
export interface DataTableInstance<TRow> {
  /** Returns the current state snapshot. Same reference until a slice mutates. */
  getState(): DataTableState;
  /** Replace the entire options object. Called by React adapter on each render. */
  setOptions(next: DataTableOptions<TRow>): void;
  /**
   * Subscribe to state changes. The listener is invoked synchronously after
   * the reducer applies a change. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): Unsubscribe;
  /**
   * Returns the row model. In M0 this is the input `data` array (a reference
   * copy). M1 replaces this with the filtered/sorted/paginated pipeline output.
   */
  getRowModel(): TRow[];
}
```

### 2.4 `packages/core/src/types.test-d.ts`

Type-level assertions. These are compiled (not run) by `tsc -b` indirectly through the typecheck step. They cause a build failure on type regressions.

```ts
import type {
  AccessorFn,
  CellPosition,
  ColumnAccessor,
  ColumnDef,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  PaginationState,
  RowIdAccessor,
  SortItem,
  SortingFn,
  Updater,
} from './types';
import type { DEFAULT_STATE } from './types';

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
type Inferred = ColumnDef<Person, string>['accessor'];
const inferred: AccessorFn<Person, string> | undefined =
  typeof def.accessor === 'function' ? def.accessor : undefined;
assertType<AccessorFn<Person, string> | undefined>(inferred);

// SortingFn signature is enforced.
const sortById: SortingFn<Person> = (a, b, _columnId) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
assertType<() => Person[]>(instance.getRowModel);
```

---

## 3. Commands (in order)

```bash
# 1. Write the files above (use write tool, contents from §2).
# 2. Verify the package typechecks and tests pass.
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
```

Expected after phase 1:
- `tsc -b` reports no errors (type tests included).
- Vitest reports the existing 1 smoke test (`VERSION` string) + 6 new utils tests (3 describes × multiple `it`s) all green.
- No runtime behavior added — the new `types.ts` is type-only at runtime (TS erases interfaces); the new `utils.ts` adds three pure helpers.

---

## 4. Verification

```bash
pnpm typecheck                                     # all *.test-d.ts files compile against types.ts
pnpm --filter @lynellf/tablekit-core test          # 1 smoke + 6 utils tests green
pnpm verify                                        # full gate green (build is still a stub bundle)
```

---

## 5. Out of scope for this phase

- `columns.ts`, `state.ts`, `createDataTable.ts` — phases 3 and 4.
- Registries — phase 2.
- React adapter — phase 5.
- Public surface re-exports in `index.ts` — phase 6.

---

## 6. Risks specific to this phase

| Risk                                                                                          | Mitigation                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `exactOptionalPropertyTypes` forces `T \| undefined` even when TS would elide undefined fields. | All optional fields on `DataTableOptions` and `DataTableState` are explicit about `undefined` presence. |
| `verbatimModuleSyntax` rejects `import { Foo }` when `Foo` is a type.                         | Use `import type { Foo } from ...` everywhere a type is imported. Tests file follows the same rule.    |
| `noUncheckedIndexedAccess` infects every array/record access.                                 | Avoid index access in `utils.ts` (the helpers don’t index); defer index access in later phases.        |