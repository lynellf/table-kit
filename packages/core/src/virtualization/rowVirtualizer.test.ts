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
    // scrollOffset 5000, viewport 200 → 20 items visible (200/10 = 20)
    // Item 500 starts at 5000 (5000/10=500), loop finds first item where cum+size > 5000
    // Item 500 ends at 5010, so startIndex=500. 20 items fit, so endIndex=519
    expect(getRange(5000, 200, sizes, 0)).toEqual({ startIndex: 500, endIndex: 520 });
  });

  it('applies overscan before and after', () => {
    const sizes = Array.from({ length: 1000 }, () => 10);
    // Base: 500..520, with overscan 4: 496..524
    expect(getRange(5000, 200, sizes, 4)).toEqual({ startIndex: 496, endIndex: 524 });
  });

  it('clamps to array bounds', () => {
    const sizes = Array.from({ length: 100 }, () => 10);
    // 95 items visible, start at 950, clamp end to 99
    expect(getRange(950, 200, sizes, 4)).toEqual({ startIndex: 91, endIndex: 99 });
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
    // 21 visible items (500..520) + 8 overscan = 29 total
    // First index with overscan 4: 500 - 4 = 496
    expect(result.rows.length).toBe(29);
    expect(result.rows[0]?.index).toBe(496);
    expect(result.rows.at(-1)?.index).toBe(524);
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
    expect(result.rows[0]?.index).toBe(496);
    expect(result.rows.at(-1)?.index).toBe(524);
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

  it('measureElement exists and can be called', () => {
    const result = createRowVirtualizer({
      rows,
      estimateSize: () => 10,
      scrollOffset: 0,
      viewportSize: 100,
    });
    expect(result.rows[0]?.size).toBe(10);
    // measureElement is callable and updates internal state
    expect(typeof result.measureElement).toBe('function');
    result.measureElement(0, 20);
    result.measureElement(5, 40);
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
      scrollOffset: 15000, // past end (1000 items * 10px = 10000 max)
      viewportSize: 200,
    });
    expect(result.rows.at(-1)?.index).toBe(999);
  });
});
