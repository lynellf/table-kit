# Phase 3 — Webix Pivot

**Phase:** 3 of 6
**Goal:** Produce the SKILL.md + guide.md pair for Webix Pivot mapping onto `@lynellf/tablekit-pivot`.
**Status:** Draft v1 for review
**Depends on:** Phase 1 (shared template + smoke test), Phase 2 (proves the format works on the DataTable target).

---

## 1. What this phase produces

1. `docs/guides/webix-pivot/SKILL.md` — agent-skill frontmatter + orientation.
2. `docs/guides/webix-pivot/guide.md` — recipe-style concept map (no wiring code) covering Webix Pivot's feature surface as of Webix 7+/8+.

After this phase, `pnpm test` should report 5 fewer failures for the `webix-pivot` describe block.

## 2. SKILL.md outline

```markdown
---
name: webix-pivot
description: Map Webix Pivot feature surface onto @lynellf/tablekit-pivot. Use when a Webix Pivot integration is being migrated, when a Webix Pivot feature request needs evaluation against table-kit's pivot primitive, or when reviewing Webix-Pivot-shaped requirements against the v1.0 API.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: webix-pivot
tablekit_packages:
  - @lynellf/tablekit-pivot
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---

# Webix Pivot — table-kit concept map

Webix Pivot is a hierarchical aggregation grid with rows/columns axes, pre-aggregation filters, value formatting, expansion, and grand totals. table-kit v1.0 ships `@lynellf/tablekit-pivot` as a framework-free primitive plus a React adapter (`usePivotTable`) that emits the same ARIA treegrid pattern. This skill maps Webix Pivot features onto the v1.0 surface.

## When to use this skill

- "Migrate this Webix Pivot to table-kit" — start by reading `./guide.md`, then plan the migration around the `PivotConfig` shape in §"Pivot configuration".
- "Can table-kit pivot do X?" — check the concept map first; many Webix Pivot features map onto `PivotConfig`, `MeasureDef`, and `TotalsConfig`.
- "Review Webix-Pivot-shaped requirements against table-kit v1.0" — use the "no v1.0 analog" section to flag gaps (notably subtotal rows per level).

## How to use it

1. Read `./guide.md` for the full concept map.
2. For wiring patterns (sticky pinning, virtualization, treegrid a11y), follow `docs/recipes/` and the pivot-specific integration tests under `packages/react/src/__integration__/pivot-*.test.tsx`.
3. The DataTable variant of Webix is a separate skill: `./../webix-datagrid/SKILL.md`.

## Out of scope

- Wiring code (this skill is a concept map, not an integration tutorial).
- Webix Pro features that table-kit has no analog for (Webix Pivot's UI extras).
- Styling/theming — table-kit ships no CSS.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/initial-spec.md` §9 (PivotTable specification)
- `./../webix-datagrid/SKILL.md` (Webix DataTable variant)
- `./../ag-grid-pivot/SKILL.md` (AG-Grid Pivot variant — overlapping features, different vocabulary)
```

## 3. guide.md outline

### 3.1 Top

```markdown
# Webix Pivot → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

Webix Pivot exposes a single `structure: { rows, columns, values, filters }` object plus `readonly`, `footer`, `totalColumn`, `map` (value formatter), sort, open/close, lazy load, and `onAfterRefresh`. table-kit v1.0 maps `structure` directly onto `PivotConfig` (`rows: FieldRef[]`, `columns: FieldRef[]`, `measures: MeasureDef[]`, `filters: PivotFilter[]`, `totals: TotalsConfig`); aggregation is by reducer-shaped `Aggregator` with required `merge`; expansion is driven by `expanded: Record<RowPathKey, boolean>` with stable `RowPathKey` ids; subtotal rows per level are **not** in v1.0 (deferred to v1.5). Where table-kit is richer: mergeable reducer aggregators that survive worker/server boundaries (P3), lazy expansion via `RowPathKey` + `expandedPaths`, ARIA treegrid a11y with roving `tabindex`.
```

### 3.2 Concept → feature table (group: Data & schema)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `data: { ... }` (raw dataset) | `data: TRow[]` on `PivotTableOptions` | full | Required; engine reads the dataset. |
| `datatype: "json"` / `"csv"` | none | none | Webix auto-parses; table-kit takes pre-parsed `TRow[]`. |
| `url: "..."` (remote data) | none directly; `engine?: AggregationEngine` (M5 server engine) | partial | Server engine is the consumer's responsibility; the engine contract is the seam. M5 ships worker engine; server engine is a consumer implementation. |
| `id: "..."` (row id) | `getRowId?: (row, index) => string` | full | Required for stable pivot tree identity. |
| `readonly: true` | (always read-only in v1.0) | full | v1.0 has no cell editing anywhere. |

### 3.3 Concept → feature table (group: Pivot configuration)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `structure.rows: [...]` (row axes, outermost first) | `PivotConfig.rows: FieldRef[]` | full | Order in the array is the row-hierarchy order (outermost first). |
| `structure.columns: [...]` (column axes) | `PivotConfig.columns: FieldRef[]` | full | Same ordering rule. |
| `structure.values: [...]` (measures) | `PivotConfig.measures: MeasureDef[]` | full | One `MeasureDef` per measure; `aggregator: 'sum'` is the default. |
| `structure.filters: [...]` (pre-aggregation filters) | `PivotConfig.filters: PivotFilter[]` | full | Three shapes per spec §9.1: declarative (`field/op/value`), inline predicate (main-thread only), or registry-name predicate (worker/server). |
| Field reference (string or object) | `FieldRef = string \| { field, accessor?, label?, sortComparator? }` | full | Inline `accessor` is main-thread only; registry names for worker/server (P3). |
| Value formatter / `map: { ... }` | `MeasureDef.format?: string` (opaque hint) + `MeasureDef.label?: unknown` (render slot) | partial | The engine emits `format` and `label` opaquely; the consumer's `cell` render slot applies formatting. |
| Custom aggregator | `registerAggregator('name', { init, accumulate, merge, finalize? })` | full | Spec §9.2; merge is required for worker/server. Built-ins: `sum`, `count`, `min`, `max`, `avg`. |
| `groupBy: "month"` (date bucketing) | consumer-side (precompute bucketed field) | none | Webix handles bucketing natively; table-kit requires the source field to be pre-bucketed. |
| Date / numeric ranges on a field | consumer-side (precompute bin) | none | Same caveat as `groupBy`. |

### 3.4 Concept → feature table (group: Aggregation & totals)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `footer: true` (grand-total row) | `TotalsConfig.grandTotalRow?: boolean` (default `true`) | full | Rendered in the footer rowgroup; carries `aria-rowindex` last and `data-total="row"`. |
| `totalColumn: true` (grand-total column) | `TotalsConfig.grandTotalColumn?: boolean` (default `true`) | full | Appends per-measure leaf columns computed from `rowTotals`; right-pinned by default. |
| `totalColumnPosition: "start" \| "end"` | `TotalsConfig.grandTotalColumnPosition?: 'start' \| 'end'` (default `'end'`) | full | |
| `subtotals: true` (per-level subtotal rows) | `TotalsConfig.subtotals?: 'none' \| 'perLevel'` (v1.0 honors `'none'` only; `'perLevel'` is v1.5) | partial | `subtotals: 'perLevel'` is in the type but engine honors only `'none'` until v1.5. |
| Grand-total row sticky to bottom | consumer-side (`position: sticky; bottom: 0`) | full | Footer rowgroup is outside row virtualization; consumer applies sticky bottom per spec §9.6 recipe. |
| Grand-total row announced | `announceTotals(...)` from `pivotTable/announcer` | full | Default English via `messages`. |
| Cell value formatter (`map`) | `MeasureDef.format` + consumer's render slot | full | Engine emits `format` opaquely. |
| `value: webix.i18n.numberFormat(...)` per value type | consumer-side | full | Same as above — applied in render slot. |
| Multiple aggregation functions per measure | multiple `MeasureDef` rows with different `aggregator` | full | E.g., `sales_sum` + `sales_avg` = two `MeasureDef`s with `aggregator: 'sum'` / `'avg'`. |

### 3.5 Concept → feature table (group: Expansion, sorting & treegrid)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `open: ["west"]` (initial expanded paths) | `initialState.expanded: Record<RowPathKey, boolean>` or `state.expanded` | full | `RowPathKey` is serialized path form (e.g., `'["West","Q3"]'`). |
| `on: { onAfterOpen, onAfterClose }` | `pivot.toggleExpanded(path)` + `pivot.subscribe(...)` for change observation | full | Engine emits on each toggle. |
| `onAfterRefresh` | `pivot.subscribe(listener)` | full | Fires after any compute. |
| `sort: "string"` / `"int"` (per-field sort comparator) | `FieldRef.sortComparator?: string` (registry name) + custom `registerSortingFn` | full | Built-in comparators via the sorting-fn registry; P3 names for worker/server. |
| Group ordering by measure | `PivotSortingState` `{ level, by: 'measure', measureId, desc }` | full | Optional `columnPath` to sort under a specific column path. |
| Group ordering by label (default) | `PivotSortingState` `{ level, by: 'label', desc, comparator? }` | full | Default; uses field's `sortComparator`. |
| Lazy loading (server-side expansion) | `engine?: AggregationEngine` + `computeChildren(path, q, ctx)` for server engine | partial | M5 ships worker engine; server engine is consumer implementation. Worker engine uses `expandedPaths` to skip unexpanded subtrees. |
| Treegrid a11y | `getGridProps()` emits `role="treegrid"`; rows carry `aria-expanded` + `aria-level` | full | Spec §9.8; full APG treegrid pattern with roving `tabindex`. |
| Keyboard expansion (Right/Left on row-header) | `usePivotKeyboardNav()` + `resolveTreegridKeyAction` / `applyTreegridAction` | full | APG treegrid keys per spec §7.5. |
| `tabBehavior: 'cells'` | `tabBehavior?: 'cells'` (opt-in on `usePivotTable`) | partial | M6 phase 2; same `'exit'`/`'cells'` modes as `useDataTable`. |
| Empty / no-data state | consumer renders | none | Engine returns empty `rowRoot`; consumer renders an empty-state row. |
| Loading state (M5 server expansion) | `childState: 'loading'` on `PivotRowNode` + `aria-busy="true"` on row | full | Spec §9.5; main-thread engine never returns `'loading'`. |
| Error state (M5 server expansion) | `childState: 'error'` + `node.error` + `retryChildren(path)` helper | full | Spec §9.5. |
| Announcement of expansion / sort / totals | `messages?: Partial<MessagesMap>` on `usePivotTable` + helpers `announceExpansion`, `announceSorting`, `announceTotals` | full | i18n; per-key overrides. |

### 3.6 Where Webix Pivot has no v1.0 analog

- **Subtotal rows per level** (`subtotals: true`) — type accepts `'perLevel'` but engine honors only `'none'` until v1.5 (`api-freeze.md` §7).
- **Date bucketing** (`groupBy: "month"`) — consumer precomputes bucketed field; engine doesn't infer bins.
- **Numeric ranges** (auto-bin continuous variables) — consumer precomputes bin; no native binning.
- **Custom map / value formatter on the Webix side** — engine emits `format` opaquely; consumer applies formatting in render slot. (This is a partial mapping, not a no-mapping.)
- **Webix-Pro UI extras** (Sparklines on pivot cells, drill-through to detail view) — out of scope.
- **Pivot chart integration** — out of scope.
- **Inline cell editing of pivot values** — v1.0 is read-only across the library.

### 3.7 Where table-kit v1.0 is richer than Webix Pivot

- **Mergeable reducer aggregators** — every `Aggregator<TIn, TAcc, TOut>` requires `merge(a, b)` so a worker can aggregate chunks in parallel and a server can return partial accumulators that still roll up correctly. Spec §9.2; P3 cross-boundary contract.
- **Lazy expansion via `RowPathKey`** — `expandedPaths` lets the main-thread and worker engines aggregate unexpanded subtrees but skip enumeration; expansion is instant and memory stays proportional to what's visible. Spec §9.5.
- **ARIA treegrid a11y with roving `tabindex`** — full WAI-ARIA APG treegrid pattern + i18n announcer. Spec §9.8 + M6 phase 1.
- **Worker engine** — `createWorkerEngine({ createWorker })` from `@lynellf/tablekit-worker` ships in v1.0 (M5); subsequent `compute` calls send only the serialized `PivotQuery`, so re-pivoting never re-ships data.
- **Engine contract as the seam** — `AggregationEngine.compute(q, ctx)` is the only surface; switching engines is per-instance and hot-swappable (`api-freeze.md` §4.3).
- **Registries for cross-boundary serialization** — aggregators and sort comparators are referenced by name when crossing worker/server boundaries (P3); inline functions only on main-thread engine.
- **Stable identity everywhere** — `RowPathKey` is identical for the same path on every compute (spec §9.1), making controlled `expanded` state coherent with server expansion.

### 3.8 See also

- `./../ag-grid-pivot/guide.md` — AG-Grid Pivot mapping (overlapping features, different vocabulary; AG-Grid's `pivotMode` is conceptually equivalent to a `usePivotTable` instance).
- `./../webix-datagrid/SKILL.md` — Webix DataTable variant.
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

- [ ] `docs/guides/webix-pivot/SKILL.md` exists, is non-empty, has all 5 required frontmatter keys.
- [ ] `docs/guides/webix-pivot/guide.md` exists, is non-empty, has all 5 required section headers, and cites `docs/m6-hardening/api-freeze.md`.
- [ ] The four concept-table groups (Data & schema / Pivot configuration / Aggregation & totals / Expansion, sorting & treegrid) each have at least one row.
- [ ] "Where the target has no v1.0 analog" section names at least: subtotal rows per level (`subtotals: 'perLevel'` is v1.5), date bucketing, numeric binning.
- [ ] "Where table-kit v1.0 is richer" section names at least: mergeable reducer aggregators, lazy expansion via `RowPathKey`, ARIA treegrid a11y, worker engine.
- [ ] The Phase 1 smoke test passes for this target's describe block.

## 5. Verification

```bash
# 1. Files exist
test -s docs/guides/webix-pivot/SKILL.md
test -s docs/guides/webix-pivot/guide.md

# 2. Frontmatter keys
grep -q '^name:'                docs/guides/webix-pivot/SKILL.md
grep -q '^description:'         docs/guides/webix-pivot/SKILL.md
grep -q '^verified_against:'    docs/guides/webix-pivot/SKILL.md
grep -q '^target:'              docs/guides/webix-pivot/SKILL.md
grep -q '^companion_guide:'     docs/guides/webix-pivot/SKILL.md

# 3. Section headers + verified-against footer
grep -q '## Mapping at a glance'               docs/guides/webix-pivot/guide.md
grep -q '## Concept → feature table'          docs/guides/webix-pivot/guide.md
grep -q '## Where the target has no v1.0 analog' docs/guides/webix-pivot/guide.md
grep -q '## Where table-kit v1.0 is richer'   docs/guides/webix-pivot/guide.md
grep -q '## Verified against'                 docs/guides/webix-pivot/guide.md
grep -q 'docs/m6-hardening/api-freeze.md'     docs/guides/webix-pivot/guide.md

# 4. The smoke test passes for this target
pnpm test packages/core/src/__tests__/guides.test.ts 2>&1 | grep -A2 webix-pivot | head -20
# Expected: webix-pivot describe block passes; the other 2 targets still fail.
```

## 6. Risks

- **Subtotal rows caveat.** `TotalsConfig.subtotals: 'perLevel'` is in the type but the v1.0 engine honors only `'none'`. The guide documents this in both the concept table (coverage: `partial`) and the "no v1.0 analog" section so reviewers don't assume v1.0 parity.
- **Webix Pivot's `map` formatter.** Webix exposes a `map: { 'sales:sum': webix.i18n.numberFormat(...) }` shape that the engine applies automatically. table-kit's analog is `MeasureDef.format?: string` (opaque hint) + consumer's render slot. The guide documents this as `partial` coverage, not full.
- **Date bucketing.** Webix Pivot's `groupBy: 'month'` is a common request; table-kit v1.0 requires pre-bucketing. The guide calls this out as a `none` row so consumers don't assume auto-binning.

## 7. Out of scope for this phase

- Writing the AG-Grid DataGrid or AG-Grid Pivot doc pairs (Phases 4, 5).
- Final cross-links from `docs/recipes/README.md` (Phase 6).
- Any source code change in `packages/*/src/`.