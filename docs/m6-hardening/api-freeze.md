<!-- Historical: true -->
# v1.0 API Freeze

> Canonical API contract for v1.0.0 — the npm release published from this repo.
> This document replaces the per-milestone freezes (`docs/mN-*/api-freeze.md`).
> Last verified: 2026-07-06.

## 1. Stability Policy

v1.x is **additive**: minor versions add exports and behavior; no breaking changes.

- `v1.0.x` patches: bug fixes, performance, no API change.
- `v1.x` minor versions: additive exports, additive fields on existing types.
- Deprecations land in `v1.x` with a console warning.
- Breaking changes (rename, remove, semantic change) land in `v2.0`. Per spec §2.3 non-goals, none are planned; the breaking-change policy exists for emergency cases.

## 2. Resolved Open Questions (spec §16)

| # | Question | Resolution |
| -- | -------- | ---------- |
| 2 | RTL — physical `left`/`right` or logical `start`/`end`? | **PHYSICAL for v1.** Matches CSS `position: sticky`. Consumers in RTL locales add a CSS mirror — see `docs/rtl-notes.md`. |
| 4 | `tabBehavior: 'exit' \| 'cells'`? | **BOTH, with `'exit'` default.** M6 phase 2 ships both. |
| 5 | Variable row heights + scroll anchoring | **Locked estimate + offset correction** (resolved in M2). |
| 7 | Level-1 debounce ownership | **Consumer-owned for v1.** |
| 8 | Worker DX | **`createWorkerEntry()` factory + bundler-recipes doc** (M5 + M6 phase 4). |
| 9 | AT variance risk | **SR matrix procedure** (M6 phase 5). |
| 10 | Mixed-mode semantics | **Soft warnings in v1, hard-gating deferred to v2.** |

## 3. M6 Additions (additive)

### 3.1 Announcer i18n (M6 Phase 1)

```ts
// @lynellf/tablekit-react
export declare const defaultMessages: Readonly<MessagesMap>;
export declare type AnnouncerKey = keyof typeof defaultMessages;
export declare type MessagesMap = {
  sortAsc: string;
  sortDesc: string;
  sortCleared: string;
  multiSort: (count: number) => string;
  filterApplied: (count: number) => string;
  filterCleared: string;
  pageChanged: (page: number, total: number) => string;
  pageSizeChanged: (size: number) => string;
  columnPinned: (id: string) => string;
  columnUnpinned: (id: string) => string;
  columnMoved: (id: string, from: number, to: number) => string;
  resizeCommitted: (id: string, width: number) => string;
  expandStarted: string;
  expandFinished: (count: number) => string;
  expandError: string;
  loadingStarted: string;
  loadingFinished: string;
  serverError: string;
};
```

`useDataTable({ messages?: Partial<MessagesMap> })` and `usePivotTable({ messages?: Partial<MessagesMap> })` accept per-key overrides. Default English is the M0–M5 hardcoded strings.

### 3.2 `tabBehavior` Option (M6 Phase 2)

```ts
// @lynellf/tablekit-core
export declare type TabBehavior = 'exit' | 'cells';

// @lynellf/tablekit-react
export interface UseDataTableOptions<TRow> {
  // ...existing options...
  tabBehavior?: TabBehavior;
  messages?: Partial<MessagesMap>;
}

export interface UseDataTableResult<TRow> {
  // ...existing returns...
  gridRef: React.RefObject<HTMLDivElement | null>; // assign to root grid element
}

export function useTabBehavior(opts: {
  gridRef: React.RefObject<HTMLElement | null>;
  tabBehavior: TabBehavior;
}): void;
```

`useDataTable({ tabBehavior?: 'exit' | 'cells' })` (default `'exit'`). `'cells'` is opt-in with smoke-test coverage (not full APG suite). The `gridRef` must be assigned to the root grid element for Tab behavior to activate.

Same option on `usePivotTable`.

## 4. v1.0 Export List (consolidated from M0–M5)

### `@lynellf/tablekit-core` (v1.0.0)

**Package:** `npm install @lynellf/tablekit-core`

**Key exports:**
- `createDataTable(options): DataTableInstance` — primary factory
- `Column`, `createColumns` — column model
- `filterRows`, `sortRows`, `paginateRows` — row pipeline stages
- `moveColumn(id, toIndex)` — column reorder
- `toggleColumnVisibility`, `toggleAllColumnsVisibility` — column visibility
- `getFacetedUniqueValues`, `getFacetedMinMax` — faceting helpers
- `mergeProps`, `chainHandlers` — prop getter utilities
- `noopAnnouncer` — default no-op announcer
- `TabBehavior` — M6 phase 2 type

**No M6 additions to core beyond `TabBehavior` type.** All i18n plumbing lives in the react package.

### `@lynellf/tablekit-react` (v1.0.0)

**Package:** `npm install @lynellf/tablekit-react`

**Key exports:**
- `useDataTable(options): UseDataTableResult` — primary React hook
  - Adds: `messages?`, `tabBehavior?` options; `gridRef` on result
- `usePivotTable(options): UsePivotTableResult` — pivot hook
  - Adds: `messages?`, `tabBehavior?` options; `gridRef` on result
- `useDataSource(table, source): UseDataSourceResult` — server mode hook
- `ReactAnnouncer`, `getReactAnnouncer` — live-region announcer
- `useRowVirtualizer`, `useCenterVirtualizer` — virtualization hooks
- `useResizeHandle` — resize interaction hook
- `useKeyboardNav`, `useTabBehavior` — navigation hooks
- `validate(source, options): ValidationResult` — ARIA validator
- `defaultMessages`, `AnnouncerKey`, `MessagesMap` — M6 i18n surface
- `createWorkerEngine` (from `@lynellf/tablekit-worker`) — worker engine factory

### `@lynellf/tablekit-pivot` (v1.0.0)

**Package:** `npm install @lynellf/tablekit-pivot`

**Key exports:**
- `createPivotTable(options): PivotTableInstance` — pivot factory
- Built-in aggregators: `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
- `registerAggregator`, `getAggregator` — aggregator registry
- Treegrid keyboard actions: `resolveTreegridKeyAction`, `applyTreegridAction`

**No breaking changes since M5 api-freeze.** Surface reaffirmed.

### `@lynellf/tablekit-worker` (v1.0.0)

**Package:** `npm install @lynellf/tablekit-worker`

**Key exports:**
- `createWorkerEngine(options): AggregationEngine` — worker engine
- `createWorkerEntry()` — worker-side entry point (call this in the worker file)

**No breaking changes since M5 api-freeze.** Surface reaffirmed.

## 5. Deprecations

None in v1.0.

## 6. Migration from 0.x

None required. v1.0 is additive over `0.1.0`; all `0.1.0` callsites still work without change.

## 7. v1.5 and v2 Items (out of scope)

The following are deferred and not part of v1.0:

| Item | Target |
| --- | --- |
| `rowSelection` state slice | v1.5 |
| State persistence helper (`serializeState`/`hydrateState`) | v1.5 |
| Subtotal rows (`perLevel`) | v1.5 |
| Column auto-fit | v2 |
| Global quick filter | v2 |
| Hard gate behind `allowWithinPageOperations` | v2 |
| Columnar / `Arrow` transfer for `setRows` | v2 |
| `validateGridStructure` CLI / layered diagnostics | post-v1.0 |

## 8. See Also

- Historical freezes: `docs/archive/api-freeze-history/`
  - M5: `docs/archive/api-freeze-history/m5-pivot-engines.md`
  - M4: `docs/archive/api-freeze-history/m4-pivot-main-thread.md`
  - M3: `docs/archive/api-freeze-history/m3-server-modes.md`
- M5 plan: `docs/m5-pivot-engines/plan-summary.md`
- M4 plan: `docs/m4-pivot-main-thread/plan-summary.md`
- Spec: `docs/initial-spec.md`
- Recipes: `docs/recipes/`
- SR matrix: `docs/m6-hardening/sr-matrix.md`
- Bundler recipes: `docs/bundler-recipes.md`
- Release process: `docs/release-process.md`
