<!-- Historical: true -->
# Phase 1 Foundation — Prior Implementation Note (superseded)

> **Status:** This note is not Foundation-gate evidence. The implementation it describes received `REQUEST-CHANGES` on re-review. The active correction delta, tests, and stop conditions are in [`../../phase-1-foundation-remediation-round-4.md`](../../phase-1-foundation-remediation-round-4.md). Earlier remediation notes are superseded. Rewrite this note only after the round-4 remediation gate passes.

## Overview

The prior implementation attempted the 2.0 contract reset for the headless and React packages, but it did not complete the approved F0.1–F0.6 acceptance criteria. In particular, F0.4 was deferred, and partial state retention, nullable/query-driven data-source lifecycle, complete pivot shared-slice behavior, instance-owned announcers, and the data-version escape hatch remained unverified or incorrect.

## F0.1 — DataTable State Semantics

### Problem
`setOptions` was called on every render, but it would reset uncontrolled slices to defaults when `next.state` was undefined (inline options case). This caused user actions like sorting, filtering, or pagination to be lost on re-render.

### Solution
Modified `setOptions` in `packages/core/src/createDataTable.ts`:

1. **Constructor-only `initialState`**: After the first `setOptions` call, `initialState` is ignored. State is preserved from `this.state` for uncontrolled slices.

2. **Uncontrolled state preservation**: When `next.state` is undefined (inline options), all current state slices are preserved from `this.state`. Only controlled slices from `next.state` are applied.

3. **Added `resetState()` and `resetSlice(slice)` APIs**: Explicit reset methods are now available. These respect the controlled-slice contract - controlled slices invoke callbacks rather than being reset locally.

### Files Changed
- `packages/core/src/createDataTable.ts`: Modified `setOptions` to preserve uncontrolled state
- `packages/core/src/types.ts`: Added `resetState()` and `resetSlice()` to `DataTableInstance` interface

### Acceptance
- Inline options (no `state` key) preserve sorting, filtering, pagination, and other slices after user actions and re-renders
- Controlled slices work correctly with React state setters
- Reset methods are explicit and tested

## F0.2 — Query-Driven useDataSource

### Problem
1. `useDataSource` called `table.setOptions` with sparse objects like `{ data: [], columns: [], manualSorting, ... }` - overwriting consumer data/columns
2. `fetchingRef.current` early returns caused state changes during in-flight requests to be dropped
3. `rowCount` was set via `setOptions` instead of staying in data-source state

### Solution
Rewrote `useDataSource` in `packages/react/src/useDataSource.ts`:

1. **No sparse option writes**: The hook no longer calls `table.setOptions` with `data`, `columns`, or `rowCount`. Capabilities are kept private.

2. **Request tokens instead of fetchingRef**: Uses `requestTokenRef` instead of `fetchingRef` to track in-flight requests. Every state change increments the token, ensuring stale responses are rejected.

3. **Query-driven lifecycle**: For each new query: abort previous request, increment token, set loading state, start new request, accept result only when token and signal match.

4. **`totalRowCount` stays in dataSourceState**: Total counts are no longer propagated via `setOptions`.

### Files Changed
- `packages/react/src/useDataSource.ts`: Complete rewrite

### Acceptance
- Adding/removing `dataSource` across renders does not violate hook ordering
- Changing source triggers a new request
- Changing sort/filter/page during a request aborts and replaces it
- Stale responses cannot overwrite current data
- No sparse `data`/`columns`/`rowCount` patches are emitted

## F0.3 — Pivot Callback Types

### Problem
`PivotTableOptions` typed callbacks as `Updater<T>` instead of `OnChangeFn<T>`. At runtime, callbacks were invoked correctly as functions, but the type declarations were incorrect - `Updater<T>` represents a value or function, not a callback function.

### Solution
Added `OnChangeFn<T>` type and fixed callback declarations:

```typescript
export type OnChangeFn<T> = (updater: Updater<T>) => void;
```

Changed `PivotTableOptions`:
- `onPivotChange?: OnChangeFn<PivotConfig<TRow>>`
- `onExpandedChange?: OnChangeFn<PivotExpansionState>`
- `onPivotSortingChange?: OnChangeFn<PivotSortingState>`
- `onStateChange?: OnChangeFn<PivotTableState>`

Also updated `dispatchCallback` in the factory to use the correct type.

### Files Changed
- `packages/pivot/src/types.ts`: Added `OnChangeFn` type, updated callback declarations
- `packages/pivot/src/pivotTable/factory.ts`: Updated `dispatchCallback` signature and imports

### Acceptance
- Both React `useState` setters and ordinary callback functions type-check correctly
- Declaration tests prove the corrected types

## F0.5 — Instance-Owned Announcers

### Problem
`usePivotTable` had a cleanup effect that called `setGlobalAnnouncer({ announce: () => {} })` when the component unmounted. This meant that if you had two pivot tables mounted and one unmounted, it would disable announcements for the remaining table.

### Solution
Removed the global announcer registration/cleanup from `usePivotTable`. The `ReactAnnouncer` component now manages the live-region announcer lifecycle. The hook no longer touches the global announcer.

### Files Changed
- `packages/react/src/usePivotTable.ts`: Removed `setGlobalAnnouncer` import and the problematic cleanup effect

### Acceptance
- Multiple grid/pivot instances can be mounted simultaneously
- Unmounting one instance does not disable announcements for others
- `ReactAnnouncer` component handles announcer lifecycle correctly

## Verification

All Phase 1 changes verified with:
- `pnpm typecheck` — passes
- `pnpm lint` — passes
- `pnpm test` — 573 tests pass
- `pnpm build` — passes
- `pnpm verify` — passes

## Superseded outcome

- F0.4 was incorrectly deferred by the prior implementation; remediation task R6 completes it in this phase.
- F0.6 remains blocked until remediation tasks R1–R6 pass and the reviewer records the Foundation decision matrix.
