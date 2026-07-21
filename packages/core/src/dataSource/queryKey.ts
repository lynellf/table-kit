/**
 * @lynellf/tablekit-core/dataSource — canonical query-key serializer.
 *
 * Produces a deterministic JSON-safe string key from a query descriptor.
 * The key is used to detect when a new request should be issued vs reusing cached data.
 *
 * Accepted grammar: null, booleans, strings, finite numbers, arrays (preserving order),
 * plain objects with recursively sorted own string keys.
 *
 * Rejected: undefined (including array members), functions, symbols, bigint, NaN,
 * positive/negative infinity, cyclic graphs, Date, Map, Set, class instances,
 * and other non-plain objects.
 *
 * Registry names are the only function representation allowed across the query boundary.
 * An inline/unregistered filter predicate is an error, never an equals fallback.
 *
 * B7-SERIALIZER-ERRORS: Rejected input produces a typed deterministic error rather
 * than throwing during render.
 */

import type { RowsQuery } from './types';

/**
 * Error code for query-key serialization failures.
 */
export const QueryKeySerializationErrorCode = {
  UNDEFINED_VALUE: 'UNDEFINED_VALUE',
  FUNCTION_VALUE: 'FUNCTION_VALUE',
  SYMBOL_VALUE: 'SYMBOL_VALUE',
  BIGINT_VALUE: 'BIGINT_VALUE',
  NAN_VALUE: 'NAN_VALUE',
  INFINITY_VALUE: 'INFINITY_VALUE',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  DATE_VALUE: 'DATE_VALUE',
  MAP_VALUE: 'MAP_VALUE',
  SET_VALUE: 'SET_VALUE',
  NON_PLAIN_OBJECT: 'NON_PLAIN_OBJECT',
  CIRCULAR_REFERENCE: 'CIRCULAR_REFERENCE',
} as const;

export type QueryKeySerializationErrorCode =
  (typeof QueryKeySerializationErrorCode)[keyof typeof QueryKeySerializationErrorCode];

/**
 * Kind of value that caused serialization to fail.
 */
export type SerializationErrorKind =
  | 'undefined'
  | 'function'
  | 'symbol'
  | 'bigint'
  | 'nan'
  | 'infinity'
  | 'cycle'
  | 'date'
  | 'map'
  | 'set'
  | 'non-plain-object'
  | 'circular-reference';

/**
 * A deterministic serialization error with stable code, kind, and property path.
 * Property path uses dot notation for nested properties (e.g., "filters[0].value.term").
 */
export class QueryKeySerializationError extends Error {
  readonly code: QueryKeySerializationErrorCode;
  readonly kind: SerializationErrorKind;
  readonly propertyPath: string;

  constructor(
    code: QueryKeySerializationErrorCode,
    kind: SerializationErrorKind,
    propertyPath: string,
  ) {
    const path = propertyPath ? ` at ${propertyPath}` : '';
    super(`Query key serialization failed${path}: ${code}`);
    this.name = 'QueryKeySerializationError';
    this.code = code;
    this.kind = kind;
    this.propertyPath = propertyPath;
  }
}

/**
 * Result of serializing a query descriptor.
 * Either a valid key string, or an invalid descriptor carrying the error.
 */
export type QueryKeyResult =
  | { valid: true; key: string }
  | { valid: false; error: QueryKeySerializationError };

/**
 * Check if a value is a plain object (created by Object constructor or with null prototype).
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Check if a number is finite (not NaN, not Infinity).
 */
const isFiniteNumber = (n: number): boolean => Number.isFinite(n);

/**
 * Represents a JSON-safe serializable value.
 */
type Serializable =
  | string
  | number
  | boolean
  | null
  | Serializable[]
  | { [key: string]: Serializable };

/**
 * Serialize a value to a JSON-safe representation with sorted keys.
 * Throws QueryKeySerializationError for rejected values.
 *
 * @param value - The value to serialize
 * @param path - Dot-notation path to this value (for error reporting)
 * @param seen - Set of already-visited object references (for cycle detection)
 */
const serializeValue = (value: unknown, path: string, seen: Set<unknown>): Serializable => {
  // null
  if (value === null) {
    return null;
  }

  // boolean
  if (typeof value === 'boolean') {
    return value;
  }

  // string
  if (typeof value === 'string') {
    return value;
  }

  // finite number
  if (typeof value === 'number' && isFiniteNumber(value)) {
    return value;
  }

  // NaN - REJECTED
  if (typeof value === 'number' && Number.isNaN(value)) {
    throw new QueryKeySerializationError(QueryKeySerializationErrorCode.NAN_VALUE, 'nan', path);
  }

  // Infinity - REJECTED (for non-finite numbers like Infinity, -Infinity)
  if (typeof value === 'number' && !isFiniteNumber(value)) {
    throw new QueryKeySerializationError(
      QueryKeySerializationErrorCode.INFINITY_VALUE,
      'infinity',
      path,
    );
  }

  // undefined - REJECTED
  if (value === undefined) {
    throw new QueryKeySerializationError(
      QueryKeySerializationErrorCode.UNDEFINED_VALUE,
      'undefined',
      path,
    );
  }

  // function - REJECTED (registry names are the only allowed function representation)
  if (typeof value === 'function') {
    throw new QueryKeySerializationError(
      QueryKeySerializationErrorCode.FUNCTION_VALUE,
      'function',
      path,
    );
  }

  // symbol - REJECTED
  if (typeof value === 'symbol') {
    throw new QueryKeySerializationError(
      QueryKeySerializationErrorCode.SYMBOL_VALUE,
      'symbol',
      path,
    );
  }

  // bigint - REJECTED
  if (typeof value === 'bigint') {
    throw new QueryKeySerializationError(
      QueryKeySerializationErrorCode.BIGINT_VALUE,
      'bigint',
      path,
    );
  }

  // Date - REJECTED
  if (value instanceof Date) {
    throw new QueryKeySerializationError(QueryKeySerializationErrorCode.DATE_VALUE, 'date', path);
  }

  // Map - REJECTED
  if (value instanceof Map) {
    throw new QueryKeySerializationError(QueryKeySerializationErrorCode.MAP_VALUE, 'map', path);
  }

  // Set - REJECTED
  if (value instanceof Set) {
    throw new QueryKeySerializationError(QueryKeySerializationErrorCode.SET_VALUE, 'set', path);
  }

  // Array - serialize elements preserving order
  if (Array.isArray(value)) {
    // Check for cycles
    if (seen.has(value)) {
      throw new QueryKeySerializationError(
        QueryKeySerializationErrorCode.CYCLE_DETECTED,
        'cycle',
        path,
      );
    }
    seen.add(value);

    const result: Serializable[] = [];
    for (let i = 0; i < value.length; i++) {
      // undefined in array is REJECTED
      if (value[i] === undefined) {
        throw new QueryKeySerializationError(
          QueryKeySerializationErrorCode.UNDEFINED_VALUE,
          'undefined',
          `${path}[${i}]`,
        );
      }
      result.push(serializeValue(value[i], `${path}[${i}]`, seen));
    }

    // Remove sentinel for this array (but keep sentinels for nested objects)
    seen.delete(value);
    return result;
  }

  // Plain object - serialize keys in sorted order
  if (isPlainObject(value)) {
    // Check for cycles
    if (seen.has(value)) {
      throw new QueryKeySerializationError(
        QueryKeySerializationErrorCode.CYCLE_DETECTED,
        'cycle',
        path,
      );
    }
    seen.add(value);

    const result: { [key: string]: Serializable } = {};
    // Get own string keys and sort them
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      const fullPath = path ? `${path}.${key}` : key;
      result[key] = serializeValue(value[key], fullPath, seen);
    }

    // Remove sentinel for this object
    seen.delete(value);
    return result;
  }

  // Non-plain object (class instance, built-in object) - REJECTED
  throw new QueryKeySerializationError(
    QueryKeySerializationErrorCode.NON_PLAIN_OBJECT,
    'non-plain-object',
    path,
  );
};

/**
 * Build a canonical query key from a query descriptor.
 *
 * Returns either a valid key string or an invalid descriptor carrying the error.
 * This allows the request effect to handle the error gracefully without throwing during render.
 *
 * @param query - The RowsQuery to serialize
 * @param sourceToken - Unique token identifying the source instance
 * @param dataVersion - Optional data version token
 * @param refetchNonce - Nonce for refetch requests
 */
export const buildQueryKey = (
  query: RowsQuery,
  sourceToken: string,
  dataVersion: string | number | undefined,
  refetchNonce: number,
): QueryKeyResult => {
  try {
    // Build the descriptor object
    const descriptor = {
      sourceToken,
      query: serializeValue(query, 'query', new Set()),
      dataVersion: dataVersion !== undefined ? dataVersion : null,
      refetchNonce,
    };

    // Serialize to JSON - should not throw since we validated all values above
    const key = JSON.stringify(descriptor);
    return { valid: true, key };
  } catch (err) {
    if (err instanceof QueryKeySerializationError) {
      return { valid: false, error: err };
    }
    // Unexpected error - wrap it
    return {
      valid: false,
      error: new QueryKeySerializationError(
        QueryKeySerializationErrorCode.CIRCULAR_REFERENCE,
        'circular-reference',
        '',
      ),
    };
  }
};

/**
 * Test-only: validate a value without building a key.
 * Throws QueryKeySerializationError if the value cannot be serialized.
 *
 * @param value - The value to validate
 * @param path - Dot-notation path to this value (for error reporting)
 */
export const validateSerializable = (value: unknown, path = ''): void => {
  serializeValue(value, path, new Set());
};
