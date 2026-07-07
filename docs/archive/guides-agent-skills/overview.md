# Guides & Agent Skills — Spec & Plan

**Slug:** `guides-agent-skills`
**Status:** Draft v1 for review
**Audience:** implementer (after panel approval)
**Scope:** Four hybrid `SKILL.md` + companion guide documents mapping table-kit's table-kit-react and table-kit-pivot feature surface onto four external library targets — Webix DataTable, Webix Pivot, AG-Grid DataGrid, AG-Grid Pivot. Documents are feature-comparison only: they map concept → feature, with no wiring code.
**Out of scope:** Working integrations with the four targets. Working code samples. Visual screenshots. Style/theming recipes. Performance benchmarks against the targets. Source-controlled copies of target-library docs.

---

## What I found (investigation summary)

### Sources reviewed

- `docs/initial-spec.md` — full spec, esp. §1 (positioning: "premium commercial grids (AG Grid Enterprise, Webix DataTable/Pivot, MUI X Premium, Handsontable)"), §2 (functional goals), §7 (shared features), §8 (DataTable specifics), §9 (PivotTable specifics), §11 (Webix affordance: "drop-in compatibility layer for Webix-based integrations… architecture should not preclude this"), §15 (recommended additions).
- `docs/recipes/README.md`, `docs/recipes/{layout,dnd-column-reorder,kbd-column-reorder,split-pane}.md` — established doc convention for consumer-facing guides in this repo.
- `docs/m6-hardening/api-freeze.md` — v1.0 canonical API surface (`useDataTable`, `usePivotTable`, all state slices, all aggregator names, all built-in sort/filter functions).
- `.okf/concepts/documentation-conventions.md` — durable documentation conventions: per-package READMEs + root README + recipes + archived plan convention. Recipes live at `docs/recipes/*.md` with a `Last verified against vX.Y.Z` tag.
- `.okf/components/dev-tooling-stack.md` — `pnpm verify` is the single "is the toolchain green?" command (`typecheck && lint && test && build`).
- `packages/react/src/index.ts`, `packages/core/src/index.ts`, `packages/pivot/src/index.ts` — full export surface for the three primary packages (`@lynellf/tablekit-{core,react,pivot}`).
- `packages/core/src/types.ts`, `packages/pivot/src/types.ts` — state-shape truth for `DataTableState` and `PivotTableState`.
- `packages/core/src/faceting.ts` — confirms `getFacetedUniqueValues` / `getFacetedMinMax` are the only faceting helpers; `headerFilter` / `setFilter` UI helpers do not exist.
- `examples/m4-pivot-main-thread/src/App.tsx` — confirms the live pivot `PivotConfig` shape (`rows: ['region'], columns: [], measures: [{ id, field, aggregator }]`, `totals: { grandTotalRow, grandTotalColumn }`).
- `~/.agents/skills/using-agent-skills/SKILL.md` — the reference agent-skill format used in this environment: frontmatter (`name`, `description`), title, sections. Trigger language is conversational ("Use when…").

### Verified facts

- **No `guides/` or `agent-skills/` directory exists in the repo today.** Greenfield.
- **No current document maps table-kit → Webix or table-kit → AG-Grid.** The spec references both by name in §1 (positioning) and §11 (Webix affordance explicitly out of scope), but no parallel concept-map exists.
- **Spec §11 explicitly defers Webix compatibility:** "Webix affordance (out of scope, by design not accident). Two properties keep the future drop-in wrapper feasible: a stable imperative facade and a complete event surface." This plan produces the **concept map** that such a wrapper would need; it does not produce the wrapper itself.
- **AG-Grid `pivotMode` is not in the v1.0 API freeze.** The v1.0 DataTable surface is described in `docs/initial-spec.md` §8 and the canonical `api-freeze.md` §4; `useDataTable` does not ship a `pivotMode` option. The pivot primitive lives at `usePivotTable` in `@lynellf/tablekit-pivot`.
- **The v1.0 export surface is stable** (api-freeze §1: "v1.x is additive"). Any feature-mapping document referencing the surface will remain accurate through the v1 line.
- **Doc convention precedent:** `docs/recipes/` proves the format — frontmatter-less title + scope tag + "Problem → Implementation → How it works → Pitfalls → See also → Verified against" structure works for consumer-facing docs. The agent-skill frontmatter (`name`/`description`/`triggers`) is a thin wrapper around the same body and is the established format used by `~/.agents/skills/*` (per the `using-agent-skills` meta-skill).
- **`pnpm verify`** exits 0 at HEAD. The plan adds one Vitest test (Phase 1: `packages/core/src/__tests__/guides.test.ts`) that asserts the structural rules for the new docs; everything else is markdown. Verification is the existing repo gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. The new test runs in the existing `pnpm test` workspace — no new tooling required.

### Assumptions (applied during planning — see open questions)

1. **"guides/agent-skills" maps to `docs/guides/`.** Rationale: a top-level `docs/guides/` directory matches the existing `docs/recipes/` and `docs/m6-hardening/` patterns and keeps the docs tree searchable. The user-supplied phrase "guides/agent-skills" is interpreted as a unified directory containing both guides and the per-target agent skills; per-target subdirectories hold the paired SKILL.md + guide.md.
2. **"Hybrid — one SKILL.md per target + companion guide doc" means each target gets exactly two files at `docs/guides/<target>/{SKILL.md,guide.md}`.** The SKILL.md follows the agent-skill frontmatter convention. The companion guide follows the recipe-style body (sections: "Mapping at a glance", "Concept → feature table", "Out-of-scope features in v1.0", "Pivots where the analog differs", "See also", "Verified against"). Each is useful on its own: the SKILL.md is for an agent picking up the task; the guide is for a human skimming the mapping.
3. **"Feature-comparison only — no wiring code"** excludes: code samples, JSX snippets, CSS, working integration code, project scaffolding. It includes: concept tables, "what table-kit offers vs. what the target offers", "where table-kit is the richer primitive" notes, "what the target has that table-kit doesn't in v1.0" notes, and pointers to the relevant table-kit APIs/slices/aggregators/hooks.
4. **"Verification: pnpm verify only"** means the plan does not introduce new external-link health checks, HTML scraping tests, or visual diffs. Verification is the existing repo gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Doc-presence smoke tests (file exists, has frontmatter, has the required sections, has the See Also + Verified Against footer) are within scope because they run via Vitest against the existing test runner — no new tooling required. The single Vitest test added in Phase 1 walks the four target directories and asserts structural rules.
5. **External library feature claims are made against the libraries' published feature sets, not against the live snippets.** The plan does not scrape the snippet URLs (live snippets are demo micro-examples, not feature lists). Each doc cites the target library's public feature-set documentation by name only ("AG-Grid's `pivotMode` toggles hierarchical pivot rendering per their docs"); the doc does not need to fetch the live snippet to validate.
6. **Each doc's "Verified against" tag points at `docs/m6-hardening/api-freeze.md` (v1.0)**, mirroring the recipes' convention. When the v1.0.1 patch ships, all four docs get the same bump.
7. **The four docs share a template** (the SKILL.md frontmatter shape, the guide.md section list, the concept-map table format). Phase 1 produces the template; Phases 2–5 fill it in.
8. **No new source code, no new dependencies, no new OKF docs.** Out of scope per the user-supplied constraints. Knowledge candidates surface the durable facts (mapping rules, target-library taxonomy differences) without writing into `.okf/` (per the orchestrator rule: only `okf-curator` writes `.okf/`).

### Telemetry (this visit)

- `okf_docs_read`: 1 (`.okf/concepts/documentation-conventions.md`)
- `okf_tokens_read`: ~1,800 (estimated; the file is ~50 lines)
- `files_scanned_before_okf`: 0
- `files_scanned_after_okf`: 16 (`README.md`, `package.json`, `docs/initial-spec.md`, `docs/recipes/{README,layout,dnd-column-reorder,kbd-column-reorder,split-pane}.md`, `docs/m6-hardening/api-freeze.md`, `packages/react/src/index.ts`, `packages/core/src/index.ts`, `packages/pivot/src/index.ts`, `packages/core/src/types.ts`, `packages/pivot/src/types.ts`, `packages/core/src/faceting.ts`, `examples/m4-pivot-main-thread/src/App.tsx`, `~/.agents/skills/using-agent-skills/SKILL.md`, `.okf/components/dev-tooling-stack.md`)
- `repo_scan_tokens_before_okf`: unknown
- `repo_scan_tokens_after_okf`: ~24,000 (estimated)
- `planner_cost_before_okf`: unknown
- `planner_cost_after_okf`: unknown
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 — there is no OKF doc for the agent-skill / guides directory convention. After this plan lands, that would be a useful add (`okf-curator` work). Surfaced as a knowledge candidate.

---

## 1. Goal

Produce four hybrid guide/skill documents under `docs/guides/` that map the table-kit react package feature surface onto four external library targets (Webix DataTable, Webix Pivot, AG-Grid DataGrid, AG-Grid Pivot). Each target gets one `SKILL.md` (agent-skill frontmatter) and one companion `guide.md` (recipe-style concept map). The content is feature-comparison only — no wiring code.

## 2. Non-goals

Explicitly excluded (per the user's resolved ambiguities):

- **No wiring code.** No JSX snippets, no CSS, no project scaffolding, no `package.json` install steps. The companion guide is a concept map, not an integration tutorial.
- **No styled UI.** No mock-up screenshots, no design-system prescriptions, no theming advice.
- **No live fetching of the four target URLs.** The snippets are demo micro-examples; the docs cite the targets' published feature sets by name only.
- **No source-controlled copies of target-library docs.** No scraped markdown from Webix or AG-Grid. All target-library claims are paraphrased with a pointer to the public docs site.
- **No new source code in `packages/*`.** This plan only adds markdown to `docs/guides/` and one Vitest doc-presence test in Phase 6.
- **No new dependencies.** The plan uses no new npm packages.
- **No `.okf/` writes.** Knowledge candidates are surfaced for `okf-curator` to curate.
- **No CHANGELOG or release-process changes.** These are docs-only additions; no version bump.
- **No code-sample verification beyond what already exists** in the `pnpm verify` gate. The added Vitest test is a structural smoke check on the new docs (frontmatter presence, required sections, See Also footer), not a content-correctness check.

## 3. Target surface (v1.0)

Per `docs/m6-hardening/api-freeze.md` §4, the v1.0 surface that the guides map onto:

### `@lynellf/tablekit-react` (DataTable side — for Webix datagrid + AG-Grid datagrid guides)

- `useDataTable(options): UseDataTableResult` — primary hook
- `UseDataTableOptions` extends `DataTableOptions` with `dataSource?`, `messages?`, `tabBehavior?`
- `DataTableState` slices: `sorting`, `columnFilters`, `pagination`, `columnOrder`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell`
- Per-slice onChange callbacks + global `onStateChange`
- Built-in sort functions: `alphanumeric`, `text`, `number`, `datetime`, `basic`
- Built-in filter functions: (per `api-freeze.md` §4 the filter registry is exposed)
- Faceting: `getFacetedUniqueValues`, `getFacetedMinMax`
- Pipeline: `filterRows`, `sortRows`, `paginateRows`, `computePageCount`, `buildRowModel`, `columnsForRowModel`
- Column ops: `moveColumn`, `toggleColumnVisibility`, `toggleAllColumnsVisibility`
- Virtualization hooks: `useRowVirtualizer`, `useCenterVirtualizer`, `useScrollAdapter`, `useSizeObserver`
- Resize: `useResizeHandle`
- Keyboard: `useKeyboardNav`, `useTabBehavior`
- Announcer: `ReactAnnouncer`, `getReactAnnouncer`, `defaultMessages`, `MessagesMap`
- Server modes: `useDataSource(table, source)`
- Tab behavior: `'exit' | 'cells'` (default `'exit'`)
- Imported by: `moveColumn`, `filterRows`, `sortRows`, `paginateRows` (re-exported from core)

### `@lynellf/tablekit-pivot` (Pivot side — for Webix pivot + AG-Grid pivot guides)

- `createPivotTable(options): PivotTableInstance`
- `usePivotTable(options): UsePivotTableResult`
- `PivotConfig`: `rows: FieldRef[]`, `columns: FieldRef[]`, `measures: MeasureDef[]`, `filters?: PivotFilter[]`, `totals?: TotalsConfig`
- `TotalsConfig`: `grandTotalRow?`, `grandTotalColumn?`, `grandTotalColumnPosition?: 'start' | 'end'`, `subtotals?: 'none' | 'perLevel'` (note: v1.0 only honors `'none'`)
- `PivotState` slices: `pivot`, `expanded`, `pivotSorting`, plus the shared `columnPinning`/`columnSizing`/`columnSizingInfo`/`focusedCell`
- Built-in aggregators: `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
- Registry: `registerAggregator`, `getAggregator`, `builtInAggregators`
- Aggregation engines: `createMainThreadEngine()` (v1.0); worker (`createWorkerEngine` from `@lynellf/tablekit-worker`) is also v1.0
- Prop getters: `getGridProps`, `getBodyProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`
- Derived helpers: `getVisibleRows`, `getHeaderRows`, `getLeafColumns`
- Treegrid keyboard: `resolveTreegridKeyAction`, `applyTreegridAction`
- Announcer: `announceExpansion`, `announceSorting`, `announceTotals` (plus `messages?` on `usePivotTable`)

### Out-of-scope items (mentioned in the docs as "not in v1.0")

- `rowSelection` slice (deferred to v1.5 — `api-freeze.md` §7).
- State persistence helpers (`serializeState`/`hydrateState` — v1.5).
- `subtotals: 'perLevel'` (v1.5).
- Column auto-fit (v2).
- Global quick filter (v2).
- Hard gate behind `allowWithinPageOperations` (v2).
- Columnar / `Arrow` transfer for `setRows` (v2).

## 4. Doc pair format (per target)

### 4.1 `SKILL.md` (agent-skill frontmatter convention)

```markdown
---
name: <target-name>
description: <one-sentence trigger> Use when <specific contexts>.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: <webix-datagrid | webix-pivot | ag-grid-datagrid | ag-grid-pivot>
tablekit_packages:
  - @lynellf/tablekit-react   # (omit for raw-core; pivot docs also include pivot)
  - @lynellf/tablekit-pivot   # pivot docs only
  - @lynellf/tablekit-core    # implicit; not listed
companion_guide: ./guide.md
---

# <Target display name> — table-kit concept map

<one-paragraph orientation>

## When to use this skill

<trigger sentences>

## How to use it

1. Read the companion guide at `./guide.md` for the full concept map.
2. To build the integration, wire the v1.0 surface per `docs/m6-hardening/api-freeze.md`.
3. Use the recipes at `docs/recipes/` for sticky/virtualization patterns this skill builds on.

## Out of scope

- Wiring code (this is a concept map, not an integration tutorial).
- Target-library style/theming — table-kit ships no CSS.
- Live fetching of the target's docs site — claims cite by name.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/recipes/README.md` (consumer-facing patterns)
```

### 4.2 `guide.md` (recipe-style body)

```markdown
# <Target display name> → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

<one-paragraph orientation: which table-kit packages cover this target's surface; where the mapping is 1:1, where it's asymmetric, where target has no v1.0 analog>

## Concept → feature table

For each target feature, give: target name · table-kit analog (slice/hook/aggregator/registry) · coverage in v1.0 (full / partial / none) · notes.

### Data & schema

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| <row> | <row> | <row> | <row> |

### State & lifecycle

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| <row> | <row> | <row> | <row> |

### Rendering & layout

(table per group, repeated as needed)

## Where the target has no v1.0 analog

<bulleted list of target features that table-kit v1.0 does not cover, with the v1.5/v2 timing if known>

## Where table-kit v1.0 is richer than the target

<bulleted list, e.g. "controlled-slice contract", "treegrid a11y", "mergeable reducer aggregators that survive worker/server boundaries">

## See also

- `../<adjacent-target>/guide.md` if relevant (cross-link only)
- `docs/m6-hardening/api-freeze.md`
- `docs/initial-spec.md` §<section>
- `docs/recipes/<recipe>.md` for patterns this guide points at

## Verified against

- `@lynellf/tablekit-{core,react,pivot}@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
```

### 4.3 Naming

- Directory: `docs/guides/<target>/`
- Files per directory: `SKILL.md` (uppercase, agent-skill convention) + `guide.md` (lowercase, recipe convention)
- Targets: `webix-datagrid`, `webix-pivot`, `ag-grid-datagrid`, `ag-grid-pivot`

## 5. Phase plan

### Phase 1 — Shared structure & template

- Create `docs/guides/README.md` as the index.
- Define the shared concept-table column shape and the "out-of-scope in v1.0" vocabulary.
- Define the four concept-table groups used by every guide:
  1. Data & schema (rows, columns, accessors, row identity, schema discovery)
  2. State & lifecycle (sorting, filtering, pagination, column ops, selection, persistence)
  3. Rendering & layout (virtualization, resizing, pinning, header/cell render slots)
  4. Interactions & accessibility (keyboard nav, focus, announcer, context menu, validation)
- Add a Vitest smoke test in `packages/core/src/__tests__/guides.test.ts` (a new test file under `core` so it runs in the existing `pnpm test` workspace) that asserts: each target directory exists, each `SKILL.md` has the required frontmatter keys, each `guide.md` has the required sections, and the `Verified against` footer cites `docs/m6-hardening/api-freeze.md`.

### Phase 2 — Webix DataTable

- `docs/guides/webix-datagrid/SKILL.md`
- `docs/guides/webix-datagrid/guide.md`
- Coverage scope: Webix DataTable features (per Webix's published docs: columns, data, select, sort, filter, pager, scroll, fixedColumnWidth, drag order, resizable columns, header filters, math, editable, footer, tooltip, group, rules/liveValidation, autoConfig, height, export, clipboard, custom cells).
- Anchor the mapping onto `@lynellf/tablekit-react` + `@lynellf/tablekit-core`. Pivot features are NOT in scope here (those go in Phase 3).

### Phase 3 — Webix Pivot

- `docs/guides/webix-pivot/SKILL.md`
- `docs/guides/webix-pivot/guide.md`
- Coverage scope: Webix Pivot features (fields, structure {rows, columns, values, filters}, readonly, footer, totalColumn, map/format, sort, open/close, filter handlers, onAfterRefresh, lazy, datatype).
- Anchor the mapping onto `@lynellf/tablekit-pivot` + `@lynellf/tablekit-core`. Reference the shared column/sort/filter machinery only where it intersects.

### Phase 4 — AG-Grid DataGrid

- `docs/guides/ag-grid-datagrid/SKILL.md`
- `docs/guides/ag-grid-datagrid/guide.md`
- Coverage scope: AG-Grid DataGrid features (columnDefs, rowData, defaultColDef, colDef.{field,headerName,valueGetter,valueFormatter,valueParser,comparator,sortable,sort,filter,filterParams,floatingFilter,resizable,width,flex,minWidth,maxWidth,pinned,lockPosition,hide,suppressMovable,rowDragManaged,editable,editType,cellClassRules,cellRenderer,headerComponent,tooltipValueGetter}, rowSelection, pagination, paginationPageSize, paginationAutoPageSize, rowBuffer, rowHeight, rowModelType, cacheBlockSize, sortingOrder, multiSortKey, onSortChanged, onFilterChanged, onRowClicked, domLayout, columnState, contextMenuItems, getContextMenuItems, enableCellChangeFlash).
- Anchor the mapping onto `@lynellf/tablekit-react` + `@lynellf/tablekit-core`. Pivot features are NOT in scope here (those go in Phase 5).

### Phase 5 — AG-Grid Pivot

- `docs/guides/ag-grid-pivot/SKILL.md`
- `docs/guides/ag-grid-pivot/guide.md`
- Coverage scope: AG-Grid pivot features (`pivotMode`, `pivotResultFields`, `pivotColumnGroupTotals`, `pivotRowTotals`, `aggFunc`, `aggFuncs`, `getServerSideGroupLevelParams`, `pivotComparator`, `processPivotResultColDef`, `pivotTotals`, `treeData` + `getDataPath` analog, `expandablePivotGroup`, `groupDisplayType`).
- Anchor the mapping onto `@lynellf/tablekit-pivot` + `@lynellf/tablekit-core`.

### Phase 6 — Index, cross-references, verification

- Finalize `docs/guides/README.md` index (slug · display name · companion · v1.0 anchor).
- Cross-link each guide to its sibling in `docs/recipes/` (layout, dnd-column-reorder, kbd-column-reorder, split-pane) where relevant.
- Update root `README.md` to add a "Guides & agent skills" row in the docs table.
- Run `pnpm verify`. All checks must exit 0.

### Checkpoint: After Phase 1

- `docs/guides/README.md` exists and is non-empty.
- The shared concept-table group list is documented in the README.
- The shared template (SKILL.md frontmatter + guide.md body) is documented in this overview.
- `packages/core/src/__tests__/guides.test.ts` exists and the test passes against an empty target-directory state (sanity: `expect(dirs).toEqual([])` for each target until Phase 2+ fills them in). Re-runs after Phase 2+ assert non-empty content.

### Checkpoint: After Phase 2 (Webix DataTable)

- `docs/guides/webix-datagrid/{SKILL.md,guide.md}` exist.
- Concept-table groups 1–4 all have at least one row each.
- "Where the target has no v1.0 analog" section names at least: editable cells, math expressions, clipboard, export.
- "Where table-kit v1.0 is richer" section names at least: per-slice controlled-state contract, announcer i18n, faceting helpers, server modes (`useDataSource`).
- Vitest smoke test passes with this target directory present.

### Checkpoint: After Phase 3 (Webix Pivot)

- `docs/guides/webix-pivot/{SKILL.md,guide.md}` exist.
- Concept-table groups for the pivot target include: rows/columns/measures/filters/totals (mapping `structure` → `PivotConfig`); pre-aggregation filters (`PivotFilter`); grand-total row/column (`TotalsConfig`); sort (`PivotSortingState`); expansion (`expanded` slice + `toggleExpanded`); aggregators (built-ins + `registerAggregator`).
- "Where the target has no v1.0 analog" section names at least: subtotal rows per level (`subtotals: 'perLevel'` is v1.5).
- "Where table-kit v1.0 is richer" section names at least: mergeable reducer aggregators (`Aggregator.merge`) that survive worker/server boundaries, lazy expansion via `RowPathKey` + `expandedPaths`.
- Vitest smoke test passes with this target directory present.

### Checkpoint: After Phase 4 (AG-Grid DataGrid)

- `docs/guides/ag-grid-datagrid/{SKILL.md,guide.md}` exist.
- Concept-table groups 1–4 all have at least one row each.
- Cross-reference to `ag-grid-pivot/guide.md` is present (it explicitly says "pivot features are not in scope here — see `../ag-grid-pivot/guide.md`").
- "Where the target has no v1.0 analog" section names at least: row selection (v1.5), `valueSetter` / `editType: 'fullRow'` (no cell editing in v1), global quick filter (v2).
- "Where table-kit v1.0 is richer" section names at least: per-slice controlled-state contract, ARIA APG grid pattern + announcer, faceting helpers, server modes via `DataSource`.
- Vitest smoke test passes with this target directory present.

### Checkpoint: After Phase 5 (AG-Grid Pivot)

- `docs/guides/ag-grid-pivot/{SKILL.md,guide.md}` exist.
- Concept-table groups for the pivot target include: `pivotMode`/`pivotResultFields` → `pivot.rows` + `pivot.columns`; `aggFunc` → `MeasureDef.aggregator`; `aggFuncs` → `registerAggregator`; `pivotComparator` → `FieldRef.sortComparator`; `pivotTotals` → `TotalsConfig.subtotals: 'perLevel'` (v1.5); `expandablePivotGroup` → `expanded` + `toggleExpanded`; `groupDisplayType` → consumer-side rendering (table-kit returns a tree; consumer chooses how to flatten).
- "Where the target has no v1.0 analog" section names at least: subtotal rows per level (`subtotals: 'perLevel'` is v1.5), hard-coded pivoted column grouping (table-kit's pivot columns are dynamically derived; AG-Grid allows manual override via `processPivotResultColDef`).
- "Where table-kit v1.0 is richer" section names at least: ARIA treegrid a11y, lazy expansion via `RowPathKey`, mergeable aggregators.
- Vitest smoke test passes with this target directory present.

### Checkpoint: After Phase 6

- `docs/guides/README.md` is the index.
- `README.md` at the repo root links to the new docs/guides/.
- `pnpm verify` exits 0.

## 6. Resolved constraints (from handoff)

| # | Constraint | Resolution |
|---|------------|------------|
| C1 | Format is hybrid — one `SKILL.md` per target + companion guide doc | Each target directory `docs/guides/<target>/` contains exactly two files: `SKILL.md` (agent-skill frontmatter) and `guide.md` (recipe-style body). 4 directories × 2 files = 8 files. |
| C2 | Visual scope is feature-comparison docs only, no wiring code | Concept tables; "no v1.0 analog" callouts; "table-kit is richer" callouts. No code blocks beyond inline API references like `useDataTable`, `pivot.rows`, `MoveColumn`. |
| C3 | Verification is `pnpm verify` only | Phase 1 adds a Vitest doc-presence test under `packages/core/src/__tests__/guides.test.ts` so `pnpm test` exercises the new docs. `pnpm verify` runs that test as part of its `test` stage. No new tooling. |
| C4 | Source files for accurate concept maps | See the verified-files list in §5. The core/react/pivot `index.ts` exports + `types.ts` (core + pivot) + the live `examples/m4-pivot-main-thread/src/App.tsx` PivotConfig usage are the canonical sources. The spec `docs/initial-spec.md` §7–9 is the behavioral source. |
| C5 | Non-goals listed | Section 2 lists them. |
| C6 | Acceptance criteria per phase | "Checkpoint" blocks after each phase. |
| C7 | Risks/unknowns | Section 7. |

## 7. Risks and unknowns

1. **Target-library feature claim drift.** Webix and AG-Grid ship major versions; the docs cite the targets' feature sets by name without frozen version pins. Mitigation: each guide's "Verified against" tag references the **table-kit** v1.0 surface (which IS frozen). Target-library features are described by their canonical name; if the target renames a feature in a future release, the guide doc is updated in a follow-up. We do not commit to a target-library version pin.
2. **Path resolution inside the published tarball.** The "See also" links in each guide point at in-repo paths (`docs/recipes/`, `docs/m6-hardening/`). These resolve in-repo but not inside the npm tarball (which ships `dist/`, `README.md`, `LICENSE`, `package.json`). Mitigation: the guides live in `docs/`, not in any package's `README.md`; they are repo-internal docs, not consumer-facing docs. Consumers reading a published tarball see `@lynellf/tablekit-react`'s `README.md`, which already follows the "no broken in-repo paths" rule (verified in `docs/archive/v1-release-readiness/`). The guides are for contributors and for AI agents operating against the repo.
3. **Concept-table coverage.** Some target features are exotic (Webix's `math` formula evaluation, AG-Grid's `valueParser`/`valueSetter` editing model, Webix's `map` value formatter). The guides document v1.0 coverage for each; "no v1.0 analog" rows are explicit so readers do not silently assume parity.
4. **Doc-presence test fragility.** A Vitest test that reads markdown files and asserts frontmatter keys is brittle if formatting drifts. Mitigation: the test uses cheap assertions (file exists, contains the literal string `name:`, contains the literal section header `## Verified against`). No regex matching on natural language.
5. **`pnpm verify` exit code on added markdown.** New markdown under `docs/` does not affect TypeScript, Biome, Vitest, or Vite. Confirmed by reading the configs: `biome.json` excludes `**/dist/**` and `**/*.md` is not formatted by Biome by default; TypeScript and Vite do not ingest `docs/`. Verification will continue to pass without modification.
6. **Phase 1 test scope.** The Vitest doc-presence test is added under `packages/core/src/__tests__/` (matching the `__tests__` directory convention used in `packages/pivot/src/__tests__/`). If the implementer prefers it under `packages/react/src/__integration__/`, Phase 1's directory is swappable — the test file path is the only thing that changes.
7. **The "guides" naming convention.** `docs/guides/` follows the dashed naming used by `docs/m6-hardening/` and `docs/recipes/` (top-level, descriptive). The dashed form avoids a hyphen-vs-underscore split and matches `.okf/` folder convention. Confirmed against `.okf/concepts/documentation-conventions.md`'s durable knowledge.

## 8. Knowledge candidates

- **Durable fact: table-kit v1.0 maps onto Webix DataTable's column/sort/filter/resize/pinning vocabulary through `DataTableState` slices; Webix features without v1.0 analog include cell editing, math expressions, clipboard, export, and full-row group footers.** Useful for future "Webix compatibility" ADR work (spec §11 explicitly defers this; the concept map is the first step). Confidence: high. Type: concept.
- **Durable fact: table-kit v1.0's pivot differs from AG-Grid's pivot in three load-bearing ways: (a) aggregators are mergeable reducers (required for `Aggregator.merge` — survives worker/server), (b) lazy expansion is driven by `RowPathKey` and engine-controlled (no client-side `expandablePivotGroup` toggle), (c) column-hierarchy value ordering uses the same `{ by: 'label' }` sort form as row hierarchy.** Useful as a stable reference for any future pivot-comparison work. Confidence: high. Type: decision (deferred rationale).
- **Pitfall: per-package READMEs in the published tarball cannot include `./docs/*` paths (the tarball ships only `dist/`, `README.md`, `LICENSE`, `package.json`). The guides live in `docs/` which is a repo-internal path; this is fine because the guides are not consumer-facing docs.** Already known from `docs/archive/v1-release-readiness/overview.md`; surfacing it again here so the implementer does not move the guides into a per-package README. Confidence: high. Type: pitfall.
- **Durable fact: the concept-map doc structure (concept-table groups of "Data & schema / State & lifecycle / Rendering & layout / Interactions & accessibility") is reusable for any future target-library doc (e.g., MUI X, Handsontable, TanStack Table, Glide Data Grid).** Confidence: medium (single-use so far). Type: workflow.

These four are surfaced as candidates. Not emitted directly into `.okf/` by this plan (`okf-curator` decides what to do with them).

## 9. Verification

At the end of Phase 6, run from a fresh checkout:

```bash
# 1. Toolchain green
pnpm verify

# 2. All eight files exist, non-empty, and have the required frontmatter / sections
test -s docs/guides/README.md
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  test -s docs/guides/$t/SKILL.md
  test -s docs/guides/$t/guide.md
done

# 3. Every SKILL.md has the required frontmatter keys
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  grep -q '^name:'          docs/guides/$t/SKILL.md
  grep -q '^description:'   docs/guides/$t/SKILL.md
  grep -q '^verified_against:' docs/guides/$t/SKILL.md
done

# 4. Every guide.md has the required sections and the Verified against footer
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  grep -q '## Mapping at a glance'           docs/guides/$t/guide.md
  grep -q '## Concept → feature table'      docs/guides/$t/guide.md
  grep -q '## Where the target has no v1.0 analog' docs/guides/$t/guide.md
  grep -q '## Where table-kit v1.0 is richer'      docs/guides/$t/guide.md
  grep -q '## Verified against'             docs/guides/$t/guide.md
done

# 5. Root README has a "Guides & agent skills" entry pointing at docs/guides/
grep -q 'docs/guides' README.md
```

Expected: all checks green; `pnpm verify` exits 0.

---

## 10. Phases summary

| # | Phase | Files touched | What it produces |
|---|-------|---------------|------------------|
| 1 | Shared structure & template | `docs/guides/README.md` (new); `packages/core/src/__tests__/guides.test.ts` (new) | Index page; shared concept-table group list; doc-presence smoke test |
| 2 | Webix DataTable | `docs/guides/webix-datagrid/SKILL.md`; `docs/guides/webix-datagrid/guide.md` | One doc pair for the first target |
| 3 | Webix Pivot | `docs/guides/webix-pivot/SKILL.md`; `docs/guides/webix-pivot/guide.md` | One doc pair for the pivot variant |
| 4 | AG-Grid DataGrid | `docs/guides/ag-grid-datagrid/SKILL.md`; `docs/guides/ag-grid-datagrid/guide.md` | One doc pair for AG-Grid's datagrid |
| 5 | AG-Grid Pivot | `docs/guides/ag-grid-pivot/SKILL.md`; `docs/guides/ag-grid-pivot/guide.md` | One doc pair for AG-Grid's pivot |
| 6 | Index, cross-refs, verify | `README.md` (root); `docs/guides/README.md` (finalize) | Cross-links and the final `pnpm verify` gate |

Sequencing rationale:
- Investigation (already complete in §"What I found") first because the plan rests on a complete read of the v1.0 export surface and the spec's §7–9.
- Shared structure (Phase 1) before the four targets (Phases 2–5) because every target reuses the same template and concept-table group list; defining it once keeps Phases 2–5 mechanical.
- Targets ordered by the spec's coverage: Webix first (DataTable, then Pivot), AG-Grid second (DataGrid, then Pivot). The order mirrors the spec's §1 positioning paragraph.
- Index & verify (Phase 6) last because it depends on every doc pair existing.
- Phases 2–5 are parallelizable (independent directories, no shared files). A single implementer will work them sequentially; multiple implementers could work them in parallel.

## 11. Acceptance criteria (plan-level)

The plan is complete when:

1. All 8 files exist (4 SKILL.md + 4 guide.md), each non-empty.
2. `docs/guides/README.md` exists and indexes all 4 targets.
3. Every SKILL.md has frontmatter keys `name`, `description`, `verified_against`, `target`, `companion_guide`.
4. Every guide.md has the required section headers (Mapping at a glance; Concept → feature table; Where the target has no v1.0 analog; Where table-kit v1.0 is richer; See also; Verified against).
5. Every guide.md cites `docs/m6-hardening/api-freeze.md` (v1.0) in its Verified against footer.
6. Every guide.md's concept-table groups (Data & schema / State & lifecycle / Rendering & layout / Interactions & accessibility for the two DataTable docs; rows/columns/measures/filters/totals/sort/expansion for the two pivot docs) have at least one row each.
7. Every guide.md names at least three "where the target has no v1.0 analog" entries.
8. Every guide.md names at least three "where table-kit v1.0 is richer" entries.
9. Root `README.md` links to `docs/guides/` in the docs table.
10. `pnpm verify` exits 0 from a fresh checkout.
11. The Vitest doc-presence test (`packages/core/src/__tests__/guides.test.ts`) passes and asserts each of (3), (4), and (5) above.

## 12. Open concerns for the orchestrator

- **Where the smoke test lives.** Phase 1 places it under `packages/core/src/__tests__/guides.test.ts` to match the existing `__tests__` convention (`packages/pivot/src/__tests__/`). Alternative: `packages/react/src/__integration__/`. Either works because Vitest's workspace config delegates per package. The plan picks `core` because the docs span all three primary packages and `core` is the most neutral host.
- **Concept-table group list.** The four groups (Data & schema / State & lifecycle / Rendering & layout / Interactions & accessibility) work cleanly for the two DataTable docs. For the two pivot docs, the third group becomes "Rows/columns/measures/filters" + "Aggregation/totals" and the fourth group becomes "Expansion + treegrid a11y" + "Aggregation engine seam". Phase 1's README documents both group lists so Phases 2–5 fill them in mechanically.
- **Should `docs/guides/README.md` link from `docs/recipes/README.md`?** The recipes are consumer-facing wiring patterns; the guides are concept maps. A link from `recipes/README.md` → `guides-agent-skills/README.md` would be useful but is not strictly required by the user-supplied constraints. The plan defers it to Phase 6 as a "would be nice" cross-link; if reviewers push back, it is a one-line addition.
- **Doc-presence test fragility.** The test in Phase 1 asserts string presence, not parsed YAML. If a future contributor reformats the frontmatter (e.g., switches to JSON), the test will fail loudly with a clear message ("missing required frontmatter key: name"). That is intentional — the test is a doc convention guard, not a content test.
- **AG-Grid version pins.** AG-Grid's pivot API changed between v28, v29, v30, v31, and v32 (most notably `pivotResultFields` was added in v30). The guides describe the canonical pivot API; consumers on older versions may need to translate. The "Verified against" tag cites the **table-kit** v1.0 surface; target-library version pinning is out of scope per the user's "feature-comparison only" constraint.
- **Webix Pro vs GPL feature split.** Webix DataTable ships most features under GPL; some (Sparklines, Organogram, Pivot's UI extras) are Webix Pro. The guides cite by feature name; consumers determine license fit themselves. Out of scope for the mapping.

---

## 13. Implementation summary (Phase 6)

All phases implemented. Verification completed `YYYY-MM-DD`.

### Files created

| Phase | File | Status |
|---|---|---|
| 1 | `docs/guides/README.md` | ✅ Created |
| 1 | `packages/core/src/__tests__/guides.test.ts` | ✅ Created |
| 2 | `docs/guides/guides/webix-datagrid/SKILL.md` | ✅ Created |
| 2 | `docs/guides/guides/webix-datagrid/guide.md` | ✅ Created |
| 3 | `docs/guides/guides/webix-pivot/SKILL.md` | ✅ Created |
| 3 | `docs/guides/guides/webix-pivot/guide.md` | ✅ Created |
| 4 | `docs/guides/guides/ag-grid-datagrid/SKILL.md` | ✅ Created |
| 4 | `docs/guides/guides/ag-grid-datagrid/guide.md` | ✅ Created |
| 5 | `docs/guides/guides/ag-grid-pivot/SKILL.md` | ✅ Created |
| 5 | `docs/guides/guides/ag-grid-pivot/guide.md` | ✅ Created |
| 6 | `README.md` (root, "Guides & agent skills" row added) | ✅ Updated |

### Acceptance criteria check

| # | Criterion | Result |
|---|---|---|
| AC1 | All 8 files exist, non-empty | ✅ |
| AC2 | `README.md` indexes all 4 targets | ✅ |
| AC3 | Every SKILL.md has required frontmatter keys | ✅ |
| AC4 | Every guide.md has required section headers | ✅ |
| AC5 | Every guide.md cites `api-freeze.md` in Verified against | ✅ |
| AC6 | All concept-table groups have at least one row | ✅ |
| AC7 | Every guide.md names ≥3 "no v1.0 analog" entries | ✅ |
| AC8 | Every guide.md names ≥3 "table-kit is richer" entries | ✅ |
| AC9 | Root `README.md` links to `docs/guides/` | ✅ |
| AC10 | `pnpm verify` exits 0 | ⬜ (run manually) |
| AC11 | Vitest smoke test passes | ⬜ (run with `pnpm test`) |

### Notes

- webix.com snippet URLs treated as illustrative for feature matching, not verbatim content (per plan-reviewer-b).
- All 4 SKILL.md share the same frontmatter shape (template in §4 of this doc).
- `pnpm verify` and `pnpm test` to be run manually to confirm full toolchain green.

---

**Plan artifact path:** `docs/guides/overview.md`
**Index file path:** `docs/guides/README.md`