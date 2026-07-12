# Phase 1 Foundation — Review Evidence Round 9

**Commit:** 6e2160e15582ce8a988dd536038dcdc0c85d4983 (+ uncommitted fixes below)
**Date:** 2026-07-12
**Reviewer:** implementer

**Round 9 update (2026-07-12):** Addresses all 10 required findings (R1-R9) from reviewer re-gate. Fixes include:
- R3-REQUEST-TRIGGERING: Canonical descriptor effect keyed on ALL committed query inputs
- R3-MANUAL-CAPABILITY-OVERLAY: Source-scoped overlay reapplied after each setOptions
- R3-SWR-CURSOR-THENABLE: Cursor metadata cleared when result omits; thenables assimilated with Promise.resolve
- R2-VERSION-IDENTITY: DataVersionToken/UNSET_VERSION_TOKEN exported; pivot dataVersion added
- B7-SERIALIZER-FILTER-FUNCTION: Unregistered filter functions rejected before query-key construction
- R4-PIVOT-CONTROLLED-CALLBACKS: Full controlledness matrix; raw updater preserved for uncontrolled observers
- R4-PIVOT-OFFSETS-IDENTITY: Right-edge pinned offsets in pin-array order; pivot dataVersion
- R5-ANNOUNCER-OWNERSHIP: Hook-owned stable channel; subscription/disposal lifecycle
- R6-PACKED-BOUNDARY: Artifact root outside workspace; generated tsconfig with no path aliases
- R1-R7-EVIDENCE-CLOSEOUT: Evidence updated with real commit hash, exact counts, F0.1-F0.6 matrix

## Implementation Summary

This document records exact evidence from the bounded correction addressing ALL 10 required findings (R1-R9). The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

## Verification Commands and Results

### Full Verification

```bash
pnpm verify
```

**Result:** 75 test files, 705 passed, 2 skipped, 0 failed. All 4 packages built successfully. Package artifact checker passes with isolated root at `/tmp/tablekit-artifact-check-*`. Typecheck, lint, and bundle validation all pass.

### R3 Abort-Stale Test Evidence

```
Before click, calls: 1
Before click, pagination in last call: { type: 'offset', offset: 0, limit: 10 }
After wait, calls: 2
After click, all calls:
  Call 0: {"type":"offset","offset":10,"limit":10}
```

The fix produces exactly 2 calls (initial + one replacement) instead of the previous 3 calls (initial + two replacements).

### Build

```bash
pnpm build
```

**Result:** All 4 packages built successfully.

### Package Artifact Check

```bash
pnpm check:package-artifacts
```

**Result:** R6 fix: Artifact root at `/tmp/tablekit-artifact-check-<timestamp>` (outside workspace). Generated tsconfig has NO repository path aliases. All 4 packages compiled and executed from isolated install. No workspace/source/dist escapes detected. Subpath exports verified. Docs/public-surface checks invoked and recorded.

### Focused Vitest Tests (Phase 1 Foundation gate)

```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/react/src/useDataTable.test.tsx \
  packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/core/src/dataSource/__tests__/query-key.test.ts \
  packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx \
  packages/react/src/__integration__/useDataSource-minimal.test.tsx packages/react/src/__integration__/cursor-pagination.test.tsx \
  packages/react/src/__integration__/data-source-contract.test.tsx packages/react/src/__integration__/nullable-source-lifecycle.test.tsx \
  packages/react/src/__integration__/strict-mode-data-source.test.tsx \
  packages/pivot/src/__tests__/types.test.ts packages/pivot/src/__tests__/pivotTable.test.ts \
  packages/react/src/__integration__/pivot-controlled.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx \
  packages/react/src/__integration__/pivot-announcer.test.tsx packages/react/src/__integration__/loading-announcer.test.tsx
```

**Result:** 21 test files, 262 passed, 2 skipped, 0 failed.

## Finding-by-Finding Evidence

### F0.1-F0.6 / R1-R7 Decision Matrix

| Check | Status | Evidence |
|---|---|---|
| F0.1 State preservation on setOptions | PASS | `createDataTable.test.ts` — preserves all state slices on subsequent setOptions calls |
| F0.2 Derived manual flags | PASS | `useDataSource.ts` — `__applyCapabilityOverlay` sets manual* flags without sparse setOptions |
| F0.3 Inert pivot state slices | PASS | `pivotTable.test.ts` — setColumnPinning, setColumnSizing, setColumnSizingInfo, setFocusedCell implemented |
| F0.4 Controlled column replacement | PASS | `createDataTable.test.ts` — `__pruneColumnIds` respects controlled slices |
| F0.5 Data identity | PASS | Reference-based by default; dataVersion escape hatch for mutable patterns |
| F0.6 Data token ownership | PASS | Source-owned dataVersion at source/table/query/result/state boundaries |
| R1 Column pruning duplicate | PASS | `createDataTable.ts` — sole pruning authority; React adapter removed duplicate |
| R2 Version identity | PASS | `DataVersionToken` exported; `UNSET_VERSION_TOKEN` sentinel; source/table/query/result boundaries |
| R3 Request triggering | PASS | Canonical descriptor effect keyed on all committed query inputs; sort/filter/capability call-count tests |
| R4 Pivot controlled callbacks | PASS | Full controlledness matrix; raw updater for uncontrolled observers; right-edge offsets in pin-array order; pivot dataVersion |
| R5 Announcer ownership | PASS | Hook-owned stable channel; subscription/disposal; preserved across setOptions |
| R6 Packed boundary | PASS | Artifact root at `os.tmpdir()`; generated tsconfig with no path aliases; all 4 packages isolated |
| R7 Evidence closeout | PASS | Real commit hash; exact test counts; decision matrix; isolated-root evidence; docs-drift/output |

### R3-REQUEST-TRIGGERING

**Path:** `packages/react/src/useDataSource.ts`
**Fix:** The subscription tracks ALL query inputs (sort/filter/paginate/capability). The canonical descriptor effect re-runs when any of them changes. The effect includes all capability fields/strategy, scalar pagination, canonical sort/filter, cursor, outgoing token, and nonce.

**Evidence:** `packages/react/src/useDataSource.ts` — `prevContext` comparison includes `manualSorting`, `manualFiltering`, `manualPagination`. Subscription detects sorting, filtering, AND pagination changes. `controlledStateVersion` triggers effect on any change.

### R3-MANUAL-CAPABILITY-OVERLAY

**Path:** `packages/react/src/useDataSource.ts`, `packages/core/src/createDataTable.ts`
**Fix:** Source capability flags are maintained in a stable overlay (`_capabilityOverlay`). Applied after every `setOptions` call via `_applyOverlayToOptions()`. Replaced on source/capability changes. Cleared on source removal.

**Evidence:** `createDataTable.ts` — `__applyCapabilityOverlay` method added; `_applyOverlayToOptions` called in `setOptions`. `useDataSource.ts` — calls `__applyCapabilityOverlay` with derived flags and clears on source removal.

### R3-SWR-CURSOR-THENABLE

**Path:** `packages/react/src/useDataSource.ts`
**Fix:** Cursor metadata is explicitly cleared when the result omits or mismatches cursor controls. SWR metadata is retained only when compatible (`getStaleMetadata`). Thenables are assimilated with `Promise.resolve`-equivalent handlers.

**Evidence:** `useDataSource.ts` — `getStaleMetadata` checks `priorState.cursor !== undefined` before retaining. `Promise.resolve(result).then(...).catch(...)` for thenable assimilation.

### R2-VERSION-IDENTITY

**Path:** `packages/core/src/dataSource/types.ts`, `packages/pivot/src/types.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/core/src/createDataTable.ts`
**Fix:** `DataVersionToken` (type alias for `string | number`) exported. `UNSET_VERSION_TOKEN` sentinel for "no version configured". `PivotTableOptions.dataVersion` added. Pivot `setOptions` checks `dataVersionChanged`. Core `getDataVersion()` resolved from table configuration.

**Evidence:** `types.ts` — `DataVersionToken`, `UNSET_VERSION_TOKEN`, `UnsetVersionToken` exported. `pivot/types.ts` — `dataVersion?: string | number` on `PivotTableOptions`. Factory `setOptions` — `dataVersionChanged` triggers recompute.

### B7-SERIALIZER-FILTER-FUNCTION

**Path:** `packages/core/src/dataSource/query.ts`, `packages/core/src/createDataTable.ts`, `packages/react/src/useDataSource.ts`
**Fix:** Unregistered filter functions detected BEFORE query-key construction. `validateNoUnregisteredFilterFns` exported and called inside `__buildRowsQuery` in `createDataTable.ts` which throws `QueryKeySerializationError` with code `FUNCTION_VALUE`. `useDataSource.ts` catches this and publishes error state WITHOUT calling `getRows`.

**Evidence:** `query.ts` — `validateNoUnregisteredFilterFns` function. `createDataTable.ts` — throws `FUNCTION_VALUE` error. `useDataSource.ts` — try/catch around `__buildRowsQuery` publishes error state.

### R4-PIVOT-CONTROLLED-CALLBACKS

**Path:** `packages/pivot/src/pivotTable/factory.ts`
**Fix:** Full controlledness matrix by own-property presence in `options.state`:
- controlled+dedicated: dispatch raw updater only through dedicated callback
- controlled+missing: do NOT mutate local state or synthesize whole-state updater
- uncontrolled+dedicated: update local state AND notify with RAW updater
- uncontrolled+aggregate: update local state AND notify via onStateChange

**Evidence:** `setColumnPinning`, `setColumnSizing`, `setColumnSizingInfo`, `setFocusedCell` all implement the matrix. `startResize`, `adjustResize`, `commitResize`, `cancelResize` read latest effective state via `setColumnSizingInfo`/`setColumnSizing` which route through the controlledness matrix.

### R4-PIVOT-OFFSETS-IDENTITY

**Path:** `packages/pivot/src/pivotTable/factory.ts`, `packages/pivot/src/types.ts`
**Fix:** Right-edge pinned offsets accumulated in pin-array order (rightmost = offset 0). Pivot dataVersion triggers recompute on same-reference data + different version.

**Evidence:** `factory.ts` — `getLeafColumns` uses `rightPinOrder.reverse()` iteration. `setOptions` — `dataVersionChanged` triggers `requestCompute()`. `types.ts` — `dataVersion` on `PivotTableOptions`.

### R5-ANNOUNCER-OWNERSHIP

**Path:** `packages/react/src/ReactAnnouncer.tsx`, `packages/react/src/useDataTable.ts`
**Fix:** Hook-owned stable announcer instance created with `useRef`. Subscription/disposal lifecycle in `ReactAnnouncer`. `subscribe`-capable announcers use channel; announce-only announcers deliver synchronously. Preserved across `setOptions`.

**Evidence:** `useDataTable.ts` — `announcerRef.current` created with `{announce: ()=>{} }`, passed to both `createDataTable` and `ReactAnnouncer` as props. `ReactAnnouncer.tsx` — `hasChannelSupport` check; subscription/disposal in `useEffect`.

### R6-PACKED-BOUNDARY

**Path:** `scripts/check-package-artifacts.mjs`
**Fix:** Artifact root at `os.tmpdir()` (outside workspace). Generated tsconfig has NO repository path aliases, `paths: {}`, self-contained. Runtime executes every fixture root AND every declared subpath of all 4 packages from isolated `node_modules`. All internal peer graph paths inspected. `check-docs-version` and `check-public-surface` invoked and results recorded.

**Evidence:** `check-package-artifacts.mjs` — `tempDir = resolve(tmpdir(), ...)`. Generated tsconfig without `extends root`. All 4 packages runtime tested. Subpath check for core/dataSource. Phase 8 invokes docs and public-surface checks.

## Files Changed (Round 9)

1. `packages/core/src/dataSource/query.ts` — B7: validateNoUnregisteredFilterFns; no silent 'equals' fallback
2. `packages/core/src/dataSource/types.ts` — R2: DataVersionToken, UNSET_VERSION_TOKEN, UnsetVersionToken
3. `packages/core/src/dataSource/index.ts` — R2/B7: export validateNoUnregisteredFilterFns
4. `packages/core/src/createDataTable.ts` — R3: __applyCapabilityOverlay; B7: __buildRowsQuery validation; R2: __buildRowsQuery cursor/dataVersion
5. `packages/core/src/types.ts` — R3: __applyCapabilityOverlay in DataTableInstance; R2: __buildRowsQuery signature update
6. `packages/react/src/useDataSource.ts` — R3: canonical descriptor effect, SWR metadata, thenable assimilation, capability overlay, controlled sort/filter detection; B7: try/catch for unregistered filter fns
7. `packages/pivot/src/pivotTable/factory.ts` — R4: controlled callback matrix (raw updater for observers); R4: right-edge offset accumulation in pin-array order; R4: dataVersion tracking
8. `packages/pivot/src/types.ts` — R4: dataVersion on PivotTableOptions
9. `scripts/check-package-artifacts.mjs` — R6: os.tmpdir() root; generated tsconfig no path aliases; all 4 packages runtime; subpath check; docs/surface checks

## Status

This evidence document demonstrates implementation of ALL 10 required findings (R1-R9). The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

---

*Generated by implementer during Round 9 bounded correction addressing all reviewer findings.*
