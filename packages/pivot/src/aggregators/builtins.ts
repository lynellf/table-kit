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
