# Phase 6 — Pivot headless parity

**Track:** P1–P4  
**Depends on:** Phase 1; P1–P4 may run in parallel with D1–D3  
**Unlocks:** PivotGrid UI and `2.3.0`

## Goal

Add the framework-free pivot contracts required by a field-builder and migration-grade PivotGrid, while preserving the existing aggregation/result/worker/server seams.

## Ordered tasks

### P1 — Field metadata and configuration model

**Files/discovery:** `packages/pivot/src/types.ts`, serialize/query modules, registry files, factory; add field metadata/type/serialization tests and update worker protocol types.

- Add `PivotFieldDef` metadata: stable ID/label/data type/accessor or accessor reference, allowed areas, default aggregator, and formatter reference.
- Define configuration commands or pure helpers for add/remove/reorder fields in rows, columns, measures, and filters. Keep configuration serializable and preserve existing `PivotConfig` compatibility.
- Validate duplicate IDs, invalid areas, missing fields, and inline functions at worker/server boundaries with stable diagnostic codes.

**Acceptance:** UI can build a complete field list from metadata without inspecting row objects; serialized configs contain registry references only; existing string/object field refs continue to compute.

### P2 — Subtotals, aggregation, and formatting

**Files/discovery:** `packages/pivot/src/aggregators/`, engine/tree builder, types, pivot tests and golden fixtures.

- Implement per-level subtotals and position/label policy using mergeable accumulators; preserve grand-total row/column semantics.
- Add distinct count plus selected common operations (sum/count/min/max/average and first/last where contractually supported). Define null/empty/NaN handling and total-operation metadata.
- Add formatter registry and locale-aware measure formatting metadata; keep arbitrary formatter functions main-thread-only and use names across boundaries.
- Add merge-law/property-style tests, multi-measure totals tests, and worker/server-compatible query golden files.

**Acceptance:** subtotal/grand-total results agree across main-thread, worker fixtures, and server result contracts; null and empty policies are explicit; formatter metadata is stable and does not execute arbitrary code remotely.

### P3 — Drill-through primitive

**Files/discovery:** pivot types, engine/factory, serialize/query, and tests.

Implement `pivot.getDrillThroughQuery(cell)` plus `onDrillThrough` UI-facing callback context. Main-thread results may include source row IDs; worker/server results return a serializable query with field filters, column path, measure, and source identity/version.

**Acceptance:** every result cell either yields a deterministic query or an explicit unsupported result; the query is safe to serialize and does not contain accessors/predicates; cancellation and current-query identity are honored.

### P4 — Persistence, export, and server processing contract

**Files/discovery:** new pivot serialization/export modules, worker protocol/server engine, factory state, tests and fixtures.

- Add versioned layout serialization/hydration with field-ID validation, optional expansion/sorting persistence, migration hooks, and no functions.
- Add canonical flattened matrix and CSV representation with measure/formatter hooks and deterministic column order.
- Add distinct-filter-value requests, child expansion, drill-through requests, retry/error metadata, cancellation, request IDs, and schema/version negotiation to server/worker seams. Keep consumer caching/retry policy outside the package.
- Extend worker protocol golden tests and server reference fixtures.

**Acceptance:** persisted layouts hydrate safely after field changes; flattened exports are stable; server/worker requests are serializable, cancellable, versioned, and distinguish current from stale responses.

### P6 — Headless verification

Focused commands: `cd packages/pivot && pnpm exec vitest run src/__tests__/types.test.ts src/__tests__/engine.test.ts src/__tests__/totals.test.ts src/__tests__/mergeLaws.test.ts src/__tests__/serialize.test.ts src/__tests__/pivotQuery.golden.test.ts`; `cd ../worker && pnpm exec vitest run src/__tests__`; `pnpm typecheck`; `pnpm build`; `pnpm verify`.

## Review gate: P1–P4 / Pivot headless contract

**Evidence required:** field/config type tests, subtotal/merge-law tests, formatting and null-policy fixtures, drill-through query fixtures, persistence/export golden files, worker protocol and server reference tests, public API diff, and `pnpm verify`.

**Approve only if:** a PivotGrid can be built without inventing private engine state, all boundary contracts are serializable and cancellable, and result semantics are shared across main-thread/worker/server implementations.

**Stop/rollback:** if a requested BI calculation needs an expression language or arbitrary remote code, defer it. If subtotal/formatter semantics differ by engine, block UI and repair the contract/golden fixtures first.
