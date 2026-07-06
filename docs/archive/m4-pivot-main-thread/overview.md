# M4: Pivot, Main Thread — Plan Overview

**Slug:** `m4-pivot-main-thread`
**Milestone:** M4 (per `docs/initial-spec.md` §14)
**Status:** Draft v1 for review — decisions D1–D8 resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** PivotTable framework-free package (`@lynellf/tablekit-pivot`), main-thread aggregation engine, reducer-shaped aggregator registry + built-ins, expansion + lazy computation, totals (grand-total row + column), pivot sorting, treegrid rendering + React hook. **Worker engine and server engine are M5 (deferred).**
**Scope resolution:** The target is **M4: Pivot, main thread** per `docs/initial-spec.md` §14 row 5 (*"Config, aggregators, result model, expansion, totals, pivot sorting, treegrid rendering — Pivot integration + a11y tree tests; sum-default verified"*). M0/M1/M2/M3 are complete: state engine, controlled-slice contract, row pipeline, virtualization, pinning, resize, keyboard nav, validator, `RowsQuery`, `DataSource`, `useDataSource`, `createClientDataSource`, mixed-mode warnings, ~380 tests green, `pnpm verify` clean, M3 `api-freeze.md` approved (see [`docs/m3-server-modes/plan-summary.md`](../m3-server-modes/plan-summary.md)). M4 extends that surface additively; no M0/M1/M2/M3 export is renamed, removed, or signature-changed.

**Out of scope (deferred):**

- **Worker engine + protocol + worker-side data store** — M5 (spec §9.3 worker engine).
- **Server engine contract for `computeChildren`** (server-side lazy expansion) — M5 (spec §9.5 server).
- **Subtotal rows (`subtotals: 'perLevel'`)** — v1.5 per spec §15. M4 ships `TotalsConfig.subtotals: 'none' | 'perLevel'` in the type but only honors `'none'` (the default).
- **`messages` map + i18n + politeness heuristics for the announcer** — M6.
- **Screen-reader manual matrix (NVDA, JAWS, VoiceOver)** — M6 release gate. Treegrid + colindex quirks are the highest-risk a11y surface; M4 ships the structural tests + the validator extensions, M6 runs the matrix.
- **`validateGridStructure` CLI / layered diagnostics / runtime dev-mode auto-run** — M6 polish.
- **`rowSelection`, state persistence helper, global quick filter, column auto-fit** — v1.5/v2.
- **Tab-behaviour override (`'exit' | 'cells'`)** — §16 risk #4, deferred per M6.
- **D6/D7 of the spec's "Hard gate behind `allowWithinPageOperations`"** — M6/v2.
- **`split-pane` recipe** (left/center/right viewports with scroll sync) — M6 docs. The library exposes the data shape (§7.3) needed for it; the recipe is documentation, not code.

---

## 1. Goal

Land M4 per the spec: *"Config, aggregators, result model, expansion, totals, pivot sorting, treegrid rendering"*. Exit criteria (spec §14): **pivot integration + a11y tree tests; sum-default verified**.

Concretely:

1. **`@lynellf/tablekit-pivot` package** — A new framework-free workspace package (per spec §3 dependency direction: `pivot → core`). Aggregator registry, main-thread engine, `createPivotTable` factory, all reducer-shaped aggregation, lazy expansion, totals, pivot sorting.
2. **Reducer-shaped `Aggregator<TIn,TAcc,TOut>` interface** with `init()`, `accumulate(acc, value, row?)`, `merge(a, b)`, `finalize(acc)` — per spec §9.2. **`merge` is required** for the worker/server seam (it is what makes the three engines share one semantics). Built-in aggregators: `sum`, `count`, `min`, `max`, `avg` (the last as a mergeable `{sum, count}` pair, finalized on read).
3. **`AggregationEngine<TRow>` contract** — `compute(q, ctx) → PivotResult`, `computeChildren?(path, q, ctx) → PivotRowNode[]`, `dispose?()`. Spec §9.3. M4 ships **only** the main-thread implementation (`createMainThreadEngine()`); the contract is the seam for M5.
4. **`PivotResult` + `PivotRowNode` + `PivotColumnNode` model** — Per spec §9.4. Stable row-path-keyed identity (`RowPathKey` = serialized path like `'["West","Q3"]'`), `childState: 'loaded' | 'notLoaded' | 'loading' | 'error'`, `values: Record<LeafColumnId, unknown>`, `rowTotals: Record<MeasureId, unknown>`. `leafColumns` is the flattened render order including the totals column.
5. **`createPivotTable<TRow>(options)` factory** with state slices `pivot`, `expanded`, `pivotSorting`, plus the shared slices from `DataTableState` (`columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell`) — per spec §4.2. Controlled/uncontrolled per slice, mirroring M0's `applySliceChange` pattern. Exposes `getVisibleRows()` (DFS-flattened), `getHeaderRows()` (column hierarchy as N header rows with `aria-colspan`), `getLeafColumns()` (flat render order).
6. **Expansion + lazy computation** — `expanded: Record<RowPathKey, boolean>`; `setExpanded`, `toggleExpanded`. Client engines compute the tree lazily by `expandedPaths`: unexpanded subtrees are aggregated but not enumerated, so expansion is instant and memory stays proportional to what's visible (spec §9.5). The engine skips enumeration of children for paths NOT in `expandedPaths`.
7. **Totals** — `TotalsConfig` with `grandTotalRow` (default `true`, footer row, `data-total="row"`), `grandTotalColumn` (default `true`, right-pinned, `data-total="column"`), `grandTotalColumnPosition: 'start' | 'end'` (default `'end'`). Both computed via aggregator `merge` over child accumulators — cheap and consistent (spec §9.6). `subtotals?: 'none' | 'perLevel'` is reserved in the type but only `'none'` is honored in M4.
8. **`PivotSortingState`** — `Array<{ level, by: 'label' | 'measure', desc, … }>` — per spec §9.7. Group ordering (per level within each parent); sort by label (using the field's `sortComparator`) or by a measure value (optionally under a specific column path). Executed by the engine so it works identically for main-thread (M4), worker (M5), and server (M5).
9. **`usePivotTable<TRow>(options)` React hook** — Adapter mirrors `useDataTable`; exposes `pivot`, `state`, `Announcer`. Treegrid prop getters: `getGridProps()` (root role `treegrid`), `getRowProps({ ... })` (with `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`), `getRowHeaderProps()` (`role="rowheader"`), `getToggleExpandedProps()` (expander affordance), `getHeaderProps()` (with `aria-colspan`), `getFooterProps()` (grand-total row), `getTotalsColumnProps()` (grand-total column). Announcements: "West expanded, 4 rows", "Loading West…", "Grand total row", "Sorted by Region ascending". Routing goes through the existing `Announcer` seam from M1.
10. **Treegrid accessibility extensions** — `validateGridStructure` accepts `role="treegrid"` and adds treegrid-specific rules: `aria-expanded` on rows with children, `aria-level` monotonicity on rendered rows, `role="rowheader"` ownership inside rows, no `tabIndex=0` requirement when no cell is focused (the grid root owns focus in treegrid). Dev-only tree-shaken module from M2 is extended.
11. **Reference app** — `examples/m4-pivot-main-thread/` (Vite + React 19) demonstrating row hierarchy (region → quarter), column hierarchy (year), measure (sum of sales + count), expansion + collapse, grand-total row + grand-total column, sort-by-label and sort-by-measure, the §12 perf budget mark ("main thread ≤ ~200k rows before worker recommended"). Spec §14 exit criterion.
12. **Aggregator merge laws + serialization contract tests** — Spec §13: property-based tests asserting `merge` associativity/commutativity where claimed and `accumulate` ≡ chunked-`merge` equivalence for every built-in aggregator. Golden fixtures for `PivotQuery` serialization (analogous to M3's `RowsQuery` fixtures). Dev warnings on inline aggregator/filter leaks into serialized queries (mirroring M3's `nameOfSortingFn`/`nameOfFilterFn`).

The deliverable from a fresh clone: `pnpm verify` exits 0; M4 tests pass; the M4 reference app boots and demonstrates row hierarchy + expansion + totals + sorting + treegrid rendering; the §14 exit criteria are satisfied.

---

## 2. What I found (investigation notes)

### 2.1 Sources reviewed

- `docs/initial-spec.md` — §3 (package architecture: `pivot → core` direction), §4.2 (`PivotTableState` sketch), §4.3 (dependency-inversion seams: aggregator registry), §7.3 (column pinning includes pivot leaf columns + grand-total column default-pinned), §7.5 (treegrid keyboard additions: Right on collapsed row-header expands, Right on expanded moves inward, Left collapses or moves to parent), §9.1–9.8 (the load-bearing design), §10 (treegrid accessibility), §12 (perf: main thread ≤ ~200k rows), §13 (property-based aggregator tests + golden serialization fixtures), §14 (M4 row + exit criteria), §15 (subtotals deferred to v1.5), §16 risk #5 (variable row heights — N/A for M4 since heights are uniform per-row), #9 (treegrid + colindex quirks).
- `docs/m3-server-modes/plan-summary.md` + phase files — established the §3-decisions + §4-architecture + §5-risks + §6-verification layout M4 will reuse. The phase-file format (Files created / Files modified / File contents / Commands / Verification / Out-of-scope / Risks) is the convention.
- `docs/archive/m2-advanced-features/api-freeze.md` + [`docs/m3-server-modes/api-freeze.md`](../m3-server-modes/api-freeze.md) — the cumulative frozen surface M4 must preserve.
- `packages/core/src/{createDataTable,columns,headers,rows,propGetters,types,state,announcer,keyboardNav,visibility,ordering,events,resize,pinning}.ts` — current source state; `applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys` from M0 are the seams M4 will reuse for pivot state.
- `packages/core/src/registries/{sorting,filtering}.ts` — registry pattern M4 mirrors for aggregators. `nameOfSortingFn`/`nameOfFilterFn` reverse-lookup pattern (added in M3) is mirrored for `nameOfAggregator`.
- `packages/core/src/pipeline/{filter,sort,rowModel,memo}.ts` — the row pipeline is reused by `createClientDataSource` (M3) and by `createMainThreadEngine` (M4 for the pre-aggregation filter pass).
- `packages/react/src/{useDataTable,ReactAnnouncer,useDataSource,useScrollAdapter,useSizeObserver,useRowVirtualizer,useCenterVirtualizer,useResizeHandle,useKeyboardNav,validate}.tsx` — adapter seams M4's `usePivotTable` mirrors. `validate.ts` is extended for treegrid in phase 5.
- `examples/m3-server-modes/` — established the reference-app pattern (Vite + React 19, workspace deps, fakeServer, DemoPanel, PerfBadge).
- `.okf/components/dev-tooling-stack.md` — tooling decisions (pnpm 10, Vite 5, Vitest 2, Biome 1.9, TS 5.6.3 strict). `.okf/workflows/dev-tooling-bootstrap.md` — `pnpm verify` aggregate gate and lefthook pre-push.

### 2.2 Verified facts

- **`packages/pivot/` and `packages/worker/` directories are reserved.** Per `.okf/components/dev-tooling-stack.md` ("all four directories reserved from day one even though M0 only ships core+react"). `ls packages/` confirms both are empty. M4 ships `@lynellf/tablekit-pivot` with `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.subpaths.config.mjs`. The `worker/` directory stays empty in M4 (M5 territory).
- **Spec §3 dependency direction `pivot → core`.** M4's pivot package depends on `@lynellf/tablekit-core` as a peer/dev dependency. No reverse dependency. React integration is in `@lynellf/tablekit-react` which transitively depends on pivot (spec §3: "`react → (core, pivot, worker)`").
- **No DOM in core.** Per M0 boundary. M4 extends this: no DOM in `pivot` either. The main-thread engine is a pure function over the rows dataset; the React adapter is the only place with DOM/React.
- **The M0/M1/M2 controlled-slice machinery (`applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices`) is reusable for pivot state slices.** `createPivotTable` will use the same `setOptions` + `subscribe` + `notify` pattern as `createDataTable`. Pivot slices are added to `PivotTableState`; the controlled-slice helpers operate on `PivotTableState` via a generic over `TState extends { [k: string]: unknown }`.
- **The registry pattern is identical for aggregators.** Aggregators live in `packages/pivot/src/registries/aggregators.ts` with the same `builtInAggregators: Record<string, Aggregator<...>>` + `customAggregators: Map<string, Aggregator<...>>` split. `registerAggregator`, `getAggregator`, `BUILT_IN_AGGREGATORS`, `builtInAggregators`, `nameOfAggregator` mirror the sorting/filtering APIs. Aggregators are not generic over `TRow` because they only see measure values (`TIn` / `TAcc`), not row shapes — `sum` works on `number` whether the source row is `SalesRecord` or `Order`. (The optional `row?: unknown` 3rd `accumulate` arg supports future row-aware aggregators without breaking the simple case.)
- **The row pipeline (`filterRows`, `sortRows`) is reusable for pre-aggregation filtering.** Spec §9.1 `PivotFilter` accepts a registry-name shape (`{ predicateRef: string; args?: unknown }`) for server/worker, but the main-thread engine also accepts inline `{ predicate: (row) => boolean }`. The pipeline's `filterRows` already threads `filterFn` registry resolution; pivot filters use the **filtering** registry (not a new one) since filter predicates operate on rows, not measures.
- **The M2 keyboard-nav module accepts a `KeyboardNavContext` that's currently DataTable-shaped.** Pivot's treegrid keyboard extensions (§7.5: Right on collapsed row-header expands; Right on expanded moves inward; Left collapses or moves to parent) add `'expand' | 'collapse' | 'moveInward' | 'moveToParent'` actions. M4 extends `KEY_BINDINGS` to add `ArrowRight: { action: 'pivotExpandOrMoveInward' }` and `ArrowLeft: { action: 'pivotCollapseOrMoveToParent' }` on the **row-header cell only** (the existing `ArrowRight: navigateCell` behavior remains for non-row-header cells). Phase 5 implements this as a new keyboard-nav variant exposed via `usePivotTable` rather than extending `useKeyboardNav` directly, to keep M2's DataTable API frozen.
- **`validateGridStructure` (M2) accepts `role="grid" | "treegrid" | "table"`.** M2's check already recognizes treegrid at the root level. Phase 5 adds treegrid-specific rules: `aria-expanded` required on rows whose `data-has-children="true"`, `aria-level` monotonicity, `role="rowheader"` ownership inside rows, no `tabIndex=0` requirement when no cell is focused (the grid root owns focus in treegrid). All additions are in the existing dev-only tree-shaken module.
- **The announcer seam (`Announcer`, `noopAnnouncer`, `getGlobalAnnouncer`, `setGlobalAnnouncer`, `ReactAnnouncer`) from M1 is reusable.** M4 routes "West expanded, 4 rows", "Loading West…", "Grand total row", "Sorted by Region ascending" through the same channel. No new announcer infrastructure.
- **`pnpm verify` is the aggregate gate.** It runs `typecheck && lint && test && build` serially. The new pivot package must participate: `pnpm -F @lynellf/tablekit-pivot build` is added to the root `build` script. The pivot package's own scripts mirror core (`build`, `typecheck`, `test`). The dev-tooling-bootstrap decision to keep `verify` short-circuited on failure means the new package cannot break the existing CI without fixing the build script in phase 1.
- **The M3 reference-app pattern (`examples/m3-server-modes/`) is the template for M4's reference app.** Same Vite + React 19 + workspace deps structure, same DemoPanel/PerfBadge skeleton, same `pnpm-workspace.yaml` already includes `examples/*` from M3.
- **Serialization golden fixtures for `PivotQuery` parallel M3's `RowsQuery` fixtures.** M3 used 5 fixtures (`empty`, `sort-only`, `filter-only`, `paginate-only`, `all-combined`). M4 uses 5+ fixtures (`empty`, `pivot-only`, `expanded-only`, `sorting-only`, `totals-only`, `all-combined`).
- **Property-based tests for aggregator merge laws** — Spec §13: "merge associativity/commutativity where claimed, accumulate vs. chunked-merge equivalence." Vitest doesn't ship with `fast-check`; we either add it as a devDep or hand-roll with `it.each` over randomized inputs. Decision in D3 (no) — we hand-roll property tests with seeded RNG (`mulberry32` in a test util) to keep the dep footprint flat. 100 random trials per built-in aggregator suffices.

### 2.3 Spec implications for M4 design

- **§3 architecture.** `pivot → core` dependency direction; the pivot package re-exports core utilities (`applySliceChange`, `mergeInitialState`) as needed. React depends on both: `react → (core, pivot, worker)`.
- **§4.2 state.** `PivotTableState` extends the shared slice machinery with `pivot: PivotConfig`, `expanded: Record<RowPathKey, boolean>`, `pivotSorting: PivotSortingState`. `columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell` are shared with `DataTableState`. M4 reuses M0's `applySliceChange` / `mergeInitialState` generically.
- **§7.3 column pinning.** Applies identically to pivot leaf columns; grand-total column defaults to right-pinned. Pinning the pivot row-header column left is the documented default recipe.
- **§7.5 treegrid keyboard.** Right on collapsed row-header expands; Right on expanded moves inward; Left collapses or moves to parent. Rows carry `aria-expanded` and `aria-level`. The M4 keyboard module adds these actions to the binding map; the React adapter dispatches them based on whether the focused cell is a row-header cell.
- **§9.1 PivotConfig.** `rows`, `columns`, `measures`, `filters?`, `totals?`. `rows` and `columns` are ordered `FieldRef[]`. `FieldRef = string | { field, accessor?, label?, sortComparator? }`. `MeasureDef` carries `id`, `field?`, `accessor?`, `aggregator?: string | Aggregator` (default `'sum'`), `label?`, `format?`. `PivotFilter` is the discriminated union: `{ field, op, value }` (server/worker-capable), `{ predicate }` (main-thread only), `{ predicateRef, args? }` (registry-name, worker/server-capable).
- **§9.2 Aggregator interface.** Reducer-shaped with required `merge` (for worker/server). Built-ins all implement `merge`. Inline aggregator objects are legal on the main-thread engine; anything crossing a boundary is a registry name (P3), with `nameOfAggregator` reverse-lookup + dev warning when an inline aggregator leaks into a serialized `PivotQuery` (analogous to M3's `nameOfSortingFn`).
- **§9.3 AggregationEngine contract.** `compute(q, ctx)` returns the full `PivotResult`. `computeChildren?(path, q, ctx)` resolves §9.5 expansions for server engines (M5). M4's main-thread engine: `compute` returns the collapsed top level + grand totals when `expandedPaths` is empty; `computeChildren(path, q, ctx)` enumerates the children of an already-aggregated node. Engine choice is per-instance (`engine` option) and hot-swappable.
- **§9.4 Result model.** `PivotResult = { columnRoot, leafColumns, rowRoot, grandTotals }`. `columnRoot` is the column hierarchy; `leafColumns` is the flattened render order including the totals column. `rowRoot` is a synthetic root; children = level-0 groups. `PivotRowNode` carries `key` (RowPathKey), `path`, `level`, `label`, `hasChildren`, `childState`, `children?`, `values`, `rowTotals`. `getVisibleRows()` flattens by DFS honoring `expanded`.
- **§9.5 Expansion + server-side.** M4's main-thread engine computes the full tree lazily by `expandedPaths`: when `expandedPaths` doesn't contain a path, the node's children are not enumerated (the engine only computes aggregated values for the node). When toggled, `computeChildren(path, q, ctx)` materializes the children synchronously. Server expansion is M5 (not in M4). The `childState` machine is implemented: `'loaded' | 'notLoaded' | 'loading' | 'error'` per node. The main-thread engine always returns `'loaded'` for materialized children and `'notLoaded'` for paths not in `expandedPaths`. The `aria-busy` + placeholder row UX from M3 applies for the (M5) `loading` / `error` states; the field is reserved.
- **§9.6 Totals.** `TotalsConfig` with `grandTotalRow?: boolean` (default `true`), `grandTotalColumn?: boolean` (default `true`), `grandTotalColumnPosition?: 'start' | 'end'` (default `'end'`), `subtotals?: 'none' | 'perLevel'` (default `'none'`; v1.5). Grand-total row: footer rowgroup (outside row virtualization), `data-total="row"`, last `aria-rowindex`. Grand-total column: per-measure leaf columns appended in the chosen position, right-pinned by default (`data-total="column"`), participates in `aria-colcount`. Both computed via aggregator `merge` over child accumulators.
- **§9.7 Pivot sorting.** `PivotSortingState = Array<{ level, by: 'label' | 'measure', desc, … }>`. `by: 'label'` (default; uses the field's `sortComparator`) or `by: 'measure'` (optionally under a specific column path). Executed by the engine (it owns the tree). Column-hierarchy value ordering uses the same `{ by: 'label' }` form applied to `columns` fields.
- **§9.8 Treegrid rendering.** Root role `treegrid`; rows carry `aria-expanded` (only when `hasChildren`), `aria-level` (= `level + 1`), and optionally `aria-setsize` / `aria-posinset`. Row-header cell uses `role="rowheader"`; indentation is the consumer's CSS keyed off `data-level`. All expansion / loading / totals states announced.
- **§10 Accessibility.** `aria-rowcount`/`aria-colcount` reflect logical totals including header rows; `aria-rowindex`/`aria-colindex` are mandatory because virtualization removes DOM siblings. `aria-busy` on rows for loading states. Announcer routes through `messages` (M6 i18n) — M4 uses hardcoded English strings like M1.
- **§12 perf.** "Pivot, main thread: ≤ ~200k source rows before docs recommend worker engine." The reference app reports row count + re-pivot timing in a perf badge (analogous to M3's "render new page < 16ms" badge). Bench suite captures main-thread re-pivot on 50k / 100k / 200k synthetic datasets; results are logged but not gated.
- **§13 testing.** Property-based merge laws; serialization goldens for `PivotQuery`; type tests via `expect-type` (already in the dev-deps from M0).

### 2.4 Assumptions (applied during planning)

1. **New package `@lynellf/tablekit-pivot`** at `packages/pivot/`. `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.subpaths.config.mjs`, `src/index.ts`. Peer-depends on `@lynellf/tablekit-core`. Depends on `@lynellf/tablekit-react` only for the React adapter (which lives in `@lynellf/tablekit-react`, not `@lynellf/tablekit-pivot`).
2. **Subpath exports** for `@lynellf/tablekit-pivot` mirror the core pattern: `.` (root), `./aggregators`, `./engine`, `./pivotTable`, `./serialize`. Each is tree-shakeable; consumers importing only `createPivotTable` pay only the factory + state code, not the engine.
3. **`@lynellf/tablekit-react` depends on `@lynellf/tablekit-pivot`.** New peer dependency added in `@lynellf/tablekit-react/package.json`. The M3 dependency on `@lynellf/tablekit-core` remains.
4. **The `worker/` directory stays empty.** M5's responsibility. M4 does not pre-stub any worker code (the engine contract is exported but no implementation lands).
5. **`PivotTableState` shares slice machinery with `DataTableState`** via a generic helper. M0's `applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled` are parameterized over `TState extends Record<string, unknown>`. This is a small refactor in phase 1 (no M0 export signature changes — only the internal generic widening).
6. **Main-thread engine implements both `compute(q, ctx)` and `computeChildren(path, q, ctx)`** for the lazy expansion contract. `compute` returns a `PivotResult` with `rowRoot.children` materialized only for paths in `expandedPaths`; `computeChildren(path, q, ctx)` is called by the React hook (via `__expand(path)` internal seam) to materialize children of a just-toggled path. The engine maintains no internal state; the React adapter caches the tree + applies lazy patches.
7. **Lazy expansion semantics.** When `expandedPaths = []`, only level-0 groups are materialized (children are aggregated into the parent's `values` / `rowTotals`). When `expandedPaths = ['["West"]']`, West's children are materialized; grandchildren are still aggregated. This keeps memory proportional to what's visible, as spec §9.5 requires.
8. **Grand-total column leaf shape.** One totals leaf per measure (per spec §16 risk #6 resolution: "one leaf per measure"). `leafColumns` includes both measure leaves and totals leaves.
9. **Multi-measure handling.** Each measure gets its own leaf column per column-path combination. Totals column gets one leaf per measure. `aria-colcount` reflects the sum.
10. **Pivot sorting is engine-owned.** The engine accepts `pivotSorting` as part of `PivotQuery` and applies sort-by-label / sort-by-measure during tree construction. The React adapter just dispatches `setPivotSorting`; the engine re-derives on the next `compute` call. The hook's `useEffect` calls `engine.compute(query, { signal })` whenever `pivot`, `pivotSorting`, `expanded`, or `data` change.
11. **Dev warnings on inline aggregator/filter leaks.** `nameOfAggregator` reverse-lookup; `validatePivotQuery` checks that all `aggregator` references in measures are registry names when the engine is `server` (M5) or `worker` (M5). In M4 with the main-thread engine, inline aggregators are legal — the warning fires only when an explicit `engine !== createMainThreadEngine()` is wired AND an inline aggregator is in the config. This is forward-compatible with M5.
12. **Reference app architecture.** Fresh Vite + React 19 app under `examples/m4-pivot-main-thread/` (following the M3 pattern). Demonstrates: row hierarchy (region → quarter), no column hierarchy, two measures (sum of sales + count of orders), expansion + collapse, grand-total row + grand-total column, sort-by-label (default), sort-by-measure ("sort regions by Q4 sales"), and the §12 perf badge. `pnpm-workspace.yaml` already includes `examples/*` from M3; no workspace change needed.
13. **`validateGridStructure` treegrid extensions** are additive (new rules appended). The M2 behavior for `role="grid"` and `role="table"` is unchanged. New rules only fire when `rootRole === 'treegrid'`: check `aria-expanded` presence on rows with children, `aria-level` monotonicity, `role="rowheader"` cell ownership, no `tabIndex=0` requirement (the treegrid root owns focus).
14. **Test counts.** ~150-210 new tests (estimated across 6 phases): ~25-30 phase 1 (types + helpers), ~30-40 phase 2 (registry + built-ins + property tests), ~40-55 phase 3 (engine + result model + lazy expansion + property tests), ~25-35 phase 4 (factory + state + prop getters), ~15-25 phase 5 (React hook + treegrid a11y extensions + announcer), ~15-25 phase 6 (reference app + golden fixtures + integration). Final tally: ~530-590 total tests across all milestones.

### 2.5 Out-of-scope items intentionally NOT in this plan

- **Worker engine + protocol + data store** — spec §9.3 explicitly M5.
- **Server engine contract for `computeChildren`** — M5. The main-thread engine's `computeChildren` exists; the worker/server hooks do not.
- **Subtotals (`perLevel`)** — spec §15 v1.5. The type field exists; only `'none'` is honored.
- **Full `messages` map + i18n** — M6. M4 uses hardcoded English strings (matching M1).
- **Screen-reader manual matrix** — M6. M4 ships structural tests + validator extensions; the manual matrix (NVDA, JAWS, VoiceOver) is the M6 release gate.
- **`validateGridStructure` CLI / layered diagnostics** — M6 polish.
- **`tabBehavior: 'exit' | 'cells'`** — §16 risk #4, deferred to M6.
- **Split-pane recipe docs** — M6 docs. The data shape needed is exposed; the recipe is documentation only.
- **`rowSelection`, state persistence helper, global quick filter, column auto-fit** — v1.5/v2.
- **Hard gate behind `allowWithinPageOperations`** — v2 per spec §16 risk #10.

---

## 3. Resolved decisions (eight open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | New `@lynellf/tablekit-pivot` package vs extend `@lynellf/tablekit-core`? | **NEW `@lynellf/tablekit-pivot` PACKAGE** | Spec §3 dependency direction `pivot → core` is explicit; aggregator registry, engine contract, and result model are substantial (~2000 LOC) and don't belong in core's surface. The empty `packages/pivot/` directory is reserved per dev-tooling-stack.md. |
| D2 | Aggregator registry in core (next to sorting/filtering) or pivot-specific? | **PIVOT-SPECIFIC** (`@lynellf/tablekit-pivot/aggregators`) | Aggregators operate on measure values, not row shapes; they are pivot-only. The sorting/filtering registries stay in core. Mirroring the registry pattern is mechanical: `builtInAggregators`, `customAggregators`, `getAggregator`, `registerAggregator`, `nameOfAggregator`. |
| D3 | Property-based tests: add `fast-check` dep or hand-roll? | **HAND-ROLL WITH SEEDED RNG** (`mulberry32` test util) | Keep the dep footprint flat (M3 didn't add fast-check for RowsQuery properties). 100 randomized trials per built-in aggregator with seeded inputs (small numbers, NaN, ±Infinity, undefined, large integers) suffice. Property tests assert associativity / commutativity where claimed and `accumulate ≡ chunked-merge` equivalence. |
| D4 | Worker engine contract: ship stub or wait until M5? | **SHIP THE INTERFACE ONLY (`AggregationEngine<TRow>`)** | Spec §9.3 defines the contract as the seam; M5 fills it. The contract is exported from `@lynellf/tablekit-pivot/engine`. The `engine` option on `createPivotTable` accepts any `AggregationEngine<TRow>`; the default is `createMainThreadEngine()`. No worker code in M4. |
| D5 | Subtotals: include in M4 or defer? | **DEFER TO v1.5; type field reserved** | Spec §15 defers to v1.5; spec §9.6 defaults to `'none'`. The `TotalsConfig.subtotals?: 'none' \| 'perLevel'` field exists in the type but only `'none'` is honored in M4. Implementation in v1.5 will reuse the same `merge` mechanism. |
| D6 | Lazy expansion: skip unexpanded subtrees entirely, or aggregate-only? | **AGGREGATE-ONLY (no enumeration)** | Spec §9.5: "client/worker engines compute the full tree lazily by `expandedPaths` (unexpanded subtrees are aggregated but not enumerated)." The engine exposes aggregated `values` / `rowTotals` for non-expanded paths but does not materialize `children`. `computeChildren(path, q, ctx)` materializes them on demand. |
| D7 | Treegrid + `role="treegrid"` always, or opt-in? | **ALWAYS (`createPivotTable` always emits `treegrid`)** | Spec §9.8 says "Root role is `treegrid`." PivotTable is fundamentally a tree; there is no read-only equivalent (unlike DataTable's `navigationMode: 'none'` → `role="table"` downgrade). M4's `createPivotTable` emits `treegrid` unconditionally. |
| D8 | Grand-total column: position + pinning defaults? | **`'end'` POSITION + RIGHT-PINNED BY DEFAULT** | Spec §9.6 verbatim: "`grandTotalColumnPosition?: 'start' \| 'end'`. default `'end'`" and "right-pinned by default (`data-total="column"`)". The leafColumns flattening places totals leaves at the chosen position; the columnPinning slice seeds the right side with totals column ids on first render unless the consumer provides `columnPinning` initial state. |

Full rationale for each is in §2 (investigation notes) and reflected in the phase files.

---

## 4. Architecture overview

### 4.1 Package layout

```
packages/pivot/
├── package.json              @lynellf/tablekit-pivot (peer: @lynellf/tablekit-core)
├── tsconfig.json             extends ../../tsconfig.base.json
├── vite.config.ts            single ESM build to dist/tablekit-pivot.es.js
├── vite.subpaths.config.mjs  multi-entry subpath build (mirrors core pattern)
└── src/
    ├── index.ts              root barrel: types + factory + aggregator re-exports
    ├── types.ts              PivotConfig, FieldRef, MeasureDef, PivotFilter, PivotQuery, PivotState, …
    ├── aggregators/
    │   ├── index.ts          registry barrel: registerAggregator, getAggregator, nameOfAggregator
    │   ├── builtins.ts       sum, count, min, max, avg (as {sum, count} pair)
    │   └── types.ts          Aggregator<TIn, TAcc, TOut>
    ├── engine/
    │   ├── index.ts          engine barrel: createMainThreadEngine, AggregationEngine
    │   ├── mainThread.ts     createMainThreadEngine factory + PivotResult builder
    │   ├── treeBuilder.ts    PivotColumnNode + PivotRowNode construction + lazy expansion
    │   └── pivotSorting.ts   PivotSortingState application (label / measure)
    ├── pivotTable/
    │   ├── index.ts          pivotTable barrel: createPivotTable
    │   ├── factory.ts        createPivotTable<TRow>(options) — controlled-slice contract
    │   ├── visibleRows.ts    getVisibleRows() — DFS flatten honoring expanded
    │   ├── headerRows.ts     getHeaderRows() — column hierarchy as N header rows
    │   └── totals.ts         grand-total row + column computation via merge
    ├── serialize/
    │   ├── index.ts          serialize barrel: buildPivotQuery, validatePivotQuery
    │   ├── query.ts          PivotConfig → PivotQuery (JSON-serializable; aggregator names; predicate names)
    │   └── warnings.ts       dev warning on inline aggregator/predicate leaks (M5-shaped)
    └── __tests__/
        ├── types.test.ts
        ├── aggregators.test.ts
        ├── mergeLaws.test.ts              property tests
        ├── engine.test.ts
        ├── lazyExpansion.test.ts
        ├── pivotSorting.test.ts
        ├── pivotTable.test.ts
        ├── totals.test.ts
        ├── serialize.test.ts
        └── fixtures/
            └── pivotQuery/*.json          golden fixtures
```

`packages/pivot/package.json` adds:

```json
{
  "name": "@lynellf/tablekit-pivot",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/tablekit-pivot.es.js",
  "module": "./dist/tablekit-pivot.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/tablekit-pivot.es.js" },
    "./aggregators": { "types": "./dist/aggregators/index.d.ts", "import": "./dist/aggregators/index.es.js" },
    "./engine": { "types": "./dist/engine/index.d.ts", "import": "./dist/engine/index.es.js" },
    "./pivotTable": { "types": "./dist/pivotTable/index.d.ts", "import": "./dist/pivotTable/index.es.js" },
    "./serialize": { "types": "./dist/serialize/index.d.ts", "import": "./dist/serialize/index.es.js" }
  },
  "files": ["dist"],
  "sideEffects": false,
  "peerDependencies": { "@lynellf/tablekit-core": ">=0.2.0" },
  "scripts": {
    "build": "vite build",
    "build:subpaths": "node vite.subpaths.config.mjs",
    "typecheck": "tsc -b"
  }
}
```

`packages/react/package.json` adds `@lynellf/tablekit-pivot: ">=0.1.0"` as a peer dependency.

### 4.2 State machinery sharing

`createPivotTable` uses the same controlled-slice pattern as `createDataTable`. The M0 state helpers (`applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices`) are widened to a generic over `TState extends Record<string, unknown>` in phase 1:

```ts
// packages/core/src/state.ts (widened signature)
export const applySliceChange = <TState extends Record<string, unknown>, K extends keyof TState>(
  state: TState,
  slice: K,
  updater: Updater<TState[K]>,
): TState => { … };
export const mergeInitialState = <TState extends Record<string, unknown>>(
  initial: Partial<TState> | undefined,
  controlled: Partial<TState> | undefined,
): TState => { … };
// … others widened similarly
```

This is **signature-compatible** for existing M0 callers (TS infers `TState = DataTableState` for the existing call sites). No M0 export is renamed or removed.

### 4.3 Engine contract

```ts
// packages/pivot/src/engine/index.ts
export interface AggregationEngine<TRow> {
  compute(q: PivotQuery, ctx: { signal: AbortSignal }): MaybePromise<PivotResult>;
  computeChildren?(
    path: FieldValue[],
    q: PivotQuery,
    ctx: { signal: AbortSignal },
  ): MaybePromise<PivotRowNode[]>;
  dispose?(): void;
}
```

`createMainThreadEngine()` returns a singleton-style engine (or a new instance per call — the factory is cheap; consumers create per-instance). The engine is stateless: `compute(q, ctx)` always derives the result from `q.rows` (the source rows are passed in the query — analogous to M3's `RowsQuery` for DataTable but larger).

### 4.4 Public surface (summary)

| Surface | Where | Notes |
| --- | --- | --- |
| `createPivotTable<TRow>(opts): PivotTableInstance<TRow>` | `@lynellf/tablekit-pivot` | Factory; mirrors M0 `createDataTable` |
| `PivotTableState`, `PivotConfig`, `FieldRef`, `MeasureDef`, `PivotFilter`, `PivotQuery`, `PivotResult`, `PivotRowNode`, `PivotColumnNode`, `PivotLeafColumn`, `PivotSortingState`, `TotalsConfig`, `Aggregator`, `AggregationEngine`, `FieldValue`, `RowPathKey`, `LeafColumnId`, `MeasureId` | `@lynellf/tablekit-pivot` | Types |
| `BUILT_IN_AGGREGATORS`, `builtInAggregators`, `getAggregator`, `registerAggregator`, `nameOfAggregator` | `@lynellf/tablekit-pivot/aggregators` | Registry |
| `createMainThreadEngine()` | `@lynellf/tablekit-pivot/engine` | Main-thread implementation |
| `buildPivotQuery`, `validatePivotQuery` | `@lynellf/tablekit-pivot/serialize` | Serialization contract |
| `usePivotTable<TRow>(opts): UsePivotTableResult<TRow>` | `@lynellf/tablekit-react` | React hook (extended in phase 5) |
| `validateGridStructure` (extended for treegrid) | `@lynellf/tablekit-react/validate` | Dev-only; tree-shaken |

Full surface is in `api-freeze.md`.

---

## 5. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [Pivot package scaffold + types + state helpers](./phase-1-package-scaffold-and-types.md) | `packages/pivot/` package, types (`PivotConfig`, `FieldRef`, `MeasureDef`, `PivotFilter`, `PivotState`, `PivotQuery`), `Aggregator` interface, `RowPathKey`/`FieldValue`/`LeafColumnId`/`MeasureId` helpers, generic widening of M0 state helpers | ~25-30 |
| 2 | [Aggregator registry + built-ins + merge laws](./phase-2-aggregator-registry.md) | `registerAggregator` / `getAggregator` / `BUILT_IN_AGGREGATORS`, built-in `sum` / `count` / `min` / `max` / `avg` (as mergeable pair), `nameOfAggregator` reverse-lookup, property-based merge law tests | ~30-40 |
| 3 | [Main-thread engine + result model + lazy expansion](./phase-3-engine-and-result-model.md) | `AggregationEngine` interface, `createMainThreadEngine()`, `PivotResult` builder, column hierarchy + leafColumns flattening, row tree + lazy expansion, totals via merge, pivot sorting application | ~40-55 |
| 4 | [createPivotTable factory + state + prop getters](./phase-4-pivot-table-factory.md) | `createPivotTable<TRow>(opts)`, controlled/uncontrolled slices, `getVisibleRows()` / `getHeaderRows()` / `getLeafColumns()`, treegrid prop getters (`getGridProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`), announcer routing | ~25-35 |
| 5 | [usePivotTable + treegrid a11y extensions + announcer polish](./phase-5-react-hook-and-treegrid-a11y.md) | `usePivotTable<TRow>(opts)` React hook, treegrid keyboard additions (Right/Left on row-header), announcer messages ("West expanded, 4 rows", "Grand total row", "Sorted by …"), `validateGridStructure` treegrid rules, React integration tests | ~15-25 |
| 6 | [Reference app + serialization goldens + api-freeze + final verify](./phase-6-reference-app-and-api-freeze.md) | `examples/m4-pivot-main-thread/` Vite app, `PivotQuery` golden fixtures, `docs/m4-pivot-main-thread/api-freeze.md`, `pnpm verify` exit 0, §14 exit criteria satisfied | ~15-25 |
| | **Total M4 tests** | | **~150-210** (on top of M0/M1/M2/M3's 380) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 6. Key risks

1. **Generic widening of M0 state helpers** — `applySliceChange<TState extends Record<string, unknown>, K extends keyof TState>` is signature-compatible for existing callers but TS inference could regress in edge cases. Mitigation: phase 1 narrows the widening to `Record<string, unknown>` shape (preserves `shallowEqual` comparison semantics); the existing `DataTableState` callers continue to infer `TState = DataTableState`. Verified by M0/M1/M2/M3 test suite remaining green.
2. **`@lynellf/tablekit-pivot` subpath deduplication** — The M2 reviewer's long-term watch item ("`vite.subpaths.config.mjs` approach may simplify when Vite/Rollup fixes the underlying deduplication issue natively"). M4 reuses the exact same pattern; no new risk. Mitigation: phase 1 mirrors M2's `vite.subpaths.config.mjs` structure verbatim.
3. **Lazy expansion + memoization** — `compute(q, ctx)` and `computeChildren(path, q, ctx)` together construct the visible tree; memoization keyed on `(rows ref, query, expandedPaths)` is necessary for the §12 budget. M4 uses a `PivotResultCache` analogous to M2's `RowModelCache`. Cache invalidation on query change is enforced by the React hook's `useEffect` dep array.
4. **Treegrid keyboard correctness** — Spec §7.5 treegrid additions are subtle (Right on collapsed vs. expanded; Left collapse vs. parent). Mitigation: phase 5 implements this as a separate `pivotKeyboardNav` module rather than extending M2's `useKeyboardNav`, to keep M2's API frozen and the test matrix simple. The module is unit-tested with the §7.5 conformance table.
5. **Treegrid + colindex handling** — Spec §10/§16 risk #9: "`aria-colindex` handling with column virtualization has historical quirks in some SR/browser pairs." M4 mitigates by (a) emitting logical `aria-colindex` per spec §9.8, (b) keeping column virtualization opt-in (the engine doesn't force it; the consumer chooses via `useCenterVirtualizer`), (c) extending `validateGridStructure` to assert monotonicity.
6. **Aggregator merge law property tests with NaN / Infinity** — Property tests must avoid false positives. `sum` over `[NaN]` → `NaN`; `merge` over `[NaN, 0]` → `NaN`; the law is `accumulate([NaN]) ≡ chunked-merge([NaN] chunked as [[NaN]])`. Mitigation: property tests for `sum` / `count` exclude NaN inputs by generating finite values; NaN handling is tested separately with a focused unit test.
7. **`PivotTableState` interaction with `DataTableState`** — Pivot reuses `columnPinning` / `columnSizing` / `columnSizingInfo` / `focusedCell`. The `applySliceChange` generic widening handles this; risk is consumer confusion (they create a pivot instance but pass `DataTableState` keys). Mitigation: phase 4 adds a runtime check in the constructor that warns if the initial state shape is empty (a no-op, but it surfaces the misconfiguration to the consumer).
8. **Dev warning on inline aggregator leaks** — M4 only ships the main-thread engine, which accepts inline aggregators. The dev warning is forward-looking for M5 (worker/server). Mitigation: phase 1 implements `nameOfAggregator` (needed for the warning) but the warning fires only when `engine !== createMainThreadEngine()` — and M5 adds the actual worker/server wiring. The warning is shipped in phase 2 along with the registry.
9. **Bundle size** — M4 adds ~10-15 kB min+gzip to the M3 baseline (~27 kB). Tree-shakeable subpath exports mitigate; consumers using only `createPivotTable` pay only the factory + state + engine code. Aggregator built-ins are individually importable from `@lynellf/tablekit-pivot/aggregators` if the consumer wants only one.
10. **`pnpm verify` exit on a new package** — The root `build` script must include `pnpm -F @lynellf/tablekit-pivot build`. Phase 1 wires this. A failure to include it would break CI; the explicit change is in the phase 1 verification checklist.
11. **`@lynellf/tablekit-react` peer dependency addition** — Adding `@lynellf/tablekit-pivot` as a peer dep to the react package may surface install-time warnings for consumers who don't install the pivot package. Mitigation: peer dep is **optional** in the sense that consumers using only DataTable don't need pivot; the package.json `peerDependenciesMeta` field marks it `optional: true`. The react adapter imports from pivot only when `usePivotTable` is consumed (tree-shaking kicks in for DataTable-only usage).
12. **Concurrent state changes + engine compute storms** — Pivot has more state slices than DataTable (`pivot` itself changes when rows/columns/measures change; `expanded` toggles; `pivotSorting` changes). The React hook's `useEffect` debounces by running `engine.compute` only when one of `[pivot, pivotSorting, expanded, data]` changes. AbortController isn't needed (main-thread engine is synchronous), but the memo cache short-circuits when the query is unchanged.
13. **`PivotTable` not shareable with `DataTable` rendering** — `usePivotTable` returns a separate instance type; consumers who want both a pivot and a tabular view on the same data create two instances. This is by design per spec §4.1 ("DataTable and PivotTable are separate instance types that share feature modules"). The cross-instance data flow is consumer-owned (memoize the rows array).
14. **`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` strictness** — The pivot types use optional fields per spec (§9.1 `filters?`, §9.6 `grandTotalColumnPosition?`). `exactOptionalPropertyTypes` means `key?: T` ≠ `key: T | undefined`. Mitigation: phase 1 uses the `key?: T` convention consistently; tests assert optional absence vs. explicit `undefined`.
15. **Bundle / runtime cost of `nameOfAggregator`** — Reverse-lookup scans `customAggregators` then `builtInAggregators`. With ~5 built-ins + consumer customizations typically < 20, the scan is O(N) on a small map; acceptable. If consumers register thousands of aggregators, they should keep their registry small (this is a reasonable constraint).

Full risk table is in `plan-summary.md` §5.

---

## 7. Verification (end-of-milestone gate)

After all 6 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                # typecheck + lint + test + build — EXIT 0
pnpm test                                                  # M0/M1/M2/M3 (~380) + M4 (~150-210) tests, all green

# Pivot subpath smoke
node -e "import('@lynellf/tablekit-pivot').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/aggregators').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/engine').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/pivotTable').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/serialize').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"

# React pivot hook smoke
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable))"

# Reference app
pnpm --filter m4-pivot-main-thread-example build           # EXIT 0
pnpm --filter m4-pivot-main-thread-example dev             # http://localhost:5173

# Golden fixture tests
pnpm --filter @lynellf/tablekit-pivot test -- --run pivotQuery.golden

# Merge law property tests
pnpm --filter @lynellf/tablekit-pivot test -- --run mergeLaws

# §12 perf bench (advisory)
pnpm --filter @lynellf/tablekit-pivot bench                # main-thread re-pivot on 50k/100k/200k
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 8. M4 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **Pivot integration + a11y tree tests** | `packages/react/src/__integration__/pivot-*.test.tsx` render the prescribed treegrid DOM shape; `validateGridStructure` (extended for treegrid in phase 5) is called after render and asserts `{ valid: true }`. Integration tests cover row hierarchy, expansion, totals, sorting, announcer routing, and treegrid keyboard conformance (Right/Left on row-header). |
| **Sum-default verified** | `packages/pivot/src/__tests__/aggregators.test.ts` asserts that omitting `aggregator` from a `MeasureDef` defaults to `'sum'`. `packages/pivot/src/__tests__/engine.test.ts` runs the engine on a small dataset with two measures (one explicit `sum`, one omitted) and asserts both produce identical results. |
| **§9.5 lazy expansion (memory stays proportional to what's visible)** | `packages/pivot/src/__tests__/lazyExpansion.test.ts` runs `compute(q, ctx)` with `expandedPaths = []` on a 100k-row dataset; asserts the result has only level-0 nodes materialized (no children). `computeChildren(path, q, ctx)` is then called for each top-level path and the children are materialized on demand. Memory usage is asserted via `JSON.stringify(result).length` (rough proxy; full memory measurement is out of scope for M4). |
| **Totals via `merge`** | `packages/pivot/src/__tests__/totals.test.ts` asserts grand-total row is computed by `merge`ing all level-0 row accumulators (not by re-scanning). `merge` law property tests in `mergeLaws.test.ts` cover all built-ins. |
| **§9.7 pivot sorting** | `packages/pivot/src/__tests__/pivotSorting.test.ts` covers sort-by-label (using field `sortComparator`) and sort-by-measure (under a specific column path). Asserts ordering is correct at each level independently. |
| **Treegrid accessibility** | `validateGridStructure` extended (phase 5) to check `aria-expanded` on rows with children, `aria-level` monotonicity, `role="rowheader"` ownership. Integration tests assert the DOM shape. |

---

## 9. Out-of-scope reminder

M4 does **not** ship the worker engine, server engine, subtotals, full announcer polish, screen-reader manual matrix, `validateGridStructure` CLI / layered diagnostics, `tabBehavior` option, split-pane recipe, `rowSelection`, state persistence helper, global quick filter, column auto-fit, or hard-gating behind `allowWithinPageOperations`. These are explicit non-goals per spec §9, §14, §15, and §16. A reviewer should flag any phase file that includes M5+ work as a scope violation.

---

## 10. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D8** in this overview — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D4 (engine contract vs. implementation), D5 (subtotals deferral), and D6 (lazy expansion semantics).
2. **§4 architecture overview** — confirm the new `@lynellf/tablekit-pivot` package mirrors M2/M3 conventions (subpath exports, subpath build runner, peer dep on core). Confirm the generic widening of M0 state helpers (§4.2) is signature-compatible.
3. **Phase 1 (package scaffold + types)** — `Aggregator` interface shape; `PivotTableState` slice layout; `RowPathKey` / `FieldValue` / `LeafColumnId` / `MeasureId` type aliases; generic widening of `applySliceChange` / `mergeInitialState`.
4. **Phase 2 (aggregator registry + built-ins)** — `sum` / `count` / `min` / `max` / `avg` semantics; `avg` as a mergeable `{sum, count}` pair (with `finalize(acc) => acc.sum / acc.count`); property test methodology (seeded RNG, NaN exclusion); `nameOfAggregator` reverse lookup.
5. **Phase 3 (engine + result model + lazy expansion)** — `PivotResult` shape; column hierarchy + `leafColumns` flattening (including totals column position); row tree construction with lazy expansion (`expandedPaths` controls enumeration); pivot sorting application; totals via `merge`.
6. **Phase 4 (factory + state + prop getters)** — `createPivotTable` controlled-slice machinery; treegrid prop getters (`getRowProps` with `aria-expanded` / `aria-level` / `aria-setsize` / `aria-posinset`); `getToggleExpandedProps`; `getFooterProps` (grand-total row); `getTotalsColumnProps` (grand-total column).
7. **Phase 5 (React hook + treegrid a11y)** — `usePivotTable` hook mirroring `useDataTable`; treegrid keyboard additions (Right/Left on row-header); `validateGridStructure` treegrid extensions (additive rules); announcer message routing.
8. **Phase 6 (reference app + integration + api-freeze)** — Vite app demonstrating row hierarchy + expansion + totals + sorting + perf badge; serialization golden fixtures for `PivotQuery`; `api-freeze.md` completeness.
9. **§6 risks** — especially generic widening of M0 helpers (R1), treegrid keyboard correctness (R4), aggregator merge law NaN handling (R6), and the new package's impact on `pnpm verify` (R10) and the react package's peer deps (R11).

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).