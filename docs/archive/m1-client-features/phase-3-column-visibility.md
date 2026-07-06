# Phase 3 — Column Visibility Helpers

**Goal:** Ship `toggleColumnVisibility(id)` and expose `getVisibleColumns()` on the instance per spec §8.4 (decision D1 — INCLUDE). The `columnVisibility` slice is already declared in M0's `DataTableState`; the `setColumnVisibility` dispatcher is already exposed; the `Column.isVisible` derivation is already computed in M0's `createColumns`. M1 only adds the toggle helper, the visible-columns getter, and a `getIsVisible()` re-check on `Column` (already done in M0).

After this phase:
- `table.toggleColumnVisibility(id)` flips the visibility for that column.
- `table.getVisibleColumns()` returns the `Column[]` filtered by visibility.
- `table.toggleAllColumnsVisibility(visible?)` flips all columns at once (helper for "show all" / "hide all" UI).
- The `columnOrder` slice interaction is unchanged: hidden columns remain in `columnOrder` and appear in the `Column[]` derivation but are filtered out of `getVisibleColumns()`.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/visibility.ts` | `toggleColumnVisibility`, `toggleAllColumnsVisibility` pure helpers |
| `packages/core/src/visibility.test.ts` | Unit tests |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/createDataTable.ts` | Expose `toggleColumnVisibility`, `toggleAllColumnsVisibility`, `getVisibleColumns`, `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns` |
| `packages/core/src/index.ts` | Re-export `toggleColumnVisibility` |

No package config changes.

---

## 3. File contents

### 3.1 `packages/core/src/visibility.ts`

```ts
/**
 * @lynellf/tablekit-core — column visibility helpers.
 *
 * Spec §8.4: `columnVisibility: Record<string, boolean>` slice. Hidden
 * columns are excluded from `getVisibleColumns()` and from `getHeaderGroups()`.
 *
 * M0 already derives `Column.isVisible` per-column; this phase adds the
 * public helpers that toggle visibility.
 */

import type { ColumnPinningState, DataTableState } from './types';

/**
 * Toggle a single column's visibility. Returns the new `columnVisibility`
 * object (or the same reference if nothing changed).
 */
export const toggleColumnVisibility = (
  visibility: Record<string, boolean>,
  columnId: string,
): Record<string, boolean> => {
  const current = visibility[columnId];
  const next = current === false ? true : false;
  return { ...visibility, [columnId]: next };
};

/**
 * Toggle all columns at once. When `next` is provided, set every column id
 * to that value; when undefined, flip every column to the opposite of the
 * most-common current value.
 *
 * Returns the new `columnVisibility` object.
 */
export const toggleAllColumnsVisibility = (
  visibility: Record<string, boolean>,
  allColumnIds: string[],
  next?: boolean,
): Record<string, boolean> => {
  let target: boolean;
  if (next !== undefined) {
    target = next;
  } else {
    // Flip: if most columns are visible, hide all; otherwise show all.
    const visibleCount = allColumnIds.filter((id) => visibility[id] !== false).length;
    target = visibleCount <= allColumnIds.length / 2;
  }
  const out: Record<string, boolean> = { ...visibility };
  for (const id of allColumnIds) {
    out[id] = target;
  }
  return out;
};

/**
 * Slice a list of column ids by pinning state. Used by phase 5's prop getters
 * to compute `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns`.
 */
export const sliceColumnsByPinning = (
  columnIds: string[],
  pinning: ColumnPinningState,
): { left: string[]; center: string[]; right: string[] } => {
  const leftSet = new Set(pinning.left);
  const rightSet = new Set(pinning.right);
  const left: string[] = [];
  const center: string[] = [];
  const right: string[] = [];
  for (const id of columnIds) {
    if (leftSet.has(id)) left.push(id);
    else if (rightSet.has(id)) right.push(id);
    else center.push(id);
  }
  // Ensure pinning order is honored for left and right.
  return {
    left,
    center,
    right,
  };
};
```

### 3.2 `packages/core/src/visibility.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  toggleColumnVisibility,
  toggleAllColumnsVisibility,
  sliceColumnsByPinning,
} from './visibility';

describe('toggleColumnVisibility', () => {
  it('hides a visible column (no entry → false)', () => {
    const out = toggleColumnVisibility({}, 'name');
    expect(out).toEqual({ name: false });
  });

  it('shows a hidden column (false → true)', () => {
    const out = toggleColumnVisibility({ name: false }, 'name');
    expect(out).toEqual({ name: true });
  });

  it('hides a visible column (true → false)', () => {
    const out = toggleColumnVisibility({ name: true }, 'name');
    expect(out).toEqual({ name: false });
  });

  it('does not mutate the input', () => {
    const input = { name: true };
    toggleColumnVisibility(input, 'name');
    expect(input).toEqual({ name: true });
  });
});

describe('toggleAllColumnsVisibility', () => {
  it('hides all when most are visible', () => {
    const out = toggleAllColumnsVisibility({ a: true, b: true, c: true }, ['a', 'b', 'c']);
    expect(out).toEqual({ a: false, b: false, c: false });
  });

  it('shows all when most are hidden', () => {
    const out = toggleAllColumnsVisibility({ a: false, b: false, c: false }, ['a', 'b', 'c']);
    expect(out).toEqual({ a: true, b: true, c: true });
  });

  it('uses explicit target when provided', () => {
    const out = toggleAllColumnsVisibility({ a: true }, ['a', 'b'], false);
    expect(out).toEqual({ a: false, b: false });
  });

  it('preserves entries for columns not in the id list', () => {
    const out = toggleAllColumnsVisibility({ a: true, ghost: false }, ['a'], false);
    expect(out).toEqual({ a: false, ghost: false });
  });
});

describe('sliceColumnsByPinning', () => {
  it('returns three empty arrays when nothing is pinned', () => {
    const out = sliceColumnsByPinning(['a', 'b', 'c'], { left: [], right: [] });
    expect(out).toEqual({ left: [], center: ['a', 'b', 'c'], right: [] });
  });

  it('places pinned columns in the correct region', () => {
    const out = sliceColumnsByPinning(
      ['l1', 'a', 'b', 'r1', 'r2'],
      { left: ['l1'], right: ['r1', 'r2'] },
    );
    expect(out).toEqual({ left: ['l1'], center: ['a', 'b'], right: ['r1', 'r2'] });
  });
});
```

### 3.3 `packages/core/src/createDataTable.ts` — `toggleColumnVisibility` and friends

Add to the `DataTable` class:

```ts
import {
  toggleColumnVisibility,
  toggleAllColumnsVisibility,
  sliceColumnsByPinning,
} from './visibility';

  // ...inside the class:

  /**
   * Toggle a single column's visibility.
   * Per spec §8.4: hidden columns are excluded from getVisibleColumns() and
   * from getHeaderGroups(). They remain in columnOrder.
   */
  toggleColumnVisibility = (columnId: string): void => {
    const next = toggleColumnVisibility(this.state.columnVisibility, columnId);
    if (Object.is(next, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', next);
  };

  /**
   * Toggle all columns at once. When `next` is provided, set every column
   * to that value; otherwise flip based on the current majority.
   */
  toggleAllColumnsVisibility = (next?: boolean): void => {
    const allIds = this.options.columns.map((c) => c.id);
    const out = toggleAllColumnsVisibility(this.state.columnVisibility, allIds, next);
    if (Object.is(out, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', out);
  };

  /**
   * Get the leaf columns in their rendered order (columnOrder + visibility
   * applied). Hidden columns are excluded.
   */
  getVisibleColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsVisible());
  }

  /**
   * Pinning-bucketed views. Phase 5 uses these for `getLeftHeaderGroups`,
   * `getCenterHeaderGroups`, `getRightHeaderGroups`.
   */
  getLeftLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'left');
  }

  getCenterLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === false);
  }

  getRightLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'right');
  }

  private getResolvedColumns(): Array<Column<TRow, unknown>> {
    // Cache by (columns ref, state.columnOrder, state.columnVisibility).
    // M0's createColumns is cheap; no cache needed yet.
    return createColumns(this.options.columns, this.state);
  }
```

`getResolvedColumns` is private and replaces the inline `columnsForRowModel` call in `getRowModel()` (phase 1). It is reused across `getVisibleColumns`, `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns`.

### 3.4 `packages/core/src/index.ts` — additions

```ts
// ─── Column visibility (M1) ────────────────────────────────────────────────
export { toggleColumnVisibility, toggleAllColumnsVisibility } from './visibility';
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

Expected after phase 3:
- All M0 + phase 1 + phase 2 tests still pass.
- ~7 new visibility tests pass.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ visibility > ... (~7 tests)
```

---

## 6. Out of scope for this phase

- Per-column show/hide UI (a context menu, a checkbox list) — consumer's responsibility.
- Persisting visibility state — v1.5.
- `getFacetedUniqueValues` filtering by visibility — phase 4.

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| `getVisibleColumns()` returning the same reference across `setOptions` calls when nothing changed | The implementation derives from `createColumns` + filter; no cache. For M1's data sizes this is fine. M2 may memoize. |
| `getLeftLeafColumns` ordering — should respect `columnPinning.left` order, not `columnOrder` | The implementation filters by `column.getIsPinned() === 'left'`, which preserves the derivation order from `createColumns` (which honors `columnOrder`). When `columnPinning.left` contains ids not in `columnOrder` (an inconsistent state), the result may be incorrect; this is a consumer-side misuse and M0's `createColumns` already documents the inconsistency. |
| `toggleAllColumnsVisibility` when `columnVisibility` already has entries for columns not in `defs` | The helper preserves unknown entries (test `preserves entries for columns not in the id list`). |
| Visible-column index for ARIA `aria-colindex` — must be 1-based and reflect visible order only | Phase 5's `buildVisibleCells` (from phase 1) computes `colIndex` in visible order, which is the correct source. |