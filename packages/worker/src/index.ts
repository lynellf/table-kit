/**
 * @lynellf/tablekit-worker — framework-free worker pivot engine + server engine.
 *
 * M5 surface:
 *  - createWorkerEngine({ createWorker }) → AggregationEngine<TRow> + setRows()
 *  - createWorkerEntry() → worker-side entry factory
 *  - registerAggregators / registerFilterFns (bulk helpers)
 *
 * Subpaths:
 *  - /protocol — WorkerRequest / WorkerResponse / WirePivotQuery / RequestId
 *  - /server   — createServerEngine
 */

// ─── Engine ────────────────────────────────────────────────────────────────────
export { createWorkerEngine } from './engine/createWorkerEngine';
export type { WorkerEngineOptions, WorkerEngine } from './engine/createWorkerEngine';

// ─── Entry ──────────────────────────────────────────────────────────────────────
export { createWorkerEntry } from './entry/createWorkerEntry';
export type { WorkerEntryHandle } from './entry/createWorkerEntry';

// ─── Serialization ─────────────────────────────────────────────────────────────
export { serializeQuery } from './serialization/serializeQuery';

// ─── Bulk registration helpers ──────────────────────────────────────────────────
export {
  validateAggregatorRegistrations,
  type AggregatorRegistration,
} from './aggregators/bulkRegister';
export {
  validateFilterRegistrations,
  type FilterRegistration,
  type WorkerFilterFn,
} from './filters/bulkRegister';

export { VERSION } from './version';
