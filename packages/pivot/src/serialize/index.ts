/**
 * @lynellf/tablekit-pivot/serialize — PivotQuery serialization (phase 1 stub).
 *
 * Phase 6 + M5 plumbing ship:
 *  - `buildPivotQuery(state, opts)` — pure PivotConfig → PivotQuery serializer
 *  - `validatePivotQuery(q)` — dev warning on inline aggregator/predicate leaks
 *  - `__resetInlineLeakWarningForTests`
 */

export type {
  PivotQuery,
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
} from '../types';
export {} from './query'; // populated in phase 6
export {} from './warnings'; // populated in phase 6
