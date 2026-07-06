/**
 * @lynellf/tablekit-pivot/aggregators — registry (spec §4.3 + §9.2).
 *
 * Mirrors the M0 sorting/filtering registry pattern:
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
        `[tablekit-pivot] registerAggregator("${name}") shadows a built-in aggregator. Choose a different name to avoid ambiguity.`,
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
