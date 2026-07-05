import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_SORTING_FNS,
  builtInSortingFns,
  getSortingFn,
  registerSortingFn,
  nameOfSortingFn,
} from './sorting';

describe('sorting registry', () => {
  describe('built-ins', () => {
    it('exposes the five built-in fns from §4.3', () => {
      expect(BUILT_IN_SORTING_FNS).toEqual(['alphanumeric', 'text', 'number', 'datetime', 'basic']);
    });

    it('alphanumeric sorts strings with numeric awareness', () => {
      const fn = getSortingFn<{ v: string }>('alphanumeric');
      const sorted = [{ v: 'item 10' }, { v: 'item 2' }, { v: 'item 1' }].sort((a, b) =>
        fn(a, b, 'v'),
      );
      expect(sorted.map((r) => r.v)).toEqual(['item 1', 'item 2', 'item 10']);
    });

    it('number sorts numeric values', () => {
      const fn = getSortingFn<{ v: number }>('number');
      const sorted = [{ v: 3 }, { v: 1 }, { v: 2 }].sort((a, b) => fn(a, b, 'v'));
      expect(sorted.map((r) => r.v)).toEqual([1, 2, 3]);
    });

    it('datetime sorts Date objects', () => {
      const fn = getSortingFn<{ v: Date }>('datetime');
      const earlier = { v: new Date(2020, 0, 1) };
      const later = { v: new Date(2021, 0, 1) };
      expect(fn(earlier, later, 'v')).toBeLessThan(0);
      expect(fn(later, earlier, 'v')).toBeGreaterThan(0);
    });

    it('basic uses locale-aware compare as a fallback', () => {
      const fn = getSortingFn<{ v: string }>('basic');
      expect(fn({ v: 'a' }, { v: 'b' }, 'v')).toBeLessThan(0);
    });

    it('handles undefined/null values without throwing', () => {
      const fn = getSortingFn<{ v?: string }>('basic');
      expect(() => fn({ v: 'a' }, {}, 'v')).not.toThrow();
      expect(() => fn({}, { v: 'a' }, 'v')).not.toThrow();
    });
  });

  describe('registry behavior', () => {
    it('registerSortingFn adds a new fn', () => {
      const custom = vi.fn(() => -1);
      registerSortingFn('always-first', custom);
      expect(getSortingFn('always-first')).toBe(custom);
    });

    it('getSortingFn throws on unknown name in dev', () => {
      const original = process.env.NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';
      try {
        expect(() => getSortingFn('does-not-exist')).toThrowError(/Unknown sorting fn/);
      } finally {
        (process.env as { NODE_ENV?: string }).NODE_ENV = original as string;
      }
    });

    it('built-ins object is frozen', () => {
      expect(Object.isFrozen(builtInSortingFns)).toBe(true);
    });
  });

  describe('nameOfSortingFn', () => {
    it('returns the name for a built-in function', () => {
      const fn = getSortingFn<Record<string, unknown>>('alphanumeric');
      expect(nameOfSortingFn(fn)).toBe('alphanumeric');
    });

    it('returns the name for a registered custom function', () => {
      const custom = vi.fn(() => -1);
      registerSortingFn('custom-sort', custom);
      expect(nameOfSortingFn(custom)).toBe('custom-sort');
    });

    it('returns undefined for an unregistered inline function', () => {
      const inline = () => -1;
      expect(nameOfSortingFn(inline)).toBeUndefined();
    });

    it('returns undefined for non-function inputs', () => {
      expect(nameOfSortingFn(null)).toBeUndefined();
      expect(nameOfSortingFn(undefined)).toBeUndefined();
      expect(nameOfSortingFn('alphanumeric')).toBeUndefined();
    });
  });
});
