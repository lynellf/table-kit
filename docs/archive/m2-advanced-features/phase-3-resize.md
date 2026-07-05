# Phase 3 — Resize Handle + Column Sizing Dispatcher

**Goal:** Ship `header.getResizeHandleProps()` (spec §7.2) with full pointer + keyboard interaction; route through `columnSizing` (state) and `columnSizingInfo` (transient session); honor `columnResizeMode: 'onChange' | 'onEnd'`; clamp to `minSize`/`maxSize`; announce commits ("X column, N pixels"); wire `setColumnSizing`/`setColumnSizingInfo` through the controlled-slice infrastructure with proper tests.

After this phase:
- `header.getResizeHandleProps(consumerProps?)` returns `{ role: 'separator', tabIndex, aria-orientation: 'vertical', aria-valuenow/min/max, aria-controls, aria-label, onPointerDown, onPointerMove, onPointerUp, onPointerCaptureLost, onKeyDown, data-resizing }`.
- Pointer interaction uses `setPointerCapture` so dragging outside the handle keeps the gesture active.
- Keyboard: Arrow Left/Right adjust by `resizeStepPx` (default 10), Shift+Arrow adjusts by 1, Enter commits (in `onEnd` mode), Escape cancels (reverts to start size).
- Resize math (`resizeColumn(columnSizing, session, minSize, maxSize) → newSizing`) is a pure function in `@lynellf/tablekit-core/resize`.
- `setColumnSizing` and `setColumnSizingInfo` are tested for controlled/uncontrolled modes (the dispatchers exist from M0; phase 3 adds tests).
- Resize commits emit announcer messages; the message format is "{columnId} column, {width} pixels".

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/resize.ts` | Pure helpers: `resizeColumn`, `clampColumnSize`, `commitResize`, `cancelResize`, `DEFAULT_RESIZE_STEP_PX` |
| `packages/core/src/resize.test.ts` | Unit tests for resize math + commit/cancel |
| `packages/react/src/useResizeHandle.ts` | React adapter hook that wires DOM events to the prop getter |
| `packages/react/src/useResizeHandle.test.tsx` | Tests for the hook's event handling (synthetic pointer events + keyboard) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/headers.ts` | Add `header.getResizeHandleProps()` method |
| `packages/core/src/createDataTable.ts` | Add `setResizeMode`, route announcer on resize commit |
| `packages/core/src/types.ts` | Add `columnResizeMode: 'onChange' | 'onEnd'` to `DataTableOptions`; add `resizeStepPx?: number`; append `setResizeMode`, `getResizeMode` to `DataTableInstance` |
| `packages/core/src/index.ts` | Re-export resize helpers + types |
| `packages/core/package.json` | Add `./resize` subpath export |
| `packages/react/src/index.ts` | Re-export `useResizeHandle` (optional — consumers can use the prop getter directly without the hook; the hook is a convenience) |

---

## 3. File contents

### 3.1 `packages/core/src/resize.ts`

```ts
/**
 * @lynellf/tablekit-core — resize math (M2 Phase 3).
 *
 * Spec §7.2: column resizing. The math is pure; DOM specifics
 * (pointer capture, gesture handling) live in the React adapter
 * (`useResizeHandle`).
 *
 * Two modes:
 *   - 'onChange': `columnSizing` updates on every pointer move.
 *   - 'onEnd': `columnSizing` updates only on pointer up; the live
 *     delta is held in `columnSizingInfo.delta`.
 *
 * Constraints clamp to `[column.getMinSize(), column.getMaxSize()]`.
 * The math here takes the min/max as arguments so it stays decoupled
 * from the `Column` class (which depends on `def`).
 */

import type { ColumnResizeSession, ColumnSizingState } from './types';

export const DEFAULT_RESIZE_STEP_PX = 10;

export interface ResizeColumnInput {
  columnSizing: ColumnSizingState;
  session: ColumnResizeSession;
  minSize: number;
  maxSize: number;
}

export interface ResizeColumnOutput {
  /** New columnSizing (only differs from input when the resize committed). */
  columnSizing: ColumnSizingState;
  /** True if the new size differs from the start size (a commit happened). */
  changed: boolean;
}

/**
 * Apply the resize session's delta to the column's size, clamping to
 * [minSize, maxSize]. Returns the new columnSizing slice.
 */
export const resizeColumn = (input: ResizeColumnInput): ResizeColumnOutput => {
  const { columnSizing, session, minSize, maxSize } = input;
  const requested = session.startSize + session.delta;
  const clamped = Math.max(minSize, Math.min(maxSize, requested));
  if (clamped === columnSizing[session.columnId]) {
    return { columnSizing, changed: false };
  }
  return {
    columnSizing: { ...columnSizing, [session.columnId]: clamped },
    changed: clamped !== session.startSize,
  };
};

/**
 * Cancel an in-progress resize: revert columnSizing to start size.
 * Returns the new columnSizing slice (or the same reference if unchanged).
 */
export const cancelResize = (
  columnSizing: ColumnSizingState,
  session: ColumnResizeSession | null,
): ColumnSizingState => {
  if (!session) return columnSizing;
  const current = columnSizing[session.columnId];
  if (current === session.startSize) return columnSizing;
  return { ...columnSizing, [session.columnId]: session.startSize };
};

/**
 * Clamp a target width to the column's [min, max] bounds.
 * Pure utility for keyboard-driven resize where the caller computes
 * the delta.
 */
export const clampColumnSize = (
  size: number,
  minSize: number,
  maxSize: number,
): number => {
  return Math.max(minSize, Math.min(maxSize, size));
};

/**
 * Build the announcer message for a resize commit.
 * M1 hardcodes English; M6 introduces the `messages` map.
 */
export const resizeAnnouncement = (
  columnId: string,
  newWidth: number,
  columnName?: string,
): string => {
  const label = columnName ?? columnId;
  return `${label} column, ${newWidth} pixels`;
};
```

### 3.2 `packages/core/src/resize.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESIZE_STEP_PX,
  cancelResize,
  clampColumnSize,
  resizeAnnouncement,
  resizeColumn,
} from './resize';
import type { ColumnResizeSession, ColumnSizingState } from './types';

const baseSizing = (): ColumnSizingState => ({ name: 150 });

const baseSession = (overrides: Partial<ColumnResizeSession> = {}): ColumnResizeSession => ({
  columnId: 'name',
  startSize: 150,
  delta: 0,
  mode: 'onChange',
  ...overrides,
});

describe('resizeColumn', () => {
  it('applies the delta and returns new sizing', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: 50 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(200);
    expect(out.changed).toBe(true);
  });

  it('clamps to minSize', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: -500 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(30);
    expect(out.changed).toBe(true);
  });

  it('clamps to maxSize', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: 1000 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(500);
    expect(out.changed).toBe(true);
  });

  it('returns unchanged when clamping results in same size', () => {
    const out = resizeColumn({
      columnSizing: { name: 500 },
      session: baseSession({ delta: 0, startSize: 500 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.changed).toBe(false);
  });
});

describe('cancelResize', () => {
  it('reverts to start size', () => {
    const out = cancelResize(
      { name: 250 },
      baseSession({ startSize: 150, delta: 100 }),
    );
    expect(out.name).toBe(150);
  });

  it('returns input unchanged when session is null', () => {
    const sizing = baseSizing();
    expect(cancelResize(sizing, null)).toBe(sizing);
  });

  it('returns input unchanged when current equals start', () => {
    const sizing = baseSizing();
    expect(cancelResize(sizing, baseSession({ startSize: 150 }))).toBe(sizing);
  });
});

describe('clampColumnSize', () => {
  it('clamps to bounds', () => {
    expect(clampColumnSize(1000, 30, 500)).toBe(500);
    expect(clampColumnSize(10, 30, 500)).toBe(30);
    expect(clampColumnSize(100, 30, 500)).toBe(100);
  });
});

describe('resizeAnnouncement', () => {
  it('formats with column name when provided', () => {
    expect(resizeAnnouncement('name', 240, 'Name')).toBe('Name column, 240 pixels');
  });

  it('falls back to columnId when no name', () => {
    expect(resizeAnnouncement('name', 240)).toBe('name column, 240 pixels');
  });
});

describe('DEFAULT_RESIZE_STEP_PX', () => {
  it('is 10', () => {
    expect(DEFAULT_RESIZE_STEP_PX).toBe(10);
  });
});
```

### 3.3 `packages/core/src/headers.ts` (additions)

Add a `getResizeHandleProps` method to the `Header` interface + implementation:

```ts
// In `Header<TRow>`:
getResizeHandleProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;

// In `buildHeaderGroups`, add a `getResizeHandleProps` to each header:
getResizeHandleProps: (consumerProps?: Record<string, unknown>) =>
  defaultResizeHandleProps<TRow>(col, ctx, consumerProps),
```

Implementation:

```ts
const defaultResizeHandleProps = <TRow>(
  col: Column<TRow, unknown>,
  ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  if (!col.getCanResize()) {
    return mergeProps({ 'aria-hidden': true, tabIndex: -1 }, consumerProps);
  }
  const minSize = col.getMinSize();
  const maxSize = col.getMaxSize();
  const currentSize = col.getSize();

  const onPointerDown = (event: PointerEvent | React.PointerEvent) => {
    // PointerEvent is a DOM type; React's PointerEvent extends it. The
    // adapter normalizes this; core treats it as a generic event shape.
    const native = event as PointerEvent;
    const instance = ctx.instance as unknown as DataTableInstanceLike;
    instance.startResize?.(col.id, currentSize, native.clientX);
  };

  const onKeyDown = (event: KeyboardEvent | React.KeyboardEvent) => {
    const native = event as KeyboardEvent;
    if (native.defaultPrevented) return;
    const instance = ctx.instance as unknown as DataTableInstanceLike;
    const step = native.shiftKey ? 1 : DEFAULT_RESIZE_STEP_PX;
    if (native.key === 'ArrowLeft') {
      instance.adjustResize?.(col.id, -step);
      native.preventDefault();
    } else if (native.key === 'ArrowRight') {
      instance.adjustResize?.(col.id, step);
      native.preventDefault();
    } else if (native.key === 'Enter') {
      instance.commitResize?.(col.id);
    } else if (native.key === 'Escape') {
      instance.cancelResize?.(col.id);
      native.preventDefault();
    }
  };

  return mergeProps(
    {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': currentSize,
      'aria-valuemin': minSize,
      'aria-valuemax': maxSize,
      'aria-controls': col.id,
      'aria-label': `Resize column ${col.id}`,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    },
    consumerProps,
  );
};
```

The `DataTableInstanceLike` type is a narrow interface the headers module imports to avoid coupling to the full `DataTableInstance`:

```ts
// New file: packages/core/src/headers/instanceLike.ts (or inline at top of headers.ts)
interface DataTableInstanceLike {
  startResize?: (columnId: string, startSize: number, clientX: number) => void;
  adjustResize?: (columnId: string, deltaPx: number) => void;
  commitResize?: (columnId: string) => void;
  cancelResize?: (columnId: string) => void;
}
```

The `HeaderContext.instance` type is widened to include these methods. `createDataTable.getHeaderContext()` provides them.

`Column.getCanResize()` is a new method (M0/M1 did not add it; phase 3 adds it):

```ts
// In Column class:
getCanResize(): boolean {
  return this.def.enableResizing !== false; // default true
}
```

### 3.4 `packages/core/src/createDataTable.ts` (additions)

Add resize-mode state and methods:

```ts
class DataTable<TRow> implements DataTableInstance<TRow> {
  // ... existing fields ...
  private resizeMode: 'onChange' | 'onEnd' = 'onChange';

  setResizeMode(mode: 'onChange' | 'onEnd'): void {
    this.resizeMode = mode;
  }
  getResizeMode(): 'onChange' | 'onEnd' {
    return this.resizeMode;
  }

  // ─── Resize interaction (M2) ──────────────────────────────────────────────
  startResize = (columnId: string, startSize: number, clientX: number): void => {
    this.applyChange('columnSizingInfo', {
      columnId,
      startSize,
      delta: 0,
      mode: this.resizeMode,
    });
  };

  /**
   * Adjust the in-progress resize by a pixel delta. Routes through
   * `columnSizingInfo` (transient) and, in 'onChange' mode, `columnSizing`.
   */
  adjustResize = (columnId: string, deltaPx: number): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    this.applyChange('columnSizingInfo', { ...session, delta: deltaPx });
    if (this.resizeMode === 'onChange') {
      // Apply the new size to columnSizing via the pure helper.
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (!col) return;
      const out = resizeColumn({
        columnSizing: this.state.columnSizing,
        session: { ...session, delta: deltaPx },
        minSize: col.getMinSize(),
        maxSize: col.getMaxSize(),
      });
      this.applyChange('columnSizing', out.columnSizing);
    }
  };

  /**
   * Commit the in-progress resize. In 'onEnd' mode, applies the new
   * size to columnSizing; in 'onChange' mode, the size is already applied.
   */
  commitResize = (columnId: string): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    if (this.resizeMode === 'onEnd') {
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (!col) return;
      const out = resizeColumn({
        columnSizing: this.state.columnSizing,
        session,
        minSize: col.getMinSize(),
        maxSize: col.getMaxSize(),
      });
      this.applyChange('columnSizing', out.columnSizing);
      this.announce(resizeAnnouncement(col.id, out.columnSizing[col.id] ?? session.startSize, col.id));
    } else {
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (col) {
        this.announce(
          resizeAnnouncement(
            col.id,
            this.state.columnSizing[col.id] ?? session.startSize,
            col.id,
          ),
        );
      }
    }
    this.applyChange('columnSizingInfo', null);
  };

  cancelResize = (columnId: string): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    const reverted = cancelResize(this.state.columnSizing, session);
    this.applyChange('columnSizing', reverted);
    this.applyChange('columnSizingInfo', null);
  };
}
```

The `getHeaderContext()` instance methods are extended:

```ts
private getHeaderContext(): HeaderContext<TRow> {
  return {
    instance: {
      // ... existing methods ...
      startResize: this.startResize,
      adjustResize: this.adjustResize,
      commitResize: this.commitResize,
      cancelResize: this.cancelResize,
    },
  };
}
```

### 3.5 `packages/core/src/types.ts` (additions)

Append to `DataTableOptions`:

```ts
columnResizeMode?: 'onChange' | 'onEnd';
resizeStepPx?: number;
```

Append to `DataTableInstance`:

```ts
// ─── Resize mode + interaction (M2) ────────────────────────────────────────
setResizeMode(mode: 'onChange' | 'onEnd'): void;
getResizeMode(): 'onChange' | 'onEnd';
```

### 3.6 `packages/core/src/index.ts` (additions)

```ts
// ─── Resize helpers (M2 Phase 3) ───────────────────────────────────────────
export {
  DEFAULT_RESIZE_STEP_PX,
  resizeColumn,
  cancelResize,
  clampColumnSize,
  resizeAnnouncement,
} from './resize';
```

Add `resize` subpath:

```json
// packages/core/package.json exports:
"./resize": {
  "types": "./dist/resize.d.ts",
  "import": "./dist/resize.es.js"
}
```

Update `vite.subpaths.config.ts`:

```ts
const entries: Record<string, string> = {
  // ... existing ...
  resize: 'src/resize.ts',
};
```

### 3.7 `packages/react/src/useResizeHandle.ts`

```ts
/**
 * @lynellf/tablekit-react — useResizeHandle hook.
 *
 * Spec §7.2: pointer-capture-based resize gesture. This hook wires
 * the native DOM events (pointermove + pointerup + pointercancel)
 * to the instance's resize dispatchers. Consumers using
 * `header.getResizeHandleProps()` directly do not need this hook
 * for keyboard, but do need it for pointer gestures because React's
 * pointer events don't include native setPointerCapture on every
 * target.
 *
 * Usage:
 *   const bind = useResizeHandle(instance);
 *   <div {...header.getResizeHandleProps(bind)} />
 *
 * The hook returns an object whose keys are merged into the prop
 * getter (via mergeProps).
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import { useCallback, useRef } from 'react';

export const useResizeHandle = <TRow>(instance: DataTableInstance<TRow>) => {
  const activeRef = useRef<{ columnId: string; startClientX: number; startSize: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const native = event.nativeEvent;
      // Find the column id from the closest columnheader ancestor.
      const headerEl = (event.currentTarget as HTMLElement).closest('[role="columnheader"]');
      const columnId = headerEl?.getAttribute('data-column-id');
      if (!columnId) return;
      const startSizeAttr = headerEl?.getAttribute('aria-valuenow');
      const startSize = startSizeAttr ? Number.parseInt(startSizeAttr, 10) : 150;
      activeRef.current = { columnId, startClientX: native.clientX, startSize };
      (event.currentTarget as HTMLElement).setPointerCapture(native.pointerId);
      // Tell the instance to begin a resize session.
      (instance as unknown as {
        startResize: (id: string, size: number, x: number) => void;
      }).startResize(columnId, startSize, native.clientX);
    },
    [instance],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      const native = event.nativeEvent;
      const deltaPx = native.clientX - active.startClientX;
      (instance as unknown as {
        adjustResize: (id: string, deltaPx: number) => void;
      }).adjustResize(active.columnId, deltaPx);
    },
    [instance],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      (event.currentTarget as HTMLElement).releasePointerCapture(event.nativeEvent.pointerId);
      (instance as unknown as {
        commitResize: (id: string) => void;
      }).commitResize(active.columnId);
      activeRef.current = null;
    },
    [instance],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      (event.currentTarget as HTMLElement).releasePointerCapture(event.nativeEvent.pointerId);
      (instance as unknown as {
        cancelResize: (id: string) => void;
      }).cancelResize(active.columnId);
      activeRef.current = null;
    },
    [instance],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    'data-resizing': 'false',
  } as const;
};
```

### 3.8 `packages/react/src/useResizeHandle.test.tsx`

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import { useResizeHandle } from './useResizeHandle';

describe('useResizeHandle', () => {
  it('starts a resize session on pointerdown', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const startResize = vi.spyOn(instance as unknown as { startResize: typeof Function }, 'startResize');

    const Probe = () => {
      const bind = useResizeHandle(instance);
      return (
        <div role="columnheader" data-column-id="a" aria-valuenow="150">
          <div data-testid="handle" {...bind}>
            handle
          </div>
        </div>
      );
    };

    const { getByTestId } = render(<Probe />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, { clientX: 100 });
    expect(startResize).toHaveBeenCalledWith('a', 150, 100);
  });

  it('adjusts the resize on pointermove', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const adjustResize = vi.spyOn(
      instance as unknown as { adjustResize: typeof Function },
      'adjustResize',
    );

    const Probe = () => {
      const bind = useResizeHandle(instance);
      return (
        <div role="columnheader" data-column-id="a" aria-valuenow="150">
          <div data-testid="handle" {...bind}>
            handle
          </div>
        </div>
      );
    };

    const { getByTestId } = render(<Probe />);
    const handle = getByTestId('handle');

    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(handle, { clientX: 150 });
    expect(adjustResize).toHaveBeenCalledWith('a', 50);
  });

  it('commits the resize on pointerup', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const commitResize = vi.spyOn(
      instance as unknown as { commitResize: typeof Function },
      'commitResize',
    );

    const Probe = () => {
      const bind = useResizeHandle(instance);
      return (
        <div role="columnheader" data-column-id="a" aria-valuenow="150">
          <div data-testid="handle" {...bind}>
            handle
          </div>
        </div>
      );
    };

    const { getByTestId } = render(<Probe />);
    fireEvent.pointerDown(getByTestId('handle'), { clientX: 100 });
    fireEvent.pointerUp(getByTestId('handle'), {});
    expect(commitResize).toHaveBeenCalledWith('a');
  });
});
```

### 3.9 `packages/react/src/index.ts` (additions)

```ts
// ─── Resize hook (M2 Phase 3) ──────────────────────────────────────────────
export { useResizeHandle } from './useResizeHandle';
```

---

## 4. Commands

```bash
pnpm --filter @lynellf/tablekit-core test -- resize
pnpm --filter @lynellf/tablekit-react test -- useResizeHandle
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. Resize math tests pass
pnpm --filter @lynellf/tablekit-core test resize
# Expected: ~15 new tests pass

# 2. Header exposes getResizeHandleProps
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{ a: 1 }],
    columns: [{ id: 'a', accessor: 'a' }],
    getRowId: r => String(r.a),
  });
  const headers = t.getHeaderGroups()[0].headers;
  const props = headers[0].getResizeHandleProps();
  console.log('role:', props.role);
  console.log('aria-orientation:', props['aria-orientation']);
  console.log('aria-valuenow:', props['aria-valuenow']);
  console.log('aria-label:', props['aria-label']);
"
# Expected: role: separator, aria-orientation: vertical, aria-valuenow: 150, aria-label: Resize column a

# 3. setColumnSizing controlled mode
# (covered by existing M0 tests + new phase-3 tests)

# 4. Resize subpath bundle builds
pnpm build
ls packages/core/dist/resize.es.js
# Expected: file exists
```

---

## 6. Out-of-scope (deferred to later phases)

- **Resize handle rendered inline with the header** — phase 7 integration tests render the prescribed DOM shape (§6.2) including the resize handle. Phase 3 ships the prop getter; phase 7 verifies it in a full DOM tree.
- **Resize + column virtualization interaction** — when a pinned column is resized, downstream offsets recompute. The math is correct (`getPinnedOffset` reads `getSize()` which reads `columnSizing`). Phase 7 integration tests verify.
- **Resize + keepMounted** — when a column is being resized, its index should stay in `keepMounted` so the resize handle doesn't unmount mid-drag. Phase 4 wires `keepMounted` to the resize session.
- **Double-click to auto-fit** — spec §7.2 says "double-click reserved for future auto-fit". v2 per §15.
- **RTL resize** — v2 per §16 risk #2.
- **Touch events** — pointer events cover touch in modern browsers (Pointer Events spec). M2 doesn't add separate `touchstart`/`touchmove` handlers.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **jsdom + Pointer Events** — jsdom does not implement the Pointer Events spec fully (no `setPointerCapture`) | `useResizeHandle` tests use React's synthetic events (which jsdom handles). The real `setPointerCapture` is exercised in the Playwright suite (phase 7). |
| **`aria-valuenow` initial value** — at first render, before any resize, the handle emits the current `columnSizing[id] ?? def.size ?? 150`. | Correct per spec §7.2: `aria-valuenow` reflects the current size. Tests verify. |
| **Pinned column resize recomputation** — `getPinnedOffset` is a function called per-render; it always reads the current state | Correct by construction. Phase 7 integration tests verify that resizing a pinned column re-renders downstream offsets. |
| **`columnResizeMode: 'onEnd'` + render perf** — the column doesn't resize visually until pointerup | The `columnSizingInfo.delta` is exposed so consumers can render a visual indicator (ghost handle) during the drag. M2 does not provide a default ghost; consumers can read `state.columnSizingInfo` and render their own. |
| **Bundle size** — resize math + hook add ~0.5 kB core + ~0.5 kB react gzip | Tree-shakeable subpath for math. Hook import is optional (consumers can call `instance.startResize` directly without the hook for keyboard-only resize). |
| **`Column.getCanResize` default** — spec §4.4 doesn't specify the default; phase 3 chooses `enableResizing !== false` (default true) | Documented in the README. Consumers can opt out per-column via `enableResizing: false`. |
| **Header `aria-valuenow` not updating during 'onEnd' drag** — consumers can't read the live size | The `columnSizingInfo` slice exposes `delta` + `startSize`; consumers compute the live size as `startSize + delta`. M2 documents this. |
