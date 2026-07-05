/**
 * Filtering registry — built-ins + extension seam.
 *
 * Spec §4.3 + P3: filter predicates cross the serialization boundary
 * (RowsQuery.filters in §5.1) and so must be referenced by name.
 */

import type { FilterFn } from '../types';

type AnyRow = Record<string, unknown>;

const builtInFilterFns: Record<string, FilterFn<AnyRow>> = {
  includesString: (row, columnId, filterValue) => {
    const cell = row[columnId];
    if (typeof cell !== 'string') return false;
    if (typeof filterValue !== 'string') return false;
    return cell.toLowerCase().includes(filterValue.toLowerCase());
  },
  equalsString: (row, columnId, filterValue) => {
    const cell = row[columnId];
    if (typeof cell !== 'string' || typeof filterValue !== 'string') return false;
    return cell === filterValue;
  },
  equals: (row, columnId, filterValue) => Object.is(row[columnId], filterValue),
  inNumberRange: (row, columnId, filterValue) => {
    const cell = row[columnId];
    if (typeof cell !== 'number') return false;
    if (!Array.isArray(filterValue) || filterValue.length !== 2) return false;
    const [min, max] = filterValue as [number, number];
    return cell >= min && cell <= max;
  },
  arrIncludes: (row, columnId, filterValue) => {
    const cell = row[columnId];
    if (!Array.isArray(cell) || !Array.isArray(filterValue)) return false;
    return (filterValue as unknown[]).some((v) => (cell as unknown[]).includes(v));
  },
};

// Freeze the built-in map to prevent accidental mutation of built-ins.
// Consumer registrations go into the separate `customFilterFns` map.
Object.freeze(builtInFilterFns);

/** Mutable map for consumer-registered filter functions. */
const customFilterFns: Record<string, FilterFn<AnyRow>> = {};

export const getFilterFn = <TRow>(name: string): FilterFn<TRow> => {
  // Check custom registrations first, then fall back to built-ins.
  const fn = customFilterFns[name] ?? builtInFilterFns[name];
  if (!fn) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Unknown filter fn "${name}". Register it via registerFilterFn().`);
    }
    return builtInFilterFns.equals as unknown as FilterFn<TRow>;
  }
  return fn as unknown as FilterFn<TRow>;
};

export const registerFilterFn = <TRow>(name: string, fn: FilterFn<TRow>): void => {
  customFilterFns[name] = fn as FilterFn<AnyRow>;
};

export const BUILT_IN_FILTER_FNS = [
  'includesString',
  'equalsString',
  'equals',
  'inNumberRange',
  'arrIncludes',
] as const;

export type BuiltInFilterFn = (typeof BUILT_IN_FILTER_FNS)[number];

export { builtInFilterFns };
