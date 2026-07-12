/**
 * @lynellf/tablekit-pivot — framework-free PivotTable primitives.
 *
 * M4 phase 1 surface (types only — implementations land in phases 2-6):
 *  - Types (§9.1, §9.3, §9.4, §9.6, §9.7)
 *  - Aggregator interface (§9.2)
 *  - PivotTableOptions / PivotTableInstance (factory impl in phase 4)
 *
 * Not yet exported (later phases):
 *  - Built-in aggregators, registry (phase 2)
 *  - createMainThreadEngine (phase 3)
 *  - createPivotTable factory (phase 4)
 *  - buildPivotQuery / validatePivotQuery (phase 6 + M5 plumbing)
 */

export const VERSION = '2.0.0' as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export type { OnChangeFn } from './types';
export type {
  FieldValue,
  RowPathKey,
  LeafColumnId,
  MeasureId,
  FieldRef,
  MeasureDef,
  PivotFilter,
  TotalsConfig,
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  PivotTableState,
  DEFAULT_PIVOT_STATE,
  Aggregator,
  MaybePromise,
  PivotTableStatus,
  AggregationEngine,
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
  InlinePivotFilter,
  PivotQueryFilter,
  PivotQuery,
  PivotLeafColumn,
  PivotColumnNode,
  PivotRowNode,
  PivotResult,
  PivotTableInstance,
  PivotTableOptions,
} from './types';

// ─── Aggregator re-export (interface only in phase 1) ────────────────────────
export type { Aggregator as AggregatorType } from './aggregators/types';

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

// ─── Engine + factory + serialize placeholders (impl in later phases) ────────

// ─── PivotTable factory (phase 4) ───────────────────────────────────────────────
export { createPivotTable } from './pivotTable/factory';
export { getVisibleRows } from './pivotTable/visibleRows';
export { getHeaderRows } from './pivotTable/headerRows';
export type { HeaderEntry } from './pivotTable/headerRows';
export {
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getToggleExpandedProps,
  getTotalsColumnProps,
} from './pivotTable/propGetters';
export { announceExpansion, announceSorting, announceTotals } from './pivotTable/announcer';

export { defaultGetRowId, __resetPivotDefaultGetRowIdWarningForTests } from './defaultGetRowId';
export {} from './engine';
export {} from './pivotTable';
export {} from './serialize';
