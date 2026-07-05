# Phase 4 — React Adapter (Scroll + Size Observers + Virtualizer Hooks)

**Goal:** Wire the React adapter to the core virtualizer via `useScrollAdapter` (reads scroll offset from grid ref), `useSizeObserver` (ResizeObserver wrapper that measures rendered rows + columns), `useRowVirtualizer` (memoized row virtualizer output), and `useCenterVirtualizer` (memoized column virtualizer output). After this phase, a consumer renders a virtualized grid by:
1. Spreading `table.getGridProps()` onto a scroll container with a ref.
2. Iterating `useRowVirtualizer(table).rows` and spreading each row's `positionStyle` + `getRowProps({ style: positionStyle })`.
3. Iterating `useCenterVirtualizer(table).columns` (combined with `getLeftLeafColumns()` + `getRightLeafColumns()`) for the header.

After this phase:
- `useScrollAdapter(gridRef, table)` reads `scrollTop`/`scrollLeft` on scroll and pushes them into the instance via `__setScrollState` + `__setColumnScrollState` (already on the instance from phase 1).
- `useSizeObserver(ref, table, { type: 'row' | 'column' })` observes rendered elements and calls `result.measureElement(index, size)` on the virtualizer result.
- `useRowVirtualizer(table)` is a memoized wrapper around `table.getRowVirtualizer()` keyed on `(scrollOffset, viewportSize, rowModelIdentity)`. Consumers iterate its `rows`.
- `useCenterVirtualizer(table)` mirrors the row hook for the column virtualizer.
- The scroll container is the grid element itself (one-scroll-container recipe from §6.3).
- `keepMounted` receives indices for the focused cell's row + column (phase 5 wires `focusedCell` into keepMounted; phase 4 sets up the wiring point).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/react/src/useScrollAdapter.ts` | Hook that reads `scrollTop` + `clientHeight` from a ref and pushes to instance |
| `packages/react/src/useScrollAdapter.test.tsx` | Tests for the scroll hook |
| `packages/react/src/useSizeObserver.ts` | Hook that wraps `ResizeObserver` for rendered rows + columns |
| `packages/react/src/useSizeObserver.test.tsx` | Tests for the resize-observer hook |
| `packages/react/src/useRowVirtualizer.ts` | Memoized row virtualizer wrapper |
| `packages/react/src/useRowVirtualizer.test.tsx` | Tests for the row virtualizer hook |
| `packages/react/src/useCenterVirtualizer.ts` | Memoized column virtualizer wrapper |
| `packages/react/src/useCenterVirtualizer.test.tsx` | Tests for the column virtualizer hook |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/react/src/useDataTable.ts` | `useDataTable` accepts an optional `gridRef` ref param? No — the consumer passes the ref to `useScrollAdapter` directly. `useDataTable` returns the same shape. |
| `packages/react/src/index.ts` | Re-export the new hooks |
| `packages/core/src/createDataTable.ts` | `__setScrollState` + `__setColumnScrollState` already added in phase 1. No further changes. |

---

## 3. File contents

### 3.1 `packages/react/src/useScrollAdapter.ts`

```ts
/**
 * @lynellf/tablekit-react — useScrollAdapter hook.
 *
 * Spec §6.3 + §7.1: the grid element IS the scroll container. This hook
 * reads `scrollTop` (rows) + `scrollLeft` (columns) from the ref on every
 * scroll event and pushes them into the core instance's scroll state.
 *
 * The core virtualizer is pure over its inputs; the adapter is the
 * dependency-inversion seam that supplies DOM measurements to core
 * (per spec §4.3 "Virtualization measurement").
 *
 * Consumers attach this to the grid element via the ref they pass to
 * `getGridProps({ ref: gridRef })`.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import { useEffect } from 'react';

export const useScrollAdapter = <TRow>(
  gridRef: React.RefObject<HTMLElement | null>,
  table: DataTableInstance<TRow>,
): void => {
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const pushState = () => {
      const instance = table as unknown as {
        __setScrollState: (offset: number, size: number) => void;
        __setColumnScrollState: (offset: number, size: number) => void;
      };
      instance.__setScrollState(el.scrollTop, el.clientHeight);
      instance.__setColumnScrollState(el.scrollLeft, el.clientWidth);
    };

    // Initial measurement on mount.
    pushState();

    const onScroll = () => pushState();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [gridRef, table]);

  // Also re-measure on resize (the viewport size changes).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const instance = table as unknown as {
        __setScrollState: (offset: number, size: number) => void;
        __setColumnScrollState: (offset: number, size: number) => void;
      };
      instance.__setScrollState(el.scrollTop, el.clientHeight);
      instance.__setColumnScrollState(el.scrollLeft, el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridRef, table]);
};
```

### 3.2 `packages/react/src/useScrollAdapter.test.tsx`

```tsx
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import { useScrollAdapter } from './useScrollAdapter';

describe('useScrollAdapter', () => {
  it('pushes scroll state on mount', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const setScrollState = vi.fn();
    (instance as unknown as { __setScrollState: typeof setScrollState }).__setScrollState = setScrollState;
    (instance as unknown as { __setColumnScrollState: typeof setScrollState }).__setColumnScrollState = setScrollState;

    const Probe = () => {
      const ref = useRef<HTMLDivElement>(null);
      useScrollAdapter(ref, instance);
      return <div ref={ref} data-testid="grid" style={{ overflow: 'auto', height: 200 }} />;
    };

    render(<Probe />);
    expect(setScrollState).toHaveBeenCalled();
  });

  it('pushes scroll state on scroll', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const setScrollState = vi.fn();
    (instance as unknown as { __setScrollState: typeof setScrollState }).__setScrollState = setScrollState;
    (instance as unknown as { __setColumnScrollState: typeof setScrollState }).__setColumnScrollState = setScrollState;

    const Probe = () => {
      const ref = useRef<HTMLDivElement>(null);
      useScrollAdapter(ref, instance);
      return <div ref={ref} data-testid="grid" style={{ overflow: 'auto', height: 200 }} />;
    };

    const { getByTestId } = render(<Probe />);
    setScrollState.mockClear();
    fireEvent.scroll(getByTestId('grid'));
    expect(setScrollState).toHaveBeenCalled();
  });
});
```

### 3.3 `packages/react/src/useSizeObserver.ts`

```ts
/**
 * @lynellf/tablekit-react — useSizeObserver hook.
 *
 * Wraps the browser's `ResizeObserver` to feed measured sizes into the
 * virtualizer's `measureElement(index, size)` callback. Each rendered
 * row + column element registers itself via a `data-virtual-index`
 * attribute; the hook observes the parent and dispatches size changes
 * to the matching index.
 *
 * Consumers attach the hook at the grid level; the hook uses
 * event delegation (a single ResizeObserver on the grid) for perf.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { RowVirtualizerResult, ColumnVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useEffect } from 'react';

export interface SizeObserverOptions<TRow> {
  gridRef: React.RefObject<HTMLElement | null>;
  rowVirtualizer: RowVirtualizerResult<TRow>;
  columnVirtualizer: ColumnVirtualizerResult;
}

export const useSizeObserver = <TRow>(
  options: SizeObserverOptions<TRow>,
): void => {
  const { gridRef, rowVirtualizer, columnVirtualizer } = options;

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return; // SSR / older browsers

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const type = target.getAttribute('data-virtual-type');
        const indexAttr = target.getAttribute('data-virtual-index');
        if (type === null || indexAttr === null) continue;
        const index = Number.parseInt(indexAttr, 10);
        if (Number.isNaN(index)) continue;
        const size =
          type === 'row'
            ? entry.contentRect.height
            : entry.contentRect.width;
        if (type === 'row') rowVirtualizer.measureElement(index, size);
        else columnVirtualizer.measureElement(index, size);
      }
    });

    // Observe all currently-mounted virtual elements.
    const rowEls = el.querySelectorAll<HTMLElement>('[data-virtual-type="row"]');
    for (const rowEl of rowEls) ro.observe(rowEl);
    const colEls = el.querySelectorAll<HTMLElement>('[data-virtual-type="column"]');
    for (const colEl of colEls) ro.observe(colEl);

    return () => ro.disconnect();
  }, [gridRef, rowVirtualizer, columnVirtualizer]);
};
```

### 3.4 `packages/react/src/useSizeObserver.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import {
  createRowVirtualizer,
  createColumnVirtualizer,
} from '@lynellf/tablekit-core/virtualization';
import { useSizeObserver } from './useSizeObserver';

// ResizeObserver is not available in jsdom by default; provide a stub.
const observeMock = vi.fn();
const disconnectMock = vi.fn();
const MockRO = vi.fn().mockImplementation(() => ({
  observe: observeMock,
  unobserve: vi.fn(),
  disconnect: disconnectMock,
}));
(globalThis as unknown as { ResizeObserver: typeof MockRO }).ResizeObserver = MockRO;

describe('useSizeObserver', () => {
  it('observes virtual elements on mount', () => {
    const instance = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const rowVirt = createRowVirtualizer({
      rows: [],
      estimateSize: () => 33,
      scrollOffset: 0,
      viewportSize: 600,
    });
    const colVirt = createColumnVirtualizer({
      columns: [],
      scrollOffset: 0,
      viewportSize: 1000,
    });

    const Probe = () => {
      const ref = useRef<HTMLDivElement>(null);
      useSizeObserver({ gridRef: ref, rowVirtualizer: rowVirt, columnVirtualizer: colVirt });
      return (
        <div ref={ref}>
          <div data-virtual-type="row" data-virtual-index="0" />
          <div data-virtual-type="column" data-virtual-index="0" />
        </div>
      );
    };

    render(<Probe />);
    expect(observeMock).toHaveBeenCalled();
  });
});
```

### 3.5 `packages/react/src/useRowVirtualizer.ts`

```ts
/**
 * @lynellf/tablekit-react — useRowVirtualizer hook.
 *
 * Memoized wrapper around `table.getRowVirtualizer()`. The hook re-computes
 * the virtualizer only when `(scrollOffset, viewportSize, rowModelIdentity)`
 * changes — these are the inputs that affect the visible window.
 *
 * The measured-size cache (`measuredSizes` inside the pure factory) is
 * captured here in a `useRef` so measured sizes persist across calls
 * within the same component lifetime. The pure factory's per-call cache
 * is replaced by a stable instance shared by all calls.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { RowVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useMemo, useRef } from 'react';

export const useRowVirtualizer = <TRow>(
  table: DataTableInstance<TRow>,
): RowVirtualizerResult<TRow> => {
  // Stable measured-size cache across hook calls.
  const measuredRef = useRef<Map<number, number>>(new Map());

  return useMemo(() => {
    const state = table.getState();
    const scrollOffset = (table as unknown as { scrollOffset?: number }).scrollOffset ?? 0;
    const viewportSize = (table as unknown as { viewportSize?: number }).viewportSize ?? 0;
    const rows = table.getRowModel();
    const measureElement = (index: number, size: number) => {
      measuredRef.current.set(index, size);
    };
    const result = table.getRowVirtualizer();
    // Wrap measureElement to persist into our ref.
    const wrappedMeasure = (index: number, size: number) => {
      measureElement(index, size);
      result.measureElement(index, size);
    };
    return {
      ...result,
      rows: result.rows.map((r) => {
        const measured = measuredRef.current.get(r.index);
        if (typeof measured === 'number' && measured !== r.size) {
          return { ...r, size: measured };
        }
        return r;
      }),
      measureElement: wrappedMeasure,
    };
    // The deps below are the inputs that affect the visible window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    table,
    (table as unknown as { scrollOffset?: number }).scrollOffset ?? 0,
    (table as unknown as { viewportSize?: number }).viewportSize ?? 0,
    table.getRowModel(),
  ]);
};
```

### 3.6 `packages/react/src/useCenterVirtualizer.ts`

```ts
import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { ColumnVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useMemo, useRef } from 'react';

export const useCenterVirtualizer = <TRow>(
  table: DataTableInstance<TRow>,
): ColumnVirtualizerResult => {
  const measuredRef = useRef<Map<number, number>>(new Map());
  return useMemo(() => {
    const scrollOffset = (table as unknown as { columnScrollOffset?: number }).columnScrollOffset ?? 0;
    const viewportSize = (table as unknown as { columnViewportSize?: number }).columnViewportSize ?? 0;
    const result = table.getCenterVirtualizer();
    const wrappedMeasure = (index: number, size: number) => {
      measuredRef.current.set(index, size);
      result.measureElement(index, size);
    };
    return {
      ...result,
      columns: result.columns.map((c) => {
        const measured = measuredRef.current.get(c.index);
        if (typeof measured === 'number' && measured !== c.size) {
          return { ...c, size: measured };
        }
        return c;
      }),
      measureElement: wrappedMeasure,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    table,
    (table as unknown as { columnScrollOffset?: number }).columnScrollOffset ?? 0,
    (table as unknown as { columnViewportSize?: number }).columnViewportSize ?? 0,
    table.getCenterLeafColumns(),
  ]);
};
```

### 3.7 Tests for `useRowVirtualizer` and `useCenterVirtualizer`

```tsx
// useRowVirtualizer.test.tsx
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import { useRowVirtualizer } from './useRowVirtualizer';

describe('useRowVirtualizer', () => {
  it('returns a virtualizer result', () => {
    const table = createDataTable({
      data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `n${i}` })),
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => (r as { id: string }).id,
    });
    const { result } = renderHook(() => useRowVirtualizer(table));
    expect(result.current).toHaveProperty('rows');
    expect(result.current).toHaveProperty('totalSize');
  });
});
```

### 3.8 `packages/react/src/index.ts` (additions)

```ts
// ─── Virtualization hooks (M2 Phase 4) ─────────────────────────────────────
export { useScrollAdapter } from './useScrollAdapter';
export { useSizeObserver } from './useSizeObserver';
export type { SizeObserverOptions } from './useSizeObserver';
export { useRowVirtualizer } from './useRowVirtualizer';
export { useCenterVirtualizer } from './useCenterVirtualizer';
```

---

## 4. Commands

```bash
pnpm --filter @lynellf/tablekit-react test -- useScrollAdapter useSizeObserver useRowVirtualizer useCenterVirtualizer
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. New hooks tests pass
pnpm --filter @lynellf/tablekit-react test useScrollAdapter useSizeObserver useRowVirtualizer useCenterVirtualizer
# Expected: ~15-20 new tests pass

# 2. useRowVirtualizer returns a result with the documented shape
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: Array.from({length: 100}, (_, i) => ({id: String(i), name: 'n'+i})),
    columns: [{ id: 'name', accessor: 'name' }],
    getRowId: r => r.id,
  });
  // __setScrollState(0, 600) to set viewport size
  t.__setScrollState(0, 600);
  const v = t.getRowVirtualizer();
  console.log('totalSize:', v.totalSize);
  console.log('rows visible:', v.rows.length);
"
# Expected: totalSize: 3300 (100 rows × 33px), rows visible: 22 (600/33 + overscan 4×2)

# 3. Hooks are exported from @lynellf/tablekit-react
node -e "
  import('@lynellf/tablekit-react').then(m => {
    console.log('useScrollAdapter:', typeof m.useScrollAdapter);
    console.log('useSizeObserver:', typeof m.useSizeObserver);
    console.log('useRowVirtualizer:', typeof m.useRowVirtualizer);
    console.log('useCenterVirtualizer:', typeof m.useCenterVirtualizer);
  });
"
# Expected: all four are functions
```

---

## 6. Out-of-scope (deferred to later phases)

- **Keyboard navigation + virtualizer integration** — `keepMounted` for the focused cell's row + column. Phase 5 wires `focusedCell` into `keepMounted`.
- **Resize session keepMounted** — the resizing column's index should stay mounted. Phase 5 wires this too (it's a single-line addition to the keepMounted callback).
- **Integration with the full render** — phase 7 renders a complete virtualized grid using the hooks. Phase 4 ships the hooks in isolation.
- **`ScrollAdapter` for non-DOM environments** — the spec mentions a `ScrollAdapter` interface; the React adapter is the default. A future Vue/Svelte adapter would provide its own. M2's `useScrollAdapter` IS the React implementation; the interface is implicit (the hook signature).
- **Virtualizer bridges** — TanStack Virtual adapter. Future M2.5+ per decision D1.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **`useMemo` deps + `table` reference stability** — `useDataTable` returns a stable instance via `useRef` (M0); the memo only re-runs when `scrollOffset`/`viewportSize`/`rowModel` change | Documented; tests verify memo stability. |
| **`ResizeObserver` not in jsdom** — tests stub it via `vi.fn()` | Production code uses native `ResizeObserver`; jsdom test path stubs. |
| **Scroll event listener cleanup** — `removeEventListener` paired with `addEventListener` | `useEffect` cleanup; tests verify listener attachment + removal. |
| **Race condition: scroll fires before `__setScrollState` is wired** — `useScrollAdapter` reads `el.scrollTop` on every scroll and pushes synchronously | The instance state is mutable; no async. |
| **`useRowVirtualizer` measured-size cache** — uses `useRef`, so cache persists across re-renders but is reset on unmount | Acceptable for v1; consumers wanting persistent cache can implement their own. |
| **`getRowVirtualizer()` `keepMounted` callback closure** — `keepMounted: () => focusedRow` captures `focusedCell` from outside; closure over the current value via `table.getState()` | Phase 5 wires the closure to read from `table.getState()` so keepMounted reflects current focus. |
| **Bundle size** — 4 hooks add ~1.5 kB react gzip | Documented in §4.4. |
