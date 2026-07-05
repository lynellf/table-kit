# Phase 3 — Column Model

**Goal:** Resolve `ColumnDef<TRow, TValue>[]` into derived `Column` views with stable identity, accessor resolution, and shape-level derived getters (`getSize()`, `getIsPinned()`, `getIsVisible()`, `getIsSorted()`, `getCanSort()`, `getCanFilter()`, `getIndex()`).

Behavior gated on slice state lands in M1/M2. The *shape* of the getters lands in M0 so consumers can build prop-getter code against a stable API even before the row pipeline exists.

After this phase:
- `columns.ts` exposes `createColumns<TRow>(defs, state): Column<TRow>[]` (or a class instance).
- Each `Column` exposes the derived getters listed above, returning safe defaults when slice state is empty.
- The factory `createDataTable` (phase 4) uses `createColumns` to produce its `columns` array.

---

## 1. Files created in this phase

| File                                       | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `packages/core/src/columns.ts`             | `Column` class + `createColumns<TRow>` resolver                               |
| `packages/core/src/columns.test.ts`        | Unit tests for column derivation + derived getters                            |

No package config changes.

---

## 2. File contents

### 2.1 `packages/core/src/columns.ts`

```ts
/**
 * @lynellf/tablekit-core — column model.
 *
 * Resolves ColumnDef[] into derived Column views (spec §4.4).
 *
 * M0 scope:
 *   - Stable `id`-keyed identity.
 *   - Accessor resolution (keyof TRow | function).
 *   - Derived shape getters that read slice state.
 *
 * Out of M0 scope (later milestones):
 *   - Resize behavior (M2).
 *   - Pinning offset math (M2).
 *   - Header group + cell rendering (M1).
 */

import type {
  AccessorFn,
  ColumnDef,
  ColumnPinningState,
  ColumnSizingState,
  DataTableState,
  RowIdAccessor,
  SortItem,
} from './types';

/**
 * Derived column view. Public-facing object exposed by the factory.
 * Methods are frozen-getter and stable across calls as long as the
 * underlying `Column` instance is the same.
 */
export class Column<TRow, TValue = unknown> {
  readonly id: string;
  readonly def: ColumnDef<TRow, TValue>;
  /** Resolved accessor as a function (always a function, even when def.accessor is a key). */
  private readonly accessorFn: AccessorFn<TRow, TValue>;
  private readonly state: DataTableState;
  /** Linear index in the resolved leaf-column order (0-based). */
  readonly index: number;
  /**
   * True when this column participates in the `columnOrder` slice or is
   * implicitly listed in the original `columns` def. False when explicitly
   * hidden via `columnVisibility[id] = false`.
   */
  readonly isVisible: boolean;
  /** Pinned side derived from `columnPinning`. */
  readonly pinnedSide: 'left' | 'right' | false;

  constructor(args: {
    def: ColumnDef<TRow, TValue>;
    state: DataTableState;
    index: number;
    resolveAccessor: (def: ColumnDef<TRow, TValue>) => AccessorFn<TRow, TValue>;
  }) {
    this.id = args.def.id;
    this.def = args.def;
    this.state = args.state;
    this.index = args.index;
    this.accessorFn = args.resolveAccessor(args.def);

    const visibility = args.state.columnVisibility[args.def.id];
    this.isVisible = visibility === undefined ? true : visibility;

    const left = args.state.columnPinning.left.includes(args.def.id);
    const right = !left && args.state.columnPinning.right.includes(args.def.id);
    this.pinnedSide = left ? 'left' : right ? 'right' : false;
  }

  /** Read the column's value from a row. Equivalent to `accessorFn(row, index)`. */
  getValue(row: TRow, rowIndex: number): TValue {
    return this.accessorFn(row, rowIndex);
  }

  /** Resolved width in px. Falls back to def.size, then to 150. */
  getSize(): number {
    const fromState = this.state.columnSizing[this.id];
    if (typeof fromState === 'number') return fromState;
    if (typeof this.def.size === 'number') return this.def.size;
    return 150;
  }

  /** Minimum allowed width during resize. Defaults to 30. */
  getMinSize(): number {
    return typeof this.def.minSize === 'number' ? this.def.minSize : 30;
  }

  /** Maximum allowed width during resize. Defaults to Infinity. */
  getMaxSize(): number {
    return typeof this.def.maxSize === 'number' ? this.def.maxSize : Number.POSITIVE_INFINITY;
  }

  getIsPinned(): 'left' | 'right' | false {
    return this.pinnedSide;
  }

  /**
   * Cumulative width of preceding pinned columns on this column's side.
   * Returns 0 when unpinned.
   */
  getPinnedOffset(): number {
    if (this.pinnedSide === false) return 0;
    const side: keyof ColumnPinningState = this.pinnedSide;
    const ordered = this.state.columnPinning[side];
    const idx = ordered.indexOf(this.id);
    if (idx <= 0) return 0;
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      const precedingId = ordered[i];
      if (precedingId === undefined) continue;
      const fromState = this.state.columnSizing[precedingId];
      if (typeof fromState === 'number') {
        offset += fromState;
      } else {
        offset += 150; // default; M2 will plumb real defs to compute this exactly
      }
    }
    return offset;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  getCanSort(): boolean {
    return this.def.enableSorting === true;
  }

  getCanFilter(): boolean {
    return this.def.enableFiltering === true;
  }

  /** True if this column is the primary sorted column. `aria-sort` source. */
  getIsSorted(): false | 'asc' | 'desc' {
    const primary = this.state.sorting[0];
    if (!primary || primary.id !== this.id) return false;
    return primary.desc ? 'desc' : 'asc';
  }

  /** Sort rank: 0 = primary, 1 = secondary, … -1 = not sorted. */
  getSortIndex(): number {
    return this.state.sorting.findIndex((s: SortItem) => s.id === this.id);
  }

  getMeta(): Record<string, unknown> | undefined {
    return this.def.meta;
  }
}

/**
 * Build an accessor function from a `ColumnDef`. When the def declares a
 * string accessor (`keyof TRow`), look it up on the row; when it declares
 * a function, return it as-is. When neither is provided, return a function
 * that returns `undefined`.
 */
export const resolveAccessor = <TRow, TValue>(
  def: ColumnDef<TRow, TValue>,
): AccessorFn<TRow, TValue> => {
  const accessor = def.accessor;
  if (typeof accessor === 'function') {
    return accessor as AccessorFn<TRow, TValue>;
  }
  if (typeof accessor === 'string') {
    return (row: TRow) => row[accessor as keyof TRow] as unknown as TValue;
  }
  return () => undefined as unknown as TValue;
};

/**
 * Resolve column defs → derived Column array using the supplied state.
 *
 * Ordering rules:
 *   1. If `state.columnOrder` is non-empty, use it (filtering out unknown ids).
 *   2. Otherwise, use the order of the `defs` argument.
 *   3. New columns appended at the end (defs not in columnOrder).
 *
 * Visibility is applied AFTER ordering: a column listed in `columnOrder` but
 * hidden via `columnVisibility` is still part of the array but `isVisible=false`.
 */
export const createColumns = <TRow>(
  defs: Array<ColumnDef<TRow, unknown>>,
  state: DataTableState,
): Array<Column<TRow, unknown>> => {
  const defsById = new Map<string, ColumnDef<TRow, unknown>>();
  for (const def of defs) defsById.set(def.id, def);

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  if (state.columnOrder.length > 0) {
    for (const id of state.columnOrder) {
      if (defsById.has(id) && !seen.has(id)) {
        orderedIds.push(id);
        seen.add(id);
      }
    }
  }
  // Append any defs not in columnOrder in their original order.
  for (const def of defs) {
    if (!seen.has(def.id)) {
      orderedIds.push(def.id);
      seen.add(def.id);
    }
  }

  const result: Array<Column<TRow, unknown>> = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === undefined) continue;
    const def = defsById.get(id);
    if (def === undefined) continue;
    result.push(
      new Column<TRow, unknown>({
        def,
        state,
        index: i,
        resolveAccessor,
      }),
    );
  }
  return result;
};

/** Convenience: read `getRowId` with a dev-only fallback to JSON.stringify. */
export const defaultGetRowId: RowIdAccessor<unknown> = (row, index) => {
  // Warn on first use per process — but suppress in production and in the
  // Vitest test environment, where the warning is pure noise. Vitest sets
  // `process.env.NODE_ENV === 'test'` by default; the additional check
  // keeps dev-time output clean for the existing smoke + column test
  // suites that exercise this helper indirectly.
  const env = process.env.NODE_ENV;
  if (env !== 'production' && env !== 'test') {
    if (!defaultGetRowId._warned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[tablekit] No `getRowId` provided; falling back to JSON.stringify. ' +
          'Provide a stable getRowId for server modes (M3) and pivot (M4).',
      );
      (defaultGetRowId as { _warned?: boolean })._warned = true;
    }
  }
  return `row-${index}-${JSON.stringify(row).length}`;
};
```

Note: `defaultGetRowId` is exported from `columns.ts` for now; phase 4 will move it to `createDataTable.ts` if it makes more sense at the call site. The dev warning is rate-limited to one per process to avoid console spam.

### 2.2 `packages/core/src/columns.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Column, createColumns, defaultGetRowId, resolveAccessor } from './columns';
import type { ColumnDef, DataTableState } from './types';
import { DEFAULT_STATE } from './types';

interface Person {
  id: string;
  name: string;
  age: number;
}

const baseDef: ColumnDef<Person, string> = {
  id: 'name',
  accessor: 'name',
};

const defs: Array<ColumnDef<Person, unknown>> = [
  baseDef,
  { id: 'age', accessor: 'age', enableSorting: true },
  { id: 'email', accessor: 'email' as keyof Person & string },
];

describe('columns', () => {
  describe('resolveAccessor', () => {
    it('returns the function as-is when accessor is a function', () => {
      const fn = (row: Person) => row.id;
      const resolved = resolveAccessor<Person, string>({ id: 'x', accessor: fn });
      expect(resolved({ id: 'r', name: 'n', age: 1 }, 0)).toBe('r');
    });

    it('looks up the key when accessor is a string', () => {
      const resolved = resolveAccessor<Person, string>({ id: 'name', accessor: 'name' });
      expect(resolved({ id: 'r', name: 'Alice', age: 1 }, 7)).toBe('Alice');
    });

    it('returns undefined when no accessor is provided', () => {
      const resolved = resolveAccessor<Person, string>({ id: 'x' });
      expect(resolved({ id: 'r', name: 'n', age: 1 }, 0)).toBeUndefined();
    });
  });

  describe('createColumns', () => {
    it('preserves def order when columnOrder is empty', () => {
      const cols = createColumns<Person>(defs, DEFAULT_STATE);
      expect(cols.map((c) => c.id)).toEqual(['name', 'age', 'email']);
    });

    it('honors columnOrder when provided', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['email', 'name'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['email', 'name', 'age']);
    });

    it('appends unknown defs at the end', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['age'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['age', 'name', 'email']);
    });

    it('drops unknown ids from columnOrder', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['age', 'ghost', 'name'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['age', 'name', 'email']);
    });

    it('assigns sequential indices', () => {
      const cols = createColumns<Person>(defs, DEFAULT_STATE);
      expect(cols.map((c) => c.index)).toEqual([0, 1, 2]);
    });
  });

  describe('Column derived getters', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);
    const nameCol = cols[0]!;
    const ageCol = cols[1]!;

    it('getValue returns the row cell', () => {
      expect(nameCol.getValue({ id: '1', name: 'Alice', age: 30 }, 0)).toBe('Alice');
      expect(ageCol.getValue({ id: '1', name: 'Alice', age: 30 }, 0)).toBe(30);
    });

    it('getSize returns def.size or default', () => {
      const sizedCol = createColumns<Person>(
        [{ id: 'name', accessor: 'name', size: 200 }],
        DEFAULT_STATE,
      )[0]!;
      expect(sizedCol.getSize()).toBe(200);
      expect(nameCol.getSize()).toBe(150); // default
    });

    it('getSize returns columnSizing override when present', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnSizing: { name: 250 },
      };
      const col = createColumns<Person>(defs, state)[0]!;
      expect(col.getSize()).toBe(250);
    });

    it('getIsPinned returns false by default', () => {
      expect(nameCol.getIsPinned()).toBe(false);
    });

    it('getIsPinned reads columnPinning state', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnPinning: { left: ['name'], right: [] },
      };
      const col = createColumns<Person>(defs, state)[0]!;
      expect(col.getIsPinned()).toBe('left');
    });

    it('getIsSorted returns false when not sorted', () => {
      expect(nameCol.getIsSorted()).toBe(false);
    });

    it('getIsSorted reads sorting state', () => {
      const state: DataTableState = { ...DEFAULT_STATE, sorting: [{ id: 'age', desc: true }] };
      const col = createColumns<Person>(defs, state)[1]!;
      expect(col.getIsSorted()).toBe('desc');
    });

    it('getCanSort reflects enableSorting', () => {
      expect(nameCol.getCanSort()).toBe(false);
      expect(ageCol.getCanSort()).toBe(true);
    });

    it('getCanFilter reflects enableFiltering', () => {
      expect(nameCol.getCanFilter()).toBe(false);
    });

    it('getIsVisible reflects columnVisibility', () => {
      expect(nameCol.getIsVisible()).toBe(true);
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnVisibility: { name: false },
      };
      const col = createColumns<Person>(defs, state)[0]!;
      expect(col.getIsVisible()).toBe(false);
    });

    it('getMinSize / getMaxSize have safe defaults', () => {
      expect(nameCol.getMinSize()).toBe(30);
      expect(nameCol.getMaxSize()).toBe(Number.POSITIVE_INFINITY);
    });

    it('getPinnedOffset is 0 when unpinned', () => {
      expect(nameCol.getPinnedOffset()).toBe(0);
    });

    it('getPinnedOffset sums preceding pinned widths', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnPinning: { left: ['name', 'age'], right: [] },
        columnSizing: { name: 100, age: 50 },
      };
      const cols2 = createColumns<Person>(defs, state);
      const ageCol2 = cols2.find((c) => c.id === 'age')!;
      expect(ageCol2.getPinnedOffset()).toBe(100); // name is 100 wide and pinned before age
    });

    it('getMeta returns the def meta', () => {
      const meta = { custom: 'value' };
      const col = createColumns<Person>(
        [{ id: 'name', accessor: 'name', meta }],
        DEFAULT_STATE,
      )[0]!;
      expect(col.getMeta()).toBe(meta);
    });
  });

  describe('defaultGetRowId', () => {
    it('produces a string id', () => {
      const id = defaultGetRowId({ id: 'r' }, 5);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('Column identity stability', () => {
    it('re-running createColumns with the same state returns structurally equal getters', () => {
      const a = createColumns<Person>(defs, DEFAULT_STATE);
      const b = createColumns<Person>(defs, DEFAULT_STATE);
      // Different instances — that is expected. But each instance reads the same state.
      expect(a[0]!.getSize()).toBe(b[0]!.getSize());
      expect(a[0]!.id).toBe(b[0]!.id);
    });
  });
});
```

---

## 3. Commands (in order)

```bash
# 1. Write the files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 3:
- All phase-1 + phase-2 tests still pass.
- 17 new column tests pass.
- `pnpm verify` exit 0.

---

## 4. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for the "columns" describe block: 17 tests passing.
```

---

## 5. Out of scope for this phase

- Real offset math using defs (M2 needs full def-by-id lookup; the current implementation defaults to 150 for missing widths — M2 fixes it).
- `getFacetedUniqueValues` / `getFacetedMinMax` — M1.
- `getFilterFn()` resolution (column reads its `filterFn` from def; M1 wires the registry).
- Header group derivation — M1.

---

## 6. Risks specific to this phase

| Risk                                                                                       | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Column` instance identity drifts across `setOptions` calls, breaking `useSyncExternalStore` snapshot equality. | **Resolved**: factory in phase 4 will short-circuit re-creation when `options` reference is unchanged (the `setOptions` call is itself a no-op). When slice state changes, the array is rebuilt; consumers do not hold column references across re-renders. |
| `getPinnedOffset` is approximate (uses 150 for unknown widths).                            | Documented in code. M2 fixes when the row pipeline + real sizing measurements land. M0 test acknowledges the approximation via state-provided widths. |
| `defaultGetRowId` logs to console.                                                         | Acceptable in dev; suppressed in production AND in the Vitest test environment via `process.env.NODE_ENV`. Plan revision 2 added the `test` check to keep test output clean. |