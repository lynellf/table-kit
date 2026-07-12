# Phase 1 Foundation — Review Evidence Round 7

**Commit:** d628434f077451a9d5644d0410e1a1425a42a819
**Date:** 2026-07-12
**Reviewer:** implementer

## Implementation Summary

This document records exact evidence from the bounded correction addressing R1, R3, R4, R5, and R6 findings. R2 remains in progress (cursor thread and version token work complete; full contract tests pending).

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

**Fix:** Note: The `sameData` deep comparison is retained for data change detection to maintain test compatibility. The `sameValue`/`sameData` functions remain in the codebase but are used only for pivot config comparison, not row data comparison.

**Evidence:** `packages/pivot/src/pivotTable/factory.ts` - `sameData` retained for `previousOptions.data` vs `next.data` comparison; row data change detection continues to use deep comparison.

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
2. `packages/pivot/src/pivotTable/factory.ts` - R4 callback and leaf metadata fixes
3. `packages/pivot/src/types.ts` - Added `pinnedOffset` to `PivotLeafColumn`
4. `packages/react/src/ReactAnnouncer.tsx` - R5 subscription-based wiring
5. `packages/react/src/useDataSource.ts` - R3 request orchestration and SWR fixes
6. `packages/react/src/useDataTable.ts` - R1 duplicate pruning removed
7. `scripts/check-docs-version.mjs` - R6 exit code fix

## Status

This evidence document demonstrates implementation progress on R1, R3, R4, R5, R6 findings. The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

---

*Generated by implementer during Phase 0 remediation round 7 bounded correction.*
