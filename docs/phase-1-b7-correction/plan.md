# Phase 1 B7 Correction — Implementation Plan

**Status:** In Progress
**Date:** 2026-07-12
**Findings:** B7-SERIALIZER-ERRORS, B7-REQUEST-TRIGGERING, B7-CURSOR-METADATA, B7-MANUAL-CAPABILITY-PERSISTENCE, B7-STRICT-MODE-OWNERSHIP, B7-ROW-MODEL-IDENTITY

## Ordered Implementation Tasks

### Task 1: B7-SERIALIZER-ERRORS — Canonical query-key serializer

**File to create:** `packages/core/src/dataSource/queryKey.ts`

**Requirements:**
- Accepted grammar: `null`, booleans, strings, finite numbers, arrays preserving order, plain objects with recursively sorted own string keys
- Rejected: `undefined` (including array members), functions, symbols, bigint, `NaN`, positive/negative infinity, cyclic graphs, `Date`, `Map`, `Set`, class instances, other non-plain objects
- Registry names are the only function representation allowed
- Produces `QueryKeySerializationError` with stable code, kind, and property path
- Equivalent plain objects with different insertion order produce byte-identical keys
- Array order remains significant

**Tests to create:** `packages/core/src/dataSource/__tests__/query-key.test.ts`

### Task 2: B7-REQUEST-TRIGGERING — Request trigger matrix

**Files to update:** `packages/react/src/useDataSource.ts`

**Requirements:**
- Implement complete trigger matrix (see table in plan)
- Cursor selection resets on non-cursor context changes
- One request per descriptor key

### Task 3: B7-CURSOR-METADATA — Cursor separation

**Files to update:** `packages/react/src/useDataSource.ts`, `packages/core/src/dataSource/types.ts`

**Requirements:**
- CursorSelection is request identity (hook-owned)
- CursorState is response metadata
- These two concepts never mix

### Task 4: B7-MANUAL-CAPABILITY-PERSISTENCE — Source-scoped capability overlay

**Files to update:** `packages/react/src/useDataSource.ts`, `packages/core/src/createDataTable.ts`

**Requirements:**
- Source-scoped capability seam that records source identity, sort, filter, paginate, paginationStrategy
- While source is active, row-model uses derived flags
- Source removal clears overlay and restores consumer options
- No sparse writes to data/columns/rowCount

### Task 5: B7-STRICT-MODE-OWNERSHIP — Strict Mode test

**File to create:** `packages/react/src/__integration__/strict-mode-data-source.test.tsx`

**Requirements:**
- Test Strict Mode effect replay
- Prove exactly one call per committed key
- Prove replacement aborts old signal

### Task 6: B7-ROW-MODEL-IDENTITY — Token-based cache contract

**Files to update:** `packages/core/src/pipeline/memo.ts`, `packages/core/src/createDataTable.ts`

**Requirements:**
- MemoKey includes data reference + DataVersionToken
- Same reference + same token → reuse
- Same reference + token A→B or B→UNSET → invalidate + recompute
- New reference → recompute even if deeply equal
- No recursive/deep row equality

## Verification Commands

After each task:
```bash
pnpm exec vitest run <affected test files>
```

Final verification:
```bash
pnpm verify
```
