import { describe, expect, it, vi } from 'vitest';
import { BUILT_IN_FILTER_FNS, builtInFilterFns, getFilterFn, registerFilterFn } from './filtering';

describe('filtering registry', () => {
  describe('built-ins', () => {
    it('exposes the five built-in fns from §4.3', () => {
      expect(BUILT_IN_FILTER_FNS).toEqual([
        'includesString',
        'equalsString',
        'equals',
        'inNumberRange',
        'arrIncludes',
      ]);
    });

    it('includesString is case-insensitive', () => {
      const fn = getFilterFn<{ name: string }>('includesString');
      expect(fn({ name: 'Alice' }, 'name', 'ali')).toBe(true);
      expect(fn({ name: 'Bob' }, 'name', 'ali')).toBe(false);
    });

    it('equalsString matches exactly', () => {
      const fn = getFilterFn<{ name: string }>('equalsString');
      expect(fn({ name: 'Alice' }, 'name', 'Alice')).toBe(true);
      expect(fn({ name: 'Alice' }, 'name', 'alice')).toBe(false);
    });

    it('equals uses Object.is semantics', () => {
      const fn = getFilterFn<{ v: number }>('equals');
      expect(fn({ v: 1 }, 'v', 1)).toBe(true);
      expect(fn({ v: Number.NaN }, 'v', Number.NaN)).toBe(true); // Object.is(NaN, NaN) === true
      expect(fn({ v: 1 }, 'v', 2)).toBe(false);
    });

    it('inNumberRange checks [min, max] inclusive', () => {
      const fn = getFilterFn<{ age: number }>('inNumberRange');
      expect(fn({ age: 25 }, 'age', [20, 30])).toBe(true);
      expect(fn({ age: 19 }, 'age', [20, 30])).toBe(false);
      expect(fn({ age: 31 }, 'age', [20, 30])).toBe(false);
    });

    it('arrIncludes matches any element', () => {
      const fn = getFilterFn<{ tags: string[] }>('arrIncludes');
      expect(fn({ tags: ['a', 'b', 'c'] }, 'tags', ['a', 'x'])).toBe(true);
      expect(fn({ tags: ['a', 'b'] }, 'tags', ['x'])).toBe(false);
    });

    it('returns false for wrong types without throwing', () => {
      const fn = getFilterFn<{ name: string }>('equalsString');
      expect(fn({ name: 'a' }, 'name', 42)).toBe(false);
    });
  });

  describe('registry behavior', () => {
    it('registerFilterFn adds a new fn', () => {
      const custom = vi.fn(() => true);
      registerFilterFn('always-true', custom);
      expect(getFilterFn('always-true')).toBe(custom);
    });

    it('getFilterFn throws on unknown name in dev', () => {
      const original = process.env.NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = 'development';
      try {
        expect(() => getFilterFn('does-not-exist')).toThrowError(/Unknown filter fn/);
      } finally {
        (process.env as { NODE_ENV?: string }).NODE_ENV = original as string;
      }
    });

    it('built-ins object is frozen', () => {
      expect(Object.isFrozen(builtInFilterFns)).toBe(true);
    });
  });
});
