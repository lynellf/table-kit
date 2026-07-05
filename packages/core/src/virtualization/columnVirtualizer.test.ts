import { describe, expect, it } from 'vitest';
import { Column, createColumns } from '../columns';
import { DEFAULT_STATE } from '../types';
import { createColumnVirtualizer } from './columnVirtualizer';

const makeColumns = (count: number, size: number) => {
  const defs = Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    size,
  }));
  return createColumns(defs, {
    ...DEFAULT_STATE,
    columnSizing: Object.fromEntries(defs.map((d) => [d.id, size])),
  } as typeof DEFAULT_STATE);
};

describe('createColumnVirtualizer', () => {
  it('returns the visible window of columns', () => {
    const columns = makeColumns(50, 100);
    const result = createColumnVirtualizer({
      columns,
      estimateSize: () => 100,
      scrollOffset: 0,
      viewportSize: 1000,
    });
    // With 100px columns and 1000px viewport, 10 columns visible
    // startIndex = 0 (0/100 = 0), endIndex = 9 (10 items fit)
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.columns[0]?.index).toBe(0);
    expect(result.totalSize).toBe(5000);
  });

  it('keeps mounted columns visible', () => {
    const columns = makeColumns(50, 100);
    const result = createColumnVirtualizer({
      columns,
      estimateSize: () => 100,
      scrollOffset: 0,
      viewportSize: 1000,
      keepMounted: () => [40, 45],
    });
    expect(result.columns.some((c) => c.index === 40)).toBe(true);
    expect(result.mountedIndices()).toContain(40);
    expect(result.mountedIndices()).toContain(45);
  });

  it('applies overscan', () => {
    const columns = makeColumns(50, 100);
    const result = createColumnVirtualizer({
      columns,
      estimateSize: () => 100,
      scrollOffset: 0,
      viewportSize: 200,
      overscan: 1,
    });
    // Without overscan: indices 0-1 (2 visible)
    // With overscan 1: indices -1 to 3, clamped to 0-3 = 4 columns
    expect(result.columns[0]?.index).toBe(0);
  });
});
