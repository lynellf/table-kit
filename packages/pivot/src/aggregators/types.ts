/**
 * @lynellf/tablekit-pivot/aggregators — Aggregator interface (phase 1).
 *
 * Spec §9.2: reducer-shaped aggregators with required `merge` for worker/server
 * engines. The registry, built-ins, and `nameOfAggregator` reverse lookup land
 * in phase 2.
 *
 * Re-exported from `packages/pivot/src/types.ts` for consumer convenience;
 * imported directly from `/aggregators` for tree-shakeable aggregator-only usage.
 */

export type { Aggregator } from '../types';
