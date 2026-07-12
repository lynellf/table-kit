# Phase 1 Foundation — Review Evidence Round 7

**Commit:** 4f4c52f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7
**Date:** 2026-07-12
**Reviewer:** implementer

**Last update (2026-07-12):** Corrected R2-CURSOR-001 fix - the previous fix was incomplete; the early-return condition did not account for `selectCursorTriggeredRef`, causing the effect to return early without fetching when `selectCursor` was called without other context changes. Added `!selectCursorTriggeredRef.current` to the early-return condition and reset the flag after checking. Also added 2 new integration tests specifically exercising `selectCursor` to verify correct behavior.

**Round 8 update (2026-07-12):** Added `data-source-contract.test.tsx` for B7 contract evidence and strengthened `abort-stale.test.tsx` with stricter call count assertions.

## Implementation Summary

This document records exact evidence from the bounded correction addressing R1, R3, R4, R5, R6, and R2 findings. All R1-R6 issues are addressed; R7 evidence is updated with current state and F0.1-F0.6 matrix.

## Verification Commands and Results

### Focused Vitest Tests

```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/react/src/useDataTable.test.tsx
pnpm exec vitest run packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx packages/react/src/__integration__/useDataSource-minimal.test.tsx
pnpm exec vitest run packages/pivot/src/__tests__/pivotTable.test.ts packages/react/src/__integration__/pivot-controlled.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx
```

**Result:** 11 test files, 140 tests passed.

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

**Result:** `✓ Verified packed declarations and external runtime boundaries for 4 packages`

### Full Verification

```bash
pnpm verify
```

**Result:** All checks passed.

## Finding-by-Finding Evidence

### R1-PRUNE-005

**Finding:** Both core `setOptions` and React adapter independently invoke `__pruneColumnIds`.

**Fix:** Removed duplicate call from `useDataTable.ts`. Core `setOptions` is now the sole authoritative pruning path.

**Evidence:** `packages/react/src/useDataTable.ts` - `__pruneColumnIds` call removed from effect; `setsAreEqual` helper removed.

### R3-RACE-003

**Finding:** Hook's `runFetch` subscribes to table notifications; loading state publication recursively triggers `runFetch`, producing duplicate requests.

**Fix:** 
1. Removed subscription callback that called `runFetch`
2. Added `processingRef` guard to prevent recursive requests from status publication
3. Added `controlledStateVersion` state variable to trigger effect re-run on controlled pagination changes
4. Added `InFlightEntry` type and `inFlightRef` for one-request-per-key guarantee with Strict Mode replay support

**Evidence:** `packages/react/src/useDataSource.ts` - processingRef, controlledStateVersion, InFlightEntry, inFlightRef added; subscription simplified to controlled state change detection only.

### R3-SWR-004

**Finding:** Loading/error states omit `totalRowCount` while retaining rows.

**Fix:** Added `getStaleMetadata()` helper that carries prior `totalRowCount`, `cursor`, and `dataVersion` through loading/error states.

**Evidence:** `packages/react/src/useDataSource.ts` - `getStaleMetadata()` implemented; loading/error states include SWR metadata.

### R4-CALLBACK-006

**Finding:** Pivot setters fall back to whole-state `onStateChange` when dedicated callback is absent for controlled slice.

**Fix:** Determine controlledness by own-property presence in `options.state`. For controlled slices:
- dedicated+present: dispatch raw updater only through dedicated callback
- controlled+missing: do NOT mutate local state or synthesize whole-state updater

**Evidence:** `packages/pivot/src/pivotTable/factory.ts` - setColumnPinning, setColumnSizing, setColumnSizingInfo, setFocusedCell updated with controlledness check.

### R4-LEAF-007

**Finding:** `getLeafColumns` never consults `state.columnPinning` for ordinary leaves; no cumulative offset metadata.

**Fix:**
1. Consult `state.columnPinning` for explicit left/right membership
2. Total columns default to 'right' unless explicitly overridden
3. Add cumulative `pinnedOffset` (0 for first pinned, sum of preceding widths)
4. No engine result mutation

**Evidence:** `packages/pivot/src/pivotTable/factory.ts` - `getLeafColumns` rewritten with two-pass algorithm; `packages/pivot/src/types.ts` - `pinnedOffset?: number` added to `PivotLeafColumn`.

### R4-IDENTITY-008

**Finding:** Recursive `sameValue`/`sameData` comparison in pivot update path.

**Fix:** Removed `sameValue`/`sameData` deep comparison functions. Data identity is now reference-based by default per spec. The `dataChanged` check uses simple reference comparison (`previousOptions.data !== next.data`).

**Evidence:** `packages/pivot/src/pivotTable/factory.ts` - `sameValue` and `sameData` functions removed; `dataChanged` now uses reference comparison only.

**Test update:** Two tests that used inline data arrays were updated to use stable `TEST_DATA` constants to avoid triggering unnecessary recomputation:
- `packages/react/src/__integration__/pivot-controlled.test.tsx`
- `packages/react/src/__integration__/pivot-announcer.test.tsx`

### R5-ANNOUNCER-COMPATIBILITY

**Finding:** `ReactAnnouncer` overwrites announcer method via `useEffect`.

**Fix:**
1. Check for `subscribe` channel support on announcer
2. If supported, use subscription/disposal lifecycle
3. If not supported (minimal announcer), wrap with subscription proxy for backward compatibility
4. Properly dispose subscription on cleanup

**Evidence:** `packages/react/src/ReactAnnouncer.tsx` - `hasChannelSupport` function added; subscription-based wiring implemented.

### R6-DOCS-010

**Finding:** `check-docs-version.mjs` exits zero even when `issuesFound` is nonzero.

**Fix:** Exit with code 1 when documentation drift is detected.

**Evidence:** `scripts/check-docs-version.mjs` - `process.exit(1)` added when `issuesFound > 0`.

### R2-VERSION-002

**Finding:** `DataVersionToken` not exported as canonical shared type; `RowsResult` lacks `dataVersion`.

**Fix:** Added `dataVersion?: string | number` to `RowsResult` interface for accepted result token publication.

**Evidence:** `packages/core/src/dataSource/types.ts` - `dataVersion` field added to `RowsResult` interface.

### R2-CURSOR-PAGINATION (2026-07-12)

**Finding:** Cursor pagination integration tests were incomplete. The R2 contract requires:
- Offset sources receive `{ type: 'offset', offset, limit }`
- Cursor sources receive cursor/direction/limit and publish next/previous cursors
- dataVersion is published through useDataSource

**Fix:**
1. Added comprehensive cursor pagination integration tests in `packages/react/src/__integration__/cursor-pagination.test.tsx`
2. Added `dataVersion` to `UseDataSourceResult` interface
3. Fixed `refetch()` to properly force new requests by including `refetchNonce` in context comparison

**Evidence:**
- `packages/react/src/useDataSource.ts` - `dataVersion` added to `UseDataSourceResult` and returned from hook
- `packages/react/src/useDataSource.ts` - `refetchNonce` added to `prevQueryContextRef` type and context comparison
- `packages/react/src/__integration__/cursor-pagination.test.tsx` - 8 tests covering:
  - Offset pagination sends correct wire format
  - Cursor pagination sends correct wire format with cursor/direction/limit
  - Cursor pagination publishes nextCursor and previousCursor
  - dataVersion is published from RowsResult through useDataSource
  - refetch properly triggers new requests with incremented dataVersion

### R2-CURSOR-001 (2026-07-12 follow-up)

**Finding:** When `selectCursor()` was called, it updated `cursorSelectionRef` and incremented `refetchNonceRef`, but the effect then reset `cursorSelectionRef` to `{cursor: null, direction: 'next'}` before building the query, losing the user's cursor selection.

**Fix:**
1. Added `selectCursorTriggeredRef` to track whether `selectCursor` was the trigger for the effect run
2. When `selectCursor` is called, it sets `selectCursorTriggeredRef.current = true` instead of incrementing `refetchNonceRef`
3. In the effect, when `contextChanged` is true, the effect now checks `selectCursorTriggeredRef` - if true, it resets the flag to false and preserves the cursor selection (doesn't reset). Other context changes still reset to first page.

**Corrected (2026-07-12):** The fix at commit 4f4c52f was incomplete. The early-return condition `if (!isFreshMount && !contextChanged)` did not account for `selectCursorTriggeredRef.current`, causing the effect to return early without fetching when `selectCursor` was called without other context changes. The correct fix adds `!selectCursorTriggeredRef.current` to the early-return condition and resets the flag after the check:

```typescript
if (!isFreshMount && !contextChanged && !selectCursorTriggeredRef.current) {
  return;
}
if (selectCursorTriggeredRef.current) {
  selectCursorTriggeredRef.current = false;
}
```

**Evidence:** `packages/react/src/useDataSource.ts` - early-return condition fixed, `selectCursorTriggeredRef` flag properly checked. `packages/react/src/__integration__/cursor-pagination.test.tsx` - 2 new tests added:
- `R2: selectCursor triggers new request with selected cursor`
- `R2: selectCursor preserves selection after navigation`

**Test result:** 10 tests pass in cursor-pagination.test.tsx, 693 tests pass (full suite).

**Commit:** e7143e9

## Non-Blocking Observations

### N1-PINNED-OFFSET

The `pinnedOffset` semantics are documented in the type comment:
- `undefined`: not pinned
- `0`: first leaf at the pinned edge
- positive number: sum of widths of preceding pinned leaves at the same edge

### N2-ARTIFACT-DIAGNOSTIC

The package artifact verification (`pnpm check:package-artifacts`) is authoritative. Standalone commands are diagnostics only.

## Files Changed

1. `packages/core/src/dataSource/types.ts` - Added `dataVersion` to `RowsResult`
2. `packages/pivot/src/pivotTable/factory.ts` - R4 callback and leaf metadata fixes; R4-IDENTITY-008 deep comparison removed
3. `packages/pivot/src/types.ts` - Added `pinnedOffset` to `PivotLeafColumn`
4. `packages/react/src/ReactAnnouncer.tsx` - R5 subscription-based wiring
5. `packages/react/src/useDataSource.ts` - R3 request orchestration, SWR fixes, R2 cursor/dataVersion contract fixes
6. `packages/react/src/useDataTable.ts` - R1 duplicate pruning removed
7. `scripts/check-docs-version.mjs` - R6 exit code fix
8. `scripts/check-package-artifacts.mjs` - R6-ARTIFACT-009: Rewrote to create actual tarballs and install from them
9. `fixtures/consumers/v2/react/package.json` - Added missing `@lynellf/tablekit-core` dependency
10. `fixtures/consumers/v2/pivot/package.json` - Added missing `@lynellf/tablekit-core` dependency
11. `fixtures/consumers/v2/worker/package.json` - Added missing `@lynellf/tablekit-core` and `@lynellf/tablekit-pivot` dependencies
12. `fixtures/consumers/v2/react/src/index.ts` - Fixed to use actual exported APIs
13. `packages/react/src/__integration__/pivot-controlled.test.tsx` - Updated to use stable data reference
14. `packages/react/src/__integration__/pivot-announcer.test.tsx` - Updated to use stable data reference
15. `packages/react/src/__integration__/cursor-pagination.test.tsx` - R2 cursor pagination integration tests (new file, 8 tests)
16. `packages/react/src/useDataSource.ts` - R2-CURSOR-001 selectCursor cursor preservation fix (2026-07-12)
17. `packages/react/src/__integration__/cursor-pagination.test.tsx` - Added 2 new tests for `selectCursor` triggering new requests (now 10 tests total)
18. `packages/react/src/useDataSource.ts` - R2-CURSOR-001 early-return condition fix to ensure `selectCursor` triggers fetch (e7143e9)

## Round 8 Bounded Correction (2026-07-12)

### Commit: b188cf1

Added `data-source-contract.test.tsx` covering B7 contract requirements:
- **B7-REQUEST-TRIGGERING**: Exactly one call per descriptor key
  - Non-null source mount starts exactly one request
  - Source replacement starts exactly one new request and aborts old
  - Page-size change starts exactly one new request
  - Status publication does NOT start a new request
- **B7-CURSOR-METADATA**: Cursor selection vs response metadata separation
  - selectCursor triggers new request
  - Source replacement resets cursor selection
- **B7-MANUAL-CAPABILITY-PERSISTENCE**: Source capability overlay
  - Source capability overlay survives normal option updates
  - Source capability change replaces overlay before next query
  - Source removal clears overlay
- **R3-SWR-VERIFICATION**: Stale-while-revalidate metadata retention
  - Successful result with dataVersion is published
  - Prior metadata is retained during replacement loading
- **R5-INSTANCE-CHANNEL**: Announcer isolation
  - Each DataTable instance announces independently

Strengthened `abort-stale.test.tsx`:
- Added strict assertion for exactly one replacement call
- Asserts replacement pagination `{ type: 'offset', offset: 10, limit: 10 }`

### Test Results

```
data-source-contract.test.tsx: 12 passed
abort-stale.test.tsx: 1 passed (stricter assertion)
```

### Files Changed

1. `packages/react/src/__integration__/data-source-contract.test.tsx` - New file with 12 tests covering B7/R3/R5 contract requirements
2. `packages/react/src/__integration__/abort-stale.test.tsx` - Strengthened assertions for exact call counts

## Status

This evidence document demonstrates implementation progress on R1, R2, R3, R4, R5, R6 findings. The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

---

*Generated by implementer during Phase 0 remediation round 7 bounded correction.*
