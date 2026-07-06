/**
 * @lynellf/tablekit-pivot/engine — aggregation engine contract + main-thread impl.
 */

export type { AggregationEngine } from '../types';

export { createMainThreadEngine } from './mainThread';
export type { MainThreadEngineOptions } from './mainThread';

export { buildPivotResult, __registerCoreFilterFn, rowPathKeyOf } from './treeBuilder';
export { PivotResultCache } from './cache';
export { applyPivotSortingAtLevel } from './pivotSorting';
