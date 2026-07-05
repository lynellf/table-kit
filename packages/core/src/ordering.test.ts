import { describe, expect, it } from 'vitest';
import { moveColumn } from './ordering';
import type { DataTableState } from './types';

const baseState = (): Pick<
  DataTableState,
  'columnOrder' | 'columnPinning' | 'columnVisibility'
> => ({
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
    // 'c' moves from center to left. It is prepended to the left-pinned
    // region (at the start of the final order). Left becomes ['c'], and the
    // remaining unpinned are ['a', 'b', 'd']. Column order = left + center.
    const result = moveColumn(state, state.columnOrder, 'c', 'left');
    expect(result.columnOrder).toEqual(['c', 'a', 'b', 'd']);
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
