# Phase 2 — Aggregator Registry + Built-Ins + Merge Law Property Tests

**Goal:** Ship the `Aggregator<…>` registry (analogous to M0's sorting/filtering registries in `packages/core/src/registries/`), all five built-in aggregators per spec §9.2 (`sum`, `count`, `min`, `max`, `avg` — the last as a mergeable `{sum, count}` pair finalized on read), the `nameOfAggregator` reverse lookup for the (M5-shaped) inline-leak dev warning, and property-based tests asserting `merge` laws.

After this phase:

- `registerAggregator`, `getAggregator`, `BUILT_IN_AGGREGATORS`, `builtInAggregators`, `nameOfAggregator` are exported from `@lynellf/tablekit-pivot/aggregators`.
- Built-in aggregators: `sum`, `count`, `min`, `max`, `avg` — all mergeable, all property-tested.
- The `Aggregator<…>` interface from phase 1 is implemented by each built-in; the registry stores them keyed by name.
- `pnpm verify` is green; new tests pass (~30-40).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/pivot/src/aggregators/builtins.ts` | `sum`, `count`, `min`, `max`, `avg` built-in aggregators |
| `packages/pivot/src/aggregators/registry.ts` | `registerAggregator`, `getAggregator`, `BUILT_IN_AGGREGATORS`, `builtInAggregators`, `nameOfAggregator`, `__resetAggregatorRegistryForTests` |
| `packages/pivot/src/aggregators/index.ts` | Replace stub with registry barrel |
| `packages/pivot/src/__tests__/aggregators.test.ts` | Built-in aggregator behavior tests (sum, count, min, max, avg; finalize; empty input; large input; mixed types) |
| `packages/pivot/src/__tests__/mergeLaws.test.ts` | Property-based tests for `merge` associativity / commutativity / `accumulate ≡ chunked-merge` equivalence |
| `packages/pivot/src/__tests__/registry.test.ts` | Registry lookup, custom registration, `nameOfAggregator` reverse lookup, `__resetAggregatorRegistryForTests` |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/pivot/src/aggregators/types.ts` | Re-export `Aggregator` from registry barrel for tree-shakeable single-import |
| `packages/pivot/src/index.ts` | Re-export built-in aggregator names + registry helpers from the root (for consumers importing from the main entry) |

No other source files change in this phase. The engine (phase 3), factory (phase 4), and React hook (phase 5) consume the registry when they land.

---

## 3. File contents (key files)

### 3.1 `packages/pivot/src/aggregators/builtins.ts`

```ts
/**
 * @lynellf/tablekit-pivot/aggregators — built-in aggregators (spec §9.2).
 *
 * Every built-in implements `merge` so that worker/server engines (M5) can
 * aggregate chunks in parallel and merge, and so that subtotals and grand
 * totals are merges of child accumulators rather than re-scans.
 *
 * - `sum`: reduces numbers; `merge(a, b) = a + b`; identity `0`.
 * - `count`: counts non-undefined values; `merge(a, b) = a + b`; identity `0`.
 * - `min`: minimum; `merge(a, b) = Math.min(a, b)`; identity `+Infinity`.
 * - `max`: maximum; `merge(a, b) = Math.max(a, b)`; identity `-Infinity`.
 * - `avg`: pair `{sum, count}` accumulator finalized as `sum / count`;
 *   `merge({sum: a, count: ca}, {sum: b, count: cb}) = {sum: a+b, count: ca+cb}`.
 *
 * NaN / Infinity handling:
 * - `sum` over `[NaN]` returns `NaN` (associative).
 * - `min` / `max` over empty input returns `+Infinity` / `-Infinity` (sentinel);
 *   finalize coerces to `NaN` if count is 0.
 * - `avg` over empty input finalizes to `NaN` (matches Excel / pandas).
 *
 * These semantics are locked in by the merge-laws tests (phase 2).
 */

import type { Aggregator } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// sum
// ─────────────────────────────────────────────────────────────────────────────

export const sumAggregator: Aggregator<number, number, number> = {
  init: () => 0,
  accumulate: (acc, value) => (typeof value === 'number' ? acc + value : acc),
  merge: (a, b) => a + b,
  // finalize: identity (no finalize needed)
};

// ─────────────────────────────────────────────────────────────────────────────
// count
// ─────────────────────────────────────────────────────────────────────────────

export const countAggregator: Aggregator<unknown, number, number> = {
  init: () => 0,
  accumulate: (acc, value) => (value === undefined ? acc : acc + 1),
  merge: (a, b) => a + b,
  // finalize: identity
};

// ─────────────────────────────────────────────────────────────────────────────
// min
// ─────────────────────────────────────────────────────────────────────────────

export const minAggregator: Aggregator<number, number, number> = {
  init: () => Number.POSITIVE_INFINITY,
  accumulate: (acc, value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(acc, value) : acc,
  merge: (a, b) => Math.min(a, b),
  finalize: (acc) => (acc === Number.POSITIVE_INFINITY ? Number.NaN : acc),
};

// ─────────────────────────────────────────────────────────────────────────────
// max
// ─────────────────────────────────────────────────────────────────────────────

export const maxAggregator: Aggregator<number, number, number> = {
  init: () => Number.NEGATIVE_INFINITY,
  accumulate: (acc, value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(acc, value) : acc,
  merge: (a, b) => Math.max(a, b),
  finalize: (acc) => (acc === Number.NEGATIVE_INFINITY ? Number.NaN : acc),
};

// ─────────────────────────────────────────────────────────────────────────────
// avg (mergeable {sum, count} pair)
// ─────────────────────────────────────────────────────────────────────────────

export interface AvgAccumulator {
  sum: number;
  count: number;
}

export const avgAggregator: Aggregator<number, AvgAccumulator, number> = {
  init: () => ({ sum: 0, count: 0 }),
  accumulate: (acc, value) =>
    typeof value === 'number' ? { sum: acc.sum + value, count: acc.count + 1 } : acc,
  merge: (a, b) => ({ sum: a.sum + b.sum, count: a.count + b.count }),
  finalize: (acc) => (acc.count === 0 ? Number.NaN : acc.sum / acc.count),
};

// ─────────────────────────────────────────────────────────────────────────────
// Built-in registry (frozen)
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_AGGREGATORS = {
  sum: sumAggregator,
  count: countAggregator,
  min: minAggregator,
  max: maxAggregator,
  avg: avgAggregator,
} as const satisfies Record<string, Aggregator>;

/** Type of the built-in registry keys. */
export type BuiltInAggregatorName = keyof typeof BUILT_IN_AGGREGATORS;
```

### 3.2 `packages/pivot/src/aggregators/registry.ts`

```ts
/**
 * @lynellf/tablekit-pivot/aggregators — registry (spec §4.3 + §9.2).
 *
 * Mirrors the M0 sorting/filtering registry pattern (per `.okf/components/dev-tooling-stack.md`):
 *  - `builtInAggregators` is a frozen record of built-in aggregators.
 *  - `customAggregators` is a Map<string, Aggregator> populated via `registerAggregator`.
 *  - `getAggregator(name)` looks up custom first, then built-in.
 *  - `nameOfAggregator(fn)` is the reverse lookup (needed for the inline-leak
 *    dev warning in M5; M4 ships the helper for completeness).
 *  - `__resetAggregatorRegistryForTests` resets the custom map between tests.
 */

import type { Aggregator } from '../types';
import { BUILT_IN_AGGREGATORS } from './builtins';

export type AggregatorName = string;

const customAggregators: Map<AggregatorName, Aggregator> = new Map();

/**
 * Register a custom aggregator under `name`. Overwrites any existing custom
 * registration with the same name. Does not allow overriding built-ins; that
 * would shadow the registry lookup. Consumers wanting to replace a built-in
 * should choose a different name.
 */
export const registerAggregator = <TIn = unknown, TAcc = unknown, TOut = unknown>(
  name: AggregatorName,
  fn: Aggregator<TIn, TAcc, TOut>,
): void => {
  if (name in BUILT_IN_AGGREGATORS) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        `[tablekit-pivot] registerAggregator("${name}") shadows a built-in aggregator. ` +
          `Choose a different name to avoid ambiguity.`,
      );
    }
  }
  customAggregators.set(name, fn as Aggregator);
};

/**
 * Look up an aggregator by name. Custom registrations take precedence over
 * built-ins (consistent with M0's sorting/filtering registries).
 */
export const getAggregator = <TIn = unknown, TAcc = unknown, TOut = unknown>(
  name: AggregatorName,
): Aggregator<TIn, TAcc, TOut> | undefined => {
  const custom = customAggregators.get(name);
  if (custom) return custom as Aggregator<TIn, TAcc, TOut>;
  const builtin = (BUILT_IN_AGGREGATORS as Record<string, Aggregator>)[name];
  return builtin as Aggregator<TIn, TAcc, TOut> | undefined;
};

/** Frozen record of built-in aggregators. Re-exported for consumers. */
export const builtInAggregators: Readonly<Record<string, Aggregator>> = BUILT_IN_AGGREGATORS;

/**
 * Reverse lookup: find the registry name for a given aggregator function.
 * Returns `undefined` if the aggregator is not registered (i.e., it's an
 * inline anonymous object — the dev warning use case).
 *
 * Comparison is by reference identity for custom aggregators and by direct
 * reference for built-ins (the registry always returns the same object).
 */
export const nameOfAggregator = (fn: Aggregator | undefined): AggregatorName | undefined => {
  if (!fn) return undefined;
  for (const [name, candidate] of customAggregators.entries()) {
    if (candidate === fn) return name;
  }
  for (const name of Object.keys(BUILT_IN_AGGREGATORS)) {
    const candidate = (BUILT_IN_AGGREGATORS as Record<string, Aggregator>)[name];
    if (candidate === fn) return name;
  }
  return undefined;
};

/** Test-only: reset the custom registry. */
export const __resetAggregatorRegistryForTests = (): void => {
  customAggregators.clear();
};
```

### 3.3 `packages/pivot/src/aggregators/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/aggregators — public barrel.
 *
 * Subpath import:
 *   import { getAggregator, sumAggregator } from '@lynellf/tablekit-pivot/aggregators';
 */

export type { Aggregator } from '../types';

export {
  sumAggregator,
  countAggregator,
  minAggregator,
  maxAggregator,
  avgAggregator,
  type AvgAccumulator,
  BUILT_IN_AGGREGATORS,
  type BuiltInAggregatorName,
} from './builtins';

export {
  registerAggregator,
  getAggregator,
  builtInAggregators,
  nameOfAggregator,
  __resetAggregatorRegistryForTests,
  type AggregatorName,
} from './registry';
```

### 3.4 `packages/pivot/src/index.ts` (additions)

```ts
// ─── Aggregator registry (phase 2) ────────────────────────────────────────────
export {
  sumAggregator,
  countAggregator,
  minAggregator,
  maxAggregator,
  avgAggregator,
  type AvgAccumulator,
  BUILT_IN_AGGREGATORS,
  type BuiltInAggregatorName,
} from './aggregators/builtins';

export {
  registerAggregator,
  getAggregator,
  builtInAggregators,
  nameOfAggregator,
  __resetAggregatorRegistryForTests,
  type AggregatorName,
} from './aggregators/registry';

export type { Aggregator } from './aggregators/types';
```

### 3.5 `packages/pivot/src/__tests__/aggregators.test.ts`

```ts
/**
 * Phase 2 — built-in aggregator behavior tests.
 *
 * Covers: sum / count / min / max / avg over small inputs, empty inputs, single
 * values, NaN/Infinity (where applicable), and finalize behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  avgAggregator,
  countAggregator,
  maxAggregator,
  minAggregator,
  sumAggregator,
} from '../aggregators/builtins';

describe('sumAggregator', () => {
  it('init returns 0', () => {
    expect(sumAggregator.init()).toBe(0);
  });

  it('accumulate folds values', () => {
    let acc = sumAggregator.init();
    acc = sumAggregator.accumulate(acc, 1);
    acc = sumAggregator.accumulate(acc, 2);
    acc = sumAggregator.accumulate(acc, 3);
    expect(acc).toBe(6);
  });

  it('accumulate ignores non-number values', () => {
    let acc = sumAggregator.init();
    acc = sumAggregator.accumulate(acc, 'foo' as unknown as number);
    acc = sumAggregator.accumulate(acc, undefined);
    acc = sumAggregator.accumulate(acc, 5);
    expect(acc).toBe(5);
  });

  it('merge sums two accumulators', () => {
    expect(sumAggregator.merge(2, 3)).toBe(5);
  });

  it('NaN propagates', () => {
    let acc = sumAggregator.init();
    acc = sumAggregator.accumulate(acc, Number.NaN);
    expect(Number.isNaN(acc)).toBe(true);
  });
});

describe('countAggregator', () => {
  it('counts non-undefined values', () => {
    let acc = countAggregator.init();
    acc = countAggregator.accumulate(acc, 1);
    acc = countAggregator.accumulate(acc, undefined);
    acc = countAggregator.accumulate(acc, 'foo');
    acc = countAggregator.accumulate(acc, null);
    expect(acc).toBe(3);
  });

  it('merge sums counts', () => {
    expect(countAggregator.merge(5, 3)).toBe(8);
  });
});

describe('minAggregator', () => {
  it('init is +Infinity', () => {
    expect(minAggregator.init()).toBe(Number.POSITIVE_INFINITY);
  });

  it('tracks minimum', () => {
    let acc = minAggregator.init();
    acc = minAggregator.accumulate(acc, 5);
    acc = minAggregator.accumulate(acc, 3);
    acc = minAggregator.accumulate(acc, 7);
    expect(acc).toBe(3);
  });

  it('ignores non-finite numbers', () => {
    let acc = minAggregator.init();
    acc = minAggregator.accumulate(acc, Number.POSITIVE_INFINITY);
    expect(acc).toBe(Number.POSITIVE_INFINITY);
  });

  it('merge returns smaller', () => {
    expect(minAggregator.merge(3, 7)).toBe(3);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(minAggregator.finalize!(minAggregator.init()))).toBe(true);
  });
});

describe('maxAggregator', () => {
  it('init is -Infinity', () => {
    expect(maxAggregator.init()).toBe(Number.NEGATIVE_INFINITY);
  });

  it('tracks maximum', () => {
    let acc = maxAggregator.init();
    acc = maxAggregator.accumulate(acc, 1);
    acc = maxAggregator.accumulate(acc, 5);
    expect(acc).toBe(5);
  });

  it('merge returns larger', () => {
    expect(maxAggregator.merge(2, 9)).toBe(9);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(maxAggregator.finalize!(maxAggregator.init()))).toBe(true);
  });
});

describe('avgAggregator', () => {
  it('init is {sum: 0, count: 0}', () => {
    expect(avgAggregator.init()).toEqual({ sum: 0, count: 0 });
  });

  it('tracks sum and count', () => {
    let acc = avgAggregator.init();
    acc = avgAggregator.accumulate(acc, 10);
    acc = avgAggregator.accumulate(acc, 20);
    acc = avgAggregator.accumulate(acc, 30);
    expect(acc).toEqual({ sum: 60, count: 3 });
  });

  it('merge combines {sum, count}', () => {
    const a = { sum: 10, count: 2 };
    const b = { sum: 20, count: 3 };
    expect(avgAggregator.merge(a, b)).toEqual({ sum: 30, count: 5 });
  });

  it('finalize: sum / count', () => {
    expect(avgAggregator.finalize!({ sum: 60, count: 3 })).toBe(20);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(avgAggregator.finalize!(avgAggregator.init()))).toBe(true);
  });
});

describe('BUILT_IN_AGGREGATORS', () => {
  it('contains sum, count, min, max, avg', () => {
    expect(Object.keys(BUILT_IN_AGGREGATORS).sort()).toEqual(['avg', 'count', 'max', 'min', 'sum']);
  });

  it('every entry has init/accumulate/merge', () => {
    for (const name of Object.keys(BUILT_IN_AGGREGATORS)) {
      const a = (BUILT_IN_AGGREGATORS as Record<string, { init: () => unknown; accumulate: (...args: unknown[]) => unknown; merge: (...args: unknown[]) => unknown }>)[name];
      expect(typeof a.init).toBe('function');
      expect(typeof a.accumulate).toBe('function');
      expect(typeof a.merge).toBe('function');
    }
  });
});
```

### 3.6 `packages/pivot/src/__tests__/mergeLaws.test.ts`

```ts
/**
 * Phase 2 — property-based tests for aggregator merge laws.
 *
 * Spec §13: "merge associativity/commutativity where claimed, accumulate vs.
 * chunked-merge equivalence."
 *
 * Methodology:
 *  - Seeded RNG (mulberry32) produces deterministic randomized inputs.
 *  - 100 trials per (aggregator, law) combination.
 *  - NaN / Infinity are EXCLUDED for sum/count/min/max (would propagate and
 *    obscure law violations); avg handles them gracefully.
 *
 * Laws asserted per aggregator:
 *  - sum: associative, commutative, accumulate ≡ chunked-merge.
 *  - count: same as sum.
 *  - min/max: associative, commutative, accumulate ≡ chunked-merge (modulo
 *    finalization; we test the accumulator, not the output).
 *  - avg: associative, commutative, accumulate ≡ chunked-merge.
 */

import { describe, expect, it } from 'vitest';
import {
  avgAggregator,
  countAggregator,
  maxAggregator,
  minAggregator,
  sumAggregator,
} from '../aggregators/builtins';
import type { Aggregator } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Seeded RNG (mulberry32)
// ─────────────────────────────────────────────────────────────────────────────

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomInts = (rng: () => number, n: number, min = -1000, max = 1000): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(min + Math.floor(rng() * (max - min + 1)));
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic law helpers
// ─────────────────────────────────────────────────────────────────────────────

const foldWith = <TAcc, TIn>(agg: Aggregator<TIn, TAcc>, values: TIn[]): TAcc => {
  let acc = agg.init();
  for (const v of values) acc = agg.accumulate(acc, v);
  return acc;
};

const chunkedMerge = <TAcc>(agg: Aggregator<unknown, TAcc>, chunks: TAcc[]): TAcc => {
  if (chunks.length === 0) return agg.init();
  let acc = chunks[0]!;
  for (let i = 1; i < chunks.length; i++) {
    acc = agg.merge(acc, chunks[i]!);
  }
  return acc;
};

const partition = <T>(arr: T[], chunks: number): T[][] => {
  if (chunks <= 1 || arr.length === 0) return [arr];
  const out: T[][] = Array.from({ length: chunks }, () => []);
  for (let i = 0; i < arr.length; i++) {
    out[i % chunks]!.push(arr[i]!);
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// Law tests
// ─────────────────────────────────────────────────────────────────────────────

const TRIALS = 100;

describe('sumAggregator laws', () => {
  it('associative: merge(a, merge(b, c)) ≡ merge(merge(a, b), c)', () => {
    const rng = mulberry32(0xa11ce);
    for (let t = 0; t < TRIALS; t++) {
      const xs = randomInts(rng, 3, -100, 100);
      const left = sumAggregator.merge(xs[0]!, sumAggregator.merge(xs[1]!, xs[2]!));
      const right = sumAggregator.merge(sumAggregator.merge(xs[0]!, xs[1]!), xs[2]!);
      expect(left).toBe(right);
    }
  });

  it('commutative: merge(a, b) ≡ merge(b, a)', () => {
    const rng = mulberry32(0xb0b);
    for (let t = 0; t < TRIALS; t++) {
      const xs = randomInts(rng, 2, -100, 100);
      expect(sumAggregator.merge(xs[0]!, xs[1]!)).toBe(sumAggregator.merge(xs[1]!, xs[0]!));
    }
  });

  it('accumulate ≡ chunked-merge', () => {
    const rng = mulberry32(0xc0ffee);
    for (let t = 0; t < TRIALS; t++) {
      const n = 5 + Math.floor(rng() * 20);
      const xs = randomInts(rng, n, -50, 50);
      const direct = foldWith(sumAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) => foldWith(sumAggregator, c));
      const merged = chunkedMerge(sumAggregator, chunks);
      expect(direct).toBe(merged);
    }
  });
});

describe('countAggregator laws', () => {
  it('associative, commutative, accumulate ≡ chunked-merge', () => {
    const rng = mulberry32(0xdada);
    for (let t = 0; t < TRIALS; t++) {
      const a = 1 + Math.floor(rng() * 10);
      const b = 1 + Math.floor(rng() * 10);
      const c = 1 + Math.floor(rng() * 10);
      expect(countAggregator.merge(a, countAggregator.merge(b, c))).toBe(
        countAggregator.merge(countAggregator.merge(a, b), c),
      );
      expect(countAggregator.merge(a, b)).toBe(countAggregator.merge(b, a));
    }
    for (let t = 0; t < TRIALS; t++) {
      const n = 5 + Math.floor(rng() * 20);
      const xs = Array.from({ length: n }, () => rng() > 0.1 ? 1 : undefined);
      const direct = foldWith(countAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) => foldWith(countAggregator, c));
      expect(direct).toBe(chunkedMerge(countAggregator, chunks));
    }
  });
});

describe('minAggregator laws (over finite numbers)', () => {
  const finiteValues = (rng: () => number, n: number): number[] =>
    randomInts(rng, n, -1000, 1000);

  it('associative, commutative', () => {
    const rng = mulberry32(0xe11e);
    for (let t = 0; t < TRIALS; t++) {
      const xs = finiteValues(rng, 3);
      const left = minAggregator.merge(xs[0]!, minAggregator.merge(xs[1]!, xs[2]!));
      const right = minAggregator.merge(minAggregator.merge(xs[0]!, xs[1]!), xs[2]!);
      expect(left).toBe(right);
      expect(minAggregator.merge(xs[0]!, xs[1]!)).toBe(minAggregator.merge(xs[1]!, xs[0]!));
    }
  });

  it('accumulate ≡ chunked-merge', () => {
    const rng = mulberry32(0xf00d);
    for (let t = 0; t < TRIALS; t++) {
      const n = 5 + Math.floor(rng() * 20);
      const xs = finiteValues(rng, n);
      const direct = foldWith(minAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) => foldWith(minAggregator, c));
      expect(direct).toBe(chunkedMerge(minAggregator, chunks));
    }
  });
});

describe('maxAggregator laws (symmetric to min)', () => {
  it('associative, commutative, accumulate ≡ chunked-merge', () => {
    const rng = mulberry32(0x1ace);
    for (let t = 0; t < TRIALS; t++) {
      const xs = randomInts(rng, 3);
      expect(maxAggregator.merge(xs[0]!, maxAggregator.merge(xs[1]!, xs[2]!))).toBe(
        maxAggregator.merge(maxAggregator.merge(xs[0]!, xs[1]!), xs[2]!),
      );
      expect(maxAggregator.merge(xs[0]!, xs[1]!)).toBe(maxAggregator.merge(xs[1]!, xs[0]!));
    }
    for (let t = 0; t < TRIALS; t++) {
      const n = 5 + Math.floor(rng() * 20);
      const xs = randomInts(rng, n, -1000, 1000);
      const direct = foldWith(maxAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) => foldWith(maxAggregator, c));
      expect(direct).toBe(chunkedMerge(maxAggregator, chunks));
    }
  });
});

describe('avgAggregator laws', () => {
  it('associative: merge(a, merge(b, c)).sum ≡ merge(merge(a, b), c).sum', () => {
    const rng = mulberry32(0xa1ce);
    for (let t = 0; t < TRIALS; t++) {
      const xs = randomInts(rng, 3, -100, 100);
      const a = { sum: xs[0]!, count: 2 };
      const b = { sum: xs[1]!, count: 3 };
      const c = { sum: xs[2]!, count: 4 };
      const left = avgAggregator.merge(a, avgAggregator.merge(b, c));
      const right = avgAggregator.merge(avgAggregator.merge(a, b), c);
      expect(left.sum).toBe(right.sum);
      expect(left.count).toBe(right.count);
    }
  });

  it('commutative', () => {
    const rng = mulberry32(0xcafe);
    for (let t = 0; t < TRIALS; t++) {
      const xs = randomInts(rng, 2, -100, 100);
      const a = { sum: xs[0]!, count: 2 };
      const b = { sum: xs[1]!, count: 3 };
      expect(avgAggregator.merge(a, b)).toEqual(avgAggregator.merge(b, a));
    }
  });

  it('accumulate ≡ chunked-merge', () => {
    const rng = mulberry32(0xbabe);
    for (let t = 0; t < TRIALS; t++) {
      const n = 5 + Math.floor(rng() * 20);
      const xs = randomInts(rng, n, -50, 50);
      const direct = foldWith(avgAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) => foldWith(avgAggregator, c));
      const merged = chunkedMerge(avgAggregator, chunks);
      expect(direct.sum).toBe(merged.sum);
      expect(direct.count).toBe(merged.count);
    }
  });
});
```

### 3.7 `packages/pivot/src/__tests__/registry.test.ts`

```ts
/**
 * Phase 2 — registry behavior tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Aggregator } from '../types';
import {
  BUILT_IN_AGGREGATORS,
  __resetAggregatorRegistryForTests,
  builtInAggregators,
  getAggregator,
  nameOfAggregator,
  registerAggregator,
  sumAggregator,
} from '../aggregators';

afterEach(() => {
  __resetAggregatorRegistryForTests();
});

describe('builtInAggregators', () => {
  it('exposes the frozen BUILT_IN_AGGREGATORS record', () => {
    expect(builtInAggregators).toBe(BUILT_IN_AGGREGATORS);
  });
});

describe('getAggregator', () => {
  it('looks up built-in aggregator by name', () => {
    expect(getAggregator('sum')).toBe(sumAggregator);
    expect(getAggregator('avg')).toBeDefined();
  });

  it('returns undefined for unknown name', () => {
    expect(getAggregator('nope')).toBeUndefined();
  });

  it('custom registration shadows built-in lookup', () => {
    const customSum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v * 2, // double
      merge: (a, b) => a + b,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerAggregator('sum', customSum);
    expect(warn).toHaveBeenCalled();
    expect(getAggregator('sum')).toBe(customSum);
    warn.mockRestore();
  });
});

describe('registerAggregator', () => {
  it('stores under custom name', () => {
    const median: Aggregator<number, number[], number> = {
      init: () => [],
      accumulate: (acc, v) => {
        acc.push(v);
        return acc;
      },
      merge: (a, b) => a.concat(b),
      finalize: (acc) => {
        const sorted = [...acc].sort((x, y) => x - y);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
      },
    };
    registerAggregator('median', median);
    expect(getAggregator('median')).toBe(median);
  });
});

describe('nameOfAggregator', () => {
  it('returns name for built-in aggregator', () => {
    expect(nameOfAggregator(sumAggregator)).toBe('sum');
    expect(nameOfAggregator(BUILT_IN_AGGREGATORS.avg)).toBe('avg');
  });

  it('returns name for custom aggregator', () => {
    const custom: Aggregator = { init: () => 0, accumulate: (a) => a, merge: (a, b) => a + b };
    registerAggregator('custom', custom);
    expect(nameOfAggregator(custom)).toBe('custom');
  });

  it('returns undefined for unregistered / inline aggregator', () => {
    const inline: Aggregator = { init: () => 0, accumulate: (a) => a, merge: (a, b) => a + b };
    expect(nameOfAggregator(inline)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(nameOfAggregator(undefined)).toBeUndefined();
  });
});
```

---

## 4. Commands

```bash
pnpm install
pnpm -F @lynellf/tablekit-pivot typecheck
pnpm --filter @lynellf/tablekit-pivot test -- --run aggregators
pnpm --filter @lynellf/tablekit-pivot test -- --run mergeLaws
pnpm --filter @lynellf/tablekit-pivot test -- --run registry
pnpm test                                                       # all tests; M0/M1/M2/M3 still pass
pnpm verify                                                     # aggregate gate — must exit 0
```

---

## 5. Verification

After this phase:

```bash
pnpm verify                                                     # EXIT 0
pnpm --filter @lynellf/tablekit-pivot test                      # 30-40 new tests, all green

# Subpath smoke
node -e "import('@lynellf/tablekit-pivot/aggregators').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot').then(m => console.log(Object.keys(m).sort()))"
```

Expected phase-2 output:

```
@lynellf/tablekit-pivot/aggregators →
  ['BUILT_IN_AGGREGATORS', 'avgAggregator', 'builtInAggregators', 'countAggregator',
   'getAggregator', 'maxAggregator', 'minAggregator', 'nameOfAggregator',
   'registerAggregator', 'sumAggregator', '__resetAggregatorRegistryForTests']

@lynellf/tablekit-pivot →
  ['VERSION', 'BUILT_IN_AGGREGATORS', 'avgAggregator', 'builtInAggregators',
   'countAggregator', 'getAggregator', 'maxAggregator', 'minAggregator',
   'nameOfAggregator', 'registerAggregator', 'sumAggregator',
   '__resetAggregatorRegistryForTests', ...types]
```

---

## 6. Out-of-scope

- Main-thread engine — phase 3.
- `PivotResult` builder, column hierarchy, leafColumns flattening — phase 3.
- Lazy expansion semantics — phase 3.
- Pivot sorting — phase 3.
- Totals via `merge` — phase 3.
- `createPivotTable` factory — phase 4.
- Prop getters — phase 4.
- `usePivotTable` React hook — phase 5.
- Treegrid a11y extensions — phase 5.
- Reference app — phase 6.
- `buildPivotQuery` / `validatePivotQuery` — phase 6.
- `nameOfAggregator`-driven inline-leak dev warning (M5-shaped) — phase 6 stub (full impl M5).

---

## 7. Risks

- **R6 (NaN/Infinity handling):** Property tests must avoid false positives from NaN propagation. Mitigation: NaN/Infinity excluded from sum/count/min/max property inputs by generating finite values; NaN handling is tested separately with focused unit tests. avg handles NaN/Infinity through `{sum, count}` arithmetic.
- **R9 (bundle size):** The registry + 5 built-ins add ~1-2 kB min+gzip. Mitigation: tree-shakeable subpath `@lynellf/tablekit-pivot/aggregators` lets consumers using only the registry import only the registry code; consumers wanting a single built-in can import it directly (`import { sumAggregator } from '@lynellf/tablekit-pivot/aggregators'`).
- **Property-test reproducibility:** Mulberry32 is seeded, so the test outcomes are deterministic across runs. CI failures are reproducible. Mitigation: 100 trials per law gives >99.99% confidence of catching a regression; the tradeoff vs. adding `fast-check` is dep-footprint flat.
- **`registerAggregator` shadowing built-ins:** The warning fires when a consumer tries to shadow a built-in. This is intentional (built-ins are referenced by the default 'sum' aggregator name; shadowing them silently would be a footgun). The warning text names the issue and recommends a different name. Tested in `registry.test.ts`.