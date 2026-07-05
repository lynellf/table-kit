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
import type { RowVirtualizerResult, VirtualRow } from './types';

const DEFAULT_OVERSCAN_ROWS = 4;

/**
 * Compute the cumulative size at a given index.
 */
const cumulativeAt = (sizes: number[], index: number): number => {
  let cum = 0;
  for (let i = 0; i < index; i++) cum += sizes[i] ?? 0;
  return cum;
};

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
  // Walk forward to find the index where the item starts being visible.
  // O(n) in the general case.
  if (sizes.length === 0) return { startIndex: 0, endIndex: -1 };

  let startIndex = 0;
  let cum = 0;
  // Find the first index whose end (cum + sizes[i]) is > scrollOffset.
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i] ?? 0;
    if (cum + size > scrollOffset) {
      startIndex = i;
      break;
    }
    cum += size;
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
  if (itemEnd <= viewportSize) return 0;
  // Default 'auto': if fully below viewport, snap to start.
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
  /** Pixels visible in the viewport (read from the grid's `clientHeight`). */
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
