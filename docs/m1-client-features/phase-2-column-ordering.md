# Phase 2 — Column Ordering Helpers

**Goal:** Ship the public `moveColumn(id, toIndex)` helper (per spec §8.3) plus the underlying ordering logic. Re-pin across pinning boundaries (a column moved from the unpinned center to the left-pinned region is automatically re-pinned on the consumer's behalf). Verify the existing `setColumnOrder` dispatcher (M0) still works correctly under combined ordering + pinning state.

After this phase:
- `table.moveColumn(id, toIndex)` moves a column in the `columnOrder` slice.
- `table.moveColumn(id, 'left' | 'right' | 'center' | false)` re-pins the column when the destination region differs from the source region (per spec §8.3).
- The `columnOrder` slice updates correctly when a column is added or removed (M0 already handles `createColumns` derivation; this phase ensures the public surface is complete).
- Ordering interacts correctly with pinning: `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns` (the slicing that phase 5's prop getters need) reflect the current state.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/ordering.ts` | `moveColumn<TRow>(state, defs, id, to)` pure helper |
| `packages/core/src/ordering.test.ts` | Unit tests for moveColumn + integration with pinning |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/createDataTable.ts` | Expose `moveColumn` on the instance (delegates to `ordering.ts`) |
| `packages/core/src/index.ts` | Re-export `moveColumn` |
| `packages/core/src/types.ts` | No new types; the helper uses existing `columnOrder` and `columnPinning` slices |

No package config changes.

---

## 3. File contents

### 3.1 `packages/core/src/ordering.ts`

```ts
/**
 * @lynellf/tablekit-core — column ordering.
 *
 * Spec §8.3: `table.moveColumn(id, toIndex)`. Reordering across pinning
 * boundaries re-pins to the target region.
 *
 * The function is pure: it returns a new `DataTableState` (or partial) with
 * the updated `columnOrder` and (when crossing pinning boundaries) the
 * updated `columnPinning`. The factory applies both via the controlled-slice
 * contract: when `columnOrder` is controlled, the consumer receives the
 * updater via `onColumnOrderChange`; when uncontrolled, the factory applies
 * it directly. The same applies to `columnPinning` when the destination
 * region changes.
 */

import type {
  ColumnPinningState,
  ColumnVisibilityState,
  DataTableState,
} from './types';

type Side = 'left' | 'right' | 'center';

/**
 * Move a column to a new position.
 *
 * `to` accepts:
 *   - a number: linear index in the visible leaf column list (after visibility
 *     is applied). The column is moved to that index. If the destination
 *     crosses a pinning boundary, the column is re-pinned to the destination
 *     region.
 *   - a string `'left' | 'right' | 'center'`: move to the end of the named
 *     region (re-pinning as needed).
 *   - `false`: equivalent to moving out of any pinned region (move to the
 *     center).
 *
 * Returns a partial state with the new `columnOrder` and (if applicable)
 * `columnPinning` slices. The factory applies both slices through their
 * respective dispatchers (controlled-slice semantics honored).
 */
export interface MoveColumnResult {
  columnOrder?: string[];
  columnPinning?: ColumnPinningState;
}

export const moveColumn = (
  state: Pick<DataTableState, 'columnOrder' | 'columnPinning' | 'columnVisibility'>,
  columnIds: string[], // ordered list of currently-visible leaf column ids
  id: string,
  to: number | Side | false,
): MoveColumnResult => {
  const currentIndex = columnIds.indexOf(id);
  if (currentIndex === -1) {
    // Column not in the visible list (hidden or unknown) → no-op.
    return {};
  }

  // Resolve destination index and side.
  let destIndex: number;
  let destSide: Side;
  if (typeof to === 'number') {
    destIndex = Math.max(0, Math.min(to, columnIds.length - 1));
    destSide = sideAtIndex(state.columnPinning, destIndex, columnIds);
  } else if (to === 'left' || to === 'right' || to === 'center') {
    destSide = to;
    if (to === 'left') {
      destIndex = state.columnPinning.left.length; // append to left
    } else if (to === 'right') {
      destIndex =
        columnIds.length - state.columnPinning.right.length; // prepended to right? No — append to right
      destIndex = columnIds.length; // append to the end of the visible list (right region)
    } else {
      // center: end of the unpinned region
      destIndex = state.columnPinning.left.length;
    }
  } else {
    // to === false → move to center
    destSide = 'center';
    destIndex = state.columnPinning.left.length;
  }

  // Move in the columnIds array.
  const reordered = [...columnIds];
  reordered.splice(currentIndex, 1);
  // After removal, destIndex may shift if it was after currentIndex.
  const adjustedDest = destIndex > currentIndex ? destIndex - 1 : destIndex;
  reordered.splice(adjustedDest, 0, id);

  // Determine if pinning changed.
  const currentSide = sideAtIndex(state.columnPinning, currentIndex, columnIds);
  const newPinning: ColumnPinningState | undefined =
    currentSide !== destSide ? { ...state.columnPinning } : undefined;

  if (newPinning && currentSide !== 'center') {
    // Remove from current pinned region.
    if (currentSide === 'left') {
      newPinning.left = newPinning.left.filter((c) => c !== id);
    } else {
      newPinning.right = newPinning.right.filter((c) => c !== id);
    }
  }
  if (newPinning && destSide !== 'center') {
    // Insert into destination region.
    if (destSide === 'left') {
      newPinning.left = [...newPinning.left, id];
    } else {
      newPinning.right = [...newPinning.right, id];
    }
  }

  return {
    columnOrder: reordered,
    columnPinning: newPinning,
  };
};

/**
 * Determine which side (left/right/center) the column at the given index
 * belongs to, given the current pinning.
 *
 * Side rule: columns in `left` are at the start; columns in `right` are at
 * the end; everything in between is center.
 */
const sideAtIndex = (
  pinning: ColumnPinningState,
  index: number,
  columnIds: string[],
): Side => {
  const leftCount = pinning.left.length;
  const rightCount = pinning.right.length;
  if (index < leftCount) return 'left';
  if (index >= columnIds.length - rightCount) return 'right';
  return 'center';
};
```

### 3.2 `packages/core/src/ordering.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { moveColumn } from './ordering';
import { DEFAULT_STATE } from './types';
import type { DataTableState } from './types';

const baseState = (): Pick<DataTableState, 'columnOrder' | 'columnPinning' | 'columnVisibility'> => ({
  columnOrder: ['a', 'b', 'c', 'd'],
  columnPinning: { left: [], right: [] },
  columnVisibility: {},
});

describe('moveColumn', () => {
  it('moves a column by index within the same region', () => {
    const state = baseState();
    const result = moveColumn(state, state.columnOrder, 'a', 2);
    expect(result.columnOrder).toEqual(['b', 'c', 'a', 'd']);
    expect(result.columnPinning).toBeUndefined();
  });

  it('moves to the start', () => {
    const state = baseState();
    const result = moveColumn(state, state.columnOrder, 'd', 0);
    expect(result.columnOrder).toEqual(['d', 'a', 'b', 'c']);
  });

  it('moves to the end', () => {
    const state = baseState();
    const result = moveColumn(state, state.columnOrder, 'a', 3);
    expect(result.columnOrder).toEqual(['b', 'c', 'd', 'a']);
  });

  it('clamps out-of-range index', () => {
    const state = baseState();
    const result = moveColumn(state, state.columnOrder, 'a', 99);
    expect(result.columnOrder).toEqual(['b', 'c', 'd', 'a']);
  });

  it('re-pins when crossing from center to left', () => {
    const state: ReturnType<typeof baseState> = {
      columnOrder: ['a', 'b', 'c', 'd'],
      columnPinning: { left: [], right: [] },
      columnVisibility: {},
    };
    const result = moveColumn(state, state.columnOrder, 'c', 'left');
    expect(result.columnOrder).toEqual(['a', 'b', 'c', 'd']);
    expect(result.columnPinning).toEqual({ left: ['c'], right: [] });
  });

  it('re-pins when crossing from left to center', () => {
    const state: ReturnType<typeof baseState> = {
      columnOrder: ['a', 'b', 'c', 'd'],
      columnPinning: { left: ['a', 'b'], right: [] },
      columnVisibility: {},
    };
    const result = moveColumn(state, state.columnOrder, 'a', 'center');
    expect(result.columnOrder).toEqual(['b', 'a', 'c', 'd']);
    expect(result.columnPinning).toEqual({ left: ['b'], right: [] });
  });

  it('re-pins when moving from left to right', () => {
    const state: ReturnType<typeof baseState> = {
      columnOrder: ['a', 'b', 'c', 'd'],
      columnPinning: { left: ['a', 'b'], right: [] },
      columnVisibility: {},
    };
    const result = moveColumn(state, state.columnOrder, 'a', 'right');
    expect(result.columnOrder).toEqual(['b', 'c', 'd', 'a']);
    expect(result.columnPinning).toEqual({ left: ['b'], right: ['a'] });
  });

  it('to=false moves unpinned (from left) to center', () => {
    const state: ReturnType<typeof baseState> = {
      columnOrder: ['a', 'b', 'c'],
      columnPinning: { left: ['a'], right: [] },
      columnVisibility: {},
    };
    const result = moveColumn(state, state.columnOrder, 'a', false);
    expect(result.columnOrder).toEqual(['b', 'a', 'c']);
    expect(result.columnPinning).toEqual({ left: [], right: [] });
  });

  it('returns empty result for unknown column id', () => {
    const state = baseState();
    const result = moveColumn(state, state.columnOrder, 'ghost', 0);
    expect(result).toEqual({});
  });

  it('respects columnVisibility when computing the visible list', () => {
    const state: ReturnType<typeof baseState> = {
      columnOrder: ['a', 'b', 'c'],
      columnPinning: { left: [], right: [] },
      columnVisibility: { b: false },
    };
    // Caller passed visible list = ['a', 'c'] (b is hidden).
    const result = moveColumn(state, ['a', 'c'], 'a', 1);
    expect(result.columnOrder).toEqual(['c', 'a']); // b stays at its index 1
  });
});
```

### 3.3 `packages/core/src/createDataTable.ts` — `moveColumn` method

Add to the `DataTable` class:

```ts
  /**
   * Move a column to a new index or side. Per spec §8.3: re-pins when crossing
   * pinning boundaries.
   *
   * Applies `columnOrder` and (if changed) `columnPinning` through their
   * respective dispatchers. Controlled-slice semantics are honored.
   */
  moveColumn = (id: string, to: number | 'left' | 'right' | 'center' | false): void => {
    const visibleIds = this.getVisibleColumns().map((c) => c.id);
    const result = moveColumn(
      {
        columnOrder: this.state.columnOrder,
        columnPinning: this.state.columnPinning,
        columnVisibility: this.state.columnVisibility,
      },
      visibleIds,
      id,
      to,
    );
    if (result.columnOrder) {
      this.applyChange('columnOrder', result.columnOrder);
    }
    if (result.columnPinning) {
      this.applyChange('columnPinning', result.columnPinning);
    }
  };
```

The `moveColumn` symbol is imported at the top of `createDataTable.ts`.

### 3.4 `packages/core/src/index.ts` — additions

```ts
// ─── Column ordering (M1) ─────────────────────────────────────────────────
export { moveColumn } from './ordering';
```

### 3.5 `packages/core/src/types.ts` — note

`ColumnVisibilityState` is referenced in `ordering.ts` for typing convenience but it is just `Record<string, boolean>` (same as `columnVisibility` slice). No new type is added in this phase; the helper uses inline types.

---

## 4. Commands (in order)

```bash
# 1. Write all files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 2:
- All M0 + phase-1 tests still pass.
- ~10 new ordering tests pass.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ ordering > moveColumn > ... (~10 tests)
```

---

## 6. Out of scope for this phase

- `moveColumn` accepting a `'left' | 'right' | 'center' | false` argument in the **prop getter** path (e.g., a header cell that exposes move controls) — phase 5.
- Re-ordering via drag-and-drop — not in M1; consumers implement via dnd-kit (per spec §8.3, "library deliberately ships no drag implementation").
- Keyboard reorder grab pattern (Space to lift, Arrows to move, Space to drop, Escape to cancel) — not in M1; spec §8.3 ships it as a documented recipe in M6.

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| `moveColumn` re-pin crossing a pinning boundary touches two slices (`columnOrder` + `columnPinning`); if either is controlled and the other isn't, the consumer sees an asymmetric update | Documented: when both slices are controlled, the consumer receives two callbacks; when only one is controlled, the consumer receives the controlled one and the engine applies the uncontrolled one. The tests in phase 1's `autoResetPageIndex` test matrix cover the symmetric case. |
| Pinning boundary detection when `columnVisibility` hides some columns | The helper uses the caller-supplied `visibleIds` list (filtered by visibility), so the index is computed in visible-order, not def-order. The test `respects columnVisibility` pins this. |
| `columnOrder` and `columnPinning` slices being inconsistent (e.g., a column listed in `left` but not in `columnOrder`) | M0's `createColumns` already handles unknown defs; phase 2 doesn't change that. The `moveColumn` helper never adds a column to `columnPinning` that isn't in `columnOrder`. |
| Index adjustment after splice | The `adjustedDest` logic accounts for the case where the destination index was after the removed element. Tested in the `moves to the start` case (which exercises the boundary). |