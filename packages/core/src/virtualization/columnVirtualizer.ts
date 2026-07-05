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
import { getRange, getScrollOffsetForIndex, getTotalSize } from './rowVirtualizer';
import type { ColumnVirtualizerResult, VirtualItem } from './types';

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
