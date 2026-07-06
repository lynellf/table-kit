# Phase 4 — Faceting Helpers

**Goal:** Ship the faceting helpers per spec §15 recommendation (decision D2 — INCLUDE): `column.getFacetedUniqueValues(): Map<unknown, number>` and `column.getFacetedMinMax(): [number, number] | undefined`. The helpers operate on the **pre-filter, pre-sort, pre-paginate** data so consumers can build filter UIs that show all available options even when the row model is currently filtered.

After this phase:
- `column.getFacetedUniqueValues()` returns a `Map<unknown, number>` mapping each unique value to its count.
- `column.getFacetedMinMax()` returns `[min, max]` for numeric accessors, or `undefined` when the column is non-numeric or has fewer than 2 numeric values.
- Both helpers read from the **input `data`** (not the row model), so they are unaffected by current filter/sort/paginate state.
- The helpers are tree-shakeable: a consumer who doesn't import `Column` from the faceting submodule doesn't pay for the code.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/faceting.ts` | `getFacetedUniqueValues`, `getFacetedMinMax` pure helpers |
| `packages/core/src/faceting.test.ts` | Unit tests |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/columns.ts` | Add `getFacetedUniqueValues` and `getFacetedMinMax` methods on `Column` |
| `packages/core/src/index.ts` | Re-export the helpers |

No package config changes in this phase; the tree-shakeable subpath export is added in **phase 7** (`packages/core/package.json` `exports` map).

---

## 3. File contents

### 3.1 `packages/core/src/faceting.ts`

```ts
/**
 * @lynellf/tablekit-core — faceting helpers.
 *
 * Spec §15 (recommended addition for v1): helpers for building filter UIs
 * against client data. `getFacetedUniqueValues` returns a count map;
 * `getFacetedMinMax` returns the numeric range for sortable numeric columns.
 *
 * Source data: the helpers read from the **input `data`** (passed via the
 * `rows` parameter), not from the row model. This means they show all
 * available values even when the row model is currently filtered.
 */

type AnyRow = Record<string, unknown>;

/**
 * Compute a count map of unique values for the given column.
 *
 * `keyFn` extracts the value from each row (typically the column's accessor).
 * Returns `Map<unknown, number>` with insertion order matching first
 * occurrence in the input.
 */
export const getFacetedUniqueValues = <TRow>(
  rows: TRow[],
  columnId: string,
  keyFn: (row: TRow, index: number) => unknown,
): Map<unknown, number> => {
  const out = new Map<unknown, number>();
  for (let i = 0; i < rows.length; i++) {
    const value = keyFn(rows[i]!, i);
    out.set(value, (out.get(value) ?? 0) + 1);
  }
  return out;
};

/**
 * Compute the [min, max] for a numeric column.
 *
 * Returns `undefined` when:
 *   - The column is not numeric (any value is non-number).
 *   - The column has fewer than 1 numeric value.
 *
 * Otherwise returns `[min, max]`. If only one numeric value exists,
 * `[value, value]` is returned.
 */
export const getFacetedMinMax = <TRow>(
  rows: TRow[],
  columnId: string,
  keyFn: (row: TRow, index: number) => unknown,
): [number, number] | undefined => {
  let min: number | undefined;
  let max: number | undefined;
  for (let i = 0; i < rows.length; i++) {
    const value = keyFn(rows[i]!, i);
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (min === undefined || value < min) min = value;
    if (max === undefined || value > max) max = value;
  }
  if (min === undefined || max === undefined) return undefined;
  return [min, max];
};
```

### 3.2 `packages/core/src/faceting.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { getFacetedUniqueValues, getFacetedMinMax } from './faceting';

interface Person {
  id: string;
  name: string;
  age: number;
}

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
  { id: '3', name: 'Alice', age: 30 },
  { id: '4', name: 'Carol', age: 35 },
  { id: '5', name: 'Bob', age: 25 },
];

const nameKey = (row: Person) => row.name;
const ageKey = (row: Person) => row.age;

describe('getFacetedUniqueValues', () => {
  it('returns a count map for string values', () => {
    const map = getFacetedUniqueValues(rows, 'name', nameKey);
    expect(map.size).toBe(3);
    expect(map.get('Alice')).toBe(2);
    expect(map.get('Bob')).toBe(2);
    expect(map.get('Carol')).toBe(1);
  });

  it('returns a count map for numeric values', () => {
    const map = getFacetedUniqueValues(rows, 'age', ageKey);
    expect(map.size).toBe(3);
    expect(map.get(30)).toBe(2);
    expect(map.get(25)).toBe(2);
    expect(map.get(35)).toBe(1);
  });

  it('returns an empty map for empty input', () => {
    const map = getFacetedUniqueValues([], 'name', nameKey);
    expect(map.size).toBe(0);
  });

  it('inserts in first-occurrence order', () => {
    const map = getFacetedUniqueValues(rows, 'name', nameKey);
    expect(Array.from(map.keys())).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('preserves insertion order on repeated calls', () => {
    const map = getFacetedUniqueValues(rows, 'name', nameKey);
    // Sanity check that re-reading the map yields the same order.
    expect(Array.from(map.keys())).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('getFacetedMinMax', () => {
  it('returns [min, max] for a numeric column', () => {
    const out = getFacetedMinMax(rows, 'age', ageKey);
    expect(out).toEqual([25, 35]);
  });

  it('returns [value, value] when only one numeric value', () => {
    const out = getFacetedMinMax([{ id: '1', name: 'A', age: 42 }], 'age', ageKey);
    expect(out).toEqual([42, 42]);
  });

  it('returns undefined for non-numeric column', () => {
    const out = getFacetedMinMax(rows, 'name', nameKey);
    expect(out).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    const out = getFacetedMinMax([], 'age', ageKey);
    expect(out).toBeUndefined();
  });

  it('ignores non-finite values (NaN, Infinity)', () => {
    const out = getFacetedMinMax(
      [
        { id: '1', name: 'A', age: 10 },
        { id: '2', name: 'B', age: Number.NaN },
        { id: '3', name: 'C', age: Number.POSITIVE_INFINITY },
        { id: '4', name: 'D', age: 20 },
      ],
      'age',
      ageKey,
    );
    expect(out).toEqual([10, 20]);
  });
});
```

### 3.3 `packages/core/src/columns.ts` — `Column` methods

Add the faceting methods to the `Column` class. The methods take the **pre-pipeline data** as their first argument; the instance's `getRowModel()` (or the input data) supplies it.

```ts
import { getFacetedUniqueValues, getFacetedMinMax } from './faceting';

export class Column<TRow, TValue = unknown> {
  // ...existing methods...

  /**
   * Faceting helper: count of each unique value for this column.
   *
   * Reads from the **input data** (pre-filter, pre-sort, pre-paginate), so
   * consumers building filter UIs see all available options even when the
   * row model is currently filtered.
   *
   * Tree-shakeable: a consumer who doesn't import `Column.getFacetedUniqueValues`
   * via the dedicated subpath entry doesn't pay for this method.
   */
  getFacetedUniqueValues(rows: TRow[]): Map<unknown, number> {
    return getFacetedUniqueValues<TRow>(rows, this.id, (row, index) =>
      this.getValue(row, index),
    );
  }

  /**
   * Faceting helper: [min, max] for numeric columns.
   *
   * Returns undefined when the column has no numeric values.
   */
  getFacetedMinMax(rows: TRow[]): [number, number] | undefined {
    return getFacetedMinMax<TRow>(rows, this.id, (row, index) =>
      this.getValue(row, index),
    );
  }
}
```

### 3.4 `packages/core/src/index.ts` — additions

```ts
// ─── Faceting helpers (M1) ─────────────────────────────────────────────────
export { getFacetedUniqueValues, getFacetedMinMax } from './faceting';
```

The tree-shakeable subpath `@lynellf/tablekit-core/faceting` is added in phase 7.

---

## 4. Commands (in order)

```bash
# 1. Write all files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 4:
- All prior tests still pass.
- ~10 new faceting tests pass.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ faceting > ... (~10 tests)
```

---

## 6. Out of scope for this phase

- A consumer UI for faceting (e.g., a checkbox list, a range slider) — consumer's responsibility.
- Faceting on grouped data (e.g., PivotTable) — M4.
- Caching across re-renders — M2 may add if profiling shows it matters; M1 recomputes on each call (the helper is O(n) so for typical data sizes it's fast enough).

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| Calling `getFacetedUniqueValues` on a 100k-row dataset is O(n) | Acceptable for M1; consumers with very large datasets can memoize the result outside. M2 may add an instance-level memoization cache keyed on `(columnId, data reference)`. |
| Faceting reads `getValue` which goes through the column's accessor; if the accessor throws, faceting throws | Same risk as the filter and sort stages; consumers are responsible for accessor correctness. |
| `Map<unknown, number>` collisions — using `Object.is` for the count map keys | M0's `equals` filter uses `Object.is`, so the count map matches. If a future revision changes equality semantics, the count map must follow. |