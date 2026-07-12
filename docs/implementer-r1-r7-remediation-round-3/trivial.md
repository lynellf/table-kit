# Phase 1 Foundation R1/R2/R4 Remediation - Implementation Summary

**Status:** COMPLETE
**Date:** 2026-07-12
**Version:** 2.0.0

## Overview

This document summarizes the implementation of Phase 1 R1/R2/R4 remediation as identified in the reviewer's analysis. R3, R5, R6 were previously approved.

## Changes Implemented

### R1 - Core State Column Pruning ✓

**Problem:** Core `setOptions` reconciliation path did NOT call `__pruneColumnIds`. Direct factory consumers could retain deleted column IDs in state slices.

**Fix:** Added pruning call into `createDataTable.setOptions` reconciliation path. When `next.columns` differs from previous columns, the valid column IDs are computed and `__pruneColumnIds` is called to prune invalid IDs from all ID-bearing state slices.

**Files changed:**
- `packages/core/src/createDataTable.ts` - Added `columnsChanged` tracking and `__pruneColumnIds` call after state update

**Focused tests:**
- R1: 112 tests pass (state.test.ts, createDataTable.test.ts, columns.test.ts, memo.test.ts, useDataTable.test.tsx)

### R2 - Cursor Pagination and Data Version in useDataSource ✓

**Problem:** 
1. `useDataSource` did NOT expose `selectCursor` for cursor-capable sources
2. `cursor` was not included in `UseDataSourceResult`
3. Query key used `dataLen` instead of resolved `DataVersionToken`
4. `RowsResult.nextCursor`/`previousCursor` were not copied into state

**Fix:**
1. Added `CursorDirection` and `CursorSelection` types to `@lynellf/tablekit-core/dataSource`
2. Added `cursor?: CursorState` and `dataVersion?: string | number` to `DataSourceState`
3. Added `cursor?: CursorState` and `selectCursor?: (cursor, direction) => void` to `UseDataSourceResult`
4. Added cursor selection state (`cursorSelectionRef`) owned by the hook
5. Added `selectCursor` function that updates cursor selection and triggers refetch
6. Changed `buildQueryKey` to use resolved `DataVersionToken` instead of `dataLen`
7. Updated `handleResult` to copy cursors from `RowsResult` into `DataSourceState.cursor`
8. Exposed `selectCursor` on result only for cursor-capable sources (`pagination === 'cursor'`)

**Files changed:**
- `packages/core/src/dataSource/types.ts` - Added `CursorDirection`, `CursorSelection` types; added `cursor` and `dataVersion` to `DataSourceState`
- `packages/core/src/dataSource/index.ts` - Exported new types
- `packages/react/src/useDataSource.ts` - Major update: cursor ownership, `selectCursor`, dataVersion in query key, cursor propagation

**Focused tests:**
- R2: 43 tests pass (query.test.ts, query.golden.test.ts, client.test.ts, cursor-pagination.test.tsx)

### R4 - Dedicated Pivot Shared-Slice Callbacks ✓

**Problem:** `PivotTableOptions` lacked dedicated callbacks for shared slices. Controlled resize routed through `onStateChange` cast as whole-state updater synthesis.

**Fix:**
1. Added `onColumnPinningChange?: OnChangeFn<ColumnPinningState>` to `PivotTableOptions`
2. Added `onColumnSizingChange?: OnChangeFn<ColumnSizingState>` to `PivotTableOptions`
3. Added `onColumnSizingInfoChange?: OnChangeFn<ColumnResizeSession | null>` to `PivotTableOptions`
4. Added `onFocusedCellChange?: OnChangeFn<CellPosition | null>` to `PivotTableOptions`
5. Updated `setColumnPinning`, `setColumnSizing`, `setColumnSizingInfo`, `setFocusedCell` to prefer dedicated callbacks when provided, falling back to `onStateChange` for controlled mode, then local state for uncontrolled mode

**Files changed:**
- `packages/pivot/src/types.ts` - Added 4 dedicated callback option types
- `packages/pivot/src/pivotTable/factory.ts` - Updated setters to route to dedicated callbacks first

**Focused tests:**
- R4: 38 tests pass (pivotTable.test.ts, propGetters.test.ts, types.test.ts, pivot-controlled.test.tsx)

## Verification Results

```bash
pnpm verify
```

| Check | Status |
|-------|--------|
| TypeScript (tsc -b) | ✓ |
| Biome lint | ✓ |
| Tests (627 passing) | ✓ |
| Build | ✓ |
| Package artifacts | ✓ |

## All Focused Test Suites

| Finding | Tests | Status |
|---------|-------|--------|
| R1 (state/column) | 112 | ✓ |
| R2 (cursor/dataVersion) | 43 | ✓ |
| R3 (nullable lifecycle) | 17 | ✓ |
| R4 (pivot callbacks) | 38 | ✓ |
| R5 (announcers) | 18 | ✓ |

## Files Modified

```
M packages/core/src/createDataTable.ts
M packages/core/src/dataSource/index.ts
M packages/core/src/dataSource/types.ts
M packages/pivot/src/pivotTable/factory.ts
M packages/pivot/src/types.ts
M packages/react/src/useDataSource.ts
```

## Knowledge Candidates

1. **Core column pruning is now in setOptions** - `createDataTable.setOptions` calls `__pruneColumnIds` when columns change, ensuring direct factory consumers also get pruning. The React adapter may also call this method; it is idempotent.

2. **Cursor selection is hook-owned** - `useDataSource` owns `CursorSelection` state (`{ cursor: string | null, direction: 'next' | 'previous' }`). `selectCursor` updates this state and triggers a new query. Cursor state is copied from `RowsResult` into `DataSourceState.cursor`.

3. **Query identity uses DataVersionToken** - `buildQueryKey` now uses the resolved `DataVersionToken` from `table.getDataVersion()` instead of `dataLen`. This enables proper mutable data detection.

4. **Pivot dedicated callbacks are preferred** - `setColumnPinning`, `setColumnSizing`, `setColumnSizingInfo`, `setFocusedCell` now prefer their dedicated `on*Change` callbacks if provided, falling back to `onStateChange` (cast), then local state.
