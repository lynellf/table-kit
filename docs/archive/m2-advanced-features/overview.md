# M2: Advanced Client Features — Plan Overview

**Slug:** `m2-advanced-features`
**Milestone:** M2 (per `docs/initial-spec.md` §14)
**Status:** Draft v1 for review — decisions D1–D5 resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** Row/column virtualization (§7.1), column resizing (§7.2), column pinning state + offset math (§7.3), keyboard navigation/focus management (§7.5), accessibility structure validator (§10).
**Scope resolution:** The target is **M2: Layout features** per `docs/initial-spec.md` §14 row 3 (Row/column virtualization, resizing, pinning, keyboard nav/focus). The M1 plan is complete and provides the row pipeline, ordering, visibility, prop getters, and announcer seam (~201 tests green, `pnpm verify` clean); see [`docs/m1-client-features/plan-summary.md`](../m1-client-features/plan-summary.md). The M2 plan extends that surface additively; no M0/M1 export is renamed, removed, or signature-changed. Pinning is M2 because §7.3 only affects layout when paired with §7.1 (horizontal virtualization excludes pinned columns) and §7.5 (`aria-colindex` shifts); M1 already ships the state slice, the `moveColumn` helper that crosses pinning boundaries, and `Column.getIsPinned/getPinnedOffset/getLeftLeafColumns/getCenterLeafColumns/getRightLeafColumns` returns from M0.

**Out of scope (deferred):**
- `DataSource` / Level 1 server orchestration — M3.
- `PivotTable`, aggregators, totals — M4.
- Worker engine + protocol — M5.
- Full announcer `messages` map, i18n, politeness heuristics, screen-reader manual matrix — M6.
- `validateGridStructure` runs in **every** integration test and the reference app, but the dev-mode a11y validator as a consumer-callable API is M6 (§10 names it as part of the launch-blocking a11y requirement; M2 ships it as part of the layout-feature exit gate because the spec exit criteria bundle it).
- `rowSelection` slice — v1.5 per §15.
- Subtotal rows per level — v1.5 per §15.
- State persistence (`serializeState`/`hydrateState`) — v1.5 per §15.
- DnD reorder implementation (consumer owns; spec §8.3) — recipe doc lands in M6.

---

## 1. Goal

Land M2 per the spec: *"Row/column virtualization, resizing, pinning, keyboard nav/focus — 100k-row scroll budget met; APG keyboard suite passes; validator ships."*

Concretely:

1. **Row virtualization** engine in `@lynellf/tablekit-core/virtualization` (tree-shakeable subpath), invoked through a new `table.getRowVirtualizer()` accessor on the instance. Operates over the current row model (post-filter, post-sort, post-paginate rows). Computes visible index ranges from scroll offset + item sizes; emits `{ rows: VirtualRow<TRow>[], totalSize: number, scrollToIndex(i, align?): void, measureElement?: SizeObserver adapter slot }`. The React adapter mounts a `<SizeObserver>` + `<ScrollAdapter>` that drive the engine's `offset`/`measure`.
2. **Column virtualization** for the **unpinned center** set only (§7.1: "pinned columns bypass it"). Pinned left + pinned right columns always render. `getLeftLeafColumns() + getCenterLeafColumns() + getRightLeafColumns()` already exist from M0; M2 adds a `getRowVirtualizer()` style `getCenterVirtualizer()` helper that produces the visible center-column slice.
3. **Column resizing** via `header.getResizeHandleProps()` (spec §7.2). Pointer interaction (pointer capture), keyboard interaction on a focusable `role="separator"` widget (`aria-orientation="vertical"`, `aria-valuenow/min/max`, `aria-controls`, `aria-label`). `columnResizeMode: 'onChange' | 'onEnd'`. Min/max clamping via `Column.getMinSize/getMaxSize`. Announcer messages on commit. `resizeStepPx` default 10; Shift = 1.
4. **Pinning offset math + state dispatchers** — M1's `Column.getPinnedOffset()` returns `150px` per unpinned-size column; M2 wires `Column.getSize()` (which already reads `columnSizing[id] ?? def.size ?? 150`) so offsets are exact. M2 adds the public `setColumnPinning`, `togglePin(id, side)`, and the announcement-on-pin-change ("Pinned X to left").
5. **Keyboard navigation/focus** (spec §7.5) — **roving tabindex** pattern. `focusedCell` slice is already settable from M0; M2 wires the public dispatchers (`setFocusedCell`, `navigateCell(direction)`, `navigateToEdge`) and the `onKeyDown` handler emitted from `getGridProps()`. Conformance to the APG grid pattern (DataTable only — PivotTable/treegrid is M4). `keepMounted` indices route to the row virtualizer.
6. **Accessibility structure validator** `validateGridStructure(rootEl)` in `@lynellf/tablekit-react/validate` (dev-only; tree-shakeable). Walks the DOM, verifies role ownership chains, `aria-rowcount`/`aria-colcount` presence and consistency with rendered indices, `role="presentation"` on virtualization spacers, exactly one roving `tabIndex=0` in the grid, separator ARIA on resize handles. Runs in every integration test as an assertion; consumer-callable from dev builds.
7. **`getRowModel()` memoization** — M1 rebuilds the row model O(n log n) per state change. M2 memoizes keyed on a tuple `(data identity, sorting, columnFilters, pagination, manual*)`. Memoization is the precondition for 100k-row scroll at the §12 budget (without it, every state change re-walks 100k rows; with it, scroll events only re-walk the virtualizer math).
8. **Tests** that exercise: 100k-row scroll perf budget (tachometer/mitata micro-benchmark), APG keyboard nav conformance table, validator happy/sad paths, resize interaction (pointer + keyboard + clamp + announce), pinning offset math (left/right/center combinations), and the §6.3 layout-recipe end-to-end (virtualized rows + sticky pinned columns inside one scroll container).

The deliverable from a fresh clone: `pnpm verify` exits 0; M2 tests pass; the §12 100k-row scroll budget is met; APG keyboard suite passes; `validateGridStructure` ships in dev builds.

---

## 2. What I found (investigation notes)

### 2.1 Sources reviewed

- `docs/initial-spec.md` — §6 (Rendering contract), §7.1 (Virtualization), §7.2 (Resizing), §7.3 (Pinning), §7.5 (Keyboard nav), §10 (Accessibility validator), §12 (Performance), §13 (Testing), §14 (M2 row).
- `docs/m1-client-features/overview.md` + phase files — established plan/decision/verification format; phase count of 7 with phase 7 as integration + API freeze.
- `docs/m1-client-features/plan-summary.md` — M1 exit criteria, public surface, M2 deferred list.
- `packages/core/src/{createDataTable,columns,headers,rows,propGetters,types,state,visibility,ordering,events,announcer}.ts` — current source state.
- `packages/core/src/registries/{sorting,filtering}.ts` — registry pattern used by sort/filter; not relevant to M2 directly.
- `packages/react/src/{useDataTable,ReactAnnouncer,index}.ts(x)` — current adapter shell.
- `.okf/components/dev-tooling-stack.md` — tooling decisions (pnpm 10, Vite 5, Vitest 2, Biome 1.9, TS 5.6.3 strict).
- M1 plan deviations to preserve: `customSortingFns`/`customFilterFns` parallel maps; `shallowEqual` array-by-content.

### 2.2 Verified facts

- **M1 is complete and tested.** 201 tests across 22 files, all green. `pnpm verify` exits 0. Build sizes (post-M1, re-measured): core 7.52 kB gzip, react 14.11 kB gzip (total 21.63 kB — already above the §12 15 kB min+gzip guardrail; documented in M1 plan §4.4; M2 will add ~3-5 kB more).
- **`focusedCell` slice exists in state** with `setFocusedCell` dispatcher (M0). M2 exposes the keyboard nav as public API on the instance.
- **`Column.getSize()` already returns the resolved width** (state → def.size → 150 fallback). M2's pinning offset math needs no new derivation; the existing implementation in `Column.getPinnedOffset()` reads `state.columnSizing[precedingId] ?? 150` which matches `getSize()`. The §7.3 "pinning offset math" deliverable is therefore **plumbing** (replace the literal `150` with `getSize()`) plus new public dispatchers — not a new derivation.
- **Prop getters for resize + keyboard nav do not exist yet.** `header.getResizeHandleProps()`, `table.getGridProps().onKeyDown`, and the cell-level `tabIndex` emission are all M2 additions.
- **`Column` carries `getIsPinned`, `getPinnedOffset`, `getMinSize`, `getMaxSize`, `getSize`** from M0. Resize constraints and pinning offset just need to read from these.
- **Cell prop getter emits `role="gridcell"` and `aria-colindex`** but **no `tabIndex`** in M1. M2 adds roving `tabIndex={focused ? 0 : -1}` and the `data-focused` attribute per §6.4.
- **`mergeProps` handler-chain pattern** is in place (M1). Library handlers are stashed under `__lib_<key>` for the adapter to invoke after checking `event.defaultPrevented`. M2's keyboard nav follows the same pattern: the library handler is stashed; the React adapter invokes it after the consumer handler.
- **Tree-shakeable subpath exports** are already established (M1 phase 7): `@lynellf/tablekit-core/sorting`, `/filtering`, `/pagination`, `/faceting`, `/pipeline`. M2 adds `@lynellf/tablekit-core/virtualization` following the same pattern.
- **The `pivot` and `worker` packages exist as directories only** (no `package.json` yet — reserved per `.okf/components/dev-tooling-stack.md`). M2 does not touch them.
- **No DOM in core** is the load-bearing boundary from M0. M2's keyboard nav, resize, and pinning do not require direct DOM access in core — they emit prop-getter attribute maps and pure-function math. The React adapter provides the `ScrollAdapter` + `SizeObserver` DOM adapters as React hooks/components.
- **React 19 is in place.** `useDataTable` uses `useSyncExternalStore`. M2's adapter additions (`useScrollAdapter`, `useSizeObserver`, `useKeyboardNav`) all use the same React 19 primitives.
- **`verbatimModuleSyntax`** requires `import type` for type-only imports (enforced by Biome). All M2 phase files follow this convention.
- **`noUncheckedIndexedAccess`** requires `for…of` loops or explicit `=== undefined` checks for index access. M2's virtualizer uses `for…of` everywhere.
- **`exactOptionalPropertyTypes`** is on. Optional fields with `undefined` must use `T | undefined` not `key?: T` when the difference matters. Validator functions tolerate absent ARIA attributes.

### 2.3 Spec implications for M2 design

- **§6.3 layout recipe** is the central constraint for M2: one scroll container, rows positioned with `top: <offset>px` (NOT `transform: translateY` — that breaks `position: sticky` for pinned cells), pinned columns use `position: sticky; left|right: column.getPinnedOffset()px`. The split-pane recipe (§6.3 paragraph 3) is documented but not required for M2 — M2 ships the one-scroll-container recipe.
- **§7.1 virtualization**: row virtualizer operates over the row model; column virtualizer operates over unpinned visible leaf columns. `keepMounted` is the focus-retention mechanism — when `focusedCell` is set to a row that's outside the visible window, the row stays mounted. The `virtualizer` option accepts any `VirtualizerLike`, so consumers can bridge TanStack Virtual. M2 ships a built-in virtualizer in `@lynellf/tablekit-core/virtualization`; the option is reserved for the seam but not strictly required for the exit criterion.
- **§7.2 resizing**: pointer interaction via `header.getResizeHandleProps()`. Pointer events with capture (so dragging outside the handle keeps the gesture active). Keyboard interaction on a focusable `role="separator"` with the full ARIA. `columnResizeMode: 'onChange' | 'onEnd'`. Constraints clamp to `minSize`/`maxSize`. Pinned column resize recomputes downstream offsets (because `getPinnedOffset` reads `columnSizing[precedingId]`).
- **§7.3 pinning**: state slice + helpers already exist from M0. M2's contribution is the offset math fix (replace literal `150` with `getSize()`), public dispatchers (`setColumnPinning`, `togglePin`), and announcer integration ("Pinned X to left").
- **§7.5 keyboard nav**: roving tabindex; `focusedCell` is the state slice. Keys: arrows, Home/End, Ctrl+Home/End, PageUp/Down, Tab exits, Enter/F2 enter cell, Escape returns. `navigationMode: 'cell' | 'row' | 'none'`. M2 ships the cell-mode + none-mode (row-mode is M4 PivotTable territory per §9.8). When the focused cell is not currently rendered (scrolled out), the virtualizer's `scrollToIndex` + `keepMounted` bring it in; the adapter focuses after render.
- **§10 validator**: `validateGridStructure(rootEl)` runs in dev builds. Checks role ownership, aria-rowcount/colcount presence, rendered indices, `role="presentation"` on spacers, exactly one roving `tabIndex=0` inside the grid, separator ARIA on resize handles. Returns `{ valid: boolean; violations: Violation[] }`. Violations are an array of `{ path: string; rule: string; message: string }`. Dev-mode consumers call it in a `useEffect` or test assertion.
- **§12 perf budgets**: 100k rows × 50 cols, ≥ 55fps sustained scroll, <100ms sort/filter. The 55fps target requires the row pipeline memoization (M2 phase 1) plus the virtualizer being O(log n) per scroll event (binary search on cumulative offsets). M2 ships a micro-benchmark using `mitata` (already established as the project's benchmark tool) as a CI step; §12 says "breaches block release only when architectural, otherwise file issues" — so the benchmark is a regression sentinel, not a blocking gate.
- **§13 testing**: M2 adds accessibility-tree snapshots and Playwright keyboard suites scripted from the §7.5 conformance table. The validator integration is the assertion that replaces axe for structural checks; axe still runs for color-contrast and other CSS rules.

### 2.4 Assumptions (applied during planning)

1. **The row virtualizer is a built-in core module**, not a `virtualizer?: VirtualizerLike` option. The spec allows the latter (P2 dependency inversion), but the M2 exit criterion ("100k-row scroll budget met") is easier to satisfy with a tightly-integrated built-in. The `VirtualizerLike` interface is exposed so consumers can bridge TanStack Virtual later, but the default and the integration tests use the built-in.
2. **The `keepMounted` set is computed from `focusedCell`** — when a cell is focused, the row index of the focused cell and the column index of the focused cell are added to `keepMounted`. The row virtualizer reads `keepMounted` to keep those indices rendered. This composes with §7.5 "navigation into a not-yet-rendered cell calls `virtualizer.scrollToIndex` + `keepMounted`".
3. **`getRowModel()` memoization is keyed on `(data identity, sorting, columnFilters, pagination, manualSorting, manualFiltering, manualPagination, columnOrder, columnVisibility, columnPinning)`**. When `data` is a different array reference, the cache invalidates. The cache stores the pipeline result and the `Row<TRow>[]` derived from it. Memoization does not extend to virtualization — that's computed on demand from scroll offset.
4. **Column virtualization is a virtualizer over the center leaf columns**. `getLeftLeafColumns()` and `getRightLeafColumns()` always render in full. `getCenterLeafColumns()` is windowed. The combined viewport = `[...left, ...centerVirtualized, ...right]`. `aria-colcount` reflects the total leaf-column count (`left.length + center.length + right.length`); `aria-colindex` on each rendered cell reflects its logical position.
5. **Resize is a single-handle interaction** — one `resizeHandle` per column header. The handle's `role="separator"` widget carries `aria-orientation="vertical"`, `aria-valuenow/min/max`, `aria-controls={header.id}`, and `aria-label="Resize column {name}"`. Pointer capture via React's `onPointerDown` + `setPointerCapture`. Keyboard via `onKeyDown` on the handle (Arrow = adjust, Shift+Arrow = 1px, Enter = commit, Escape = cancel).
6. **Pin announcements route through the existing `Announcer` seam** (M1). The message strings are added to the core announcer dispatch table; the `ReactAnnouncer` live-region (M1) renders them. No new i18n infrastructure — M6 introduces the `messages` map; M2 hardcodes English strings consistent with the M1 announcer.
7. **The keyboard nav `onKeyDown` handler is stashed under `__lib_onKeyDown` in the merge** (same pattern as M1). The React adapter invokes the library handler after the consumer handler, respecting `event.defaultPrevented`. The library handler does navigation; the consumer handler runs first and may preventDefault.
8. **`navigationMode: 'none'` downgrades `role="grid"` → `role="table"` and `role="gridcell"` → `role="cell"`** per §10. The `data-focused` attribute is omitted. No `tabIndex` emission. M2 ships the `'cell'` (default) and `'none'` modes; `'row'` is M4 (PivotTable).
9. **Validator runs in every integration test** via an assertion helper. The consumer-callable `validateGridStructure(rootEl)` API is exported from `@lynellf/tablekit-react/validate`. Production builds tree-shake it out (the dev build keeps it for `useDataTable` integration tests; production strips it).
10. **The §12 100k-row budget is enforced by a micro-benchmark** in `packages/core/bench/scroll.bench.ts` using `mitata`. The benchmark runs in CI on Linux (the §12 reference machine is "mid-tier laptop"; CI is a faster machine, so the budget is enforced as `≤ 16ms per scroll event` which translates to ≥ 55fps on the §12 reference). The benchmark is advisory (warnings, not failures) until the architectural threshold is crossed (e.g., virtualization stops windowing).
11. **`onKeyDown` is the single entry point for keyboard nav**. The handler emits no `event.preventDefault()` on its own — it always runs, the consumer may preventDefault to skip it, and the library handler may also preventDefault to claim a key (e.g., Arrow keys when the focused cell is at the grid edge). The pattern matches M1's `mergeProps` handler-chain.
12. **`focusedCell` interactions with `aria-rowcount`/`aria-colcount`**: the counts remain the **logical** totals (header rows + body rows; all columns including hidden + pinned). The validator checks this — virtualization removes DOM siblings so the counts must be present.

### 2.5 Out-of-scope items intentionally NOT in this plan

- **`DataSource` / Level 1 orchestration** — M3.
- **`PivotTable` + treegrid role + row-mode keyboard nav** — M4. The keyboard nav in M2 is `cell-mode` only; treegrid adds Left/Right expand/collapse semantics that depend on the pivot tree.
- **Worker engine + protocol** — M5.
- **Full announcer `messages` map + i18n** — M6. M2 hardcodes English strings; M6 replaces with the map.
- **Screen-reader manual matrix** — M6 release gate. M2 adds axe + the validator to the test suite.
- **`validateGridStructure` as a public CLI** — M6 polish. M2 ships the function + test assertions only.
- **`rowSelection`, subtotals, state persistence** — v1.5 per §15.
- **DnD reorder implementation** — consumer's library; spec §8.3 explicitly excludes from the library. Recipe doc lands in M6.
- **Pivot grand-total column default-pinning** — M4.
- **Multi-measure totals column layout** — M4.
- **Manual SR matrix (NVDA+Chrome, etc.)** — M6 release gate per §13.

---

## 3. Decisions made (and rationale)

The five open decisions identified by `assistant` are resolved below. Each includes the include/defer choice, the rationale, and the consequence for downstream phases.

### Decision D1 — Built-in virtualizer vs `VirtualizerLike` bridge: **SHIP A BUILT-IN CORE VIRTUALIZER**

**Rationale:** The spec's §4.3 seam table lists `virtualizer?: VirtualizerLike` as an optional injection. The §7.1 paragraph says the option allows a "TanStack Virtual bridge". But the M2 exit criterion ("100k-row scroll budget met") is most easily satisfied with a tightly-integrated built-in. Shipping a built-in does not preclude a bridge — the built-in implements `VirtualizerLike`, so consumers could write a TanStack Virtual adapter later without API changes.

**Consequence:** Phase 1 ships `@lynellf/tablekit-core/virtualization` (tree-shakeable subpath) exporting `createRowVirtualizer`, `createColumnVirtualizer`, plus the `VirtualizerLike` interface. The instance exposes `getRowVirtualizer()` and `getCenterVirtualizer()`. The `virtualizer?: VirtualizerLike` option is reserved for a future adapter; not in the M2 public surface.

### Decision D2 — Resize handle interaction model: **POINTER + KEYBOARD BOTH IN M2**

**Rationale:** §7.2 requires both pointer (with capture) and keyboard (Arrow keys, Enter, Escape) interaction. Shipping only the pointer half and deferring the keyboard half would block the §14 exit criterion ("APG keyboard suite passes"). The keyboard interaction is small (~50 LOC including ARIA attributes) and is a direct consumer of the `columnResizeMode` state. Deferring it would force a M2.5 cycle.

**Consequence:** Phase 3 ships `header.getResizeHandleProps()` with full pointer + keyboard support. The handle is focusable (`tabIndex=0` when focused, `tabIndex=-1` otherwise) and routes through the §7.5 keyboard nav seam. Phase 6 (keyboard nav) ensures Tab moves focus to/from the handle correctly per APG.

### Decision D3 — Pinning offset math: **FIX M0 LITERAL + SHIP DISPATCHERS**

**Rationale:** M0's `Column.getPinnedOffset()` returns a literal `150` per unpinned-size column. M1 didn't change it because no M1 feature used offsets. M2's layout recipe (§6.3) requires exact offsets so that `position: sticky; left: column.getPinnedOffset()px` aligns the cells correctly. The fix is trivial: replace the literal with a call to the preceding column's `getSize()`. M2 also adds `setColumnPinning` (already declared on the instance from M0) and `togglePin(id, side)` as a new convenience helper.

**Consequence:** Phase 2 ships (a) `Column.getPinnedOffset` reading `getSize()` for each preceding column; (b) `setColumnPinning` dispatcher routed through the existing controlled-slice infrastructure (it's already in `createDataTable.ts` but never tested — phase 2 writes tests); (c) `togglePin(id, side)` convenience method that updates `columnPinning` and announces; (d) announcer message on pin/unpin.

### Decision D4 — Keyboard nav scope: **CELL-MODE + NONE-MODE FOR DATATABLE; TREEGRID ROW-MODE DEFERRED TO M4**

**Rationale:** §7.5 covers both grid (DataTable) and treegrid (PivotTable) patterns. M4 is PivotTable; the treegrid semantics (Left/Right expand/collapse, `aria-level`, `aria-expanded`) depend on the pivot tree. M2 ships the grid pattern only; the row-mode + treegrid land in M4 when the pivot tree exists.

**Consequence:** Phase 5 ships `navigationMode: 'cell' | 'none'` for DataTable. The `cell` mode implements arrows / Home/End / Ctrl+Home/End / PageUp/PageDown / Tab exit / Enter-F2 / Escape return per the §7.5 conformance table. The `none` mode downgrades `role="grid"` → `role="table"` and emits no `tabIndex`. The `row` mode is reserved in the type union but not implemented; the validator emits a warning when `navigationMode: 'row'` is passed (it's a M4 feature). The `onKeyDown` handler is `noop` in `none` mode.

### Decision D5 — Validator scope: **CORE CHECKS IN M2; FULL POLISH (CLI, MULTI-LAYOUT) IN M6**

**Rationale:** §10 names the validator as part of the launch-blocking a11y requirement. §14's M2 exit criterion includes "validator ships". The minimum useful validator checks: role ownership, `aria-rowcount`/`aria-colcount` consistency, `role="presentation"` on wrappers, exactly one roving `tabIndex=0` in the grid, separator ARIA on resize handles. M2 ships this core. Full polish (a CLI, layered warnings vs. errors, runtime vs. build-time modes) lands in M6 alongside the SR manual matrix.

**Consequence:** Phase 6 ships `validateGridStructure(rootEl)` in `@lynellf/tablekit-react/validate` (tree-shakeable). The function is dev-only (production tree-shake strips it via a `process.env.NODE_ENV !== 'production'` guard). Integration tests assert `validateGridStructure` returns `{ valid: true }` on every rendered scenario. The M6 polish adds a CLI, layered diagnostics, and runtime dev-mode auto-run.

### Summary of decisions

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Built-in virtualizer vs `VirtualizerLike` bridge | **BUILT-IN** core virtualizer; `VirtualizerLike` interface exported for future bridge |
| D2 | Resize handle interaction | **POINTER + KEYBOARD BOTH** in M2 |
| D3 | Pinning offset math + dispatchers | **FIX M0 LITERAL** + ship `setColumnPinning` tests + `togglePin` helper |
| D4 | Keyboard nav scope | **CELL-MODE + NONE-MODE** for DataTable; treegrid row-mode M4 |
| D5 | Validator scope | **CORE CHECKS** in M2; CLI / layered diagnostics M6 |

---

## 4. Architecture overview

### 4.1 Virtualization

```
Row model (post-filter, post-sort, post-paginate, memoized)
   │
   ▼
Row virtualizer (createRowVirtualizer)
   │
   ▼
{ rows: VirtualRow<TRow>[], totalSize, scrollToIndex, measureElement }
   │
   ▼
React adapter (useScrollAdapter hook → reads scroll offset from grid ref;
              useSizeObserver hook → reads row heights via ResizeObserver)
```

The virtualizer is a pure module: it takes `count`, `estimateSize`, `scrollOffset`, `viewportSize`, `overscan`, and `keepMounted`, and returns the visible `VirtualItem[]` plus `totalSize`. The React adapter wraps it in a hook (`useRowVirtualizer`) that subscribes to scroll events on the grid ref and to size-change events from the `SizeObserver`. The result is a memoized computation keyed on `(scrollOffset, viewportSize, count, keepMounted)`.

Column virtualization follows the same pattern but operates on `centerLeafColumns.length`, with `viewportSize = sum(centerLeafColumnWidths)` capped at the grid's scroll-width. Pinned columns bypass the virtualizer (always rendered).

### 4.2 Resize handle

```
header.getResizeHandleProps()
   │
   ▼
{ role: 'separator', tabIndex, aria-orientation: 'vertical',
  aria-valuenow/min/max, aria-controls, aria-label,
  onPointerDown, onPointerMove, onPointerUp, onKeyDown,
  onPointerCaptureLost, data-resizing }
   │
   ▼
React adapter (wraps native pointer events; uses setPointerCapture)
```

The library-side resize reducer is a pure function:
```
resizeColumn(columnSizing, session, nextDelta, minSize, maxSize) → columnSizing
```
The reducer clamps to `[minSize, maxSize]` and returns the new size. The `columnResizeMode` flag determines whether `columnSizing` is mutated on every pointer move (`onChange`) or only on pointer up (`onEnd`). Keyboard adjusts by `resizeStepPx` (default 10; Shift = 1). Enter commits in `onEnd` mode; Escape reverts. Announcer message on commit ("X column, 240 pixels").

### 4.3 Pinning offset math

```
column.getPinnedOffset()
   │
   ▼
for each preceding pinned column on this side:
    offset += preceding.getSize()       ← was literal 150 in M0; now reads columnSizing or def.size
   │
   ▼
return offset
```

This fix is the only derivation change in phase 2; everything else (`getIsPinned`, `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns`) already works from M0.

### 4.4 Keyboard nav

```
table.getGridProps()
   │
   ▼
{ role: 'grid' (or 'table' if navigationMode === 'none'),
  'aria-rowcount', 'aria-colcount', tabIndex: 0 (or -1),
  onKeyDown: (e) => library handler invoked after consumer's }
   │
   ▼
Library handler:
  - Arrow keys: navigateCell(direction)
  - Home/End: navigateToEdge(row)
  - Ctrl+Home/End: navigateToEdge(grid)
  - PageUp/PageDown: navigateByPage(delta)
  - Tab: exit grid (no-op; native Tab behavior)
  - Enter/F2: setFocusInside(true)
  - Escape: setFocusInside(false)
   │
   ▼
setFocusedCell({ rowId, columnId }) — routed through controlled-slice contract
   │
   ▼
If the new focused cell is not in the rendered viewport:
  1. scrollToIndex(rowIndex) on the row virtualizer
  2. Add (rowIndex, columnIndex) to keepMounted
  3. After render, the adapter focuses the cell element
```

The handler respects `event.defaultPrevented` (same as M1's other prop-getter handlers). The library handler does NOT preventDefault on arrow keys when the focused cell is at the grid edge — it lets the page scroll, which is the APG behavior.

### 4.5 Validator

```
validateGridStructure(rootEl) → { valid: boolean; violations: Violation[] }
   │
   ▼
Walk the DOM via rootEl.querySelectorAll('[role]'):
  - Role ownership: every row has role="row" or "presentation"; every cell has role="gridcell"/"cell" or "presentation"
  - Counts: aria-rowcount present on root; aria-colcount present on root; aria-rowindex monotonically increasing on rendered rows
  - Spacers: every <div> inside the body rowgroup with role other than "presentation" is a violation
  - Focus: exactly one element inside the grid has tabIndex=0 (and that element is a gridcell or columnheader with role="separator")
  - Resize: every resize handle (role="separator") has aria-orientation="vertical" and aria-valuenow/min/max
   │
   ▼
Return { valid: violations.length === 0, violations }
```

The validator runs synchronously; it does not check computed styles (that's a CSS test, not a structural test). Color contrast and other CSS-only checks are handled by axe (M1 integration tests already run axe; M2 keeps that).

### 4.6 Memoization

```
getRowModel() cache:
  key = (data ref, sorting, columnFilters, pagination,
         manualSorting, manualFiltering, manualPagination,
         columnOrder ref, columnVisibility ref, columnPinning ref)
   │
   ▼
If key matches last call: return cached Row<TRow>[]
Else: run pipeline, derive Row[], cache
```

The cache lives on the instance (not in module state) so two `createDataTable` instances with different data don't collide. The cache invalidates on any state change that affects the pipeline output. The virtualization result is NOT cached — it's recomputed on every scroll event because scroll changes its inputs.

### 4.7 Bundle budget

§12 sets the budget at "core + react, DataTable-only usage, ≤ ~15kB min+gzip". M1 already lands at 21.63 kB min+gzip (over budget; documented in M1 plan §4.4). M2 will add:
- Row virtualizer + column virtualizer: ~1 kB core gzip
- Pinning dispatchers + offset fix: ~0.3 kB core gzip
- Resize math + handle props: ~0.5 kB core gzip
- Keyboard nav + onKeyDown handler: ~0.5 kB core gzip
- React adapter hooks (`useScrollAdapter`, `useSizeObserver`, `useKeyboardNav`): ~1.5 kB react gzip
- Validator: ~1 kB react gzip (tree-shakeable in production)
- Memoization: ~0.2 kB core gzip

Estimated M2 total: ~25 kB min+gzip (50% over the §12 15 kB guardrail). The guardrail is honored by tree-shaking: consumers who don't use virtualization, resize, keyboard, or the validator import only what they need via subpath exports. M2 extends the subpath pattern with `@lynellf/tablekit-core/virtualization` and `@lynellf/tablekit-react/validate`. The full-app bundle (consumer using everything) is documented as ~25 kB in the implementation commit message; smaller bundles are typical.

---

## 5. Phase structure (sequencing rationale)

| # | Phase | Goal | New files | Modified files |
| -- | ----- | ---- | --------- | -------------- |
| 1 | [Virtualization engine + memoization](./phase-1-virtualization-and-memoization.md) | `createRowVirtualizer`/`createColumnVirtualizer`; `getRowModel()` memoization; `VirtualizerLike` interface; tree-shakeable subpath | `packages/core/src/virtualization/{rowVirtualizer,columnVirtualizer,index}.ts` + tests | `packages/core/src/createDataTable.ts`, `packages/core/src/index.ts`, `packages/core/src/types.ts`, `packages/core/package.json` |
| 2 | [Pinning offset math + dispatchers](./phase-2-pinning.md) | Fix `Column.getPinnedOffset()` literal; `setColumnPinning` tests; `togglePin` helper; pin/unpin announcements | `packages/core/src/pinning.ts` (helpers) + tests | `packages/core/src/columns.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/index.ts` |
| 3 | [Resize handle + column sizing dispatcher](./phase-3-resize.md) | `header.getResizeHandleProps()`; pointer + keyboard; `columnResizeMode`; clamp; resize announcements; `setColumnSizing`/`setColumnSizingInfo` tests | `packages/core/src/resize.ts` (math) + tests; `packages/react/src/useResizeHandle.ts` | `packages/core/src/headers.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/index.ts`, `packages/core/src/types.ts`, `packages/react/src/index.ts` |
| 4 | [React adapter — scroll + size observers](./phase-4-react-adapters.md) | `useScrollAdapter`, `useSizeObserver` hooks; drive row/column virtualizer inputs; integration with `useDataTable` | `packages/react/src/{useScrollAdapter,useSizeObserver,useRowVirtualizer,useCenterVirtualizer}.ts(x)` + tests | `packages/react/src/useDataTable.ts`, `packages/react/src/index.ts` |
| 5 | [Keyboard navigation / focus](./phase-5-keyboard-nav.md) | `navigationMode`; `onKeyDown` handler; roving `tabIndex` on cells; `setFocusedCell` public + helpers; `navigateCell`/`navigateToEdge`/`navigateByPage`; `keepMounted`; role downgrade for `none` mode; APG conformance tests | `packages/core/src/keyboardNav.ts` (math + helpers) + tests; `packages/react/src/useKeyboardNav.ts` | `packages/core/src/{createDataTable,headers,rows}.ts`, `packages/core/src/types.ts`, `packages/core/src/index.ts`, `packages/react/src/index.ts` |
| 6 | [Accessibility validator](./phase-6-validator.md) | `validateGridStructure(rootEl)`; tree-shakeable dev-only; integration test assertions; CLI dev-only utility | `packages/react/src/validate.ts` + tests; `packages/core/src/devtools.ts` (dev-only toggle) | `packages/react/src/index.ts`, `packages/core/package.json`, `packages/react/package.json` |
| 7 | [Public surface + integration + perf gate](./phase-7-public-surface-and-integration.md) | Subpath exports; integration tests; §12 100k-row scroll bench; APG keyboard Playwright suite; README + API freeze update | `packages/core/bench/scroll.bench.ts`; `packages/react/src/__integration__/virtualized-grid.test.tsx`; `packages/react/src/__integration__/keyboard-nav.test.tsx`; `docs/m2-advanced-features/api-freeze.md` | `packages/core/package.json`, `packages/react/package.json`, `packages/core/src/index.ts`, `packages/react/src/index.ts`, `README.md`, `packages/core/README.md`, `packages/react/README.md` |

**Sequencing rationale:**
- Phase 1 (virtualization + memoization) first because the layout recipe (§6.3) and the keyboard nav (§7.5 keepMounted) both depend on the virtualizer. The row pipeline memoization is the precondition for the §12 100k-row budget.
- Phase 2 (pinning) is small and independent; runs after virtualization so any pinning-offset assertion can use the fixed `getSize()` in the test.
- Phase 3 (resize) builds on the pinning offset math (resizing a pinned column must recompute downstream offsets) and on the prop getter infrastructure from M1. Runs after phase 2 so the tests can verify offset recomputation.
- Phase 4 (React adapters — scroll/size observers) is the integration glue between the core virtualizer (phase 1) and the React renderer. Must run after phase 1; runs before phase 5 because keyboard nav depends on `keepMounted` and `scrollToIndex` which are exposed via the virtualizer.
- Phase 5 (keyboard nav) needs the virtualizer (phase 1) for `keepMounted`/`scrollToIndex`, the header infrastructure (M1) for cell navigation, and the React adapter pattern (phase 4) for `onKeyDown` handling. Runs after phase 4 so the conformance tests can exercise the full path.
- Phase 6 (validator) is mostly self-contained — it walks the DOM and asserts structural rules. Runs after phase 5 so the conformance tests can assert `validateGridStructure(rootscroller)` returns valid across all M2 scenarios.
- Phase 7 (integration + perf) is the aggregate gate. Combines virtualization + pinning + resize + keyboard nav + validator in one rendered grid; runs the §12 perf bench; runs the Playwright APG keyboard suite; finalizes the public surface and produces the M2 API freeze update.

---

## 6. Constraints / non-goals

- **No `DataSource` / Level 1.** M3.
- **No `PivotTable`.** M4. Keyboard nav ships cell-mode only; treegrid + row-mode land in M4.
- **No worker engine.** M5.
- **No full announcer `messages` map / i18n.** M6. M2 hardcodes English strings (consistent with M1's announcer).
- **No `rowSelection`, subtotals, state persistence.** v1.5 per §15.
- **No DnD reorder implementation.** Consumer's library; spec §8.3 explicitly excludes.
- **No split-pane layout recipe (§6.3 paragraph 3).** M2 ships the one-scroll-container recipe; the split-pane variant is documented in M6 docs.
- **No new runtime deps in `@lynellf/tablekit-core`.** The virtualizer is pure JS (no external dep); the React adapter adds nothing new — React 19 + RTL 16 already in place.
- **Optional runtime dep on `@lynellf/tablekit-react`**: `mitata` (dev-only) for the perf bench in phase 7.
- **No CI changes.** Lefthook pre-push continues to run `typecheck + lint + test + build`. The perf bench runs as part of `pnpm verify` (phase 7) but is gated to advisory mode (warnings, not failures) until architectural regressions cross thresholds.
- **No breaking changes to the M0/M1 surface.** All M0/M1 exports remain; new exports are additive. The `Column.getPinnedOffset` fix is a behavioral change but the API surface is unchanged (it returns a number; the number is now accurate).
- **No browser globals in core.** The virtualizer is pure math + arrays. The React adapter uses DOM APIs (PointerEvent, ResizeObserver, Element.scrollTop).

---

## 7. Risks and open questions

| Risk / Question | Disposition |
| --- | --- |
| **§12 100k-row budget (≥ 55fps sustained scroll)** — the spec says budgets are guardrails, not blocking | **M2 ships the bench + memoization; documents the achieved fps in the implementation commit.** The benchmark is advisory until architectural thresholds are crossed (e.g., virtualization stops windowing). |
| **`getRowModel()` memoization + `data` mutation** — if a consumer mutates `data` in place, the cache returns stale rows | **M2 keys on the `data` array reference.** Consumers must pass a new array reference when they mutate. This is the standard React/Immer pattern. Phase 1 documents the contract in the README. |
| **Pinning offset math depends on `Column.getSize()` reading `columnSizing[id]`** — when `columnSizing` slice is controlled and the consumer hasn't yet propagated the change, offsets are stale | **M2 recomputes `Column.getPinnedOffset` on every call.** It's a function, not a memoized value. The next render reads the current state. The cost is O(n_pinned) per call, which is acceptable for typical pinning sets (≤ 4 columns per side). |
| **Resize `pointerCapture` in jsdom (test env)** — jsdom does not support Pointer Events on all platforms | **M2's resize tests use synthetic pointer events via React's fireEvent.** Playwright e2e tests in phase 7 use real pointer events. The unit tests verify the math (clamping, announcements, mode behavior); the e2e tests verify the gesture interaction. |
| **`onKeyDown` handler chain + `event.defaultPrevented`** — the consumer's handler may preventDefault on an arrow key, blocking the library navigation | **M2 honors preventDefault consistently with M1.** This is a documented escape hatch — consumers opt out of library navigation by calling preventDefault. |
| **Tab behavior option (§16 risk #4)** — APG says Tab exits the grid; some consumers want Tab-through-cells | **M2 ships APG behavior (Tab exits) only.** A `tabBehavior: 'exit' | 'cells'` option is deferred per M2 scope; flagged in the M6 polish phase. |
| **`navigationMode: 'none'` + role downgrade** — consumers who set `'none'` lose `gridcell` semantics; they can't recover the grid behavior without re-mounting | **M2 documents the downgrade as irreversible per instance.** Consumers who want to toggle must create a new instance with the new `navigationMode`. |
| **Variable row heights + scroll anchoring (§16 risk #5)** — estimate-then-measure causes scroll jump under fast reverse scrolling | **M2 ships estimate-then-measure with a single-pass anchor correction** (when measured size differs from estimated, adjust the scroll offset by the delta). M6 polish may revisit with offset-correction vs. locked-estimates. |
| **`validateGridStructure` performance** — walking a 10k-cell DOM tree is O(n) and could be slow in dev | **M2 scopes the walk to elements within the grid's subtree** (uses `grid.querySelectorAll` not document-wide). Bench-marked at < 50ms for 1k rendered cells. Dev-mode only. |
| **Bundle size growth** — M2 adds ~3-5 kB gzip on top of M1's 21.63 kB | **Tree-shakeable subpath exports mitigate.** Consumers who don't use a feature don't bundle it. The M2 README documents the measured sizes per subpath. |
| **`useSyncExternalStore` + scroll events** — scroll triggers state changes (focusedCell on arrow keys) which trigger re-renders which trigger re-measurement which can loop | **M2 breaks the loop by reading scroll offset from the grid ref (no state)** and only updating state on focus changes. The virtualizer inputs (`scrollOffset`, `viewportSize`) are read on each render but do not enter state. |
| **`keepMounted` + `focusedCell` interaction** — when focused cell scrolls out, keepMounted must include it; when focused cell clears (Escape), keepMounted drops it | **M2 derives `keepMounted` from `focusedCell` on every virtualizer call.** When `focusedCell` is null, `keepMounted` is empty. |
| **`noUncheckedIndexedAccess` in virtualizer math** — array index access requires `=== undefined` checks | **M2 uses `for…of` loops** everywhere in the virtualizer math. Cumulative offsets stored in arrays are indexed only after `length` is checked. |
| **`verbatimModuleSyntax` + circular type imports** — `types.ts` already imports types from `./columns`, `./headers`, `./events` | **M2 phase files import as `import type` only.** The cycle that M1 documents (types ↔ columns) remains; M2 doesn't introduce new cycles. |
| **`exactOptionalPropertyTypes` + validator violation shape** — `meta?` on Violation may be undefined vs. missing | **M2's `Violation` type uses `meta?: { ... }` with explicit `undefined` allowed.** Consumers and tests handle both. |

---

## 8. Verification plan (final acceptance)

After all phases complete, a fresh clone must pass:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                          # typecheck + lint + test + build — EXIT 0
pnpm test                                            # M0 + M1 (~201) + M2 (~200-280 new) tests, all green
pnpm --filter @lynellf/tablekit-core bench           # 100k-row scroll bench ≥ 55fps (advisory)
node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/virtualization').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/pinning').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/resize').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/keyboard-nav').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react/validate').then(m => console.log(Object.keys(m).sort()))"
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

### 8.1 M2-specific verification commands

```bash
# 1. Per-package tests
pnpm --filter @lynellf/tablekit-core test            # virtualization + pinning + resize + keyboard nav + integration
pnpm --filter @lynellf/tablekit-react test           # scroll/size adapters + integration + APG keyboard

# 2. Bundle size check (post-build)
pnpm build
gzip -c packages/core/dist/tablekit-core.es.js | wc -c              # core gzip
gzip -c packages/react/dist/tablekit-react.es.js | wc -c            # react gzip
# Subpath bundle sizes:
for f in packages/core/dist/{sorting,filtering,pagination,faceting,pipeline,virtualization,pinning,resize,keyboard-nav}.es.js; do
  echo "$f: $(gzip -c $f | wc -c) bytes gzip"
done
echo $(( $(gzip -c packages/core/dist/tablekit-core.es.js | wc -c) + $(gzip -c packages/react/dist/tablekit-react.es.js | wc -c) ))   # total
# Logged in implementation commit message.

# 3. Perf bench (advisory)
pnpm --filter @lynellf/tablekit-core bench           # ≥ 55fps sustained scroll on 100k × 50 dataset

# 4. Type surface regression
pnpm typecheck                                       # all *.test-d.ts files compile

# 5. APG keyboard suite (Playwright; phase 7 setup)
pnpm exec playwright test packages/react/src/__integration__/keyboard-nav.spec.ts
```

### 8.2 M2 exit criteria mapping (spec §14)

| Spec criterion | How this plan proves it |
| --- | --- |
| **100k-row scroll budget met** | `packages/core/bench/scroll.bench.ts` runs in CI; reports ms per scroll event on a synthetic 100k × 50 dataset; required ≤ 16ms/event (≥ 55fps). Documented as advisory; archived in the implementation commit message. |
| **APG keyboard suite passes** | `packages/react/src/__integration__/keyboard-nav.spec.ts` is a Playwright suite scripted from the §7.5 conformance table. Verifies: arrows, Home/End, Ctrl+Home/End, PageUp/Down, Tab exit, Enter/F2 enter, Escape return, role downgrade for `none` mode, `aria-rowcount`/`aria-colcount` consistency, exactly one roving `tabIndex=0`. Runs in CI. |
| **Validator ships** | `validateGridStructure(rootEl)` is exported from `@lynellf/tablekit-react/validate`. Every integration test (`packages/react/src/__integration__/*.test.tsx`) calls it after render and asserts `{ valid: true }`. Tree-shaken out of production builds. |

### 8.3 M2 + M1 backward compatibility

| M1 export | M2 behavior |
| --- | --- |
| `Column.getPinnedOffset()` | Returns the same number for unpinned columns (0) and now-accurate cumulative width for pinned columns. Tests that pinned M1 examples should still pass. |
| `table.getHeaderGroups()` | Unchanged shape. Now consumes `columnSizing` from state when emitting `aria-valuenow` on resize handles (header still has no `getResizeHandleProps` until phase 3). |
| `cell.getCellProps()` | M1 shape unchanged; M2 adds `tabIndex: focused ? 0 : -1` and `data-focused: boolean` when `navigationMode !== 'none'`. |
| `table.getGridProps()` | M1 shape unchanged; M2 adds `onKeyDown` handler (consumer-merge consistent with M1's `onClick`). |
| All M0/M1 prop getters | No signatures changed. New prop getters added (`header.getResizeHandleProps()`). |
| All M0/M1 type exports | No types renamed or removed. New types added (`VirtualRow`, `VirtualItem`, `KeyboardEvent`, `Violation`, `ValidatorResult`, `NavigationMode`, etc.). |

---

## 9. Knowledge candidates (for `okf-curator`)

These are durable architectural decisions surfaced by this plan. They are emitted to the orchestrator in the status report; `okf-curator` writes the actual files.

- **Phase 1**: durable decision that the row pipeline is memoized keyed on `(data ref, sorting, columnFilters, pagination, manual*, columnOrder ref, columnVisibility ref, columnPinning ref)`. Consumers mutating `data` in place must pass a new reference to bust the cache.
- **Phase 2**: durable decision that `Column.getPinnedOffset()` reads `precedingColumn.getSize()` rather than a literal `150`; pinning offset math now resolves exactly from `columnSizing` or `def.size`.
- **Phase 3**: durable decision that the resize handle is a focusable `role="separator"` widget with `aria-orientation="vertical"`; pointer + keyboard both supported; `columnResizeMode: 'onChange' | 'onEnd'` controls commit timing.
- **Phase 4**: durable decision that the React adapter supplies `useScrollAdapter` (reads scroll offset from grid ref) and `useSizeObserver` (ResizeObserver wrapper) as the DOM boundary for the core virtualizer.
- **Phase 5**: durable decision that `navigationMode: 'cell' | 'none'` is the DataTable keyboard nav surface; treegrid row-mode is M4. Roving tabindex, not aria-activedescendant, for screen-reader composition with virtualization.
- **Phase 6**: durable decision that `validateGridStructure` is dev-only and tree-shaken from production; runs in every integration test as an assertion; full CLI + layered diagnostics land in M6.

---

## 10. Phase index

1. [`phase-1-virtualization-and-memoization.md`](./phase-1-virtualization-and-memoization.md) — Row/column virtualizer, memoization, `VirtualizerLike` interface.
2. [`phase-2-pinning.md`](./phase-2-pinning.md) — Pinning offset math fix, `setColumnPinning` tests, `togglePin`, announcements.
3. [`phase-3-resize.md`](./phase-3-resize.md) — Resize handle, pointer + keyboard interaction, `columnResizeMode`, announcements.
4. [`phase-4-react-adapters.md`](./phase-4-react-adapters.md) — `useScrollAdapter`, `useSizeObserver`, `useRowVirtualizer`, `useCenterVirtualizer`.
5. [`phase-5-keyboard-nav.md`](./phase-5-keyboard-nav.md) — `navigationMode`, roving tabindex, `onKeyDown`, `setFocusedCell`, APG conformance.
6. [`phase-6-validator.md`](./phase-6-validator.md) — `validateGridStructure`, dev-only, integration test assertions.
7. [`phase-7-public-surface-and-integration.md`](./phase-7-public-surface-and-integration.md) — Subpath exports, perf bench, APG Playwright suite, integration tests, API freeze update.
