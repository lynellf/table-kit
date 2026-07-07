# Phase 5 — AG-Grid Pivot

**Phase:** 5 of 6
**Goal:** Produce the SKILL.md + guide.md pair for AG-Grid Pivot (`pivotMode`) mapping onto `@lynellf/tablekit-pivot`.
**Status:** Draft v1 for review
**Depends on:** Phase 1 (shared template + smoke test), Phase 3 (proven format on Webix Pivot; this phase reuses the same four concept-table groups).

---

## 1. What this phase produces

1. `docs/guides/ag-grid-pivot/SKILL.md` — agent-skill frontmatter + orientation.
2. `docs/guides/ag-grid-pivot/guide.md` — recipe-style concept map (no wiring code) covering AG-Grid's `pivotMode` and pivot-related features as of AG-Grid v32+.

After this phase, the four Phase 1 smoke-test target describe blocks all pass; `pnpm verify` is green by the end of Phase 6.

## 2. SKILL.md outline

```markdown
---
name: ag-grid-pivot
description: Map AG-Grid Pivot feature surface (pivotMode) onto @lynellf/tablekit-pivot. Use when an existing AG-Grid pivot integration is being migrated, when an AG-Grid pivot feature request needs evaluation against table-kit's pivot primitive, or when reviewing AG-Grid-pivot-shaped requirements against the v1.0 API.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: ag-grid-pivot
tablekit_packages:
  - @lynellf/tablekit-pivot
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---

# AG-Grid Pivot — table-kit concept map

AG-Grid Enterprise exposes a `pivotMode` that converts the grid into a hierarchical aggregation view with row/column axes, value columns, and customizable aggregations. table-kit v1.0 ships `@lynellf/tablekit-pivot` as a framework-free primitive plus a React adapter (`usePivotTable`) that emits the same ARIA treegrid pattern. This skill maps AG-Grid's pivot features onto the v1.0 surface. The DataTable variant of AG-Grid is a separate skill: `./../ag-grid-datagrid/SKILL.md`.

## When to use this skill

- "Migrate this AG-Grid pivot to table-kit" — start by reading `./guide.md`, then plan the migration around the `PivotConfig` shape in §"Pivot configuration".
- "Can table-kit pivot do X?" — check the concept map first; many AG-Grid pivot features map onto `PivotConfig`, `MeasureDef`, and `TotalsConfig`.
- "Review AG-Grid-pivot-shaped requirements against table-kit v1.0" — use the "no v1.0 analog" section to flag gaps (notably subtotal rows per level and group-total row).

## How to use it

1. Read `./guide.md` for the full concept map.
2. For wiring patterns (treegrid a11y, sticky pinning, virtualization), follow `docs/recipes/` and the pivot-specific integration tests under `packages/react/src/__integration__/pivot-*.test.tsx`.
3. The DataTable variant of AG-Grid (without `pivotMode`) is a separate skill: `./../ag-grid-datagrid/SKILL.md`.

## Out of scope

- Wiring code (this skill is a concept map, not an integration tutorial).
- AG-Grid Enterprise features that table-kit has no analog for (e.g., Range Selection on pivot cells).
- Styling/theming — table-kit ships no CSS.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/initial-spec.md` §9 (PivotTable specification)
- `./../ag-grid-datagrid/SKILL.md` (AG-Grid DataGrid variant — pre-pivot state)
- `./../webix-pivot/SKILL.md` (Webix Pivot variant — overlapping features, different vocabulary)
```

## 3. guide.md outline

### 3.1 Top

```markdown
# AG-Grid Pivot → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

AG-Grid's `pivotMode` toggles hierarchical aggregation in-place; `pivotResultFields` declares the row axes, `aggFunc` declares the measure, `pivotColumnGroupTotals` / `pivotRowTotals` control totals placement, `aggFuncs` registers custom aggregators, and `processPivotResultColDef` lets consumers override the generated column definitions. table-kit v1.0 maps these onto `PivotConfig` (`rows`, `columns`, `measures`), `MeasureDef` (`aggregator`), `TotalsConfig`, `registerAggregator`, and consumer-rendered `header` / `cell` slots. Subtotal rows per group level (`pivotTotals`) are **not** in v1.0 (deferred to v1.5). Where table-kit is richer: mergeable reducer aggregators that survive worker/server boundaries (P3), lazy expansion via `RowPathKey` + `expandedPaths`, ARIA treegrid a11y, and an engine-contract seam that lets the same `usePivotTable` instance switch between main-thread, worker, and server engines.
```

### 3.2 Concept → feature table (group: Data & schema)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `rowData: T[]` | `usePivotTable({ data })` (or `createPivotTable({ data })`) | full | Same shape as AG-Grid's rowData. |
| `getRowId: (params) => string` | `getRowId?: (row, index) => string` | full | Required for stable pivot tree identity. |
| Pivot mode trigger (`pivotMode: true` on the grid) | `usePivotTable` (separate instance from `useDataTable`) | full | Conceptually equivalent: a pivot instance is a separate render path. table-kit doesn't toggle in-place; the consumer chooses which hook to use. |
| `pivotResultFields: string[]` (declared row axes) | `PivotConfig.rows: FieldRef[]` | full | Order in the array = row-hierarchy order (outermost first). |
| `aggFunc: 'sum' \| 'avg' \| 'count' \| ...` (per-value-column default) | `MeasureDef.aggregator: string` (default `'sum'`) | full | Built-in registry: `sum`, `count`, `min`, `max`, `avg`. |
| `aggFuncs: { myAvg: (params) => ... }` (custom aggregators) | `registerAggregator('myAvg', { init, accumulate, merge, finalize? })` | full | Spec §9.2; `merge` is required for worker/server. |
| `getServerSideGroupLevelParams` (server pivot) | `engine?: AggregationEngine` (consumer-implemented server engine) | partial | M5 ships worker engine; server engine is consumer's implementation against the engine contract. |
| `serverSideEnableClientSideSort: true` | consumer's `AggregationEngine` decides | full | Engine owns the sort; consumer wires whether the server pre-sorts. |
| `treeData: true` + `getDataPath: (data) => string[]` | not applicable (pivot is the equivalent) | none | Pivot's tree is driven by `PivotConfig.rows`; if you need arbitrary-tree rendering, use pivot with a single-row axis. |

### 3.3 Concept → feature table (group: Pivot configuration)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Drag a column to "Row Groups" / "Column Labels" / "Values" panel | consumer updates `PivotConfig` via `pivot.setPivot(updater)` | full | Spec §9.1: `pivot` is a normal controlled/uncontrolled state slice. |
| Field reference (column id) | `FieldRef = string \| { field, accessor?, label?, sortComparator? }` | full | Inline `accessor` is main-thread only; registry names for worker/server (P3). |
| `colDef.pivot: true` / `enablePivot: true` | consumer wires (which columns are pivot-eligible) | partial | The pivot config is a separate field; consumers maintain the list of pivot-eligible columns in their own state. |
| `processPivotResultColDef: (colDef) => colDef` (override generated col def) | consumer renders the generated `PivotLeafColumn` / `PivotColumnNode` via `header` / `cell` render slots | full | Engine emits the result; consumer's render slot applies overrides. |
| Value column label | `MeasureDef.label?: unknown` (opaque render slot) | full | |
| Value column format (`valueFormatter` on the result col def) | `MeasureDef.format?: string` (opaque hint) + consumer's `cell` render slot | full | Engine emits `format` opaquely; consumer applies formatting in render slot. |
| `pivotComparator: (valueA, valueB) => number` | `FieldRef.sortComparator?: string` (registry name) + custom `registerSortingFn` | full | Built-in comparators via the sorting-fn registry. |
| `getGroupRowAgg: (params) => object` (custom group aggregation) | `registerAggregator` + `MeasureDef.aggregator` | full | Same mechanism. |
| `processRowGroupCallback: (params) => params` (modify generated row group) | consumer renders the `PivotRowNode` row-header cell via `rowHeader` render slot | full | Engine emits the row; consumer's render slot applies overrides. |

### 3.4 Concept → feature table (group: Aggregation & totals)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `pivotColumnGroupTotals: 'before' \| 'after'` | `TotalsConfig.grandTotalColumnPosition?: 'start' \| 'end'` (default `'end'`) | full | |
| `pivotRowTotals: 'before' \| 'after'` | none (totals row is footer-anchored) | partial | table-kit's grand-total row is in the footer rowgroup (after all data rows). AG-Grid's `pivotRowTotals` allows "before"; the analog is consumer-side row reordering. |
| `pivotTotals: true` (per-level subtotal rows) | `TotalsConfig.subtotals?: 'none' \| 'perLevel'` (v1.0 honors `'none'` only; `'perLevel'` is v1.5) | partial | Same caveat as Webix Pivot — the type accepts `'perLevel'` but the engine honors only `'none'` until v1.5. |
| `grandTotalRow: true` (footer with all rows aggregated) | `TotalsConfig.grandTotalRow?: boolean` (default `true`) | full | Rendered in the footer rowgroup. |
| `grandTotalColumn: true` (per-row totals across the column dimension) | `TotalsConfig.grandTotalColumn?: boolean` (default `true`) | full | Appends per-measure leaf columns; right-pinned by default. |
| `groupTotalRow: (params) => ...` (override group-total rendering) | consumer renders the totals row | full | Same as the regular totals customization. |
| `aggFunc: 'sum' \| 'avg'` per value column | `MeasureDef.aggregator: string` | full | |
| `getValue: (node) => any` (custom value retrieval for non-leaf nodes) | consumer renders via `rowHeader` / `cell` slots | full | Engine emits finalized values; consumer renders. |
| Aggregation over filtered rows | pre-aggregation `PivotFilter[]` | full | Spec §9.1; declarative / inline / registry-name shapes. |

### 3.5 Concept → feature table (group: Expansion, sorting & treegrid)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `expandablePivotGroup: true` (allow expanding/collapsing pivot groups) | `expanded: Record<RowPathKey, boolean>` slice + `toggleExpanded(path)` | full | Always-on for pivot rows that have children; spec §9.5. |
| Initial expansion state | `initialState.expanded` (or `state.expanded` for controlled) | full | |
| `groupDefaultExpanded: -1` (all groups expanded by default) | consumer pre-populates `expanded` with all current `RowPathKey`s | partial | table-kit doesn't expose a "default expand all" option; consumers compute the set. |
| `isGroupOpenByDefault: (params) => boolean` | consumer pre-populates `expanded` per the predicate | full | Same mechanism. |
| `onCellKeyDown` / keyboard expansion | `usePivotKeyboardNav()` + `resolveTreegridKeyAction` / `applyTreegridAction` | full | APG treegrid keys per spec §7.5. |
| `groupDisplayType: 'singleColumn'` (one column with all groups) | consumer renders the `PivotRowNode.label` + level via the row-header cell | full | Engine returns a tree; consumer flattens as needed. |
| `groupDisplayType: 'multipleColumns'` (one column per row axis) | consumer renders one row-header cell per `rows` field | full | Same. |
| `groupDisplayType: 'groupRow'` (a separate row above each group) | consumer composes rows + row-header cells | full | Same. |
| `groupDisplayType: 'custom'` (custom group rendering) | consumer composes freely via `rowHeader` / `cell` render slots | full | Same. |
| `autoGroupColumnDef: {...}` (configure the auto-generated group column) | consumer renders the row-header cell with the desired shape | full | Engine emits `PivotRowNode.label` + `level`; consumer renders. |
| `getDataPath: (data) => string[]` (path retrieval for tree data) | `RowPathKey` (engine-emitted serialized path) | full | `RowPathKey` is identical for the same path on every compute. |
| `treeDataChildrenField: 'children'` | not applicable (pivot tree is row-axis-driven) | none | |
| Treegrid a11y | `getGridProps()` emits `role="treegrid"`; rows carry `aria-expanded` + `aria-level` | full | Spec §9.8. |
| `tabBehavior: 'cells'` | `tabBehavior?: 'cells'` (opt-in on `usePivotTable`) | partial | M6 phase 2; same `'exit'`/`'cells'` modes as `useDataTable`. |
| Empty / no-data state | consumer renders | none | Engine returns empty `rowRoot`; consumer renders an empty-state row. |
| Loading state (server expansion) | `childState: 'loading'` on `PivotRowNode` + `aria-busy="true"` on row | full | Spec §9.5. |
| Error state (server expansion) | `childState: 'error'` + `node.error` + `retryChildren(path)` helper | full | Spec §9.5. |
| Announcement of expansion / sort / totals | `messages?: Partial<MessagesMap>` on `usePivotTable` + helpers `announceExpansion`, `announceSorting`, `announceTotals` | full | i18n. |
| `onColumnRowGroupChanged`, `onColumnPivotChanged`, `onColumnValueChanged` (drag events) | `pivot.setPivot(updater)` + `pivot.subscribe(...)` | full | Engine emits on every `pivot` change. |

### 3.6 Where AG-Grid Pivot has no v1.0 analog

- **Subtotal rows per group level** (`pivotTotals: true`) — type accepts `'perLevel'` but engine honors only `'none'` until v1.5 (`api-freeze.md` §7).
- **`pivotRowTotals: 'before'`** — table-kit's grand-total row is footer-anchored; AG-Grid allows "before" placement.
- **Range Selection on pivot cells** (`enableRangeSelection: true`) — Enterprise-only and out of scope.
- **In-place pivot mode toggle** (`pivotMode: true` flips a `useDataTable` into pivot mode) — table-kit uses a separate `usePivotTable` instance. The mapping is equivalent but the API surface is separate.
- **`processPivotResultColDef` runtime override** — engine emits the result; consumer's render slot applies overrides. (This is a partial mapping; AG-Grid's runtime hook is more dynamic.)
- **`getDataPath` arbitrary-tree rendering** — pivot's tree is row-axis-driven; arbitrary-tree data should be flattened into a pivot config with a single row axis.
- **Group-level column totals (`pivotColumnGroupTotals: 'before'`)** — supported via `TotalsConfig.grandTotalColumnPosition: 'start'`. Note: this only moves the **grand-total** column, not per-group totals (which are v1.5).

### 3.7 Where table-kit v1.0 is richer than AG-Grid

- **Mergeable reducer aggregators** — every `Aggregator<TIn, TAcc, TOut>` requires `merge(a, b)` so a worker can aggregate chunks in parallel and a server can return partial accumulators that still roll up correctly. Spec §9.2; P3 cross-boundary contract.
- **Lazy expansion via `RowPathKey`** — `expandedPaths` lets the main-thread and worker engines aggregate unexpanded subtrees but skip enumeration; expansion is instant and memory stays proportional to what's visible. Spec §9.5.
- **Engine-contract seam** — `AggregationEngine.compute(q, ctx)` is the only surface; switching engines is per-instance and hot-swappable. AG-Grid has client-side / server-side row models but no equivalent per-instance engine swap for pivot.
- **Worker engine** — `createWorkerEngine({ createWorker })` from `@lynellf/tablekit-worker` ships in v1.0; subsequent `compute` calls send only the serialized `PivotQuery`, so re-pivoting never re-ships data.
- **ARIA treegrid a11y with roving `tabindex`** — full WAI-ARIA APG treegrid pattern + i18n announcer. Spec §9.8 + M6 phase 1.
- **Registries for cross-boundary serialization** — aggregators and sort comparators are referenced by name when crossing worker/server boundaries (P3).
- **Stable identity everywhere** — `RowPathKey` is identical for the same path on every compute, making controlled `expanded` state coherent with server expansion.

### 3.8 See also

- `./../webix-pivot/guide.md` — Webix Pivot mapping (overlapping features, different vocabulary).
- `./../ag-grid-datagrid/SKILL.md` — AG-Grid DataGrid variant (pre-pivot state; non-pivot features like `editable` apply only here).
- `docs/m6-hardening/api-freeze.md` — v1.0 contract.
- `docs/initial-spec.md` §9 (PivotTable specification).
- `packages/pivot/src/types.ts` — full type surface for `PivotConfig`, `MeasureDef`, `PivotFilter`, `TotalsConfig`, `PivotSortingState`, `Aggregator`, `AggregationEngine`.

### 3.9 Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-pivot@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` §9 (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)

## 4. Acceptance criteria

- [ ] `docs/guides/ag-grid-pivot/SKILL.md` exists, is non-empty, has all 5 required frontmatter keys.
- [ ] `docs/guides/ag-grid-pivot/guide.md` exists, is non-empty, has all 5 required section headers, and cites `docs/m6-hardening/api-freeze.md`.
- [ ] The four concept-table groups (Data & schema / Pivot configuration / Aggregation & totals / Expansion, sorting & treegrid) each have at least one row.
- [ ] "Where the target has no v1.0 analog" section names at least: subtotal rows per level (`pivotTotals: true` is v1.5), `pivotRowTotals: 'before'`, in-place `pivotMode` toggle.
- [ ] "Where table-kit v1.0 is richer" section names at least: mergeable reducer aggregators, lazy expansion via `RowPathKey`, engine-contract seam, worker engine.
- [ ] The Phase 1 smoke test passes for this target's describe block.

## 5. Verification

```bash
# 1. Files exist
test -s docs/guides/ag-grid-pivot/SKILL.md
test -s docs/guides/ag-grid-pivot/guide.md

# 2. Frontmatter keys
grep -q '^name:'                docs/guides/ag-grid-pivot/SKILL.md
grep -q '^description:'         docs/guides/ag-grid-pivot/SKILL.md
grep -q '^verified_against:'    docs/guides/ag-grid-pivot/SKILL.md
grep -q '^target:'              docs/guides/ag-grid-pivot/SKILL.md
grep -q '^companion_guide:'     docs/guides/ag-grid-pivot/SKILL.md

# 3. Section headers + verified-against footer
grep -q '## Mapping at a glance'               docs/guides/ag-grid-pivot/guide.md
grep -q '## Concept → feature table'          docs/guides/ag-grid-pivot/guide.md
grep -q '## Where the target has no v1.0 analog' docs/guides/ag-grid-pivot/guide.md
grep -q '## Where table-kit v1.0 is richer'   docs/guides/ag-grid-pivot/guide.md
grep -q '## Verified against'                 docs/guides/ag-grid-pivot/guide.md
grep -q 'docs/m6-hardening/api-freeze.md'     docs/guides/ag-grid-pivot/guide.md

# 4. The smoke test passes for all four targets
pnpm test packages/core/src/__tests__/guides.test.ts 2>&1 | tail -20
# Expected: all four describe blocks pass. (Phase 6 still needs to land for the full `pnpm verify` green.)
```

## 6. Risks

- **Subtotal rows caveat.** Same as Phase 3: `TotalsConfig.subtotals: 'perLevel'` is in the type but v1.0 honors only `'none'`. The guide documents this in both the concept table (`partial` coverage) and the "no v1.0 analog" section.
- **In-place `pivotMode` toggle.** AG-Grid users often toggle pivot mode at runtime; table-kit uses a separate `usePivotTable` instance. The mapping is conceptually equivalent but the API surface is separate. The guide documents this in the "no v1.0 analog" section so reviewers don't assume runtime toggle parity.
- **`pivotRowTotals: 'before'`.** AG-Grid allows totals row before data; table-kit's totals row is footer-anchored. The guide documents this as `partial` coverage.
- **AG-Grid Enterprise.** All pivot features are Enterprise-tier. The guide names features without Enterprise tags; consumers verify licensing themselves.

## 7. Out of scope for this phase

- Index finalization in `docs/guides/README.md` (Phase 6).
- Root `README.md` cross-link addition (Phase 6).
- Any source code change in `packages/*/src/`.