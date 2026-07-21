# R2-CURSOR-001 Fix — Implementation Trivial

## Current Request

Continue remediation: fix the incomplete R2-CURSOR-001 fix identified by the assistant.

## Verbatim Issue

When `selectCursor()` was called, it updated `cursorSelectionRef` and incremented `refetchVersion`, but the effect returned early without fetching because `contextChanged` was `false` (since `refetchNonceRef.current` was not incremented by `selectCursor`).

The previous fix (commit 4f4c52f) attempted to address this by using `selectCursorTriggeredRef` to track whether `selectCursor` was the trigger, but the early-return condition `if (!isFreshMount && !contextChanged)` did not account for this flag, causing the effect to return early without fetching.

## Outcome

R2-CURSOR-001 is now correctly fixed. The early-return condition was modified to also check `selectCursorTriggeredRef.current`. When `selectCursor` triggers the effect (even without other context changes), the effect now proceeds to build the query with the new cursor selection and issues the request.

## Files Changed

1. `packages/react/src/useDataSource.ts` — Fixed early-return condition to account for `selectCursorTriggeredRef`:
   - Changed `if (!isFreshMount && !contextChanged)` to `if (!isFreshMount && !contextChanged && !selectCursorTriggeredRef.current)`
   - Added flag reset: `if (selectCursorTriggeredRef.current) { selectCursorTriggeredRef.current = false; }`

2. `packages/react/src/__integration__/cursor-pagination.test.tsx` — Added 2 new tests:
   - `R2: selectCursor triggers new request with selected cursor`
   - `R2: selectCursor preserves selection after navigation`

## Verification Evidence

### Cursor Pagination Tests
```
pnpm exec vitest run packages/react/src/__integration__/cursor-pagination.test.tsx
✓ cursor-pagination.test.tsx (10 tests)
Test Files: 1 passed
Tests: 10 passed
```

### Focused Tests
```
pnpm exec vitest run [all focused test files]
Test Files: 14 passed
Tests: 190 passed
```

### Full Verification
```
pnpm verify
Test Files: 74 passed
Tests: 693 passed | 2 skipped
Build: All 4 packages built successfully
Package artifacts: Verified
```

## Commits Pushed

- `e7143e9` — fix: R2-CURSOR-001 ensure selectCursor triggers new request
- `9b932fd` — docs: update review-evidence-round-7.md with R2-CURSOR-001 fix correction

## Notes

- The review-evidence-round-7.md was updated to document that the previous fix was incomplete and has been corrected
- The `review-decision.md` remains `REQUEST-CHANGES` pending independent reviewer re-gate
- The assistant had enumerated 10 specific blockers; only R2-CURSOR-001 was verified as still broken. The remaining 9 blockers require independent verification by the reviewer.
