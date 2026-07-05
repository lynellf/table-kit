# Phase 2 — Registries (sorting + filtering)

**Goal:** Implement the registry pattern from spec §4.3 + P3 (name-referenced serialization). Ship built-in sorting and filtering functions with stable names, plus a registry helper that lets consumers register their own.

After this phase, consumers can:
- Use any of the built-in sort/filter functions by string name (e.g., `sortingFn: 'alphanumeric'`) or by inline function.
- Look up a registered function by name at runtime via `getSortingFn(name)` / `getFilterFn(name)`.
- Register additional functions via `registerSortingFn()` / `registerFilterFn()`.

The state engine (phase 4) will use these getters to resolve string-referenced functions in slice state.

---

## 1. Files created in this phase

| File                                                | Purpose                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/core/src/registries/sorting.ts`           | `SortingFn` re-export, registry of built-ins, `registerSortingFn`, `getSortingFn` |
| `packages/core/src/registries/sorting.test.ts`      | Unit tests for built-ins + registry behavior                                   |
| `packages/core/src/registries/filtering.ts`         | `FilterFn` re-export, registry of built-ins, `registerFilterFn`, `getFilterFn` |
| `packages/core/src/registries/filtering.test.ts`    | Unit tests for built-ins + registry behavior                                   |
| `packages/core/src/registries/index.ts`             | Barrel re-export                                                               |

No package config changes in this phase.

---

## 2. File contents

### 2.1 `packages/core/src/registries/sorting.ts`

```ts
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

// Freeze to prevent accidental mutation by consumers.
Object.freeze(builtInSortingFns);

/** Lookup a sorting fn by registry name. Throws in dev for unknown names. */
export const getSortingFn = <TRow>(name: string): SortingFn<TRow> => {
  const fn = builtInSortingFns[name];
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
  (builtInSortingFns as Record<string, SortingFn<AnyRow>>)[name] = fn as SortingFn<AnyRow>;
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
```

### 2.2 `packages/core/src/registries/sorting.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_SORTING_FNS,
  builtInSortingFns,
  getSortingFn,
  registerSortingFn,
} from './sorting';

describe('sorting registry', () => {
  describe('built-ins', () => {
    it('exposes the five built-in fns from §4.3', () => {
      expect(BUILT_IN_SORTING_FNS).toEqual([
        'alphanumeric',
        'text',
        'number',
        'datetime',
        'basic',
      ]);
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
        (process.env as { NODE_ENV?: string }).NODE_ENV = original;
      }
    });

    it('built-ins object is frozen', () => {
      expect(Object.isFrozen(builtInSortingFns)).toBe(true);
    });
  });
});
```

### 2.3 `packages/core/src/registries/filtering.ts`

```ts
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

Object.freeze(builtInFilterFns);

export const getFilterFn = <TRow>(name: string): FilterFn<TRow> => {
  const fn = builtInFilterFns[name];
  if (!fn) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Unknown filter fn "${name}". Register it via registerFilterFn().`);
    }
    return builtInFilterFns.equals as unknown as FilterFn<TRow>;
  }
  return fn as unknown as FilterFn<TRow>;
};

export const registerFilterFn = <TRow>(name: string, fn: FilterFn<TRow>): void => {
  (builtInFilterFns as Record<string, FilterFn<AnyRow>>)[name] = fn as FilterFn<AnyRow>;
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
```

### 2.4 `packages/core/src/registries/filtering.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_FILTER_FNS,
  builtInFilterFns,
  getFilterFn,
  registerFilterFn,
} from './filtering';

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
      expect(fn({ v: NaN }, 'v', NaN)).toBe(true); // Object.is(NaN, NaN) === true
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
        (process.env as { NODE_ENV?: string }).NODE_ENV = original;
      }
    });

    it('built-ins object is frozen', () => {
      expect(Object.isFrozen(builtInFilterFns)).toBe(true);
    });
  });
});
```

### 2.5 `packages/core/src/registries/index.ts`

```ts
export {
  BUILT_IN_SORTING_FNS,
  builtInSortingFns,
  getSortingFn,
  registerSortingFn,
  type BuiltInSortingFn,
} from './sorting';

export {
  BUILT_IN_FILTER_FNS,
  builtInFilterFns,
  getFilterFn,
  registerFilterFn,
  type BuiltInFilterFn,
} from './filtering';
```

---

## 3. Commands (in order)

```bash
# 1. Write all five files above (use write tool, contents from §2).
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 2:
- All phase-1 tests still pass.
- 12 new sorting tests pass.
- 12 new filtering tests pass.
- `pnpm verify` exit 0.

---

## 4. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Expected output:
#   ✓ sorting registry > built-ins > alphanumeric sorts strings with numeric awareness
#   ... (12 sorting tests)
#   ✓ filtering registry > built-ins > includesString is case-insensitive
#   ... (12 filtering tests)
```

---

## 5. Out of scope for this phase

- Aggregator registry — phase 4 of M4 (PivotTable).
- Predicate registry for PivotTable filters (`predicateRef`) — M4.
- Serializer/deserializer for `RowsQuery.filters` — M3.

---

## 6. Risks specific to this phase

| Risk                                                                  | Mitigation                                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mutating `builtInSortingFns` / `builtInFilterFns` from another module. | `Object.freeze`; dev warnings if `register*` is called with a name that already exists (TBD in M4 if needed; M0 silent).   |
| `process.env.NODE_ENV` not set in Vitest.                             | Vitest sets it to `'test'` by default; we explicitly treat anything other than `'production'` as dev for the throw path.   |
| `noUncheckedIndexedAccess` on `filterValue as [number, number]`.      | Cast inside `inNumberRange` after the runtime length check; type assertion is safe because we verified the shape.           |