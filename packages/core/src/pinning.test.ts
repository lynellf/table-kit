import { describe, expect, it } from 'vitest';
import { pinAnnouncement, pinColumns, togglePinColumn, unpinColumns } from './pinning';
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
