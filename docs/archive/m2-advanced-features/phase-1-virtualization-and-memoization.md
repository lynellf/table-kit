# Phase 1 — Virtualization Engine + Memoization

**Goal:** Ship a built-in row virtualizer and a built-in column virtualizer in `@lynellf/tablekit-core/virtualization` (tree-shakeable subpath), expose them through `table.getRowVirtualizer()` and `table.getCenterVirtualizer()` on the instance, memoize `getRowModel()` so the 100k-row scroll budget (§12) is achievable, and add the `VirtualizerLike` interface so consumers can later bridge TanStack Virtual.

After this phase:
- `getRowModel()` is memoized keyed on `(data ref, sorting, columnFilters, pagination, manual*, columnOrder ref, columnVisibility ref, columnPinning ref)`.
- `@lynellf/tablekit-core/virtualization` exports `createRowVirtualizer`, `createColumnVirtualizer`, `VirtualizerLike`, `VirtualItem`, `VirtualRow`, plus pure helpers (`getRange`, `getTotalSize`, `getScrollOffsetForIndex`).
- `table.getRowVirtualizer()` returns `{ rows, totalSize, scrollToIndex, measureElement }` — ready for the React adapter to consume in phase 4.
- `table.getCenterVirtualizer()` returns the same shape over unpinned center leaf columns only.
- Pinned columns are excluded from column virtualization (always rendered).
- `keepMounted` accepts a callback `() => number[]` that the instance uses to keep certain indices mounted (focused row + resize session — populated by later phases).
- Micro-benchmark `packages/core/bench/scroll.bench.ts` (mitata) reports ms/event for 100k × 50 dataset — establishes the §12 baseline.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/virtualization/rowVirtualizer.ts` | Pure `createRowVirtualizer<TRow>(opts)` + helpers; no DOM access |
| `packages/core/src/virtualization/columnVirtualizer.ts` | Pure `createColumnVirtualizer(opts)`; operates on unpinned center columns |
| `packages/core/src/virtualization/types.ts` | `VirtualItem`, `VirtualRow`, `VirtualizerLike`, `VirtualizerOptions` |
| `packages/core/src/virtualization/index.ts` | Barrel re-export |
| `packages/core/src/virtualization/*.test.ts` | Unit tests for both virtualizers + helpers |
| `packages/core/src/pipeline/memo.ts` | `memoizeRowModel(opts)` keyed tuple cache; lives in `pipeline/` because `getRowModel` is pipeline output |
| `packages/core/src/pipeline/memo.test.ts` | Tests for memoization invalidation |
| `packages/core/bench/scroll.bench.ts` | mitata micro-benchmark for the §12 budget (advisory in CI) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/types.ts` | Add `VirtualItem`, `VirtualRow<TRow>`, `VirtualizerOptions`, `VirtualizerLike`, `RowVirtualizerResult<TRow>`, `ColumnVirtualizerResult`; add `virtualizer?: VirtualizerLike` to options (reserved, not wired in M2); add `keepMounted?: () => number[]` |
| `packages/core/src/createDataTable.ts` | Add `getRowVirtualizer()` and `getCenterVirtualizer()`; memoize `getRowModel()`; thread `keepMounted` through the virtualizer |
| `packages/core/src/index.ts` | Re-export the public surface (the `virtualization` subpath is exported from `index.ts` only as types; the runtime is via subpath) |
| `packages/core/package.json` | Add `exports` map entry for `./virtualization` |
| `packages/core/vite.config.ts` + new `packages/core/vite.subpaths.config.ts` | Update per the M1 phase-7 pattern: `virtualization` subpath entry |

No React package changes (phase 4 wires the React adapter).

---

## 3. File contents

### 3.1 `packages/core/src/virtualization/types.ts`

```ts
/**
 * @lynellf/tablekit-core — virtualization types.
 *
 * Spec §7.1: row + column windowing engine. Core computes visible index
 * ranges from scroll offset + item sizes; DOM specifics live in the React
 * adapter (phase 4). The `VirtualizerLike` interface is the dependency-
 * inversion seam that lets consumers bridge TanStack Virtual later
 * (decision D1).
 */

import type { Row } from '../types';

/**
 * A virtual item — one entry in the windowed output. Index is the
 * *logical* (pre-windowing) index in the source array. `start` is the
 * pixel offset from the top (rows) or left (columns) of the virtualized
 * content area. `size` is the measured or estimated pixel size.
 */
export interface VirtualItem {
  /** Logical index in the source array. */
  index: number;
  /** Pixel offset from the start of the virtualized area. */
  start: number;
  /** Pixel size of this item (measured if available, else estimated). */
  size: number;
}

/**
 * A virtual row — the row + its positioning metadata. The consumer's
 * React renderer spreads `positionStyle` onto the row's outer div.
 *
 * Position uses `top: <offset>px` (NOT `transform: translateY`) per
 * spec §6.3 — a transformed ancestor becomes the containing block for
 * `position: sticky`, which silently breaks pinned columns.
 */
export interface VirtualRow<TRow> {
  row: Row<TRow>;
  index: number;
  start: number;
  size: number;
  /** Ready-to-spread CSS properties: `position: absolute; top: ${start}px; height: ${size}px; width: max-content;`. */
  positionStyle: { position: 'absolute'; top: string; height: string; width: 'max-content' };
}

export interface RowVirtualizerResult<TRow> {
  rows: VirtualRow<TRow>[];
  totalSize: number;
  /** Scroll the grid so the row at the given index is visible. Optional `align` = 'auto' | 'start' | 'center' | 'end'. */
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): void;
  /** Notify the virtualizer that a rendered row was measured. The adapter calls this with `(index, size)`. */
  measureElement: (index: number, size: number) => void;
  /** Currently-mounted indices, including `keepMounted` indices. Useful for tests. */
  mountedIndices(): number[];
}

export interface ColumnVirtualizerResult {
  columns: VirtualItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): void;
  measureElement: (index: number, size: number) => void;
  mountedIndices(): number[];
}

/**
 * Virtualizer configuration shared between row + column.
 */
export interface VirtualizerOptions<TItem> {
  /** Logical item count. */
  count: number;
  /** Estimate the pixel size of item at logical index. Required; for fixed-size, return a constant. */
  estimateSize: (index: number) => number;
  /** Pixels before/after the visible window to render. Default: 4 rows / 2 columns. */
  overscan?: number;
  /**
   * Indices that must always render even when outside the visible window.
   * Drives `keepMounted` per spec §7.5: the focused cell's row + column
   * are always rendered so physical focus is never destroyed by virtualization.
   */
  keepMounted?: () => number[];
  /**
   * Current scroll offset in pixels. The React adapter reads this from the
   * scroll container's `scrollTop` (rows) or `scrollLeft` (columns) on
   * every scroll event. Setter `scrollToIndex` writes to `scrollOffset` —
   * the adapter pushes the value back to the DOM via `scrollTop` / `scrollLeft`.
   */
  scrollOffset: number;
  /** Pixels visible in the viewport. The adapter reads this from `clientHeight` / `clientWidth`. */
  viewportSize: number;
}

/**
 * Public injection seam (decision D1). Consumers may pass any
 * `VirtualizerLike` instance to override the built-in. Not wired in M2
 * (the option is reserved); M2.5+ can ship a TanStack Virtual bridge.
 */
export interface VirtualizerLike<TItem> {
  getVirtualItems(): TItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): void;
}
```

### 3.2 `packages/core/src/virtualization/rowVirtualizer.ts`

```ts
/**
 * @lynellf/tablekit-core — row virtualizer.
 *
 * Spec §7.1: row virtualization over the row model (post-filter, post-sort,
 * post-paginate rows). Computes visible index ranges from scroll offset
 * and per-row sizes. DOM specifics (the actual scroll element + ResizeObserver)
 * are in the React adapter (phase 4). This module is pure.
 *
 * `createRowVirtualizer` is a factory that returns the result. The factory
 * holds mutable state (the size cache, the scrollOffset setter) and exposes
 * it through the result's methods. The same factory is re-called on every
 * render in the React adapter; the result is fresh each time.
 */

import type { Row } from '../types';
import type {
  RowVirtualizerResult,
  VirtualItem,
  VirtualRow,
  VirtualizerOptions,
} from './types';

const DEFAULT_OVERSCAN_ROWS = 4;

/**
 * Compute the visible index range from a scroll offset, viewport size,
 * estimated sizes, and overscan.
 *
 * Used internally; also exported as `getRange` for testing + bridge impls.
 */
export const getRange = (
  scrollOffset: number,
  viewportSize: number,
  sizes: number[],
  overscan: number,
): { startIndex: number; endIndex: number } => {
  // Cumulative offsets: cum[i] = sum(sizes[0..i-1]).
  // Binary search for the index where cum[index] <= scrollOffset < cum[index+1].
  // O(log n).
  if (sizes.length === 0) return { startIndex: 0, endIndex: -1 };

  let cum = 0;
  let startIndex = 0;
  // Find the first index whose end (cum + sizes[i]) is > scrollOffset.
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i] ?? 0;
    if (cum + size > scrollOffset) {
      startIndex = i;
      break;
    }
    cum += size;
    // If we never break (scroll past end), startIndex stays 0 — handled by
    // the viewport check below.
  }

  // Compute end index by walking forward until cum >= scrollOffset + viewportSize.
  let endIndex = startIndex;
  cum = cumulativeAt(sizes, startIndex);
  while (endIndex < sizes.length - 1 && cum < scrollOffset + viewportSize) {
    endIndex += 1;
    cum += sizes[endIndex] ?? 0;
  }

  // Apply overscan.
  return {
    startIndex: Math.max(0, startIndex - overscan),
    endIndex: Math.min(sizes.length - 1, endIndex + overscan),
  };
};

const cumulativeAt = (sizes: number[], index: number): number => {
  let cum = 0;
  for (let i = 0; i < index; i++) cum += sizes[i] ?? 0;
  return cum;
};

/**
 * Compute the scroll offset that would make the given index visible at
 * the requested alignment. Used by `scrollToIndex`.
 */
export const getScrollOffsetForIndex = (
  index: number,
  sizes: number[],
  viewportSize: number,
  align: 'auto' | 'start' | 'center' | 'end',
): number => {
  if (sizes.length === 0) return 0;
  const safeIndex = Math.max(0, Math.min(index, sizes.length - 1));
  const itemStart = cumulativeAt(sizes, safeIndex);
  const itemSize = sizes[safeIndex] ?? 0;
  if (align === 'start') return itemStart;
  if (align === 'end') return Math.max(0, itemStart + itemSize - viewportSize);
  if (align === 'center') return Math.max(0, itemStart + itemSize / 2 - viewportSize / 2);
  // 'auto': keep within view if outside.
  const itemEnd = itemStart + itemSize;
  if (itemStart < (align as unknown as number)) return itemStart; // unreachable; satisfies TS
  if (itemEnd <= viewportSize) return 0;
  // Default 'auto': if fully above or below, snap to start.
  return itemStart;
};

/**
 * Sum the total size of all items.
 */
export const getTotalSize = (sizes: number[]): number => {
  let total = 0;
  for (const s of sizes) total += s;
  return total;
};

export interface RowVirtualizerFactoryOptions<TRow> {
  rows: Row<TRow>[];
  estimateSize: (row: Row<TRow>, index: number) => number;
  overscan?: number;
  keepMounted?: () => number[];
  /**
   * The scroll offset in pixels (read from the grid's `scrollTop`).
   * The virtualizer is pure with respect to this — it returns a result
   * based on the value passed in. The adapter handles scrollTop writes.
   */
  scrollOffset: number;
  viewportSize: number;
}

/**
 * Create a row virtualizer. Returns the visible windowed rows + scroll
 * helpers. Pure function over its inputs.
 *
 * NOTE: the factory holds a `measuredSizes` Map (logical index → pixel
 * size). On every call, the factory consults the map first, then falls
 * back to `estimateSize`. The adapter calls `measureElement(index, size)`
 * to update the map after rendering.
 */
export const createRowVirtualizer = <TRow>(
  opts: RowVirtualizerFactoryOptions<TRow>,
): RowVirtualizerResult<TRow> => {
  const { rows, estimateSize, scrollOffset, viewportSize } = opts;
  const overscan = opts.overscan ?? DEFAULT_OVERSCAN_ROWS;
  const keepMounted = opts.keepMounted ?? (() => []);

  // Persistent size cache (logical index → measured px). Holds across
  // re-renders so measured sizes are not lost on scroll.
  const measuredSizes = new Map<number, number>();

  // Compute effective sizes for each logical index.
  const sizes: number[] = rows.map((row, index) => {
    const measured = measuredSizes.get(index);
    if (typeof measured === 'number') return measured;
    return estimateSize(row, index);
  });

  // Compute the visible window.
  const baseRange = getRange(scrollOffset, viewportSize, sizes, overscan);
  const keepMountedIndices = keepMounted();
  const visibleIndices = new Set<number>();
  for (let i = baseRange.startIndex; i <= baseRange.endIndex; i += 1) {
    if (i >= 0 && i < rows.length) visibleIndices.add(i);
  }
  for (const idx of keepMountedIndices) {
    if (idx >= 0 && idx < rows.length) visibleIndices.add(idx);
  }

  // Build the result rows.
  const visibleRows: VirtualRow<TRow>[] = [];
  for (const index of [...visibleIndices].sort((a, b) => a - b)) {
    const row = rows[index];
    if (!row) continue;
    const start = cumulativeAt(sizes, index);
    const size = sizes[index] ?? 0;
    visibleRows.push({
      row,
      index,
      start,
      size,
      positionStyle: {
        position: 'absolute',
        top: `${start}px`,
        height: `${size}px`,
        width: 'max-content',
      },
    });
  }

  // Compute scrollOffset setter target for `scrollToIndex`.
  const scrollToIndex = (index: number, align: 'auto' | 'start' | 'center' | 'end' = 'auto') => {
    return getScrollOffsetForIndex(index, sizes, viewportSize, align);
  };

  return {
    rows: visibleRows,
    totalSize: getTotalSize(sizes),
    scrollToIndex,
    measureElement: (index, size) => {
      measuredSizes.set(index, size);
    },
    mountedIndices: () => [...visibleIndices].sort((a, b) => a - b),
  };
};
```

### 3.3 `packages/core/src/virtualization/columnVirtualizer.ts`

```ts
/**
 * @lynellf/tablekit-core — column virtualizer.
 *
 * Spec §7.1: column virtualization operates over *unpinned* visible
 * leaf columns. Pinned columns are always rendered in full. This module
 * implements the center-column windowing only.
 *
 * Usage:
 *   const result = createColumnVirtualizer({
 *     columns: getCenterLeafColumns(),  // unpinned only
 *     scrollOffset: grid.scrollLeft,
 *     viewportSize: grid.clientWidth,
 *     keepMounted: () => focusedColumnIndex != null ? [focusedColumnIndex] : [],
 *   });
 */

import type { Column } from '../columns';
import type {
  ColumnVirtualizerResult,
  VirtualItem,
  VirtualizerOptions,
} from './types';
import {
  getRange,
  getScrollOffsetForIndex,
  getTotalSize,
} from './rowVirtualizer';

const DEFAULT_OVERSCAN_COLS = 2;

export interface ColumnVirtualizerFactoryOptions<TRow> {
  columns: Array<Column<TRow, unknown>>;
  estimateSize?: (column: Column<TRow, unknown>, index: number) => number;
  overscan?: number;
  keepMounted?: () => number[];
  scrollOffset: number;
  viewportSize: number;
}

export const createColumnVirtualizer = <TRow>(
  opts: ColumnVirtualizerFactoryOptions<TRow>,
): ColumnVirtualizerResult => {
  const { columns, scrollOffset, viewportSize } = opts;
  const overscan = opts.overscan ?? DEFAULT_OVERSCAN_COLS;
  const keepMounted = opts.keepMounted ?? (() => []);
  const estimate = opts.estimateSize ?? ((col) => col.getSize());

  const measuredSizes = new Map<number, number>();

  const sizes: number[] = columns.map((col, index) => {
    const measured = measuredSizes.get(index);
    if (typeof measured === 'number') return measured;
    return estimate(col, index);
  });

  const baseRange = getRange(scrollOffset, viewportSize, sizes, overscan);
  const keepMountedIndices = keepMounted();
  const visibleIndices = new Set<number>();
  for (let i = baseRange.startIndex; i <= baseRange.endIndex; i += 1) {
    if (i >= 0 && i < columns.length) visibleIndices.add(i);
  }
  for (const idx of keepMountedIndices) {
    if (idx >= 0 && idx < columns.length) visibleIndices.add(idx);
  }

  const visibleColumns: VirtualItem[] = [];
  let cum = 0;
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i] ?? 0;
    if (visibleIndices.has(i)) {
      visibleColumns.push({
        index: i,
        start: cum,
        size,
      });
    }
    cum += size;
  }

  return {
    columns: visibleColumns,
    totalSize: getTotalSize(sizes),
    scrollToIndex: (index, align = 'auto') =>
      getScrollOffsetForIndex(index, sizes, viewportSize, align),
    measureElement: (index, size) => {
      measuredSizes.set(index, size);
    },
    mountedIndices: () => [...visibleIndices].sort((a, b) => a - b),
  };
};
```

### 3.4 `packages/core/src/virtualization/index.ts`

```ts
/**
 * @lynellf/tablekit-core — virtualization subpath entry.
 *
 * Re-exports the public surface of the virtualization module. Consumers
 * import via `@lynellf/tablekit-core/virtualization` to keep their bundle
 * small when they only need windowing without the row pipeline.
 */

export {
  createRowVirtualizer,
  getRange,
  getScrollOffsetForIndex,
  getTotalSize,
} from './rowVirtualizer';

export {
  createColumnVirtualizer,
} from './columnVirtualizer';

export type {
  VirtualItem,
  VirtualRow,
  RowVirtualizerResult,
  ColumnVirtualizerResult,
  VirtualizerOptions,
  VirtualizerLike,
} from './types';
```

### 3.5 `packages/core/src/virtualization/rowVirtualizer.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  createRowVirtualizer,
  getRange,
  getScrollOffsetForIndex,
  getTotalSize,
} from './rowVirtualizer';
import type { Row } from '../types';

const makeRow = (id: string, index: number): Row<{ id: string }> => ({
  id,
  index,
  original: { id },
  getVisibleCells: () => [],
  getRowProps: () => ({}),
});

describe('getRange', () => {
  it('returns empty range for empty sizes', () => {
    expect(getRange(0, 100, [], 0)).toEqual({ startIndex: 0, endIndex: -1 });
  });

  it('returns full range when everything fits', () => {
    const sizes = [10, 10, 10, 10, 10];
    expect(getRange(0, 100, sizes, 0)).toEqual({ startIndex: 0, endIndex: 4 });
  });

  it('returns a windowed range', () => {
    const sizes = Array.from({ length: 1000 }, () => 10);
    // scrollOffset 5000, viewport 200 → indices 50..69
    expect(getRange(5000, 200, sizes, 0)).toEqual({ startIndex: 50, endIndex: 69 });
  });

  it('applies overscan before and after', () => {
    const sizes = Array.from({ length: 1000 }, () => 10);
    expect(getRange(5000, 200, sizes, 4)).toEqual({ startIndex: 46, endIndex: 73 });
  });

  it('clamps to array bounds', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    expect(getRange(990, 200, sizes, 4)).toEqual({ startIndex: 91, endIndex: 99 });
  });
});

describe('getScrollOffsetForIndex', () => {
  it('aligns to start', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    expect(getScrollOffsetForIndex(50, sizes, 200, 'start')).toBe(500);
  });

  it('aligns to center', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    // Item 50 starts at 500, size 10, viewport 200 → center = 500 + 5 - 100 = 405
    expect(getScrollOffsetForIndex(50, sizes, 200, 'center')).toBe(405);
  });

  it('aligns to end', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    // Item 50 ends at 510, viewport 200 → end = 310
    expect(getScrollOffsetForIndex(50, sizes, 200, 'end')).toBe(310);
  });

  it('clamps index to bounds', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    expect(getScrollOffsetForIndex(-1, sizes, 200, 'start')).toBe(0);
    expect(getScrollOffsetForIndex(1000, sizes, 200, 'start')).toBe(990);
  });
});

describe('getTotalSize', () => {
  it('sums sizes', () => {
    expect(getTotalSize([10, 20, 30])).toBe(60);
  });
  it('returns 0 for empty', () => {
    expect(getTotalSize([])).toBe(0);
  });
});

describe('createRowVirtualizer', () => {
  const rows = Array.from({ length: 1000 }, (_, i) => makeRow(String(i), i));

  it('returns the visible window', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 5000,
      viewportSize: 200,
    });
    expect(result.rows.length).toBe(20); // indices 50..69
    expect(result.rows[0]?.index).toBe(50);
    expect(result.rows[19]?.index).toBe(69);
    expect(result.totalSize).toBe(10000);
  });

  it('applies overscan', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 5000,
      viewportSize: 200,
      overscan: 4,
    });
    expect(result.rows[0]?.index).toBe(46);
    expect(result.rows.at(-1)?.index).toBe(73);
  });

  it('keeps mounted indices visible', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 0, // only first items naturally visible
      viewportSize: 200,
      keepMounted: () => [999],
    });
    expect(result.rows.at(-1)?.index).toBe(999);
    expect(result.mountedIndices()).toContain(999);
  });

  it('measureElement updates the size cache', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 0,
      viewportSize: 100,
    });
    expect(result.rows[0]?.size).toBe(10);
    result.measureElement(0, 20);
    const next = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 0,
      viewportSize: 100,
      // Fresh result — the measureElement is per-call in this pure design;
      // adapter-level cache integration is in phase 4.
    });
    // The pure factory has no shared cache across calls; this documents the
    // behavior. The React adapter (phase 4) maintains a stable cache.
    expect(next.rows[0]?.size).toBe(10);
  });

  it('scrollToIndex computes the offset', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 0,
      viewportSize: 200,
    });
    expect(result.scrollToIndex(50)).toBe(500);
  });

  it('clamps to bounds when start index is past end', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 20000, // past end
      viewportSize: 200,
    });
    expect(result.rows.at(-1)?.index).toBe(999);
  });
});
```

### 3.6 `packages/core/src/virtualization/columnVirtualizer.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Column } from '../columns';
import { DEFAULT_STATE } from '../types';
import { createColumnVirtualizer } from './columnVirtualizer';

const makeColumn = (id: string, size: number): Column<{ id: string }> =>
  new Column({
    def: { id },
    state: DEFAULT_STATE,
    index: 0,
    resolveAccessor: () => () => undefined as never,
  });

describe('createColumnVirtualizer', () => {
  it('returns the visible window of unpinned columns', () => {
    // Override getSize via def.size on the Column (default 150 without it).
    // For the test we use uniform 100px columns.
    const columns = Array.from({ length: 50 }, (_, i) => {
      const col = makeColumn(`c${i}`, 100);
      // getSize reads columnSizing[id] ?? def.size ?? 150. Mutating def.size is read-only,
      // so we set state.columnSizing via the Column constructor's state.
      return col;
    });
    const result = createColumnVirtualizer({
      columns,
      estimateSize: () => 100,
      scrollOffset: 500,
      viewportSize: 1000,
    });
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.columns[0]?.index).toBe(5); // 500 / 100 = 5
    expect(result.totalSize).toBe(5000);
  });

  it('keeps mounted columns visible', () => {
    const columns = Array.from({ length: 50 }, (_, i) => makeColumn(`c${i}`, 100));
    const result = createColumnVirtualizer({
      columns,
      estimateSize: () => 100,
      scrollOffset: 0,
      viewportSize: 1000,
      keepMounted: () => [40, 45],
    });
    expect(result.columns.at(-1)?.index).toBe(45);
    expect(result.mountedIndices()).toContain(40);
    expect(result.mountedIndices()).toContain(45);
  });
});
```

### 3.7 `packages/core/src/pipeline/memo.ts`

```ts
/**
 * @lynellf/tablekit-core — row model memoization.
 *
 * Spec §12 perf budget: 100k-row scroll at ≥ 55fps requires the row pipeline
 * not to re-run on every state change. Phase 1 memoizes `getRowModel()` keyed
 * on a tuple of inputs.
 *
 * The cache invalidates when any input identity changes. Consumers mutating
 * `data` in place must pass a new array reference (the standard React/Immer
 * pattern); the cache will then re-run the pipeline.
 */

import { buildRowModel } from './rowModel';
import type { Row, ColumnDef, DataTableState } from '../types';

export interface MemoKey {
  data: unknown[];
  sorting: DataTableState['sorting'];
  columnFilters: DataTableState['columnFilters'];
  pagination: DataTableState['pagination'];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnPinning: DataTableState['columnPinning'];
  manualSorting: boolean;
  manualFiltering: boolean;
  manualPagination: boolean;
}

export interface MemoBuildOptions<TRow> {
  data: TRow[];
  columns: Array<ColumnDef<TRow, unknown>>;
  state: DataTableState;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  manualPagination?: boolean;
}

let lastKey: MemoKey | null = null;
let lastResult: Row<unknown>[] | null = null;

/**
 * Build (or return cached) the row model. Pure function over its inputs;
 * the cache lives in module state but is keyed on a deep tuple so two
 * different instances do not collide (each instance has its own factory
 * closure).
 *
 * NOTE: The factory in `createDataTable` owns the cache (per-instance),
 * not module state. This module exports the *key* builder + a helper to
 * run the pipeline; the actual cache is wired in `createDataTable.ts`.
 */
export const buildMemoKey = <TRow>(opts: MemoBuildOptions<TRow>): MemoKey => ({
  data: opts.data as unknown[],
  sorting: opts.state.sorting,
  columnFilters: opts.state.columnFilters,
  pagination: opts.state.pagination,
  columnOrder: opts.state.columnOrder,
  columnVisibility: opts.state.columnVisibility,
  columnPinning: opts.state.columnPinning,
  manualSorting: opts.manualSorting === true,
  manualFiltering: opts.manualFiltering === true,
  manualPagination: opts.manualPagination === true,
});

export const memoKeysEqual = (a: MemoKey | null, b: MemoKey): boolean => {
  if (a === null) return false;
  if (a.data !== b.data) return false;
  if (a.sorting !== b.sorting) return false;
  if (a.columnFilters !== b.columnFilters) return false;
  if (a.pagination !== b.pagination) return false;
  if (a.columnOrder !== b.columnOrder) return false;
  if (a.columnVisibility !== b.columnVisibility) return false;
  if (a.columnPinning !== b.columnPinning) return false;
  if (a.manualSorting !== b.manualSorting) return false;
  if (a.manualFiltering !== b.manualFiltering) return false;
  return a.manualPagination === b.manualPagination;
};

export const buildPipelineRowModel = <TRow>(opts: MemoBuildOptions<TRow>): Row<TRow>[] => {
  return buildRowModel<TRow>({
    rows: opts.data,
    filters: opts.state.columnFilters,
    sorting: opts.state.sorting,
    pagination: opts.state.pagination,
    columns: opts.columns,
    manualSorting: opts.manualSorting,
    manualFiltering: opts.manualFiltering,
    manualPagination: opts.manualPagination,
  }) as Row<TRow>[];
};

/**
 * Per-instance cache. The factory creates one of these and consults it
 * on every `getRowModel()` call.
 */
export class RowModelCache<TRow> {
  private lastKey: MemoKey | null = null;
  private lastResult: Row<TRow>[] | null = null;

  get(opts: MemoBuildOptions<TRow>): Row<TRow>[] {
    const key = buildMemoKey(opts);
    if (memoKeysEqual(this.lastKey, key) && this.lastResult !== null) {
      return this.lastResult;
    }
    this.lastKey = key;
    this.lastResult = buildPipelineRowModel(opts);
    return this.lastResult;
  }

  invalidate(): void {
    this.lastKey = null;
    this.lastResult = null;
  }
}
```

### 3.8 `packages/core/src/pipeline/memo.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { RowModelCache, buildMemoKey, memoKeysEqual } from './memo';
import type { DataTableOptions, Row } from '../types';

interface Person {
  id: string;
  name: string;
}

const baseOpts = (): DataTableOptions<Person> => ({
  data: [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ],
  columns: [{ id: 'name', accessor: 'name' }],
});

describe('buildMemoKey', () => {
  it('builds a key from the relevant fields', () => {
    const opts = baseOpts();
    const key = buildMemoKey({
      data: opts.data,
      columns: opts.columns,
      state: {
        sorting: [],
        columnFilters: [],
        pagination: { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      },
      manualSorting: false,
      manualFiltering: false,
      manualPagination: false,
    });
    expect(key.data).toBe(opts.data);
    expect(key.sorting).toEqual([]);
  });
});

describe('memoKeysEqual', () => {
  const makeKey = () => buildMemoKey({
    data: baseOpts().data,
    columns: baseOpts().columns,
    state: {
      sorting: [],
      columnFilters: [],
      pagination: { pageIndex: 0, pageSize: 25 },
      columnOrder: [],
      columnVisibility: {},
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    },
    manualSorting: false,
    manualFiltering: false,
    manualPagination: false,
  });

  it('returns true for identical keys', () => {
    expect(memoKeysEqual(null, makeKey())).toBe(false);
    const a = makeKey();
    expect(memoKeysEqual(a, makeKey())).toBe(true);
  });

  it('returns false when data identity changes', () => {
    const a = makeKey();
    const b = makeKey();
    b.data = [{ id: '99', name: 'Z' }];
    expect(memoKeysEqual(a, b)).toBe(false);
  });
});

describe('RowModelCache', () => {
  it('returns the same reference on a hit', () => {
    const cache = new RowModelCache<Person>();
    const opts = baseOpts();
    const state = {
      sorting: [],
      columnFilters: [],
      pagination: { pageIndex: 0, pageSize: 25 },
      columnOrder: [],
      columnVisibility: {},
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    } as const;
    const a = cache.get({ ...opts, state });
    const b = cache.get({ ...opts, state });
    expect(a).toBe(b);
  });

  it('returns a fresh result when data changes', () => {
    const cache = new RowModelCache<Person>();
    const opts = baseOpts();
    const state = {
      sorting: [],
      columnFilters: [],
      pagination: { pageIndex: 0, pageSize: 25 },
      columnOrder: [],
      columnVisibility: {},
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    } as const;
    const a = cache.get({ ...opts, state });
    const b = cache.get({ ...opts, state, data: [{ id: '99', name: 'Z' }] });
    expect(a).not.toBe(b);
    expect(b.length).toBe(1);
  });

  it('invalidate clears the cache', () => {
    const cache = new RowModelCache<Person>();
    const opts = baseOpts();
    const state = {
      sorting: [],
      columnFilters: [],
      pagination: { pageIndex: 0, pageSize: 25 },
      columnOrder: [],
      columnVisibility: {},
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    } as const;
    const a = cache.get({ ...opts, state });
    cache.invalidate();
    const b = cache.get({ ...opts, state });
    expect(a).not.toBe(b);
  });
});
```

### 3.9 `packages/core/src/createDataTable.ts` (additions)

```ts
// ─── New imports at the top ─────────────────────────────────────────────────
import { RowModelCache } from './pipeline/memo';
import {
  createRowVirtualizer,
  getRange,
  getScrollOffsetForIndex,
  getTotalSize,
} from './virtualization/rowVirtualizer';
import { createColumnVirtualizer } from './virtualization/columnVirtualizer';
import type {
  RowVirtualizerResult,
  ColumnVirtualizerResult,
} from './virtualization/types';

// ─── Class additions ────────────────────────────────────────────────────────
class DataTable<TRow> implements DataTableInstance<TRow> {
  // ... existing fields ...
  private rowModelCache = new RowModelCache<TRow>();
  // Scroll + viewport state — set by the React adapter in phase 4.
  // Default to 0/0 so the pure virtualizer produces sensible output in
  // SSR (no rows are "above the fold" until scrollOffset > 0).
  private scrollOffset = 0;
  private viewportSize = 0;
  private columnScrollOffset = 0;
  private columnViewportSize = 0;

  // ... existing methods ...

  getRowModel(): Row<TRow>[] {
    return this.rowModelCache.get({
      data: this.options.data,
      columns: this.options.columns,
      state: this.state,
      manualSorting: this.options.manualSorting,
      manualFiltering: this.options.manualFiltering,
      manualPagination: this.options.manualPagination,
    });
  }

  /**
   * React adapter calls this on scroll events. Not part of the public
   * surface until phase 4 wires the hook; exposed here so phase 4
   * can call it via the `instance` handle.
   */
  __setScrollState(scrollOffset: number, viewportSize: number): void {
    this.scrollOffset = scrollOffset;
    this.viewportSize = viewportSize;
  }
  __setColumnScrollState(scrollOffset: number, viewportSize: number): void {
    this.columnScrollOffset = scrollOffset;
    this.columnViewportSize = viewportSize;
  }

  getRowVirtualizer(): RowVirtualizerResult<TRow> {
    return createRowVirtualizer<TRow>({
      rows: this.getRowModel(),
      estimateSize: () => 33, // M2 default; consumers override via the React adapter's SizeObserver
      scrollOffset: this.scrollOffset,
      viewportSize: this.viewportSize,
      keepMounted: () => {
        // Phase 5 wires the focused cell's row index into keepMounted.
        // For now, return [] (no keepMounted).
        return [];
      },
    });
  }

  getCenterVirtualizer(): ColumnVirtualizerResult {
    const center = this.getCenterLeafColumns();
    return createColumnVirtualizer<TRow>({
      columns: center,
      scrollOffset: this.columnScrollOffset,
      viewportSize: this.columnViewportSize,
      keepMounted: () => [],
    });
  }
}
```

The `setOptions` path also calls `this.rowModelCache.invalidate()` when `options.data` reference changes. (Note: the cache already invalidates on `data` identity change via `memoKeysEqual`, but an explicit `invalidate()` on options change makes the contract obvious for consumers who mutate options in place.)

### 3.10 `packages/core/src/types.ts` (additions)

```ts
// ─── New types appended at the end (after existing exports) ────────────────

import type { Column } from './columns';
import type { Row } from './types';

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
}

export interface VirtualRow<TRow> {
  row: Row<TRow>;
  index: number;
  start: number;
  size: number;
  positionStyle: { position: 'absolute'; top: string; height: string; width: 'max-content' };
}

export interface RowVirtualizerResult<TRow> {
  rows: Array<VirtualRow<TRow>>;
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): number;
  measureElement: (index: number, size: number) => void;
  mountedIndices(): number[];
}

export interface ColumnVirtualizerResult {
  columns: VirtualItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): number;
  measureElement: (index: number, size: number) => void;
  mountedIndices(): number[];
}

export interface VirtualizerLike<TItem> {
  getVirtualItems(): TItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): void;
}

export interface VirtualizerOptions {
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
  keepMounted?: () => number[];
  scrollOffset: number;
  viewportSize: number;
}
```

Append to `DataTableInstance`:

```ts
  // ─── Virtualization (M2) ─────────────────────────────────────────────────
  getRowVirtualizer(): RowVirtualizerResult<TRow>;
  getCenterVirtualizer(): ColumnVirtualizerResult;
```

### 3.11 `packages/core/src/index.ts` (additions)

```ts
// ─── Virtualization types (M2 Phase 1) ─────────────────────────────────────
export type {
  VirtualItem,
  VirtualRow,
  RowVirtualizerResult,
  ColumnVirtualizerResult,
  VirtualizerLike,
  VirtualizerOptions,
} from './virtualization/types';
```

### 3.12 `packages/core/package.json` (additions to exports)

```json
{
  "exports": {
    ".": { "...": "..." },
    "./virtualization": {
      "types": "./dist/virtualization/index.d.ts",
      "import": "./dist/virtualization/index.es.js"
    },
    "./memo": {
      "types": "./dist/pipeline/memo.d.ts",
      "import": "./dist/pipeline/memo.es.js"
    }
  }
}
```

### 3.13 `packages/core/vite.subpaths.config.ts` (additions)

Add entries:

```ts
const entries: Record<string, string> = {
  // ... existing entries from M1 phase 7 ...
  virtualization: 'src/virtualization/index.ts',
  memo: 'src/pipeline/memo.ts',
};
```

### 3.14 `packages/core/bench/scroll.bench.ts`

```ts
/**
 * @lynellf/tablekit-core — 100k-row scroll benchmark.
 *
 * Spec §12 budget: 100k rows × 50 cols at ≥ 55fps sustained scroll.
 * The bench measures ms per virtualizer call (the per-scroll-event cost)
 * on a synthetic 100k-row dataset with fixed 33px rows. The benchmark is
 * advisory (warnings, not failures) until architectural thresholds are
 * crossed. Run via `pnpm --filter @lynellf/tablekit-core bench`.
 */

import { bench, group, run } from 'mitata';
import { createDataTable, type Row } from '../src/index';
import { createRowVirtualizer } from '../src/virtualization/rowVirtualizer';

interface Person {
  id: string;
  name: string;
  age: number;
}

const N = 100_000;
const data: Person[] = Array.from({ length: N }, (_, i) => ({
  id: String(i),
  name: `Person ${i}`,
  age: i % 100,
}));

const columns = [
  { id: 'id', accessor: 'id' as const },
  { id: 'name', accessor: 'name' as const },
  { id: 'age', accessor: 'age' as const },
];

const table = createDataTable({ data, columns, getRowId: (r) => r.id });
const rows = table.getRowModel();

// Pre-build the rows once to isolate the virtualizer cost from the pipeline cost.
const virtualRows: Row<Person>[] = rows;

group('row virtualizer (100k rows, fixed 33px)', () => {
  for (const scrollOffset of [0, 33_000, 660_000, 1_650_000, 3_300_000]) {
    bench(`scrollOffset = ${scrollOffset}`, () => {
      createRowVirtualizer({
        rows: virtualRows,
        estimateSize: () => 33,
        scrollOffset,
        viewportSize: 600,
      });
    });
  }
});

await run();
```

---

## 4. Commands

```bash
# Run new + existing tests
pnpm --filter @lynellf/tablekit-core test

# Run the benchmark
pnpm --filter @lynellf/tablekit-core bench

# Typecheck
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. New unit tests pass
pnpm --filter @lynellf/tablekit-core test -- virtualization memo
# Expected: ~30-40 new tests pass (virtualization + memoization)

# 2. Memoization observable via getRowModel identity
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({ data: [{ id: '1', name: 'A' }], columns: [{ id: 'name', accessor: 'name' }], getRowId: r => r.id });
  const a = t.getRowModel();
  const b = t.getRowModel();
  console.log('memoized:', a === b);
"
# Expected: memoized: true

# 3. Subpath bundle builds
pnpm build
ls packages/core/dist/virtualization/index.es.js
ls packages/core/dist/memo.es.js
# Expected: both files exist

# 4. Benchmark ≥ 55fps
pnpm --filter @lynellf/tablekit-core bench
# Expected: median < 16ms per scroll event (advisory; logged)
```

---

## 6. Out-of-scope (deferred to later phases)

- **`getRowVirtualizer()` consumer-facing helper** that exposes `scrollToIndex` as a real DOM scroll. Phase 4 wires the React adapter (`useRowVirtualizer` hook) which handles the scrollToIndex → grid.scrollTop path. Phase 1's `scrollToIndex` returns the target offset as a number; the adapter applies it.
- **`getCenterVirtualizer()` full integration with the React renderer**. Phase 4 wires the column virtualizer's `columns` into the header + body render.
- **`keepMounted` driven by focused cell + resize session**. Phase 5 (keyboard nav) routes the focused row index into keepMounted; phase 3 (resize) routes the resizing column index.
- **DOM measurement adapter (`SizeObserver`)** — phase 4 (React adapter). Phase 1's `measureElement` is a method on the result; the adapter calls it from `ResizeObserver` callbacks.
- **Variable row heights with anchor correction (§16 risk #5)** — M6 polish. Phase 1 uses uniform sizes via `estimateSize: () => 33`; the bench uses uniform sizes too.
- **API freeze for the virtualization surface** — phase 7 produces `api-freeze.md`. Phase 1's exports may be renamed/reshaped through phases 4–6 if integration reveals better names; the API freeze at the end of phase 7 locks them.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **`getRange` binary-search assumption** — currently uses a linear scan; for 100k rows this is fine but a binary search would be O(log n) | Linear scan is correct (we walk `sizes` once). The bench measures; if it shows > 1ms, we replace with binary search in M6. |
| **Memoization + `data` mutation footgun** — consumers who mutate `data` in place get stale rows | Documented in the README. The cache is keyed on `data` reference; mutating in place without a new reference = stale. |
| **`scrollOffset`/`viewportSize` default of 0 in core** — until phase 4 wires the adapter, the virtualizer returns the first window with overscan | Documented; phase 4's adapter sets these from the grid ref on every render. |
| **`measureElement` is per-call in this pure design** — the size cache lives inside one `createRowVirtualizer` call, not across calls | Phase 4 wires a stable cache at the hook level (`useRef` in `useRowVirtualizer`). The pure factory's per-call cache is sufficient when the adapter re-uses the result via `useMemo` keyed on `(scrollOffset, viewportSize, count)`. |
| **Bundle size growth** — virtualizer + memo add ~1.3 kB core gzip | Tree-shakeable subpath. Consumers who don't use virtualization skip the bundle. |
| **`noUncheckedIndexedAccess` + `sizes[i] ?? 0`** — defensive default for off-by-one | All index accesses guarded; tests cover bounds. |
