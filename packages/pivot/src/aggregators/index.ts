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
