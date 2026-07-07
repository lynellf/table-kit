# Phase 2 — Webix DataTable

**Phase:** 2 of 6
**Goal:** Produce the SKILL.md + guide.md pair for Webix DataTable mapping onto `@lynellf/tablekit-react`.
**Status:** Draft v1 for review
**Depends on:** Phase 1 (the shared template and the doc-presence smoke test).

---

## 1. What this phase produces

1. `docs/guides/webix-datagrid/SKILL.md` — agent-skill frontmatter + orientation.
2. `docs/guides/webix-datagrid/guide.md` — recipe-style concept map (no wiring code) covering Webix DataTable's feature surface as of Webix 7+/8+ general availability.

After this phase, `pnpm test` should report 5 fewer failures for the `webix-datagrid` describe block in `packages/core/src/__tests__/guides.test.ts`.

## 2. SKILL.md outline (copy and fill in)

```markdown
---
name: webix-datagrid
description: Map Webix DataTable feature surface onto @lynellf/tablekit-react. Use when an existing Webix DataTable integration is being migrated, when a Webix DataTable feature request needs to be evaluated against table-kit, or when reviewing Webix-shaped requirements against the v1.0 API.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: webix-datagrid
tablekit_packages:
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---

# Webix DataTable — table-kit concept map

Webix DataTable is a full-featured grid with built-in column model, sort, filter, paging, resizing, pinning, drag-reorder, selection, math expressions, clipboard, and export. table-kit v1.0 covers the **headless state model and prop getters**; the consumer owns rendering, styling, and integration with application state. This skill maps Webix DataTable features onto the v1.0 surface so a Webix-shaped requirement can be evaluated against what table-kit ships.

## When to use this skill

- "Migrate this Webix DataTable to table-kit" — start by reading `./guide.md`, then plan the migration around the slice-by-slice mapping in §"State & lifecycle".
- "Can table-kit do X?" — check the concept map first; many Webix features map 1:1 onto v1.0 slices.
- "Review Webix-shaped requirements against table-kit v1.0" — use the "no v1.0 analog" section to flag gaps.

## How to use it

1. Read `./guide.md` for the full concept map.
2. For wiring patterns (sticky pinning, virtualization, DnD reorder, keyboard reorder, split-pane), follow `docs/recipes/`.
3. The pivot variant of Webix (rows/columns/measures) is a separate skill: `./../webix-pivot/SKILL.md`.

## Out of scope

- Wiring code (this skill is a concept map, not an integration tutorial).
- Webix Pro features that table-kit has no analog for (Sparklines, Organogram, etc.).
- Styling/theming — table-kit ships no CSS.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/recipes/README.md` (consumer-facing patterns)
- `./../webix-pivot/SKILL.md` (Webix Pivot variant)
```

## 3. guide.md outline (copy and fill in)

### 3.1 Top

```markdown
# Webix DataTable → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

Webix DataTable ships a rich column model, sort, filter, paging, resize, pinning, drag-reorder, selection, math, clipboard, export, and a few Webix-Pro-only extras. table-kit v1.0 covers the **headless state model and prop getters** for sort, filter, pagination, resize, pinning, drag-reorder via `moveColumn`, and server modes; **no v1.0 analog exists for cell editing, math expressions, clipboard, export, or row selection** (selection ships in v1.5). The mapping is **1:1 for state lifecycle**, **partial for rendering** (consumer owns layout/CSS), and **gapped for editing/clipboard/export**. Where table-kit is richer: per-slice controlled state, ARIA APG grid pattern, faceting helpers, server modes, and i18n announcer.
```

### 3.2 Concept → feature table (group: Data & schema)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `data: [...]` (in-memory dataset) | `useDataTable({ data: rows })` | full | Direct prop; passed through `setOptions` on every render. |
| `datatype: "json"` / `"xml"` / `"csv"` | none | none | Webix auto-parses; table-kit takes pre-parsed `TRow[]`. |
| `url: "..."` (remote data) | `dataSource?: DataSource<TRow>` (server modes) | full | `useDataSource(table, source)` wires a `DataSource` for server-side pagination/sort/filter. |
| `columns: [...]` | `columns: ColumnDef<TRow, unknown>[]` | full | `ColumnDef.id` is the stable id (Webix uses field name; table-kit uses `id`). |
| `id: "myid"` (stable row id) | `getRowId?: (row, index) => string` | full | Required for server modes + pivot. |
| `autoConfig: true` | none | none | Webix derives columns from data; table-kit requires explicit `ColumnDef[]` (consumer responsibility). |
| `scheme: { $init: ..., $change: ..., $update: ... }` (data normalization) | none | none | Webix DataTable owns data shape; table-kit is data-shape-agnostic — consumer normalizes before passing. |

### 3.3 Concept → feature table (group: State & lifecycle)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `select: true` / `"cell"` / `"row"` / `"multiselect"` / `"area"` | none (v1.0); `rowSelection` slice (v1.5) | none in v1.0 | Selection is a v1.5 state slice. |
| `sort: true` / `sort: "int"` / `sort: "string"` | `enableSorting: true` + `sortingFn: "alphanumeric"` / `"number"` / `"datetime"` | full | Multi-sort supported via `state.sorting: SortItem[]`; `enableMultiSort` defaulted true. |
| `filter: true` / `headerFilters` | `enableFiltering: true` + `filterFn` (built-in or registry name) | full | Per-column `ColumnFilterItem.value` carries the opaque filter value. |
| `pager: { ... }` | `pagination: { pageIndex, pageSize }` slice | full | `computePageCount(rows, pageSize)` derives total pages. |
| `scroll: "y"` (virtual Y scroll) | `useRowVirtualizer({ overscan })` + `getRowModel()` windowing | full | Spec §7.1 windowing. |
| `scrollX: true` / `scrollY: true` | `useCenterVirtualizer` (column virtualization) + `useRowVirtualizer` | full | Column virtualization applies to unpinned columns only (§7.3). |
| `fixedColumnWidth: true` / column `width: 100` | `size?: number`, `minSize?: number`, `maxSize?: number` | full | Stable identity for sizes. |
| `drag: "order"` / `"move"` (column reorder) | `moveColumn(id, toIndex)` + consumer wires DnD (see `docs/recipes/dnd-column-reorder.md`) | partial | table-kit provides the state change; DnD wiring is consumer-side (dnd-kit shown in recipe). |
| `resizeColumn: true` | `useResizeHandle()` + `columnSizing` slice + `onColumnSizingChange` | full | Spec §7.2; pointer + keyboard resize supported. |
| `clipboard: "selection"` | none | none | Clipboard is v2 (out of scope per spec §2.3). |
| `export: true` / `export: "excel"` | none | none | Export is out of scope per spec §2.3. |
| `liveValidation: true` + `rules: [...]` | none | none | Cell validation is out of scope (no editing in v1). |
| `math: true` (formula evaluation) | none | none | Spec §2.3 non-goal; aggregation is handled by `@lynellf/tablekit-pivot` for pivot use cases. |
| `footer: true` (column footer row) | consumer renders | none | table-kit has no opinionated footer; consumer renders `<tfoot>`-like rowgroup from `getRowModel()` post-aggregation. |
| `onSelectChange`, `onAfterSelect`, `onCheck`, `onEdit`, `onAfterEdit` | `onCellClick`, `onCellDoubleClick`, `onCellActivate`, `onCellFocusChange` | partial | Selection/edit/cell-event callbacks map to v1.0's interaction event surface (§7.6). No `onCheck` analog (checkbox column is consumer-rendered via `cell`). |

### 3.4 Concept → feature table (group: Rendering & layout)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `header: [...]` (custom header rows, e.g., grouped headers) | `header` opaque render slot on `ColumnDef`; consumer composes | partial | `getHeaderGroups()` exposes header structure; consumer renders DOM. |
| `template: "{common.icon()} #title#"` (cell template) | `cell` opaque render slot on `ColumnDef` | full | Consumer renders cell content; `cell` is opaque to core. |
| `css: "..."` / `cssFormat: ...` | none | none | No CSS in core. Consumer-owned. |
| `width: 100`, `minWidth: 50`, `maxWidth: 300` | `size`, `minSize`, `maxSize` on `ColumnDef` | full | Stable identity for resize calculations. |
| `hidden: true` | `state.columnVisibility[id] = false` (or `initialState`) | full | `toggleColumnVisibility`, `toggleAllColumnsVisibility` helpers exposed. |
| `id: "..."` (column id) | `ColumnDef.id` | full | Stable column identity. |
| `sort: "sort"` (CSS class for sortable) | consumer CSS | none | table-kit has no opinion. |
| `tooltip: true` / `{ template: ... }` | none | none | No tooltip in core. |
| `format: webix.i18n.numberFormat(...)` (value formatter) | `cell` render slot | full | Consumer applies formatting in render slot. |
| `editor: "text"` / `"combo"` / `"date"` (cell editor) | none | none | No editing in v1.0 (spec §2.3 non-goal). |

### 3.5 Concept → feature table (group: Interactions & accessibility)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Keyboard navigation (arrow keys, Home/End, etc.) | `useKeyboardNav()` hook | full | WAI-ARIA APG grid pattern; spec §7.5. |
| Roving `tabindex` (Tab exits the grid by default) | `tabBehavior?: 'exit' \| 'cells'` (default `'exit'`) | full | Spec §7.5 + §3.2 of api-freeze. |
| Sort toggle (click header) | `header.getSortToggleProps()` on the header cell | full | Multi-sort via `enableMultiSort` defaulted true. |
| Resize via pointer on column edge | `useResizeHandle()` + `header.getResizeHandleProps()` | full | Spec §7.2. |
| Resize via keyboard | same `getResizeHandleProps()` (focusable `role="separator"`) | full | Arrow keys adjust by `resizeStepPx`; Enter commits, Escape cancels. |
| Announcer / aria-live | `useDataTable` returns `Announcer` component + `messages?: Partial<MessagesMap>` | full | i18n; default English; per-key overrides. |
| ARIA structure validation | `validate(source, options): ValidationResult` from `@lynellf/tablekit-react` | full | Dev-mode structure check. |
| `tabBehavior: 'cells'` (Tab focuses first cell; arrows move within row) | `tabBehavior?: 'cells'` (opt-in) | partial | M6 phase 2 ships both modes; `'cells'` is opt-in with smoke coverage (not full APG suite). |
| Right-click context menu (`onContextMenu`) | `onCellContextMenu` interaction event | full | Spec §7.6; consumer wires the menu UI. |
| `tooltip` on hover/focus | none | none | Out of scope. |
| `liveValidation` error announcement | none | none | No validation in v1.0. |

### 3.6 Where Webix DataTable has no v1.0 analog

- **Cell editing** (`editor: "text"`, `onEdit`, `onAfterEdit`) — spec §2.3 non-goal; v2 candidate.
- **Math expressions** (`math: true`, formula evaluation) — spec §2.3 non-goal.
- **Clipboard** (`clipboard: "selection"`) — spec §2.3 non-goal; v2 candidate.
- **Export** (`export: true`, `export: "excel"`) — spec §2.3 non-goal.
- **Row / cell selection** (`select: true`, `select: "multiselect"`, `select: "area"`) — `rowSelection` slice is v1.5.
- **Live validation** (`liveValidation: true`, `rules: [...]`) — no validation surface in v1.0.
- **Tooltips** (`tooltip: true`) — no tooltip in core.
- **Auto-derive columns from data** (`autoConfig: true`) — consumer must declare `ColumnDef[]`; no schema inference.
- **Data normalization** (`scheme: { $init, $change, $update }`) — consumer pre-normalizes.
- **Footer / summary row** (`footer: true`) — consumer renders a custom rowgroup; no first-class footer helper.
- **Sparklines / Organogram / Webix-Pro add-ons** — out of scope by license.
- **Group rows** (`group: true`, `groupBy: "continent"`) — spec §2.3 explicitly recommends pivot for grouping.

### 3.7 Where table-kit v1.0 is richer than Webix DataTable

- **Per-slice controlled state** — every state slice (`sorting`, `columnFilters`, `pagination`, `columnOrder`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell`) is independently controllable via `state` + `on<Slice>Change`. Webix's overall state object is single-piece.
- **ARIA APG grid pattern** — full compliance with WAI-ARIA APG grid pattern + roving `tabindex`, including `focusedCell` state slice.
- **i18n announcer** — `messages?: Partial<MessagesMap>` per-key overrides with 18 default keys; Webix uses locale files but the integration is via string lookups.
- **Faceting helpers** — `getFacetedUniqueValues`, `getFacetedMinMax` (spec §15) for filter UI construction; Webix exposes counts via its own component APIs.
- **Server modes** — `useDataSource` + `DataSource<TRow>` interface for server-side pagination/sort/filter; Webix `url: "..."` is a single-config remote loader.
- **Stable identity everywhere** — every row, column, pivot node has a consumer-controllable stable id (P6), making controlled state + virtualization coherent.
- **Registries for cross-boundary serialization** — sort/filter/aggregator registries use string names when crossing worker/server boundaries (P3); Webix has no equivalent seam.

### 3.8 See also

- `./../ag-grid-datagrid/guide.md` — AG-Grid DataGrid mapping (overlapping features, different vocabulary).
- `./../webix-pivot/SKILL.md` — Webix Pivot variant (rows/columns/measures/totals).
- `docs/m6-hardening/api-freeze.md` — v1.0 contract.
- `docs/initial-spec.md` §2 (goals/non-goals), §7 (shared features), §8 (DataTable specifics).
- `docs/recipes/layout.md` — sticky pinning + virtualization.
- `docs/recipes/dnd-column-reorder.md` — DnD column reorder wiring pattern.
- `docs/recipes/kbd-column-reorder.md` — keyboard "grab" reorder wiring pattern.
- `docs/recipes/split-pane.md` — three-viewport scroll sync for transformed parents.

### 3.9 Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)

## 4. Acceptance criteria

- [ ] `docs/guides/webix-datagrid/SKILL.md` exists, is non-empty, and has all 5 required frontmatter keys.
- [ ] `docs/guides/webix-datagrid/guide.md` exists, is non-empty, has all 5 required section headers, and cites `docs/m6-hardening/api-freeze.md`.
- [ ] The four concept-table groups (Data & schema / State & lifecycle / Rendering & layout / Interactions & accessibility) each have at least one row.
- [ ] "Where the target has no v1.0 analog" section names at least: cell editing, math expressions, clipboard, export.
- [ ] "Where table-kit v1.0 is richer" section names at least: per-slice controlled state, ARIA APG grid, i18n announcer, faceting helpers, server modes.
- [ ] The Phase 1 smoke test passes for this target's describe block.

## 5. Verification

```bash
# 1. Files exist
test -s docs/guides/webix-datagrid/SKILL.md
test -s docs/guides/webix-datagrid/guide.md

# 2. Frontmatter keys
grep -q '^name:'                docs/guides/webix-datagrid/SKILL.md
grep -q '^description:'         docs/guides/webix-datagrid/SKILL.md
grep -q '^verified_against:'    docs/guides/webix-datagrid/SKILL.md
grep -q '^target:'              docs/guides/webix-datagrid/SKILL.md
grep -q '^companion_guide:'     docs/guides/webix-datagrid/SKILL.md

# 3. Section headers + verified-against footer
grep -q '## Mapping at a glance'               docs/guides/webix-datagrid/guide.md
grep -q '## Concept → feature table'          docs/guides/webix-datagrid/guide.md
grep -q '## Where the target has no v1.0 analog' docs/guides/webix-datagrid/guide.md
grep -q '## Where table-kit v1.0 is richer'   docs/guides/webix-datagrid/guide.md
grep -q '## Verified against'                 docs/guides/webix-datagrid/guide.md
grep -q 'docs/m6-hardening/api-freeze.md'     docs/guides/webix-datagrid/guide.md

# 4. The smoke test passes for this target
pnpm test packages/core/src/__tests__/guides.test.ts 2>&1 | grep -A2 webix-datagrid | head -20
# Expected: webix-datagrid describe block passes; the other 3 targets still fail.
```

## 6. Risks

- **Webix feature vocabulary drift.** Webix DataTable's option names have evolved across Webix 6/7/8. The guide cites by canonical option name; consumers on older Webix versions may need to translate. Out of scope per the user's "feature-comparison only" constraint.
- **Webix Pro vs GPL feature split.** Some features (e.g., Pivot's UI extras) are Webix Pro. The guide names features without license tags; consumers verify licensing themselves.
- **Naming mismatch.** Webix uses `field` as the column key; table-kit uses `id`. The mapping is explicitly called out in the Data & schema section so consumers do not silently mis-translate.

## 7. Out of scope for this phase

- Writing the Webix Pivot, AG-Grid DataGrid, or AG-Grid Pivot doc pairs (Phases 3, 4, 5).
- Final cross-links from `docs/recipes/README.md` (Phase 6).
- Any source code change in `packages/*/src/`.