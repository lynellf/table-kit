# M1: DataTable Client Features — Plan Overview

**Slug:** `m1-client-features`
**Milestone:** M1 (per `docs/initial-spec.md` §14)
**Status:** Draft v1 for review — 4 open decisions resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** Sort/filter/paginate pipeline + ordering + visibility + interaction events + prop getters + faceting helpers + minimal announcer seam.
**Scope resolution:** The target is **M1: DataTable client features** per `docs/initial-spec.md` §14 row 2 (Sorting, filtering, pagination, ordering, visibility, events). M0 is complete and provides the instance/state/controlled-slice contract, column model, registries, and React adapter shell (103 tests green); see [`docs/core-engine/overview.md`](../core-engine/overview.md).

**Out of scope (deferred):**
- Virtualization (row + column windowing) — M2.
- Resize behavior + resize handle prop getter — M2.
- Pinning offset math (M0 returns defaults; M2 fixes) — M2.
- Keyboard navigation, focus management, `focusedCell` slice dispatchers on the public surface — M2.
- `DataSource` / Level 1 server orchestration — M3.
- `PivotTable` and aggregator registry — M4.
- Worker engine — M5.
- Full announcer (live-region, `messages` map, i18n, `validateGridStructure` validator) — M6.
- `rowSelection` slice — v1.5 per spec §15.
- Subtotal rows per level — v1.5 per spec §15.
- State persistence (`serializeState` / `hydrateState`) — v1.5 per spec §15.

---

## 1. Goal

Land M1 per the spec: *"Sorting, filtering, pagination, ordering, visibility, events — Feature integration tests; Level 0 API frozen."*

Concretely:

1. **Row pipeline (filter → sort → paginate)** wired into `getRowModel()`. Each stage is skippable via the existing `manual*` flags on `DataTableOptions` (already declared in M0). Default is client-side.
2. **Sort toggle + multi-sort** helpers (`toggleSorting`, `setSorting`, public dispatchers already exist from M0). Pipeline uses the column's `sortingFn` (registry name → `getSortingFn`, or inline).
3. **Filter pipeline** using each column's `filterFn` (registry name → `getFilterFn`, or inline). Per spec §8.1: filter changes reset `pageIndex` to 0 by default (`autoResetPageIndex`).
4. **Pagination** helpers (`nextPage`, `previousPage`, `setPageIndex`, `setPageSize`, `getCanPreviousPage`, `getCanNextPage`, `getPageCount`).
5. **Column ordering helpers** (`moveColumn(id, toIndex)`, `setColumnOrder` already exists). Crosses pinning boundaries per spec §8.3.
6. **Column visibility helpers** (`toggleColumnVisibility`, `setColumnVisibility` already exists from M0; column array filters hidden columns out of `getVisibleColumns()`).
7. **Prop getters** for the M1 rendering surface (`getGridProps`, `getHeaderGroupProps`, `headerGroup.getRowProps`, `header.getHeaderProps`, `header.getSortToggleProps`, `table.getBodyProps`, `row.getRowProps`, `cell.getCellProps`, `table.getHeaderGroups`, `row.getVisibleCells`, `cell.getContext`).
8. **Interaction event wiring** per spec §7.6 (`onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`, `onRowDoubleClick`, `onHeaderClick`) — top-level options surfaced on `DataTableOptions` and propagated through prop getters with the `CellEventContext` payload.
9. **Faceting helpers** (§15 recommendation): `column.getFacetedUniqueValues()` and `column.getFacetedMinMax()` for client-side filter UIs.
10. **Minimal announcer seam**: an `Announcer` interface in `@lynellf/tablekit-core` with a default no-op implementation, a default live-region `ReactAnnouncer` in `@lynellf/tablekit-react`, and wiring through `DataTableOptions.announcer`. Full `messages` map and i18n land in M6.
11. **Level 0 API freeze**: the public surface of `@lynellf/tablekit-core` and `@lynellf/tablekit-react` is locked to the M1 contract. Subsequent milestones (M2+) add to it without breaking existing names.
12. **Tests** that exercise the pipeline end-to-end (sort + filter + paginate + visibility, controlled and uncontrolled) plus integration tests that render the prescribed ARIA DOM shape and verify interaction events fire with the correct `CellEventContext`.

The deliverable from a fresh clone: `pnpm verify` exits 0 with all M0 + M1 tests green and the spec's M1 exit criteria satisfied.

---

## 2. What I found (investigation notes)

### 2.1 Sources reviewed

- `docs/initial-spec.md` — full spec, esp. §6 (Rendering contract), §7 (Shared features), §8.1–§8.4 (DataTable features), §10 (Accessibility), §14 (milestones), §15 (recommended additions).
- `docs/core-engine/overview.md` — M0 scope statement, decisions, and risks.
- `docs/core-engine/phase-1-core-types.md` through `phase-6-public-surface-and-verification.md` — established plan format and coding patterns.
- `docs/core-engine/scope-resolution-spec.md` — M0 vs M1 decision; M0 ships only the type + state + registry + React adapter shell.
- `packages/core/src/{types,state,columns,createDataTable,utils}.ts` — M0 surface that M1 extends.
- `packages/react/src/useDataTable.ts` — M0 React adapter shell.
- `.pi-conductor/runs/4cda1ac6-*.jsonl` — run memory: M0 implementer noted two architectural deviations (`customSortingFns`/`customFilterFns` separate maps; `shallowEqual` array-by-content) that are load-bearing for M1.
- `.okf/components/dev-tooling-stack.md` — established tooling decisions (pnpm 10.33.1, Vite 5, Vitest 2, Biome 1.9, TypeScript 5.6.3 strict).
- `docs/archive/prepare-for-npm/plan.md` — established publishing surface: package metadata already complete.

### 2.2 Verified facts

- **M0 surface is complete and tested.** 103 tests across 9 files, all green. `pnpm verify` exits 0.
- **State slices are in place.** `sorting`, `columnFilters`, `pagination`, `columnOrder`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell` all exist with their `set<Slice>` dispatchers, `on<Slice>Change` callbacks, and `state[slice]` controlled-slice support.
- **Registries are wired.** `getSortingFn(name)` and `getFilterFn(name)` resolve registry names; built-ins (`alphanumeric`, `text`, `number`, `datetime`, `basic` for sort; `includesString`, `equalsString`, `equals`, `inNumberRange`, `arrIncludes` for filter) are implemented; `registerSortingFn` / `registerFilterFn` accept consumer extensions via separate `custom*` maps (deviation from M0 plan — the `builtIn*` map is frozen so consumers cannot mutate it; consumer entries live in a parallel mutable map that is consulted first).
- **`manualSorting` / `manualFiltering` / `manualPagination` options are declared** but currently unused — M1 wires them into the pipeline.
- **`getRowModel()` returns `data` as-is** (M0 stub). M1 replaces this with the pipeline output.
- **`Column` derivation works.** `createColumns(defs, state)` honors `columnOrder`, sets `isVisible` per `columnVisibility`, sets `pinnedSide`, exposes `getSize/getIsSorted/getSortIndex/getCanSort/getCanFilter/getIsVisible/getIsPinned/getPinnedOffset`. The derived `getIsSorted` returns `'asc'|'desc'|false` based on the primary sort entry only (multi-sort rank handled separately via `getSortIndex`).
- **`focusedCell` slice is settable** but no UI surfaces it (M2 concern).
- **React 19 was upgraded** as part of M0 (the implementer moved to React 19 + `@testing-library/react@^16.3.2` to enable the StrictMode test). This is load-bearing for M1 — keep React 19.
- **`packages/core/vite.config.ts`** is library-mode ESM; **no new build config** is needed for M1 because new exports are additive.
- **Bundle size budget** (§12): "core + react, DataTable-only usage, ≤ ~15kB min+gzip". M0 measured core 3.62 kB gzip, react 11.53 kB gzip. M1 will add pipeline + prop getters + announcer — must keep total ≤ ~15kB min+gzip.

### 2.3 Spec implications for M1 design

- **§6.1 prop getters** are the *delivery mechanism* for accessibility (P5). M1 must ship enough prop getters that a consumer can render the prescribed DOM shape from `docs/initial-spec.md §6.2` and produce a valid ARIA grid. Resize handles and virtualization positioning (the `positionStyle` argument to `row.getRowProps`) are M2 concerns.
- **§7.4 sorting**: multi-sort supported; toggle cycle is none → asc → desc → none when `enableSortingRemoval` is true (default), configurable via `sortDescFirst`. Per-column `sortingFn` may be a registry name or an inline function.
- **§7.5 keyboard nav** (grid pattern, roving tabindex) is M2; M1's prop getters must still emit `role`, `aria-rowcount`, `aria-colcount`, `aria-rowindex`, `aria-colindex`, and `aria-sort` because these come from state (not from keyboard input). The single `tabIndex=0` for the focused cell is M2.
- **§7.6 interaction events**: top-level options on `DataTableOptions`. Native ordering preserved (double-click fires two `onCellClick`). Consumer props merge with, and run before, internal handlers; internal behavior is skipped when `event.defaultPrevented`.
- **§8.1 filtering**: client resolution uses per-column `filterFn`; built-ins match M0's `filtering.ts`; values are opaque to the core. Filter changes reset `pageIndex` to 0 unless `autoResetPageIndex: false` (default true).
- **§8.2 pagination**: client mode is the last pipeline stage; page slice produces the row model. Helpers `getPageCount()`, `getCanPreviousPage()`, `getCanNextPage()`, `setPageIndex()`, `nextPage()`, `previousPage()`, `setPageSize()`. `aria-rowcount` reflects the **full** logical row count in both client and server modes; M1 only ships client mode.
- **§8.3 column re-ordering**: `moveColumn(id, toIndex)`. Reordering across pinning boundaries re-pins to the target region.
- **§8.4 column visibility**: filter leaf columns before ordering.
- **§15 faceting helpers**: `column.getFacetedUniqueValues()` and `column.getFacetedMinMax()`. Tree-shakeable module — only loaded when imported. Returns `Map` for unique values; `[min, max]` for numeric ranges.
- **§10 announcer**: `interface Announcer { announce(message, politeness?) }`. M1 ships the interface + default no-op + a minimal React live-region default; the `messages` map and i18n are M6.

### 2.4 Assumptions (applied during planning)

1. **`getRowModel()` is rebuilt** on every `setOptions` call and every slice change (sort, filter, paginate, columnOrder, columnVisibility). For M1 this is O(n log n) — fine because n is bounded by the consumer's dataset and M0 has no row pipeline. Memoization is a possible future optimization (M2 if profiling shows it matters).
2. **`getRowModel()` returns the **full pipeline output** (filtered, sorted, paginated). Callers slice further inside the React adapter if they need a windowed view (M2 will virtualize).
3. **`Row` is a derived object** built lazily from `getRowModel()` + `getRowId`. It carries `id`, `index` (in the pipeline output), `original` (the original row), `getVisibleCells()`. `Row` identity is rebuilt on every `getRowModel()` call — M1 does not memoize; consumers do not hold `Row` references across renders (same constraint that M0 documents for `Column`).
4. **`Cell` is a derived object** built lazily per row, carrying `id`, `row`, `column`, `getValue()`, `getContext()`, `getCellProps()`. Same identity-stability constraint as `Row`.
5. **`getRowId` is required** for the row pipeline. M0 has `defaultGetRowId` (dev-warning fallback to a JSON-based id); M1 keeps that for development but emits a hard error in production when the consumer forgets `getRowId` because the row model needs stable ids for prop getters, interaction events, and future server modes. The hard error is gated by a `process.env.NODE_ENV !== 'production'` check; production keeps the JSON fallback (with a runtime warning) to avoid breaking existing consumer apps.
6. **No virtualization in M1.** `getRowVirtualizer()` is **not** added to the public surface in M1 — it's M2. The React adapter renders all pipeline rows. Consumers wanting windowed output wait for M2.
7. **`focusedCell` slice remains settable** (M0) but prop getters do not emit `tabIndex={0}` for the focused cell in M1 — that's M2's keyboard nav concern. M1's prop getters still emit the `role`/`aria-rowindex`/`aria-colindex`/`aria-sort`/`aria-rowcount`/`aria-colcount` attributes that come from state.
8. **Manual modes** (`manualSorting`, `manualFiltering`, `manualPagination`) skip the corresponding pipeline stage. `manualPagination` also requires `pageCount` (or `rowCount`) from the consumer because the engine has no way to derive page count without slicing. M1's server modes are a thin wrapper: when `manual*` is true, the pipeline returns the input rows unprocessed.
9. **`autoResetPageIndex` defaults to true** and can be disabled via `DataTableOptions.autoResetPageIndex: false`. When true, every `setColumnFilters` dispatch also calls `setPagination((p) => ({ ...p, pageIndex: 0 }))` **only when the current pagination slice is uncontrolled** (the consumer owns it otherwise).
10. **`Announcer` is injected** via `DataTableOptions.announcer: Announcer`. Default is `noopAnnouncer`. The React adapter exposes a `ReactAnnouncer` default that mounts a visually-hidden live region.
11. **The announcer in M1 emits a small fixed set of messages** — sort changes, filter result counts, page changes — with English strings hardcoded in the `core` package. The full `messages` map (i18n) is M6; M1's strings are deliberately simple so M6 can replace them without API changes.
12. **Bundle size budget (§12, ≤ ~15kB min+gzip)** is the load-bearing constraint on M1 scope. The row pipeline + prop getters + announcer + faceting helpers should fit in the same envelope. If anything has to give, it is faceting (smallest standalone module, easiest to tree-shake).

### 2.5 Out-of-scope items intentionally NOT in this plan

- `getRowVirtualizer()` / column virtualization — M2.
- `header.getResizeHandleProps()` and the resize interaction — M2.
- Keyboard nav (`onKeyDown`, roving tabindex, `focusedCell` dispatchers on the public surface) — M2.
- `validateGridStructure` and the full `messages` map — M6.
- `rowSelection` slice — v1.5 per spec §15.
- Pivot, DataSource, worker engine — M3–M5.

---

## 3. Decisions made (and rationale)

The four open decisions identified by `assistant` are resolved below. Each includes the include/defer choice, the rationale, and the consequence for downstream phases.

### Decision D1 — Column visibility (§8.4): **INCLUDE**

**Rationale:** Spec §14's M1 row already lists "visibility" alongside ordering and events. §8.4 explicitly notes it as a "conscious scope decision" — the slice is already part of the state sketch in §4.2. §15 recommends it for v1 ("Near-zero cost, expected alongside re-ordering"). The cost in M1 is trivial: a helper method `toggleColumnVisibility(id)` and a `getVisibleColumns()` derivation that filters the `Column` array by `column.isVisible`. The `columnVisibility` slice is already declared in M0's `DataTableState`; the `setColumnVisibility` dispatcher is already exposed; the `Column.isVisible` field is already set in M0's `createColumns`. M1 only adds the helper method and the wiring into `getHeaderGroups()`.

**Consequence:** Phase 3 ships `toggleColumnVisibility(id)`, `getVisibleColumns()` on the instance, and integrates visibility into `getHeaderGroups()` so hidden columns are skipped from the rendered header structure (per spec §8.4).

### Decision D2 — Faceting helpers (§15): **INCLUDE**

**Rationale:** §15 explicitly recommends faceting for v1. It's small (two methods on `Column`), well-scoped (client data only), and unlocks consumer filter UIs without additional library work. It does not depend on M2+ work. The methods are tree-shakeable: consumers who don't import them don't pay for them.

**Consequence:** Phase 5 ships `column.getFacetedUniqueValues(): Map<unknown, number>` and `column.getFacetedMinMax(): [number, number] | undefined` as Column methods. They read from the *pre-filter, pre-sort, pre-paginate* row set (i.e., `options.data` or the consumer's row source — for M1, the same array `getRowModel()` derives from). The instance exposes a memoization cache keyed on `getRowId(data[i])` so repeated calls within the same pipeline output don't recompute.

### Decision D3 — Announcer wiring: **MINIMAL SEAM IN M1, FULL POLISH IN M6**

**Rationale:** §10 lists the announcer as a launch-blocking requirement and §7.4/§8.1/§8.2 mandate that sort/filter/paginate emit announcements. Shipping these announcements in M1 is the right scope. However, the full polish (live-region + `messages` map + i18n + politeness heuristics + `validateGridStructure`) is M6 per §14.

M1's scope is:
- `interface Announcer { announce(message: string, politeness?: 'polite' | 'assertive'): void }` in `@lynellf/tablekit-core`.
- `const noopAnnouncer: Announcer` (default; consumers who don't care get silence).
- A minimal live-region default in `@lynellf/tablekit-react`: a `ReactAnnouncer` component that mounts a single visually-hidden `aria-live="polite"` div and routes `announce()` calls into it.
- `DataTableOptions.announcer?: Announcer` slot.
- Wiring: `setSorting` → "Sorted by X ascending" (single-sort) or "Sorted by X ascending, then Y descending" (multi-sort); `setColumnFilters` → "N rows after filtering"; `setPagination` → "Page X of Y" (computed via `getPageCount()`).
- Hardcoded English strings (no `messages` map).

**Consequence:** Phase 6 ships the announcer seam and the React live-region default. M6 replaces the hardcoded strings with the `messages` map and adds the validator.

### Decision D4 — Prop getter completeness: **M1 RENDERING SUBSET, M2+ EXTENDS**

**Rationale:** §6.1 is the ARIA delivery mechanism. M1 must ship enough getters that a consumer can render the prescribed DOM shape (§6.2) and produce a valid ARIA grid **without keyboard nav, virtualization, or resize**. Concretely, M1 ships:

| Getter | M1 surface |
| --- | --- |
| `table.getGridProps()` | ✅ role="grid" (default), aria-rowcount, aria-colcount, tabIndex=0 (M0 placeholder — becomes -1 in M2 when nav lands) |
| `table.getHeaderGroupProps()` | ✅ role="rowgroup" |
| `headerGroup.getRowProps()` | ✅ role="row", aria-rowindex=1 |
| `header.getHeaderProps()` | ✅ role="columnheader", aria-colindex, aria-sort (primary) |
| `header.getSortToggleProps()` | ✅ role="button" (when `enableSorting`), tabIndex=-1, onClick (consumer merges) |
| `table.getBodyProps()` | ✅ role="rowgroup" |
| `row.getRowProps()` | ✅ role="row", aria-rowindex (no positionStyle in M1 — M2) |
| `cell.getCellProps()` | ✅ role="gridcell", aria-colindex |
| `table.getHeaderGroups()` | ✅ array of derived header groups |
| `row.getVisibleCells()` | ✅ array of derived cells (skips hidden columns) |
| `cell.getContext()` | ✅ context object passed to `renderSlot(def.header/cell, ctx)` |
| `header.getResizeHandleProps()` | ❌ M2 |
| `cell.getResizeHandleProps()` | ❌ M2 |
| `table.getRowVirtualizer()` | ❌ M2 |
| Keyboard focus handlers (`onKeyDown`, roving tabindex) | ❌ M2 |

**Consequence:** Phase 5 ships the M1 subset. M2 extends with resize handles, virtualization, and keyboard nav. The M1 surface is sufficient for ARIA validation via axe in M1 integration tests (no SR manual matrix — that's M6).

### Summary of decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Column visibility (§8.4) | **INCLUDE** in M1 |
| D2 | Faceting helpers (§15) | **INCLUDE** in M1 |
| D3 | Announcer wiring | **MINIMAL SEAM IN M1** (interface + no-op + react live-region + basic announcements); full polish in M6 |
| D4 | Prop getter completeness | **M1 SUBSET** (rendering surface without resize / virtualization / keyboard nav) |

---

## 4. Architecture overview

### 4.1 Row pipeline

```
options.data
   │
   ▼
filter (per-column filterFn registry/inline)         ← skipped when manualFiltering
   │
   ▼
sort   (per-column sortingFn registry/inline)        ← skipped when manualSorting
   │
   ▼
paginate (slice by {pageIndex, pageSize})            ← skipped when manualPagination
   │
   ▼
Row[]   ← returned by getRowModel()
```

Each stage is a pure function over its input array. The factory caches the pipeline result keyed on the `(data reference, sorting, columnFilters, pagination, manual*)` tuple. On every state change, the cache invalidates.

The pipeline resolves `sortingFn` and `filterFn` via the registries (`getSortingFn(name)`, `getFilterFn(name)`) when the column declares a string, and uses the inline function directly when the column declares one.

### 4.2 Prop getter contract

Every prop getter accepts an optional `consumerProps` object that is shallow-merged into the returned props. Consumer handlers (e.g., `onClick`) run **before** internal handlers; internal handlers check `event.defaultPrevented` before running. This matches TanStack's behavior and is the contract §7.6 specifies.

Prop getters are pure functions — no side effects, no DOM access. They return a plain `{ [attr]: value }` object. The React adapter maps the `onClick`/`onKeyDown` etc. to React event props; a future Vue adapter maps them to `@click`/`@keydown`. No DOM coupling in `core`.

### 4.3 Announcer wiring

```
DataTableOptions.announcer: Announcer
   │
   ▼
DataTable (core)         ← emits announcements via the injected Announcer
   │
   ▼
ReactAnnouncer (react)   ← default; renders a single <div aria-live="polite" />
                            + announces into it via announce()
```

The default `noopAnnouncer` is used when the consumer does not pass `announcer`. The React adapter mounts the `ReactAnnouncer` and passes it via `announcer` automatically when the consumer renders through `useDataTable`. Consumers may override by passing their own `announcer` option.

### 4.4 Bundle budget

§12 sets the budget at "core + react, DataTable-only usage, ≤ ~15kB min+gzip". M0 used 3.62 kB core + 11.53 kB react (15.15 kB total — already at the limit). M1 will add ~1 kB core (pipeline + dispatchers + announcer interface + faceting helpers) and ~1 kB react (live-region default + interaction event handlers + prop getter merge logic). Net: ~17 kB. This **exceeds** the spec's budget.

**Mitigation:** The core row pipeline is the heaviest addition. It can be made tree-shakeable by exporting the filter/sort/paginate functions from `@lynellf/tablekit-core/filters`, `@lynellf/tablekit-core/sorting`, `@lynellf/tablekit-core/pagination` entry points (subpath exports) so consumers who don't use a particular stage don't bundle it. The plan adopts this split (see §5.2 phase 1 design).

Even with tree-shaking, the M1 budget will land at ~16 kB min+gzip — slightly over the spec's 15 kB target but within ~7% and within the §12 footnote ("guardrails, not goals"). The post-M1 implementation commit message will log the measured sizes.

---

## 5. Phase structure (sequencing rationale)

| # | Phase | Goal | New files | Modified files |
| -- | ----- | ---- | --------- | -------------- |
| 1 | [Row pipeline](./phase-1-row-pipeline.md) | filter→sort→paginate wired into `getRowModel()`; manual* flags honored; `autoResetPageIndex`; row/cell derivation | `pipeline/{filter,sort,paginate,rowModel}.ts`, `rows.ts`, `pipeline/*.test.ts`, `rows.test.ts` | `createDataTable.ts`, `index.ts` (re-export), `types.ts` (add `Row`, `Cell`, `HeaderGroup`, `autoResetPageIndex`, `enableMultiSort`, `sortDescFirst`, `enableSortingRemoval`) |
| 2 | [Column ordering helpers](./phase-2-column-ordering.md) | `moveColumn(id, toIndex)`, re-pin on boundary crossing; public dispatcher | `ordering.ts`, `ordering.test.ts` | `index.ts`, `types.ts` |
| 3 | [Column visibility helpers](./phase-3-column-visibility.md) | `toggleColumnVisibility(id)`, `getVisibleColumns()`; integrate into `getHeaderGroups()` | `visibility.ts`, `visibility.test.ts` | `columns.ts` (`getIsVisible` already returns correct value; expose `getVisibleColumns` on instance), `index.ts` |
| 4 | [Faceting helpers](./phase-4-faceting-helpers.md) | `column.getFacetedUniqueValues()`, `column.getFacetedMinMax()` | `faceting.ts`, `faceting.test.ts` | `columns.ts` (add methods), `index.ts` |
| 5 | [Prop getters + header structure](./phase-5-prop-getters.md) | `getGridProps`, `getHeaderGroupProps`, `getRowProps`, `getHeaderProps`, `getSortToggleProps`, `getBodyProps`, `getCellProps`, `getHeaderGroups`, `getVisibleCells`, `getContext`; ARIA attributes; consumer-merge semantics | `propGetters.ts`, `headers.ts`, `propGetters.test.ts`, `headers.test.ts` | `index.ts`, `createDataTable.ts` (expose `getHeaderGroups`, `getRowModel` already wired; add `getLeftLeafColumns`/`getCenterLeafColumns`/`getRightLeafColumns` for pinned slicing) |
| 6 | [Interaction events + announcer](./phase-6-events-and-announcer.md) | §7.6 callbacks on `DataTableOptions`; `Announcer` interface + noop + react live-region; basic announcements for sort/filter/paginate | `events.ts`, `announcer.ts`, `events.test.ts`, `announcer.test.ts`; react: `ReactAnnouncer.tsx`, `ReactAnnouncer.test.tsx` | `createDataTable.ts` (route announcements), `types.ts` (add `InteractionOptions`, `Announcer`), `useDataTable.ts` (mount ReactAnnouncer), `index.ts` |
| 7 | [Public surface + integration + freeze](./phase-7-public-surface-and-integration.md) | Public re-exports; README update; `pnpm verify` green; feature integration tests; Level 0 API freeze manifest | `integration.test.tsx` (react), `integration.test.ts` (core) | `index.ts` (both packages), README files, `types.ts` (any final surface tweaks) |

**Sequencing rationale:**
- Phase 1 (pipeline) first because every later phase depends on `getRowModel()` returning the correct row set.
- Phases 2 + 3 (ordering, visibility) next because they mutate the column array that phase 5 (prop getters) iterates over.
- Phase 4 (faceting) is small and independent; can run after pipeline so the cache invalidation hooks are in place.
- Phase 5 (prop getters) is the consumer-facing rendering surface; needs pipeline + ordering + visibility.
- Phase 6 (events + announcer) needs prop getters (events ride through them).
- Phase 7 (integration + freeze) is the aggregate gate.

---

## 6. Constraints / non-goals

- **No virtualization.** All pipeline rows are rendered. M2.
- **No resize behavior.** `getResizeHandleProps()` is not exposed in M1.
- **No keyboard nav.** Roving tabindex, `focusedCell` dispatchers on public surface, `onKeyDown` handlers — all M2.
- **No `DataSource`, no Level 1 orchestration.** `manual*` flags are the M1 server escape hatch.
- **No `PivotTable`.** M4.
- **No worker engine.** M5.
- **No full announcer polish** (`messages` map, i18n, validator). M6.
- **No `rowSelection` slice.** v1.5 per spec §15.
- **No new runtime deps in `@lynellf/tablekit-core`.** Dev deps in `@lynellf/tablekit-react` already sufficient (React 19 + RTL 16).
- **No CI changes.** Lefthook pre-push continues to run `typecheck + lint + test + build`.
- **No breaking changes to the M0 surface.** All M0 exports remain; new exports are additive.

---

## 7. Risks and open questions

| Risk / Question | Disposition |
| --- | --- |
| Bundle size budget (§12, ≤ ~15kB min+gzip) — M1 likely lands at ~16 kB | **Mitigation:** tree-shakeable subpath exports for filter/sort/paginate; logged in implementation commit. Within 7% of the §12 guardrail. |
| **`getRowModel()` rebuild cost** on every state change (O(n log n) for sort) | **Deferred to M2.** M1 emits the pipeline as written; if profiling in M2 shows the rebuild matters, memoize keyed on a tuple. For M1, the consumer's data is assumed small enough that this is fine. |
| **`getRowId` required in production** — M0's `defaultGetRowId` is a dev fallback | **M1 hardens it.** Dev: warn once. Production: warn once and continue. Hard error is gated by an `options.requireGetRowId` flag (default false). Consumers opting into server modes (M3) must set it. |
| **Multi-sort toggle cycle** (`enableSortingRemoval`, `sortDescFirst`) needs to be plumbed through `toggleSorting` | **M1 wires defaults.** Spec defaults are encoded in `DataTableOptions`; column-level overrides land in M2 (M2 also adds the Shift-to-append multi-sort interaction). |
| **`aria-rowcount` semantics in `manualPagination`** — engine has no way to know the server's total | **M1 documents the contract.** `getRowCount()` returns the input array's length by default; consumers in `manualPagination` mode pass `rowCount` (option) which becomes `aria-rowcount`. Page count derives from `rowCount / pageSize` (rounded up). |
| **`Announcer` injection from `useDataTable`** — the React adapter must auto-inject `ReactAnnouncer` only once per component | **M1 uses a context-free pattern.** `useDataTable` mounts the announcer lazily on first call (singleton at module scope). Consumers who pass their own `announcer` option skip the auto-mount. |
| **`getCellProps` consumer-merge semantics** — duplicate keys between consumer and library | **Spec §7.6 wins:** consumer runs first; library runs second; `event.defaultPrevented` skips library handlers. The merge is shallow + handler-chaining. |
| **Filter value change resets pagination — but only when uncontrolled** | **M1 routes through `applyChange`.** When `pagination` is controlled, the auto-reset calls `setColumnFilters` then a separate `onPaginationChange(updater)` request via the slice callback (the consumer owns the slice). |
| **`exactOptionalPropertyTypes` friction with `InteractionOptions` (callbacks may be undefined)** | **All callback fields declared `((ctx: CellEventContext<TRow>, event: Event) => void) \| undefined`.** Builders inside the factory tolerate absent callbacks. |
| **`noUncheckedIndexedAccess` + array access in pipeline** | **Use `for…of` loops** (no index access) for the filter/sort/paginate stages. Avoid `data[0]`-style access without `=== undefined` checks. |
| **`Announcer.announce` politeness parameter** — `'polite'` vs `'assertive'` | **M1 always uses `'polite'`.** The second arg is accepted for forward compat but ignored. M6 wires the full politeness heuristic. |
| **Tree-shakeable subpath exports** — package.json `exports` map needs new entries | **Phase 7 edits `packages/core/package.json` `exports`.** Backwards-compatible additions; the root `.` entry remains stable. |

---

## 8. Verification plan (final acceptance)

After all phases complete, a fresh clone must pass:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                          # typecheck + lint + test + build
pnpm test                                            # M0 (103 tests) + M1 (~120-140 new tests) all green
node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/filtering').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/sorting').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/pagination').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

### 8.1 M1-specific verification commands

```bash
# 1. Public API smoke test
pnpm --filter @lynellf/tablekit-core test            # pipeline + ordering + visibility + faceting + prop getters + announcer + integration
pnpm --filter @lynellf/tablekit-react test           # prop getters integration + announcer live-region

# 2. Bundle size check
pnpm build
gzip -c packages/core/dist/tablekit-core.es.js | wc -c    # core gzip
gzip -c packages/react/dist/tablekit-react.es.js | wc -c  # react gzip
echo $(( $(gzip -c packages/core/dist/tablekit-core.es.js | wc -c) + $(gzip -c packages/react/dist/tablekit-react.es.js | wc -c) ))   # total
# Logged in implementation commit message.

# 3. Type surface regression
pnpm typecheck                                       # all *.test-d.ts files compile
```

### 8.2 M1 exit criteria mapping (spec §14)

| Spec criterion | How this plan proves it |
| --- | --- |
| **Feature integration tests** | `packages/core/src/integration.test.ts` + `packages/react/src/integration.test.tsx`: end-to-end tests that combine sort + filter + paginate + ordering + visibility + interaction events on a controlled instance, asserting the rendered DOM has the prescribed ARIA shape and that pipeline output is correct under combined state. |
| **Level 0 API frozen** | `docs/m1-client-features/api-freeze.md` (phase 7) records every public export of `@lynellf/tablekit-core` and `@lynellf/tablekit-react`. Subsequent milestones (M2+) may add new exports but must not rename, remove, or change the signature of any name listed in the freeze manifest. The freeze manifest is reviewed by the implementer in phase 7 and signed off by the reviewer post-implementation. |

---

## 9. Knowledge candidates (for `okf-curator`)

These are durable architectural decisions surfaced by this plan. They are emitted to the orchestrator in the status report; `okf-curator` writes the actual files.

- **`docs/m1-client-features/overview.md`**: durable decision that the row pipeline is wired into `getRowModel()` and is O(n log n) per state change; memoization deferred to M2.
- **`docs/m1-client-features/phase-1-row-pipeline.md`**: durable telemetry field semantics — `autoResetPageIndex` is a per-instance option that resets `pageIndex` to 0 on `setColumnFilters` dispatch, but only when the pagination slice is uncontrolled.
- **`docs/m1-client-features/phase-6-events-and-announcer.md`**: durable decision that `Announcer` is a `core` interface with a default `noopAnnouncer`, and the React adapter auto-mounts `ReactAnnouncer` only when the consumer does not pass their own `announcer` option.
- **`docs/m1-client-features/overview.md` §3**: durable scope decisions D1–D4 — column visibility in, faceting in, announcer seam (not full polish), prop getter subset.

---

## 10. Phase index

1. [`phase-1-row-pipeline.md`](./phase-1-row-pipeline.md) — filter/sort/paginate pipeline; `Row`/`Cell` derivation; `autoResetPageIndex`; manual* modes.
2. [`phase-2-column-ordering.md`](./phase-2-column-ordering.md) — `moveColumn` + dispatcher; pinning boundary re-pin.
3. [`phase-3-column-visibility.md`](./phase-3-column-visibility.md) — `toggleColumnVisibility` + `getVisibleColumns`; header-group integration.
4. [`phase-4-faceting-helpers.md`](./phase-4-faceting-helpers.md) — `getFacetedUniqueValues` + `getFacetedMinMax`; tree-shakeable module.
5. [`phase-5-prop-getters.md`](./phase-5-prop-getters.md) — getGridProps/getHeaderProps/getCellProps/etc.; ARIA attributes; consumer-merge; header group derivation.
6. [`phase-6-events-and-announcer.md`](./phase-6-events-and-announcer.md) — §7.6 interaction callbacks; `Announcer` interface + noop + React live-region; basic announcements.
7. [`phase-7-public-surface-and-integration.md`](./phase-7-public-surface-and-integration.md) — public re-exports; README; integration tests; Level 0 API freeze.