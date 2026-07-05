/**
 * Sorting registry — built-ins + extension seam.
 *
 * Spec §4.3 + P3: sorting functions cross the serialization boundary
 * (RowsQuery in §5.1) and so must be referenced by name. Inline functions
 * are permitted for main-thread execution but emit a runtime warning when
 * they leak into a controlled slice that is sent to the server (M3).
 */

import type { SortingFn } from '../types';

type AnyRow = Record<string, unknown>;

/**
 * Generic comparator that works for any comparable value (string, number, bigint, Date).
 * `null`/`undefined` are placed per `sortUndefined` (`first` or `last`).
 */
const compareValues = (a: unknown, b: unknown, sortUndefined: 'first' | 'last'): number => {
  if (a === b) return 0;
  if (a == null) return sortUndefined === 'first' ? -1 : 1;
  if (b == null) return sortUndefined === 'first' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  // Fall back to locale-aware string compare.
  return String(a).localeCompare(String(b));
};

const builtInSortingFns: Record<string, SortingFn<AnyRow>> = {
  alphanumeric: (rowA, rowB, columnId) => {
    const a = rowA[columnId];
    const b = rowB[columnId];
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }
    return compareValues(a, b, 'last');
  },
  text: (rowA, rowB, columnId) => {
    const a = rowA[columnId];
    const b = rowB[columnId];
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b);
    }
    return compareValues(a, b, 'last');
  },
  number: (rowA, rowB, columnId) => compareValues(rowA[columnId], rowB[columnId], 'last'),
  datetime: (rowA, rowB, columnId) => {
    const a = rowA[columnId];
    const b = rowB[columnId];
    if (a instanceof Date || b instanceof Date) {
      return compareValues(a, b, 'last');
    }
    // ISO 8601 strings sort lexically.
    return compareValues(a, b, 'last');
  },
  basic: (rowA, rowB, columnId) => compareValues(rowA[columnId], rowB[columnId], 'last'),
};

// Freeze the built-in map to prevent accidental mutation of built-ins.
// Consumer registrations go into the separate `customSortingFns` map.
Object.freeze(builtInSortingFns);

/** Mutable map for consumer-registered sorting functions. */
const customSortingFns: Record<string, SortingFn<AnyRow>> = {};

/** Lookup a sorting fn by registry name. Throws in dev for unknown names. */
export const getSortingFn = <TRow>(name: string): SortingFn<TRow> => {
  // Check custom registrations first, then fall back to built-ins.
  const fn = customSortingFns[name] ?? builtInSortingFns[name];
  if (!fn) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Unknown sorting fn "${name}". Register it via registerSortingFn().`);
    }
    // In production, fall back to `basic` to avoid hard-failing user apps.
    return builtInSortingFns.basic as unknown as SortingFn<TRow>;
  }
  return fn as unknown as SortingFn<TRow>;
};

/** Register a consumer sorting fn by name. Overwrites an existing entry of the same name. */
export const registerSortingFn = <TRow>(name: string, fn: SortingFn<TRow>): void => {
  customSortingFns[name] = fn as SortingFn<AnyRow>;
};

/** List of built-in sorting fn names. Stable for documentation and type tests. */
export const BUILT_IN_SORTING_FNS = [
  'alphanumeric',
  'text',
  'number',
  'datetime',
  'basic',
] as const;

export type BuiltInSortingFn = (typeof BUILT_IN_SORTING_FNS)[number];

export { builtInSortingFns };
