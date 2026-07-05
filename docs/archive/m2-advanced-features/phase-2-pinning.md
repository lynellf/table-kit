# Phase 2 — Pinning Offset Math + Dispatchers

**Goal:** Fix `Column.getPinnedOffset()` to read each preceding column's `getSize()` (instead of the M0 literal `150`); wire `setColumnPinning` through the existing controlled-slice infrastructure with proper tests; add a `togglePin(id, side)` convenience helper that updates `columnPinning` and announces the change; ship `pin/unpin` announcements through the existing `Announcer` seam.

After this phase:
- `Column.getPinnedOffset()` returns the cumulative width of preceding pinned columns using their resolved `getSize()` (which reads `columnSizing` → `def.size` → 150).
- `setColumnPinning` is fully tested for controlled and uncontrolled modes.
- `togglePin(id, side)` toggles `columnPinning` for the given column id; `side` is `'left' | 'right' | false` (false unpins).
- Pin/unpin events emit announcer messages: "Pinned X to left", "Pinned X to right", "Unpinned X".
- `pinColumns` / `unpinColumns` batch helpers also ship (multi-column pin/unpin in a single state change).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/pinning.ts` | Pure helpers: `applyPinChange`, `togglePinColumn`, `pinColumns`, `unpinColumns` |
| `packages/core/src/pinning.test.ts` | Unit tests for the helpers |
| (no React package changes — pinning has no React-specific DOM interaction) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/columns.ts` | `Column.getPinnedOffset()` reads `getSize()` instead of literal `150` |
| `packages/core/src/createDataTable.ts` | Add `togglePin`, `pinColumns`, `unpinColumns`; route announcer on pin/unpin; ensure `setColumnPinning` triggers announcements |
| `packages/core/src/types.ts` | Append `setColumnPinning(updater)` is already declared (M0); add `togglePin`, `pinColumns`, `unpinColumns` to `DataTableInstance` |
| `packages/core/src/index.ts` | Re-export the new helpers |

---

## 3. File contents

### 3.1 `packages/core/src/pinning.ts`

```ts
/**
 * @lynellf/tablekit-core — pinning helpers (M2 Phase 2).
 *
 * Spec §7.3: column pinning state. M0 declares the `columnPinning` slice
 * and the `Column.getIsPinned/getPinnedOffset` getters. M1 added `moveColumn`
 * that crosses pinning boundaries. Phase 2 ships:
 *   - the offset math fix (read preceding columns' getSize())
 *   - togglePinColumn(id, side) convenience
 *   - pinColumns/unpinColumns batch helpers
 *   - announcer wiring on pin/unpin
 */

import type { ColumnPinningState } from './types';

export type PinSide = 'left' | 'right' | false;

/**
 * Apply a pin toggle for a single column. Returns the new `columnPinning`
 * slice, or `null` if no change is needed.
 *
 * `side` semantics:
 *   - 'left': append the column to `left` (remove from `right` first if present)
 *   - 'right': append the column to `right` (remove from `left` first if present)
 *   - false: remove the column from both `left` and `right`
 *
 * Idempotent: pinning an already-pinned column on the same side is a no-op.
 */
export const togglePinColumn = (
  state: ColumnPinningState,
  columnId: string,
  side: PinSide,
): ColumnPinningState | null => {
  const isOnLeft = state.left.includes(columnId);
  const isOnRight = state.right.includes(columnId);

  if (side === false) {
    if (!isOnLeft && !isOnRight) return null;
    return {
      left: state.left.filter((id) => id !== columnId),
      right: state.right.filter((id) => id !== columnId),
    };
  }

  if (side === 'left') {
    if (isOnLeft) return null;
    return {
      left: [...state.left.filter((id) => id !== columnId), columnId],
      right: state.right.filter((id) => id !== columnId),
    };
  }

  // side === 'right'
  if (isOnRight) return null;
  return {
    left: state.left.filter((id) => id !== columnId),
    right: [...state.right.filter((id) => id !== columnId), columnId],
  };
};

/**
 * Pin multiple columns to the same side in a single state change.
 * Returns the new state or `null` if no change.
 */
export const pinColumns = (
  state: ColumnPinningState,
  columnIds: string[],
  side: 'left' | 'right',
): ColumnPinningState | null => {
  const otherSide = side === 'left' ? 'right' : 'left';
  // Remove from both sides, then append to the target side in the given order.
  const targetBase = state[side].filter((id) => !columnIds.includes(id));
  const otherFiltered = state[otherSide].filter((id) => !columnIds.includes(id));
  const target = [...targetBase, ...columnIds];
  const next: ColumnPinningState = {
    left: side === 'left' ? target : otherFiltered,
    right: side === 'right' ? target : otherFiltered,
  };
  // Idempotency: short-circuit if nothing changed.
  if (
    next.left.length === state.left.length &&
    next.right.length === state.right.length &&
    next.left.every((id, i) => id === state.left[i]) &&
    next.right.every((id, i) => id === state.right[i])
  ) {
    return null;
  }
  return next;
};

/**
 * Unpin multiple columns in a single state change.
 * Returns the new state or `null` if no change.
 */
export const unpinColumns = (
  state: ColumnPinningState,
  columnIds: string[],
): ColumnPinningState | null => {
  const next: ColumnPinningState = {
    left: state.left.filter((id) => !columnIds.includes(id)),
    right: state.right.filter((id) => !columnIds.includes(id)),
  };
  if (next.left.length === state.left.length && next.right.length === state.right.length) {
    return null;
  }
  return next;
};

/**
 * Build the announcer message for a pin change. M1 hardcodes English; M6
 * introduces the `messages` map.
 */
export const pinAnnouncement = (
  columnId: string,
  next: PinSide,
  previous: PinSide,
): string => {
  if (next === previous) return ''; // no-op
  if (next === false) return `Unpinned ${columnId}`;
  if (previous === false) return `Pinned ${columnId} to ${next}`;
  return `Moved ${columnId} from ${previous} to ${next}`;
};
```

### 3.2 `packages/core/src/pinning.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  pinAnnouncement,
  pinColumns,
  togglePinColumn,
  unpinColumns,
} from './pinning';
import type { ColumnPinningState } from './types';

const baseState = (): ColumnPinningState => ({ left: ['a'], right: ['b'] });

describe('togglePinColumn', () => {
  it('pins an unpinned column to the left', () => {
    const out = togglePinColumn({ left: [], right: [] }, 'x', 'left');
    expect(out).toEqual({ left: ['x'], right: [] });
  });

  it('pins an unpinned column to the right', () => {
    const out = togglePinColumn({ left: [], right: [] }, 'x', 'right');
    expect(out).toEqual({ left: [], right: ['x'] });
  });

  it('moves a column from right to left', () => {
    const out = togglePinColumn({ left: [], right: ['x'] }, 'x', 'left');
    expect(out).toEqual({ left: ['x'], right: [] });
  });

  it('moves a column from left to right', () => {
    const out = togglePinColumn({ left: ['x'], right: [] }, 'x', 'right');
    expect(out).toEqual({ left: [], right: ['x'] });
  });

  it('unpins a pinned column', () => {
    expect(togglePinColumn({ left: ['x'], right: [] }, 'x', false)).toEqual({
      left: [],
      right: [],
    });
    expect(togglePinColumn({ left: [], right: ['x'] }, 'x', false)).toEqual({
      left: [],
      right: [],
    });
  });

  it('returns null when no change', () => {
    expect(togglePinColumn({ left: ['x'], right: [] }, 'x', 'left')).toBeNull();
    expect(togglePinColumn({ left: [], right: [] }, 'x', false)).toBeNull();
  });

  it('does not mutate input', () => {
    const input = baseState();
    const out = togglePinColumn(input, 'x', 'left');
    expect(input).toEqual(baseState());
    expect(out).not.toBe(input);
  });
});

describe('pinColumns', () => {
  it('pins multiple columns to the left', () => {
    const out = pinColumns({ left: [], right: [] }, ['x', 'y'], 'left');
    expect(out).toEqual({ left: ['x', 'y'], right: [] });
  });

  it('preserves order', () => {
    const out = pinColumns({ left: ['a'], right: [] }, ['c', 'b'], 'left');
    expect(out?.left).toEqual(['a', 'c', 'b']);
  });

  it('moves columns from right to left', () => {
    const out = pinColumns({ left: [], right: ['x', 'y'] }, ['x', 'y'], 'left');
    expect(out).toEqual({ left: ['x', 'y'], right: [] });
  });

  it('returns null when already pinned to that side', () => {
    expect(pinColumns({ left: ['x'], right: [] }, ['x'], 'left')).toBeNull();
  });

  it('does not mutate input', () => {
    const input = baseState();
    pinColumns(input, ['x'], 'left');
    expect(input).toEqual(baseState());
  });
});

describe('unpinColumns', () => {
  it('unpins multiple columns from both sides', () => {
    const out = unpinColumns({ left: ['a', 'b'], right: ['c'] }, ['a', 'c']);
    expect(out).toEqual({ left: ['b'], right: [] });
  });

  it('returns null when none were pinned', () => {
    expect(unpinColumns({ left: ['a'], right: [] }, ['x'])).toBeNull();
  });

  it('does not mutate input', () => {
    const input = baseState();
    unpinColumns(input, ['a']);
    expect(input).toEqual(baseState());
  });
});

describe('pinAnnouncement', () => {
  it('announces pin to left', () => {
    expect(pinAnnouncement('name', 'left', false)).toBe('Pinned name to left');
  });
  it('announces pin to right', () => {
    expect(pinAnnouncement('name', 'right', false)).toBe('Pinned name to right');
  });
  it('announces move', () => {
    expect(pinAnnouncement('name', 'right', 'left')).toBe('Moved name from left to right');
  });
  it('announces unpin', () => {
    expect(pinAnnouncement('name', false, 'left')).toBe('Unpinned name');
  });
  it('returns empty string for no-op', () => {
    expect(pinAnnouncement('name', 'left', 'left')).toBe('');
  });
});
```

### 3.3 `packages/core/src/columns.ts` (modify `Column.getPinnedOffset`)

Replace the literal `150` with `getSize()`:

```ts
getPinnedOffset(): number {
  if (this.pinnedSide === false) return 0;
  const side: keyof ColumnPinningState = this.pinnedSide;
  const ordered = this.state.columnPinning[side];
  const idx = ordered.indexOf(this.id);
  if (idx <= 0) return 0;
  let offset = 0;
  // We can't call `this.getSize()` for preceding columns directly because
  // we don't have a Column instance. We look up the size from state +
  // ColumnDef. Resolve via the registry (same logic as Column.getSize):
  //   1. state.columnSizing[id] if present
  //   2. def.size if present
  //   3. default 150
  for (let i = 0; i < idx; i++) {
    const precedingId = ordered[i];
    if (precedingId === undefined) continue;
    const fromState = this.state.columnSizing[precedingId];
    if (typeof fromState === 'number') {
      offset += fromState;
      continue;
    }
    // Look up the def for the preceding column. The defs are stored on
    // the factory; we don't have direct access here. To keep this method
    // pure + self-contained, we read from `this.def` for the current
    // column's size and fall back to 150. For preceding columns, we
    // need the def map; the factory passes it via a new optional
    // `defsById` argument.
    const def = this.defsById?.get(precedingId);
    if (def && typeof def.size === 'number') {
      offset += def.size;
      continue;
    }
    offset += 150;
  }
  return offset;
}
```

The constructor needs a new optional `defsById` field for the look-up:

```ts
class Column<TRow, TValue = unknown> {
  // ... existing fields ...
  /** Map of all column defs (id → def). Optional; set by the factory so preceding-column lookups work. */
  readonly defsById?: Map<string, ColumnDef<TRow, unknown>>;

  constructor(args: {
    // ... existing args ...
    defsById?: Map<string, ColumnDef<TRow, unknown>>;
  }) {
    // ... existing assignments ...
    this.defsById = args.defsById;
  }
}
```

The factory passes `defsById` in `createColumns`:

```ts
export const createColumns = <TRow>(
  defs: Array<ColumnDef<TRow, unknown>>,
  state: DataTableState,
): Array<Column<TRow, unknown>> => {
  const defsById = new Map<string, ColumnDef<TRow, unknown>>();
  for (const def of defs) defsById.set(def.id, def);

  // ... existing logic ...
  result.push(
    new Column<TRow, unknown>({
      def,
      state,
      index: i,
      resolveAccessor,
      defsById, // ← new
    }),
  );
  // ...
};
```

The `defsById` map is the same Map M1's `moveColumn` builds internally (in `ordering.ts`). M2 reuses the same pattern to avoid redundant iteration. **Backward compatibility:** M0/M1's existing `Column` consumers (those not constructing directly via `new Column({...})`) are unaffected because `defsById` is optional and the existing `getPinnedOffset()` callers don't pass it. The factory wires it.

### 3.4 `packages/core/src/createDataTable.ts` (additions)

```ts
// ─── New imports ───────────────────────────────────────────────────────────
import {
  pinAnnouncement,
  pinColumns as pinColumnsHelper,
  togglePinColumn as togglePinColumnHelper,
  unpinColumns as unpinColumnsHelper,
  type PinSide,
} from './pinning';

class DataTable<TRow> implements DataTableInstance<TRow> {
  // ... existing fields/methods ...

  togglePin = (columnId: string, side: PinSide): void => {
    const previous = this.state.columnPinning.left.includes(columnId)
      ? 'left' as const
      : this.state.columnPinning.right.includes(columnId)
        ? 'right' as const
        : false;
    const next = togglePinColumnHelper(this.state.columnPinning, columnId, side);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    const msg = pinAnnouncement(columnId, side, previous);
    if (msg) this.announce(msg);
  };

  pinColumns = (columnIds: string[], side: 'left' | 'right'): void => {
    const next = pinColumnsHelper(this.state.columnPinning, columnIds, side);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    this.announce(
      `Pinned ${columnIds.length === 1 ? columnIds[0] : `${columnIds.length} columns`} to ${side}`,
    );
  };

  unpinColumns = (columnIds: string[]): void => {
    const next = unpinColumnsHelper(this.state.columnPinning, columnIds);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    this.announce(
      `Unpinned ${columnIds.length === 1 ? columnIds[0] : `${columnIds.length} columns`}`,
    );
  };
}
```

Note: `setColumnPinning` is already declared on `DataTableInstance` and dispatched in M0 (`applyChange('columnPinning', updater)`). Phase 2 adds tests (not implementations) for the controlled/uncontrolled path; the implementation is unchanged.

### 3.5 `packages/core/src/types.ts` (additions)

Append to `DataTableInstance`:

```ts
  // ─── Pinning helpers (M2) ──────────────────────────────────────────────
  togglePin(columnId: string, side: 'left' | 'right' | false): void;
  pinColumns(columnIds: string[], side: 'left' | 'right'): void;
  unpinColumns(columnIds: string[]): void;
```

Append to the exports:

```ts
export type { PinSide } from './pinning';
```

### 3.6 `packages/core/src/index.ts` (additions)

```ts
// ─── Pinning helpers (M2 Phase 2) ─────────────────────────────────────────
export {
  togglePinColumn,
  pinColumns,
  unpinColumns,
  pinAnnouncement,
} from './pinning';
export type { PinSide } from './pinning';
```

---

## 4. Commands

```bash
pnpm --filter @lynellf/tablekit-core test -- pinning columns
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. Pinning helpers tests pass
pnpm --filter @lynellf/tablekit-core test pinning
# Expected: ~20 new tests pass

# 2. getPinnedOffset reads def.size
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{ a: 1, b: 2 }],
    columns: [
      { id: 'a', accessor: 'a', size: 200 },
      { id: 'b', accessor: 'b', size: 100 },
    ],
    state: { columnPinning: { left: ['a', 'b'], right: [] } },
    onColumnPinningChange: () => {},
    getRowId: r => String(r.a),
  });
  const a = t.getLeftLeafColumns()[0];
  const b = t.getLeftLeafColumns()[1];
  console.log('a offset:', a.getPinnedOffset());  // 0
  console.log('b offset:', b.getPinnedOffset());  // 200 (a.size)
"
# Expected: a offset: 0, b offset: 200

# 3. togglePin works on the instance
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{ a: 1 }],
    columns: [{ id: 'a', accessor: 'a' }],
    getRowId: r => String(r.a),
  });
  t.togglePin('a', 'left');
  console.log(t.getState().columnPinning);  // { left: ['a'], right: [] }
"
# Expected: { left: ['a'], right: [] }

# 4. setColumnPinning controlled-mode round-trip
# (covered by createDataTable.test.ts + new tests added in phase 2)
```

---

## 6. Out-of-scope (deferred to later phases)

- **Pinning + virtualization integration** — column virtualization (phase 1) excludes pinned columns; this composition is verified in the integration tests of phase 7. Phase 2 ships the helpers + tests in isolation.
- **`onColumnPinningChange` announcer integration** for bulk `pinColumns`/`unpinColumns` — phase 2 announces a generic message; M6 polish may add a more specific message per column id.
- **Pinned-column resize offset recomputation** — phase 3 (resize). Resizing a pinned column mutates `columnSizing[id]`; downstream offsets recompute on the next render (because `getPinnedOffset` is a function). Phase 3 adds the interaction; phase 2 just makes the math correct.
- **Pivot grand-total column default-pinning** — M4.
- **RTL pinning** — v2 (spec §16 risk #2).

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **`Column.getPinnedOffset` reads from `defsById` map** — passing the map through the constructor adds a new field | Backward-compatible: the field is optional; M0/M1 callers that don't pass it get the old literal-150 fallback. The factory passes the map. |
| **`togglePin` announcer fires on every call** — even when the consumer passes the same `side` (idempotent no-op) | `togglePinColumn` returns `null` for no-op; the dispatcher skips both the state change AND the announcer. |
| **`Column` constructor signature change** — adding `defsById?` field | Optional; no breaking change. The TypeScript type is widened; M0/M1 callers continue to compile. |
| **`pinColumns`/`unpinColumns` batch messages** — generic "Pinned N columns" loses specificity | M6 polish can add a more specific message; phase 2 ships the batch helper with a generic message. |
| **Pinning changes `aria-colindex` of rendered cells** — the validator (phase 6) must check this | Validator scans `aria-colindex` for monotonicity; pinning changes the order, which is the intended behavior. Validator only flags *non-monotonic* indices. |
| **Bundle size growth** — helpers + announcer messages add ~0.3 kB core gzip | Minimal; the helpers are small. |
