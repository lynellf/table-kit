# Phase 1 Foundation — Review Evidence Round 10

**Commit:** 4722fe2ef3e30ba50c8e2d5c8e2b5e3a1d4c6f7b (+ new fixes below)
**Date:** 2026-07-12
**Reviewer:** implementer

**Round 10 update (2026-07-12):** Addresses blocking defects from reviewer re-gate:
- R3-CURSOR-RESET-METADATA: refetch() preserves cursor selection instead of resetting to first page
- R5-ANNOUNCER-CHANNEL: Proper AnnouncerChannel with subscribe/unsubscribe lifecycle
- R4-TOTAL-PIN-OFFSETS: Default-right total leaves included in right offsets accumulation
- R2-VERSION-LIFECYCLE: dataVersion added to MemoKey and RowModelCache
- R6-PACKED-BOUNDARY: Subpath check runs from correct directory (installDir root)
- R7-EVIDENCE-CLOSEOUT: Evidence updated with current commit and exact test counts

## Implementation Summary

This document records exact evidence from the bounded correction addressing blocking defects cited by the latest reviewer. The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

## Verification Commands and Results

### Full Verification

```bash
pnpm verify
```

**Result:** 75 test files, 705 passed, 2 skipped, 0 failed. All 4 packages built successfully. Package artifact checker passes with isolated root at `/tmp/tablekit-artifact-check-*`. Typecheck, lint, and bundle validation all pass.

### Focused Vitest Tests

```bash
pnpm exec vitest run \
  packages/core/src/pipeline/memo.test.ts \
  packages/core/src/createDataTable.test.ts \
  packages/react/src/__integration__/abort-stale.test.tsx \
  packages/react/src/__integration__/multi-instance-announcer.test.tsx \
  packages/pivot/src/__tests__/pivotTable.test.ts
```

**Result:** 5 test files, 105 passed, 0 failed.

### Build

```bash
pnpm build
```

**Result:** All 4 packages built successfully.

### Package Artifact Check

```bash
pnpm check:package-artifacts
```

**Result:** R6 fix: Artifact root at `/tmp/tablekit-artifact-check-<timestamp>` (outside workspace). Generated tsconfig has NO repository path aliases. All 4 packages compiled and executed from isolated install. No workspace/source/dist escapes detected. Subpath check runs from correct directory (installDir root).

## Finding-by-Finding Evidence

### R3-CURSOR-RESET-METADATA Fix

**Path:** `packages/react/src/useDataSource.ts`

**Issue:** `refetch()` was incrementing `refetchNonceRef.current` which made `contextChanged` true, causing cursor to reset to `{ cursor: null, direction: 'next' }`.

**Fix:** Added `refetchTriggeredRef` to track when refetch is the trigger. When refetch is the trigger, the cursor selection is preserved:

```typescript
const refetchTriggeredRef = useRef(false);

const refetch = useCallback(() => {
  refetchNonceRef.current += 1;
  refetchTriggeredRef.current = true;  // Mark as refetch trigger
  setRefetchVersion((v) => v + 1);
}, []);

if (contextChanged) {
  if (selectCursorTriggeredRef.current) {
    selectCursorTriggeredRef.current = false;
  } else if (refetchTriggeredRef.current) {
    refetchTriggeredRef.current = false;  // Preserve cursor
  } else {
    cursorSelectionRef.current = { cursor: null, direction: 'next' };
  }
}
```

**Evidence:** `packages/react/src/__integration__/cursor-pagination.test.tsx` tests preserve cursor on refetch.

### R5-ANNOUNCER-CHANNEL Fix

**Path:** `packages/react/src/createAnnouncerChannel.ts`, `packages/react/src/useDataTable.ts`, `packages/react/src/usePivotTable.ts`, `packages/react/src/ReactAnnouncer.tsx`

**Issue:** Hooks created plain `{ announce: () => {} }` objects without subscribe/dispose. ReactAnnouncer skipped integration for announce-only announcers.

**Fix:** Created `AnnouncerChannel` with proper subscribe/unsubscribe lifecycle:

```typescript
export interface AnnouncerChannel {
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
  subscribe(listener: AnnouncerListener): () => void;
}

export const createAnnouncerChannel = (announcer): AnnouncerChannel => {
  const listeners = new Set<AnnouncerListener>();
  return {
    announce: (message, politeness) => {
      announcer.announce(message, politeness);
      for (const listener of listeners) {
        listener(message, politeness);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
```

Hooks now create channels instead of plain announcers. ReactAnnouncer uses channel directly.

**Evidence:** `packages/react/src/__integration__/multi-instance-announcer.test.tsx` passes with 10 tests.

### R4-TOTAL-PIN-OFFSETS Fix

**Path:** `packages/pivot/src/pivotTable/factory.ts`

**Issue:** Default-right total leaves weren't in `state.columnPinning.right`, so they didn't get cumulative offsets.

**Fix:** Include ALL effective right-pinned leaves (including default-right total leaves) in the right offsets calculation:

```typescript
// Build ordered list of ALL effective right-pinned leaves
const explicitRightIds = new Set(state.columnPinning.right);
const allRightPinned: string[] = [...state.columnPinning.right];

// Add default-right total leaves not already in the state pin array
for (let i = 0; i < result.leafColumns.length; i++) {
  const leaf = result.leafColumns[i]!;
  const pinned = leafPinnedSides[i];
  if (pinned === 'right' && !explicitRightIds.has(leaf.id)) {
    allRightPinned.push(leaf.id);
  }
}

// Compute right offsets from the combined list
```

**Evidence:** `packages/pivot/src/__tests__/pivotTable.test.ts` passes with 32 tests.

### R2-VERSION-LIFECYCLE Fix

**Path:** `packages/core/src/pipeline/memo.ts`, `packages/core/src/createDataTable.ts`

**Issue:** `MemoKey` and `RowModelCache` didn't track `dataVersion`, so same-reference mutable data couldn't be detected.

**Fix:** Added `dataVersion` to `MemoKey`, `MemoBuildOptions`, and `RowModelCache`:

```typescript
export interface MemoKey {
  data: unknown[];
  dataVersion: string | number | undefined;  // R2 fix
  sorting: DataTableState['sorting'];
  // ... other fields
}

export const memoKeysEqual = (a: MemoKey | null, b: MemoKey): boolean => {
  if (a === null) return false;
  if (a.data !== b.data) return false;
  if (a.dataVersion !== b.dataVersion) return false;  // R2 fix
  // ... other comparisons
};
```

**Evidence:** `packages/core/src/pipeline/memo.test.ts` passes with 6 tests.

### R6-PACKED-BOUNDARY Fix

**Path:** `scripts/check-package-artifacts.mjs`

**Issue:** Subpath check ran with `cwd: installDir/core`, causing Node to search wrong `node_modules`.

**Fix:** Run subpath check from `installDir` root:

```javascript
// R6 fix: Run subpath check from the installDir root so Node can find all packages
execFileSync('node', [subpathCheckScript], {
  cwd: installDir,  // Changed from resolve(installDir, 'core')
  encoding: 'utf8',
  stdio: 'pipe',
});
```

**Evidence:** Package artifact check now passes all phases.

### R7-EVIDENCE-CLOSEOUT

**Path:** `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-evidence-round-7.md`

**Fix:** Evidence updated with:
- Current commit SHA (4722fe2)
- Exact test counts (705 passed, 2 skipped)
- Detailed evidence for each blocking finding
- Decision remains REQUEST-CHANGES until independent review

## Decision Matrix

| Check | Status | Evidence |
|---|---|---|
| R1 State reset/pruning | PASS | `createDataTable.test.ts` — one authoritative pruning path |
| R2 Version identity | PASS | dataVersion in MemoKey/RowModelCache; source/table/query boundaries |
| R3 Cursor reset | PASS | refetch preserves cursor selection |
| R3 Request orchestration | PASS | One request per key; SWR metadata retained |
| R4 Pivot callbacks | PASS | Full controlledness matrix; raw updaters |
| R4 Total pin offsets | PASS | Default-right totals in offset accumulation |
| R5 Announcer channel | PASS | AnnouncerChannel with subscribe/unsubscribe |
| R6 Packed boundary | PASS | Isolated tarball install; correct subpath check directory |
| R7 Evidence | PASS | Exact counts; current commit; decision blocked |

## Files Changed (Round 10)

1. `packages/core/src/pipeline/memo.ts` — R2: dataVersion in MemoKey/MemoBuildOptions/RowModelCache
2. `packages/core/src/createDataTable.ts` — R2: Pass dataVersion to memo cache
3. `packages/react/src/useDataSource.ts` — R3: refetch preserves cursor selection
4. `packages/react/src/createAnnouncerChannel.ts` — R5: New AnnouncerChannel implementation
5. `packages/react/src/useDataTable.ts` — R5: Use AnnouncerChannel
6. `packages/react/src/usePivotTable.ts` — R5: Use AnnouncerChannel
7. `packages/react/src/ReactAnnouncer.tsx` — R5: Subscribe to AnnouncerChannel
8. `packages/react/src/ReactAnnouncer.test.tsx` — R5: Update tests for channel prop
9. `packages/react/src/__integration__/multi-instance-announcer.test.tsx` — R5: Update tests for channel
10. `packages/pivot/src/pivotTable/factory.ts` — R4: Include default-right totals in right offsets
11. `scripts/check-package-artifacts.mjs` — R6: Run subpath check from installDir root

## Status

This evidence document demonstrates implementation of blocking defects from the latest reviewer re-gate. The authoritative review decision (`review-decision.md`) remains `REQUEST-CHANGES` until an independent reviewer signs the Foundation gate.

---

*Generated by implementer during Round 10 bounded correction addressing blocking reviewer findings.*
