import { describe, expect, it } from 'vitest';
import {
  sliceColumnsByPinning,
  toggleAllColumnsVisibility,
  toggleColumnVisibility,
} from './visibility';

describe('toggleColumnVisibility', () => {
  it('hides a visible column (no entry → false)', () => {
    const out = toggleColumnVisibility({}, 'name');
    expect(out).toEqual({ name: false });
  });

  it('shows a hidden column (false → true)', () => {
    const out = toggleColumnVisibility({ name: false }, 'name');
    expect(out).toEqual({ name: true });
  });

  it('hides a visible column (true → false)', () => {
    const out = toggleColumnVisibility({ name: true }, 'name');
    expect(out).toEqual({ name: false });
  });

  it('does not mutate the input', () => {
    const input = { name: true };
    toggleColumnVisibility(input, 'name');
    expect(input).toEqual({ name: true });
  });
});

describe('toggleAllColumnsVisibility', () => {
  it('hides all when most are visible', () => {
    const out = toggleAllColumnsVisibility({ a: true, b: true, c: true }, ['a', 'b', 'c']);
    expect(out).toEqual({ a: false, b: false, c: false });
  });

  it('shows all when most are hidden', () => {
    const out = toggleAllColumnsVisibility({ a: false, b: false, c: false }, ['a', 'b', 'c']);
    expect(out).toEqual({ a: true, b: true, c: true });
  });

  it('uses explicit target when provided', () => {
    const out = toggleAllColumnsVisibility({ a: true }, ['a', 'b'], false);
    expect(out).toEqual({ a: false, b: false });
  });

  it('preserves entries for columns not in the id list', () => {
    const out = toggleAllColumnsVisibility({ a: true, ghost: false }, ['a'], false);
    expect(out).toEqual({ a: false, ghost: false });
  });
});

describe('sliceColumnsByPinning', () => {
  it('returns three empty arrays when nothing is pinned', () => {
    const out = sliceColumnsByPinning(['a', 'b', 'c'], { left: [], right: [] });
    expect(out).toEqual({ left: [], center: ['a', 'b', 'c'], right: [] });
  });

  it('places pinned columns in the correct region', () => {
    const out = sliceColumnsByPinning(['l1', 'a', 'b', 'r1', 'r2'], {
      left: ['l1'],
      right: ['r1', 'r2'],
    });
    expect(out).toEqual({ left: ['l1'], center: ['a', 'b'], right: ['r1', 'r2'] });
  });
});
