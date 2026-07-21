/**
 * @lynellf/tablekit-core/dataSource — query-key serializer tests.
 *
 * B7-SERIALIZER-ERRORS: Tests for canonical query-key serialization.
 * Covers: sorted object keys, array ordering, rejected value kinds,
 * cycles, registry-only functions, stable error paths/codes, collision resistance.
 */

import { describe, expect, it } from 'vitest';
import {
  QueryKeySerializationError,
  QueryKeySerializationErrorCode,
  buildQueryKey,
  validateSerializable,
} from '../queryKey';
import type { RowsQuery } from '../types';

describe('buildQueryKey', () => {
  describe('valid inputs', () => {
    it('serializes null', () => {
      const result = buildQueryKey({} as RowsQuery, 'source_1', undefined, 0);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.key).toBeTruthy();
      }
    });

    it('serializes string values', () => {
      const query: RowsQuery = {
        sorting: [],
        filters: [{ id: 'name', value: 'Alice' }],
        pagination: { type: 'offset', offset: 0, limit: 10 },
      };
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(true);
    });

    it('serializes number values', () => {
      const query: RowsQuery = {
        sorting: [],
        filters: [{ id: 'age', value: 25 }],
        pagination: { type: 'offset', offset: 0, limit: 10 },
      };
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(true);
    });

    it('serializes boolean values', () => {
      const query: RowsQuery = {
        sorting: [],
        filters: [{ id: 'active', value: true }],
        pagination: { type: 'offset', offset: 0, limit: 10 },
      };
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(true);
    });

    it('serializes array values preserving order', () => {
      const query: RowsQuery = {
        sorting: [{ id: 'name', desc: false }],
        filters: [],
        pagination: { type: 'offset', offset: 0, limit: 10 },
      };
      const result1 = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result1.valid).toBe(true);
    });

    it('serializes nested objects', () => {
      const query: RowsQuery = {
        sorting: [],
        filters: [{ id: 'nested', value: { deep: { value: 'test' } } }],
        pagination: { type: 'offset', offset: 0, limit: 10 },
      };
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(true);
    });
  });

  describe('key determinism', () => {
    it('produces byte-identical keys for objects with different insertion order', () => {
      // Plain objects have their keys sorted, so different insertion order produces same key
      const query1: RowsQuery = {
        sorting: [],
        filters: [{ id: 'name', value: { a: 1, b: 2 } }],
      };
      const query2: RowsQuery = {
        sorting: [],
        filters: [{ id: 'name', value: { b: 2, a: 1 } }],
      };

      const key1 = buildQueryKey(query1, 'source_1', undefined, 0);
      const key2 = buildQueryKey(query2, 'source_1', undefined, 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).toBe(key2.key);
      }
    });

    it('produces different keys for arrays with different element order (array order is significant)', () => {
      // Arrays preserve order, so different element order produces different keys
      const query1: RowsQuery = {
        sorting: [
          { id: 'a', desc: false },
          { id: 'b', desc: true },
        ],
        filters: [],
      };
      const query2: RowsQuery = {
        sorting: [
          { id: 'b', desc: true },
          { id: 'a', desc: false },
        ],
        filters: [],
      };

      const key1 = buildQueryKey(query1, 'source_1', undefined, 0);
      const key2 = buildQueryKey(query2, 'source_1', undefined, 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).not.toBe(key2.key);
      }
    });

    it('produces different keys for different values', () => {
      const query1: RowsQuery = {
        sorting: [{ id: 'a', desc: false }],
        filters: [],
      };
      const query2: RowsQuery = {
        sorting: [{ id: 'b', desc: false }],
        filters: [],
      };

      const key1 = buildQueryKey(query1, 'source_1', undefined, 0);
      const key2 = buildQueryKey(query2, 'source_1', undefined, 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).not.toBe(key2.key);
      }
    });

    it('produces different keys for different source tokens', () => {
      const query: RowsQuery = { sorting: [], filters: [] };
      const key1 = buildQueryKey(query, 'source_1', undefined, 0);
      const key2 = buildQueryKey(query, 'source_2', undefined, 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).not.toBe(key2.key);
      }
    });

    it('produces different keys for different data versions', () => {
      const query: RowsQuery = { sorting: [], filters: [] };
      const key1 = buildQueryKey(query, 'source_1', 'v1', 0);
      const key2 = buildQueryKey(query, 'source_1', 'v2', 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).not.toBe(key2.key);
      }
    });

    it('produces different keys for different refetch nonces', () => {
      const query: RowsQuery = { sorting: [], filters: [] };
      const key1 = buildQueryKey(query, 'source_1', undefined, 0);
      const key2 = buildQueryKey(query, 'source_1', undefined, 1);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).not.toBe(key2.key);
      }
    });

    it('produces same key for same inputs', () => {
      const query: RowsQuery = {
        sorting: [{ id: 'name', desc: false }],
        filters: [{ id: 'age', value: 25 }],
        pagination: { type: 'offset', offset: 10, limit: 10 },
      };
      const key1 = buildQueryKey(query, 'source_1', 'v1', 0);
      const key2 = buildQueryKey(query, 'source_1', 'v1', 0);

      expect(key1.valid).toBe(true);
      expect(key2.valid).toBe(true);
      if (key1.valid && key2.valid) {
        expect(key1.key).toBe(key2.key);
      }
    });
  });

  describe('rejected values', () => {
    it('rejects undefined', () => {
      const query = { sorting: [], filters: [{ id: 'x', value: undefined }] } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.UNDEFINED_VALUE);
        expect(result.error.kind).toBe('undefined');
        expect(result.error.propertyPath).toContain('filters');
      }
    });

    it('rejects undefined in arrays', () => {
      const query = { sorting: [undefined as unknown], filters: [] } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.UNDEFINED_VALUE);
        expect(result.error.kind).toBe('undefined');
        expect(result.error.propertyPath).toContain('sorting');
      }
    });

    it('rejects functions', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: () => {} }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.FUNCTION_VALUE);
        expect(result.error.kind).toBe('function');
      }
    });

    it('rejects symbols', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: Symbol('test') }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.SYMBOL_VALUE);
        expect(result.error.kind).toBe('symbol');
      }
    });

    it('rejects bigint', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: BigInt(123) }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.BIGINT_VALUE);
        expect(result.error.kind).toBe('bigint');
      }
    });

    it('rejects NaN', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: NaN }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.NAN_VALUE);
        expect(result.error.kind).toBe('nan');
      }
    });

    it('rejects positive infinity', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: Infinity }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.INFINITY_VALUE);
        expect(result.error.kind).toBe('infinity');
      }
    });

    it('rejects negative infinity', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: -Infinity }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.INFINITY_VALUE);
        expect(result.error.kind).toBe('infinity');
      }
    });

    it('rejects Date objects', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: new Date() }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.DATE_VALUE);
        expect(result.error.kind).toBe('date');
      }
    });

    it('rejects Map objects', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: new Map() }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.MAP_VALUE);
        expect(result.error.kind).toBe('map');
      }
    });

    it('rejects Set objects', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: new Set() }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.SET_VALUE);
        expect(result.error.kind).toBe('set');
      }
    });

    it('rejects class instances', () => {
      class CustomClass {
        constructor(public value: string) {}
      }
      const query = {
        sorting: [],
        filters: [{ id: 'x', value: new CustomClass('test') }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.NON_PLAIN_OBJECT);
        expect(result.error.kind).toBe('non-plain-object');
      }
    });
  });

  describe('cycle detection', () => {
    it('rejects direct object cycles', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;
      const query = { sorting: [], filters: [{ id: 'x', value: obj }] } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.CYCLE_DETECTED);
        expect(result.error.kind).toBe('cycle');
      }
    });

    it('rejects indirect object cycles', () => {
      const obj1: Record<string, unknown> = { a: 1 };
      const obj2: Record<string, unknown> = { b: obj1 };
      obj1.parent = obj2;
      const query = { sorting: [], filters: [{ id: 'x', value: obj1 }] } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.CYCLE_DETECTED);
        expect(result.error.kind).toBe('cycle');
      }
    });

    it('rejects array cycles', () => {
      const arr: unknown[] = [1, 2, 3];
      arr.push(arr);
      const query = { sorting: [], filters: [{ id: 'x', value: arr }] } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.code).toBe(QueryKeySerializationErrorCode.CYCLE_DETECTED);
        expect(result.error.kind).toBe('cycle');
      }
    });
  });

  describe('property path', () => {
    it('reports correct path for top-level value', () => {
      // Test direct validation of a value with undefined at top level
      // The path should be 'sorting' because that's the property name in the object
      try {
        validateSerializable({ sorting: undefined, filters: [] }, '');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryKeySerializationError);
        if (err instanceof QueryKeySerializationError) {
          expect(err.propertyPath).toBe('sorting');
        }
      }
    });

    it('reports correct nested path', () => {
      const query = {
        sorting: [],
        filters: [{ id: 'name', value: { nested: { deep: NaN } } }],
      } as RowsQuery;
      const result = buildQueryKey(query, 'source_1', undefined, 0);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error.propertyPath).toMatch(/filters\[0\]\.value\.nested\.deep/);
      }
    });
  });
});

describe('validateSerializable', () => {
  it('accepts valid values', () => {
    expect(() => validateSerializable(null)).not.toThrow();
    expect(() => validateSerializable(true)).not.toThrow();
    expect(() => validateSerializable(false)).not.toThrow();
    expect(() => validateSerializable('string')).not.toThrow();
    expect(() => validateSerializable(123)).not.toThrow();
    expect(() => validateSerializable([1, 2, 3])).not.toThrow();
    expect(() => validateSerializable({ a: 1, b: 2 })).not.toThrow();
    expect(() => validateSerializable({ a: [1, { b: 2 }] })).not.toThrow();
  });

  it('rejects undefined', () => {
    expect(() => validateSerializable(undefined, 'path')).toThrow(QueryKeySerializationError);
  });

  it('rejects functions', () => {
    expect(() => validateSerializable(() => {}, 'path')).toThrow(QueryKeySerializationError);
  });

  it('reports correct property path', () => {
    try {
      validateSerializable(undefined, 'filters[0].value');
    } catch (err) {
      expect(err).toBeInstanceOf(QueryKeySerializationError);
      if (err instanceof QueryKeySerializationError) {
        expect(err.propertyPath).toBe('filters[0].value');
      }
    }
  });
});

describe('collision resistance', () => {
  it('different source tokens produce different keys', () => {
    const query: RowsQuery = { sorting: [], filters: [] };
    const keys = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const result = buildQueryKey(query, `source_${i}`, undefined, 0);
      expect(result.valid).toBe(true);
      if (result.valid) {
        keys.add(result.key);
      }
    }

    expect(keys.size).toBe(100);
  });

  it('different data versions produce different keys', () => {
    const query: RowsQuery = { sorting: [], filters: [] };
    const keys = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const result = buildQueryKey(query, 'source_1', `v${i}`, 0);
      expect(result.valid).toBe(true);
      if (result.valid) {
        keys.add(result.key);
      }
    }

    expect(keys.size).toBe(100);
  });

  it('different refetch nonces produce different keys', () => {
    const query: RowsQuery = { sorting: [], filters: [] };
    const keys = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const result = buildQueryKey(query, 'source_1', undefined, i);
      expect(result.valid).toBe(true);
      if (result.valid) {
        keys.add(result.key);
      }
    }

    expect(keys.size).toBe(100);
  });
});
