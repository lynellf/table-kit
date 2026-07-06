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

const chunkedMerge = <TAcc>(agg: Aggregator<unknown, NonNullable<TAcc>>, chunks: NonNullable<TAcc>[]): TAcc => {
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
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) =>
        foldWith(sumAggregator, c),
      );
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
      const xs = Array.from({ length: n }, () => (rng() > 0.1 ? 1 : undefined));
      const direct = foldWith(countAggregator, xs);
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) =>
        foldWith(countAggregator, c),
      );
      expect(direct).toBe(chunkedMerge(countAggregator, chunks));
    }
  });
});

describe('minAggregator laws (over finite numbers)', () => {
  const finiteValues = (rng: () => number, n: number): number[] => randomInts(rng, n, -1000, 1000);

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
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) =>
        foldWith(minAggregator, c),
      );
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
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) =>
        foldWith(maxAggregator, c),
      );
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
      const chunks = partition(xs, 1 + Math.floor(rng() * 4)).map((c) =>
        foldWith(avgAggregator, c),
      );
      const merged = chunkedMerge(avgAggregator, chunks);
      expect(direct.sum).toBe(merged.sum);
      expect(direct.count).toBe(merged.count);
    }
  });
});
