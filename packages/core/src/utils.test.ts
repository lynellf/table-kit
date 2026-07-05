import { describe, expect, it } from 'vitest';
import { assertNever, identity, shallowEqual } from './utils';

describe('utils', () => {
  describe('identity', () => {
    it('returns its argument unchanged', () => {
      const obj = { a: 1 };
      expect(identity(obj)).toBe(obj);
      expect(identity(42)).toBe(42);
      expect(identity('x')).toBe('x');
      expect(identity(null)).toBe(null);
    });
  });

  describe('shallowEqual', () => {
    it('returns true for the same reference', () => {
      const obj = { a: 1 };
      expect(shallowEqual(obj, obj)).toBe(true);
    });

    it('returns true for structurally equal objects', () => {
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    it('returns false when a value differs', () => {
      expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('returns false when key sets differ', () => {
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });

    it('returns false when a key is missing from the other object', () => {
      // Test: left has {a}, right has {a, b} — 'b' is missing from left.
      expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      // Test: left has {a, b}, right has {a} — 'b' is missing from right.
      expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });
  });

  describe('assertNever', () => {
    it('throws on unreachable branch', () => {
      expect(() => assertNever(undefined as never)).toThrowError(/Unexpected value/);
    });
  });
});
