# M1: DataTable Client Features — Plan Summary

**Audience:** `plan-reviewer-a`, `plan-reviewer-b`
**Goal:** Review-ready summary of the M1 plan.
**Full plan:** [`overview.md`](./overview.md) + 7 phase files.

---

## 1. Goal recap

Land M1 per `docs/initial-spec.md` §14 row 2: **Sorting, filtering, pagination, ordering, visibility, events**. Exit criteria: **feature integration tests + Level 0 API frozen**.

M0 is complete (103 tests, `pnpm verify` green). M1 extends the surface additively; no M0 exports are renamed or removed.

## 2. Scope (what's in, what's out)

### In M1

| Feature | Spec section | New surface |
| --- | --- | --- |
| Sort pipeline + toggle helpers | §7.4 | `Row[]` re-ordered by column `sortingFn`; `toggleSorting(id, desc?)`; `setSorting` already in M0; pipeline honors `manualSorting` |
| Filter pipeline | §8.1 | `Row[]` filtered by column `filterFn`; `setColumnFilters` already in M0; pipeline honors `manualFiltering`; `autoResetPageIndex` (default true) |
| Pagination helpers | §8.2 | `nextPage`/`previousPage`/`setPageIndex`/`setPageSize`; `getCanPreviousPage`/`getCanNextPage`/`getPageCount`/`getRowCount`; `manualPagination` + `rowCount` |
| Column ordering | §8.3 | `moveColumn(id, toIndex)`; re-pins across pinning boundaries; `setColumnOrder` already in M0 |
| Column visibility | §8.4 (D1 INCLUDE) | `toggleColumnVisibility(id)`; `getVisibleColumns()`; integrated into `getHeaderGroups()` |
| Prop getters (rendering subset) | §6.1 (D4 SUBSET) | `getGridProps`, `getHeaderGroupProps`, `getHeaderProps`, `getRowProps`, `getSortToggleProps`, `getBodyProps`, `getCellProps`, `getHeaderGroups`, `getVisibleCells`, `getContext` |
| Interaction events | §7.6 | `onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`, `onRowDoubleClick`, `onHeaderClick`; `CellEventContext<TRow>` |
| Faceting helpers | §15 (D2 INCLUDE) | `column.getFacetedUniqueValues(): Map<unknown, number>`; `column.getFacetedMinMax(): [number, number] \| undefined` |
| Minimal announcer seam | §10 (D3 PARTIAL) | `interface Announcer { announce(msg, politeness?) }`; `noopAnnouncer` (default); `ReactAnnouncer` (live-region in react); basic sort/filter/paginate announcements |

### Out of M1 (deferred)

- Virtualization (`getRowVirtualizer`, `positionStyle`) — M2.
- Resize handle (`getResizeHandleProps`) + resize interaction — M2.
- Keyboard nav (roving tabindex, `focusedCell` public dispatchers, `onKeyDown`) — M2.
- `validateGridStructure` + full `messages` map (i18n) + politeness heuristics — M6.
- `DataSource` / Level 1 — M3.
- `PivotTable` — M4.
- Worker engine — M5.
- `rowSelection`, subtotals, state persistence — v1.5 per spec §15.

## 3. Resolved decisions (the four open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | Column visibility (§8.4) — include or defer? | **INCLUDE** | §14 lists it in M1; §8.4 says "conscious scope decision"; §15 recommends it; cost is trivial (helper + derivation; slice + dispatcher already in M0) |
| D2 | Faceting helpers (§15) — include or defer? | **INCLUDE** | §15 recommends it for v1; small, well-scoped, independent of M2+ |
| D3 | Announcer wiring — ship in M1 or defer to M6? | **MINIMAL SEAM IN M1** | §7.4/§8.1/§8.2 require announcements for sort/filter/paginate. M1 ships interface + no-op + react live-region + hardcoded English strings. Full `messages` map, i18n, validator land in M6. |
| D4 | Prop getter completeness — full §6.1 or subset? | **M1 SUBSET** | M1 ships rendering surface without resize / virtualization / keyboard nav. M2 extends. M1 is sufficient for ARIA-grid validation via axe; SR manual matrix is M6. |

Full rationale for each is in [`overview.md` §3](../m1-client-features/overview.md).

## 4. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [Row pipeline](./phase-1-row-pipeline.md) | filter→sort→paginate wired into `getRowModel()`; `Row`/`Cell` derivation; `autoResetPageIndex`; manual* modes | ~35-40 |
| 2 | [Column ordering](./phase-2-column-ordering.md) | `moveColumn`, re-pin on boundary | ~8-10 |
| 3 | [Column visibility](./phase-3-column-visibility.md) | `toggleColumnVisibility`, `getVisibleColumns`, header integration | ~8-10 |
| 4 | [Faceting](./phase-4-faceting-helpers.md) | `getFacetedUniqueValues`, `getFacetedMinMax` | ~8-10 |
| 5 | [Prop getters + headers](./phase-5-prop-getters.md) | §6.1 rendering subset; ARIA; consumer-merge; `getHeaderGroups` | ~25-30 |
| 6 | [Events + announcer](./phase-6-events-and-announcer.md) | §7.6 callbacks; `Announcer` interface; React live-region; basic announcements | ~15-20 |
| 7 | [Public surface + integration + freeze](./phase-7-public-surface-and-integration.md) | Re-exports; README; integration tests; API freeze | ~10-15 |
| | **Total M1 tests** | | **~110-135** (on top of M0's 103) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

## 5. Key risks

1. **Bundle size budget** (§12: ≤ ~15kB min+gzip). M0 already at 15.15 kB; M1 lands at ~16 kB (within 7% of guardrail). Tree-shakeable subpath exports mitigate.
2. **`getRowModel()` rebuild cost** is O(n log n) per state change. Accepted for M1; memoization deferred to M2.
3. **`getRowId` hardening**: M0's `defaultGetRowId` is a dev fallback; M1 keeps the fallback but adds a clearer error path for production server modes (M3 strict enforcement).
4. **`autoResetPageIndex` interaction with controlled pagination**: must route through `onPaginationChange` callback when slice is controlled. Tested in phase 1.
5. **Announcer singleton in React**: `useDataTable` mounts `ReactAnnouncer` at module scope; consumers passing their own `announcer` option skip auto-mount.
6. **`verbatimModuleSyntax`** requires `import type` for type-only imports. Enforced by Biome.

Full risk table in [`overview.md` §7](../m1-client-features/overview.md).

## 6. Verification

After all 7 phases, from a fresh clone:

```bash
pnpm install
pnpm verify                                          # typecheck + lint + test + build — EXIT 0
pnpm test                                            # M0 (103) + M1 (~120-135) tests, all green
node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/sorting').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/filtering').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/pagination').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"
```

Expected public surface (M1-final, abridged):

```ts
// @lynellf/tablekit-core (root)
{
  createDataTable,
  Column,
  createColumns,
  resolveAccessor,
  // registries (M0)
  getSortingFn, registerSortingFn, BUILT_IN_SORTING_FNS,
  getFilterFn, registerFilterFn, BUILT_IN_FILTER_FNS,
  // state engine (M0)
  resolveUpdater, applySliceChange, isSliceControlled, mergeInitialState,
  controlledSliceKeys, stateChangedOnSlices,
  // utils (M0)
  identity, shallowEqual, assertNever,
  // M1 additions:
  moveColumn, toggleColumnVisibility, getVisibleColumns,
  nextPage, previousPage, setPageIndex, setPageSize,
  getCanPreviousPage, getCanNextPage, getPageCount, getRowCount,
  noopAnnouncer,
  DEFAULT_STATE,
  // ...re-exported types
}

// @lynellf/tablekit-core/sorting (subpath, tree-shakeable)
{ sortRows, sortDescFirstDefault, ... }

// @lynellf/tablekit-core/filtering (subpath, tree-shakeable)
{ filterRows, ... }

// @lynellf/tablekit-core/pagination (subpath, tree-shakeable)
{ paginateRows, computePageCount, ... }

// @lynellf/tablekit-react
{
  useDataTable,           // M0 (now also mounts ReactAnnouncer)
  ReactAnnouncer,         // M1
  // re-exports from @lynellf/tablekit-core
  ...coreSurface,
}
```

## 7. M1 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **Feature integration tests** | `packages/core/src/integration.test.ts` + `packages/react/src/integration.test.tsx`: combined sort + filter + paginate + ordering + visibility + interaction events on a controlled instance, asserting the rendered DOM has the prescribed ARIA shape and pipeline output is correct |
| **Level 0 API frozen** | `docs/m1-client-features/api-freeze.md` produced in phase 7 — every public export of both packages listed; subsequent milestones may add exports but may not rename/remove/signature-change frozen names |

## 8. Out-of-scope reminder

M1 does **not** ship virtualization, resize, keyboard nav, full announcer polish, DataSource, PivotTable, worker engine, or rowSelection. These are explicit non-goals in [`overview.md` §6](../m1-client-features/overview.md). A reviewer should flag any phase file that includes M2+ work as a scope violation.

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D4** in `overview.md` — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D3 (announcer seam vs. full polish) and D4 (prop getter subset vs. full §6.1).
2. **§5 phase structure** — confirm sequencing is correct and each phase's scope is bounded.
3. **Phase 1 (row pipeline)** — `autoResetPageIndex` interaction with controlled pagination; manual* mode semantics; tree-shakeable subpath exports.
4. **Phase 5 (prop getters)** — consumer-merge semantics; ARIA attribute correctness; `aria-rowcount` in `manualPagination`.
5. **Phase 6 (events + announcer)** — `CellEventContext` payload completeness; `defaultPrevented` skip behavior; announcer singleton in `useDataTable`.
6. **Phase 7 (integration + freeze)** — feature integration test matrix; API freeze manifest format.

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).