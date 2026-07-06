# M4: Pivot, Main Thread — Plan Summary

**Audience:** `plan-reviewer-a`, `plan-reviewer-b`
**Goal:** Review-ready summary of the M4 plan.
**Full plan:** [`overview.md`](./overview.md) + 6 phase files + [`api-freeze.md`](./api-freeze.md).

---

## 1. Goal recap

Land M4 per `docs/initial-spec.md` §14 row 5: **Pivot, main thread — Config, aggregators, result model, expansion, totals, pivot sorting, treegrid rendering**. Exit criteria: **pivot integration + a11y tree tests; sum-default verified**.

M0/M1/M2/M3 are complete (~380 tests green across 45 files, `pnpm verify` clean, M3 `api-freeze.md` approved). M4 extends the surface additively; no M0/M1/M2/M3 export is renamed, removed, or signature-changed. The only behavioral changes are (a) M0's controlled-slice helpers widened to a generic over `TState extends Record<string, unknown>` (signature-compatible for existing callers — TS infers `TState = DataTableState`); (b) M2's `validateGridStructure` extended with treegrid-specific rules (additive, production tree-shaking preserved).

---

## 2. Scope (what's in, what's out)

### In M4

| Feature | Spec section | New surface |
| --- | --- | --- |
| New `@lynellf/tablekit-pivot` package | §3 | `packages/pivot/` (peer-deps `@lynellf/tablekit-core`) |
| PivotConfig + FieldRef + MeasureDef + PivotFilter types | §9.1 | `PivotConfig<TRow>`, `FieldRef<TRow>`, `MeasureDef<…>`, `PivotFilter<TRow>` |
| PivotTableState + state slices | §4.2, §9 | `PivotTableState`, `PivotExpansionState`, `PivotSortingState`, `DEFAULT_PIVOT_STATE` |
| `Aggregator<TIn, TAcc, TOut>` interface (required `merge`) | §9.2 | `Aggregator` |
| Aggregator registry + built-ins | §9.2, §4.3 | `registerAggregator`, `getAggregator`, `nameOfAggregator`, `BUILT_IN_AGGREGATORS`, `builtInAggregators`; built-ins `sum`, `count`, `min`, `max`, `avg` (last as `{sum, count}` pair) |
| `AggregationEngine<TRow>` contract + main-thread impl | §9.3 | `createMainThreadEngine()`, `AggregationEngine<TRow>`, `PivotResultCache` |
| `PivotResult` + `PivotRowNode` + `PivotColumnNode` + `PivotLeafColumn` | §9.4 | All §9.4 types |
| Lazy expansion (unexpanded subtrees aggregated) | §9.5 | `expandedPaths` semantics in engine + `computeChildren(path, q, ctx)` |
| Totals (grand-total row + grand-total column via `merge`) | §9.6 | `TotalsConfig`, totals column position + pinning |
| Pivot sorting (by label / by measure) | §9.7 | `PivotSortingState`, `applyPivotSortingAtLevel` |
| `createPivotTable<TRow>(opts)` factory | §4.1 | `PivotTableInstance<TRow>`, `PivotTableOptions<TRow>` |
| Controlled/uncontrolled slices | §4.2 | `setPivot`, `setExpanded`, `toggleExpanded`, `setPivotSorting`, `setColumnPinning`, `setColumnSizing`, `setFocusedCell` |
| Derived accessors | §9.4 | `getVisibleRows()`, `getHeaderRows()`, `getLeafColumns()` |
| Treegrid prop getters | §9.8 | `getGridProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`, `getBodyProps` |
| Announcer routing | §10, §9.8 | `announceExpansion`, `announceSorting`, `announceTotals` (routes through M1 `Announcer` seam) |
| `usePivotTable<TRow>(opts)` React hook | §4.1, §11 | `@lynellf/tablekit-react` export |
| Treegrid keyboard navigation | §7.5 | `resolveTreegridKeyAction`, `applyTreegridAction` (Right/Left on row-header) |
| `validateGridStructure` treegrid extensions | §10 | `treegrid-tabindex`, `treegrid-row-expanded`, `treegrid-level-monotonic`, `treegrid-rowheader-ownership` |
| Aggregator merge laws + property tests | §13 | `mergeLaws.test.ts` (associativity, commutativity, accumulate ≡ chunked-merge) |
| PivotQuery serialization + goldens | §13 | `buildPivotQuery`, `validatePivotQuery`, 6 golden fixtures |
| Reference app | §14 | `examples/m4-pivot-main-thread/` (Vite + React 19) |
| §12 perf bench | §12 | `packages/pivot/bench/main-thread.bench.ts` |

### Out of M4 (deferred)

- **Worker engine + protocol + data store** — M5 (spec §9.3).
- **Server engine contract for `computeChildren`** — M5 (spec §9.5 server expansion).
- **Subtotals (`perLevel`)** — v1.5 per spec §15. M4 ships `TotalsConfig.subtotals` in the type but only honors `'none'`.
- **Full `messages` map + i18n + politeness heuristics** — M6. M4 uses hardcoded English strings.
- **Screen-reader manual matrix** — M6 release gate. M4 ships structural tests + validator extensions; the matrix (NVDA, JAWS, VoiceOver) is M6.
- **`validateGridStructure` CLI / layered diagnostics / runtime dev-mode auto-run** — M6 polish.
- **`tabBehavior: 'exit' | 'cells'`** — §16 risk #4, deferred to M6.
- **Split-pane recipe docs** — M6 docs. Data shape exposed; recipe is documentation only.
- **`rowSelection`, state persistence helper, global quick filter, column auto-fit** — v1.5/v2.
- **Hard gate behind `allowWithinPageOperations`** — v2 per spec §16 risk #10.
- **Comparator registry integration** — M6. M4 applies pivot sorting via default `localeCompare` + numeric compare.
- **Inline `accessor`/`predicate`/`aggregator` round-trip in `PivotQuery`** — M4 strips them when `serialize: true`; full inline-form support across the worker/server boundary is M5.
- **Tachometer/mitata CI bench integration** — M6. M4 uses Vitest's built-in `bench` mode (advisory).

---

## 3. Resolved decisions (eight open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | New `@lynellf/tablekit-pivot` package vs extend `@lynellf/tablekit-core`? | **NEW `@lynellf/tablekit-pivot` PACKAGE** | Spec §3 dependency direction `pivot → core` is explicit; aggregator registry, engine contract, and result model are substantial (~2000 LOC) and don't belong in core's surface. The empty `packages/pivot/` directory is reserved per dev-tooling-stack.md. |
| D2 | Aggregator registry in core (next to sorting/filtering) or pivot-specific? | **PIVOT-SPECIFIC** (`@lynellf/tablekit-pivot/aggregators`) | Aggregators operate on measure values, not row shapes; they are pivot-only. The sorting/filtering registries stay in core. Mirroring the registry pattern is mechanical: `builtInAggregators`, `customAggregators`, `getAggregator`, `registerAggregator`, `nameOfAggregator`. |
| D3 | Property-based tests: add `fast-check` dep or hand-roll? | **HAND-ROLL WITH SEEDED RNG** (`mulberry32` test util) | Keep the dep footprint flat (M3 didn't add fast-check for RowsQuery properties). 100 randomized trials per built-in aggregator with seeded inputs (small numbers, NaN excluded for sum/count/min/max) suffice. Property tests assert associativity / commutativity where claimed and `accumulate ≡ chunked-merge` equivalence. |
| D4 | Worker engine contract: ship stub or wait until M5? | **SHIP THE INTERFACE ONLY (`AggregationEngine<TRow>`)** | Spec §9.3 defines the contract as the seam; M5 fills it. The contract is exported from `@lynellf/tablekit-pivot/engine`. The `engine` option on `createPivotTable` accepts any `AggregationEngine<TRow>`; the default is `createMainThreadEngine()`. No worker code in M4. |
| D5 | Subtotals: include in M4 or defer? | **DEFER TO v1.5; type field reserved** | Spec §15 defers to v1.5; spec §9.6 defaults to `'none'`. The `TotalsConfig.subtotals?: 'none' \| 'perLevel'` field exists in the type but only `'none'` is honored in M4. Implementation in v1.5 will reuse the same `merge` mechanism. |
| D6 | Lazy expansion: skip unexpanded subtrees entirely, or aggregate-only? | **AGGREGATE-ONLY (no enumeration)** | Spec §9.5: "client/worker engines compute the full tree lazily by `expandedPaths` (unexpanded subtrees are aggregated but not enumerated)." The engine exposes aggregated `values` / `rowTotals` for non-expanded paths but does not materialize `children`. `computeChildren(path, q, ctx)` materializes them on demand. |
| D7 | Treegrid + `role="treegrid"` always, or opt-in? | **ALWAYS (`createPivotTable` always emits `treegrid`)** | Spec §9.8 says "Root role is `treegrid`." PivotTable is fundamentally a tree; there is no read-only equivalent (unlike DataTable's `navigationMode: 'none'` → `role="table"` downgrade). M4's `createPivotTable` emits `treegrid` unconditionally. |
| D8 | Grand-total column: position + pinning defaults? | **`'end'` POSITION + RIGHT-PINNED BY DEFAULT** | Spec §9.6 verbatim: "`grandTotalColumnPosition?: 'start' \| 'end'`. default `'end'`" and "right-pinned by default (`data-total="column"`)". The leafColumns flattening places totals leaves at the chosen position; the columnPinning slice seeds the right side with totals column ids on first render unless the consumer provides `columnPinning` initial state. |

Full rationale for each is in [`overview.md` §3](../m4-pivot-main-thread/overview.md).

---

## 4. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [Package scaffold + types + state helper widening](./phase-1-package-scaffold-and-types.md) | `packages/pivot/` package, types (`PivotConfig`, `FieldRef`, `MeasureDef`, `PivotFilter`, `PivotState`, `PivotQuery`), `Aggregator` interface, `RowPathKey`/`FieldValue`/`LeafColumnId`/`MeasureId` helpers, generic widening of M0 state helpers | ~25-30 |
| 2 | [Aggregator registry + built-ins + merge laws](./phase-2-aggregator-registry.md) | `registerAggregator` / `getAggregator` / `BUILT_IN_AGGREGATORS`, built-in `sum` / `count` / `min` / `max` / `avg` (as mergeable pair), `nameOfAggregator` reverse-lookup, property-based merge law tests | ~30-40 |
| 3 | [Main-thread engine + result model + lazy expansion](./phase-3-engine-and-result-model.md) | `AggregationEngine` interface, `createMainThreadEngine()`, `PivotResult` builder, column hierarchy + leafColumns flattening, row tree + lazy expansion, totals via merge, pivot sorting application | ~40-55 |
| 4 | [createPivotTable factory + state + prop getters](./phase-4-pivot-table-factory.md) | `createPivotTable<TRow>(opts)`, controlled/uncontrolled slices, `getVisibleRows()` / `getHeaderRows()` / `getLeafColumns()`, treegrid prop getters (`getGridProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`), announcer routing | ~25-35 |
| 5 | [usePivotTable + treegrid a11y extensions + announcer polish](./phase-5-react-hook-and-treegrid-a11y.md) | `usePivotTable<TRow>(opts)` React hook, treegrid keyboard additions (Right/Left on row-header), announcer messages ("West expanded, 4 rows", "Grand total row", "Sorted by …"), `validateGridStructure` treegrid rules, React integration tests | ~15-25 |
| 6 | [Reference app + serialization goldens + api-freeze + final verify](./phase-6-reference-app-and-api-freeze.md) | `examples/m4-pivot-main-thread/` Vite app, `PivotQuery` golden fixtures, `docs/m4-pivot-main-thread/api-freeze.md`, `pnpm verify` exit 0, §14 exit criteria satisfied | ~15-25 |
| | **Total M4 tests** | | **~150-210** (on top of M0/M1/M2/M3's 380) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 5. Key risks

1. **Generic widening of M0 state helpers** — `applySliceChange<TState extends Record<string, unknown>, K extends keyof TState>` is signature-compatible for existing callers but TS inference could regress in edge cases. Mitigation: phase 1 narrows the widening to `Record<string, unknown>` shape (preserves `shallowEqual` comparison semantics); the existing `DataTableState` callers continue to infer `TState = DataTableState`. Verified by M0/M1/M2/M3 test suite remaining green.
2. **`@lynellf/tablekit-pivot` subpath deduplication** — The M2 reviewer's long-term watch item. M4 reuses the exact same `vite.subpaths.config.mjs` pattern; no new risk.
3. **Lazy expansion + memoization** — `compute(q, ctx)` and `computeChildren(path, q, ctx)` together construct the visible tree; memoization keyed on `(rows ref, query)` is necessary for the §12 budget. M4 uses a `PivotResultCache` analogous to M2's `RowModelCache`. Cache invalidation on query change is enforced by the React hook's `useEffect` dep array.
4. **Treegrid keyboard correctness** — Spec §7.5 treegrid additions are subtle (Right on collapsed vs. expanded; Left collapse vs. parent). Mitigation: phase 5 implements this as a separate `usePivotKeyboardNav` module rather than extending M2's `useKeyboardNav`, to keep M2's API frozen and the test matrix simple. The module is unit-tested with the §7.5 conformance table.
5. **Treegrid + colindex handling** — Spec §10/§16 risk #9: "`aria-colindex` handling with column virtualization has historical quirks in some SR/browser pairs." M4 mitigates by (a) emitting logical `aria-colindex` per spec §9.8, (b) keeping column virtualization opt-in (the engine doesn't force it; the consumer chooses via `useCenterVirtualizer`), (c) extending `validateGridStructure` to assert monotonicity.
6. **Aggregator merge law property tests with NaN / Infinity** — Property tests must avoid false positives. `sum` over `[NaN]` → `NaN`; `merge` over `[NaN, 0]` → `NaN`; the law is `accumulate([NaN]) ≡ chunked-merge([NaN] chunked as [[NaN]])`. Mitigation: property tests for `sum` / `count` exclude NaN inputs by generating finite values; NaN handling is tested separately with a focused unit test.
7. **`PivotTableState` interaction with `DataTableState`** — Pivot reuses `columnPinning` / `columnSizing` / `columnSizingInfo` / `focusedCell`. The `applySliceChange` generic widening handles this; risk is consumer confusion (they create a pivot instance but pass `DataTableState` keys). Mitigation: phase 4 adds a runtime check in the constructor that warns if the initial state shape is empty (a no-op, but it surfaces the misconfiguration to the consumer).
8. **Dev warning on inline aggregator leaks** — M4 only ships the main-thread engine, which accepts inline aggregators. The dev warning is forward-looking for M5 (worker/server). Mitigation: phase 6 implements `validatePivotQuery` that fires when inline forms are paired with `serialize: true`. The warning fires only when the consumer explicitly opts into serialization (M5 use case).
9. **Bundle size** — M4 adds ~10-15 kB min+gzip to the M3 baseline (~27 kB). Tree-shakeable subpath exports mitigate; consumers using only `createPivotTable` pay only the factory + state + engine code. Aggregator built-ins are individually importable from `@lynellf/tablekit-pivot/aggregators` if the consumer wants only one.
10. **`pnpm verify` exit on a new package** — The root `build` script must include `pnpm -F @lynellf/tablekit-pivot build`. Phase 1 wires this. A failure to include it would break CI; the explicit change is in the phase 1 verification checklist.
11. **`@lynellf/tablekit-react` peer dependency addition** — Adding `@lynellf/tablekit-pivot` as a peer dep to the react package may surface install-time warnings for consumers who don't install the pivot package. Mitigation: peer dep is **optional** (`peerDependenciesMeta.pivot.optional: true`). The react adapter imports from pivot only when `usePivotTable` is consumed (tree-shaking kicks in for DataTable-only usage).
12. **Concurrent state changes + engine compute storms** — Pivot has more state slices than DataTable. The React hook's `useEffect` debounces by running `engine.compute` only when one of `[pivot, pivotSorting, expanded, data]` changes. The `PivotResultCache` short-circuits when the query is unchanged.
13. **`PivotTable` not shareable with `DataTable` rendering** — `usePivotTable` returns a separate instance type; consumers who want both a pivot and a tabular view on the same data create two instances. This is by design per spec §4.1. The cross-instance data flow is consumer-owned (memoize the rows array).
14. **`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` strictness** — The pivot types use optional fields per spec (§9.1 `filters?`, §9.6 `grandTotalColumnPosition?`). `exactOptionalPropertyTypes` means `key?: T` ≠ `key: T | undefined`. Mitigation: phase 1 uses the `key?: T` convention consistently; tests assert optional absence vs. explicit `undefined`.
15. **Bundle / runtime cost of `nameOfAggregator`** — Reverse-lookup scans `customAggregators` then `builtInAggregators`. With ~5 built-ins + consumer customizations typically < 20, the scan is O(N) on a small map; acceptable.

Full risk table is in [`overview.md` §6](../m4-pivot-main-thread/overview.md).

---

## 6. Verification

After all 6 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                      # typecheck + lint + test + build — EXIT 0
pnpm test                                                         # M0/M1/M2/M3 (~380) + M4 (~150-210) tests, all green

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
pnpm --filter m4-pivot-main-thread-example build                 # EXIT 0
pnpm --filter m4-pivot-main-thread-example dev                   # http://localhost:5174

# Golden fixture tests
pnpm --filter @lynellf/tablekit-pivot test -- --run pivotQuery.golden

# Merge law property tests
pnpm --filter @lynellf/tablekit-pivot test -- --run mergeLaws

# §12 perf bench (advisory)
pnpm --filter @lynellf/tablekit-pivot bench main-thread.bench
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 7. M4 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **Pivot integration + a11y tree tests** | `packages/react/src/__integration__/pivot-basic.test.tsx` + `pivot-treegrid-a11y.test.tsx` + `pivot-keyboard.test.tsx` render the prescribed treegrid DOM shape; `validateGridStructure` (extended for treegrid in phase 5) is called after render and asserts `{ valid: true }`. Integration tests cover row hierarchy, expansion, totals, sorting, announcer routing, and treegrid keyboard conformance (Right/Left on row-header). |
| **Sum-default verified** | `packages/pivot/src/__tests__/aggregators.test.ts` asserts that omitting `aggregator` from a `MeasureDef` defaults to `'sum'`. `packages/pivot/src/__tests__/engine.test.ts` runs the engine on a small dataset with two measures (one explicit `sum`, one omitted) and asserts both produce identical results. |
| **§9.5 lazy expansion (memory stays proportional to what's visible)** | `packages/pivot/src/__tests__/lazyExpansion.test.ts` runs `compute(q, ctx)` with `expandedPaths = []` on a 100k-row dataset; asserts the result has only level-0 nodes materialized (no children). `computeChildren(path, q, ctx)` is then called for each top-level path and the children are materialized on demand. Memory usage is asserted via `JSON.stringify(result).length` (rough proxy; full memory measurement is out of scope for M4). |
| **Totals via `merge`** | `packages/pivot/src/__tests__/totals.test.ts` asserts grand-total row is computed by `merge`ing all level-0 row accumulators (not by re-scanning). `merge` law property tests in `mergeLaws.test.ts` cover all built-ins. |
| **§9.7 pivot sorting** | `packages/pivot/src/__tests__/pivotSorting.test.ts` covers sort-by-label (using field `sortComparator`) and sort-by-measure (under a specific column path). Asserts ordering is correct at each level independently. |
| **Treegrid accessibility** | `validateGridStructure` extended (phase 5) to check `aria-expanded` on rows with children, `aria-level` monotonicity, `role="rowheader"` ownership. Integration tests assert the DOM shape. |

---

## 8. Out-of-scope reminder

M4 does **not** ship the worker engine, server engine, subtotals, full announcer polish, screen-reader manual matrix, `validateGridStructure` CLI / layered diagnostics, `tabBehavior` option, split-pane recipe, `rowSelection`, state persistence helper, global quick filter, column auto-fit, or hard-gating behind `allowWithinPageOperations`. These are explicit non-goals per spec §9, §14, §15, and §16. A reviewer should flag any phase file that includes M5+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D8** in [`overview.md`](../m4-pivot-main-thread/overview.md) — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D4 (engine contract vs. implementation), D5 (subtotals deferral), and D6 (lazy expansion semantics).
2. **§4 architecture overview** — confirm the new `@lynellf/tablekit-pivot` package mirrors M2/M3 conventions (subpath exports, subpath build runner, peer dep on core). Confirm the generic widening of M0 state helpers (§4.2) is signature-compatible.
3. **Phase 1 (package scaffold + types)** — `Aggregator` interface shape; `PivotTableState` slice layout; `RowPathKey` / `FieldValue` / `LeafColumnId` / `MeasureId` type aliases; generic widening of `applySliceChange` / `mergeInitialState`.
4. **Phase 2 (aggregator registry + built-ins)** — `sum` / `count` / `min` / `max` / `avg` semantics; `avg` as a mergeable `{sum, count}` pair (with `finalize(acc) => acc.sum / acc.count`); property test methodology (seeded RNG, NaN exclusion); `nameOfAggregator` reverse lookup.
5. **Phase 3 (engine + result model + lazy expansion)** — `PivotResult` shape; column hierarchy + `leafColumns` flattening (including totals column position); row tree construction with lazy expansion (`expandedPaths` controls enumeration); pivot sorting application; totals via `merge`.
6. **Phase 4 (factory + state + prop getters)** — `createPivotTable` controlled-slice machinery; treegrid prop getters (`getRowProps` with `aria-expanded` / `aria-level` / `aria-setsize` / `aria-posinset`); `getToggleExpandedProps`; `getFooterProps` (grand-total row); `getTotalsColumnProps` (grand-total column).
7. **Phase 5 (React hook + treegrid a11y)** — `usePivotTable` hook mirroring `useDataTable`; treegrid keyboard additions (Right/Left on row-header); `validateGridStructure` treegrid extensions (additive rules); announcer message routing.
8. **Phase 6 (reference app + integration + api-freeze)** — Vite app demonstrating row hierarchy + expansion + totals + sorting + perf badge; serialization golden fixtures for `PivotQuery`; `api-freeze.md` completeness.
9. **§6 risks** — especially generic widening of M0 helpers (R1), treegrid keyboard correctness (R4), aggregator merge law NaN handling (R6), and the new package's impact on `pnpm verify` (R10) and the react package's peer deps (R11).

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).