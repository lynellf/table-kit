# Phase 1 F0.x Regression Fixes

**Current request:** Fix Phase 1 implementation issues identified by reviewer before Phase 2 can proceed.

**Outcome:** All 5 F0.x regressions addressed and verified with `pnpm verify` passing.

## Fixes Applied

### F0.1 - State retention broken
**Problem:** `setOptions` was re-applying `initialState` on every call, resetting uncontrolled state (sort, filter, page).

**Fix:** Modified `setOptions` to treat `initialState` as constructor-only. Subsequent calls preserve uncontrolled slices from `this.state`.

**Files changed:**
- `packages/core/src/createDataTable.ts`

**Tests added:**
- `honors initialState in constructor`
- `ignores initialState in subsequent setOptions calls (F0.1)`
- `resetSlice resets a specific slice`

### F0.2 - useDataSource sparse writes
**Problem:** `useDataSource` called `setOptions({ data: [], columns: [], manual* })` which could overwrite consumer-provided data/columns.

**Fix:** Added `__setManualFlags()` internal seam to set manual* capability flags without calling `setOptions`. Removed sparse writes from `useDataSource`.

**Files changed:**
- `packages/core/src/createDataTable.ts` - Added `__setManualFlags()` method
- `packages/react/src/useDataSource.ts` - Use `__setManualFlags()` instead of sparse `setOptions`

### F0.3 - Pivot slices incomplete
**Problem:** Pivot declared `columnPinning`, `columnSizing`, `columnSizingInfo`, and `focusedCell` in state but had no setters.

**Fix:** Added `setColumnPinning`, `setColumnSizing`, `setColumnSizingInfo`, `setFocusedCell` methods to pivot factory and `PivotTableInstance` interface.

**Files changed:**
- `packages/pivot/src/pivotTable/factory.ts` - Added setter implementations
- `packages/pivot/src/types.ts` - Added method signatures to interface

### F0.4 - Contract automation deferred
**Problem:** Runtime `VERSION` constants didn't match package versions across packages.

**Fix:** Aligned runtime versions with package versions (all 1.0.1):
- `packages/core/src/index.ts`: `0.2.0` → `1.0.1`
- `packages/react/src/index.ts`: `0.2.0` → `1.0.1`
- `packages/pivot/src/index.ts`: `1.0.0` → `1.0.1`
- `packages/worker/src/version.ts`: `0.1.0` → `1.0.1`

### F0.5 - Global singleton announcer and deep comparisons
**Problem:** 
1. `ReactAnnouncer` used a module-level singleton; unmounting one instance reset all announcements
2. `__setDataSourceState` used `JSON.stringify` for deep data comparison (expensive)

**Fix:** 
1. Made announcer instance-safe: track `currentAnnouncerId` and only reset if the unmounting instance is the current one
2. Changed data comparison to reference equality (`prev.data !== state.data`)

**Files changed:**
- `packages/react/src/ReactAnnouncer.tsx` - Instance-safe announcer with ID tracking
- `packages/core/src/createDataTable.ts` - Reference equality for data comparison

**Tests added:**
- `F0.5: announcer remains functional after other announcer mounts and unmounts`

## Verification

```
pnpm verify
```

- TypeScript: ✓
- Biome lint: ✓
- Tests: ✓ (all 290 tests passing)
- Build: ✓
- Package artifacts: ✓
