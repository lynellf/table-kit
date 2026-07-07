# Phase 4 — AG-Grid DataGrid

**Phase:** 4 of 6
**Goal:** Produce the SKILL.md + guide.md pair for AG-Grid DataGrid mapping onto `@lynellf/tablekit-react`.
**Status:** Draft v1 for review
**Depends on:** Phase 1 (shared template + smoke test), Phase 2 (proven format on Webix DataTable; this phase reuses the same four concept-table groups).

---

## 1. What this phase produces

1. `docs/guides/ag-grid-datagrid/SKILL.md` — agent-skill frontmatter + orientation.
2. `docs/guides/ag-grid-datagrid/guide.md` — recipe-style concept map (no wiring code) covering AG-Grid DataGrid's feature surface as of AG-Grid v32+.

After this phase, `pnpm test` should report 5 fewer failures for the `ag-grid-datagrid` describe block.

## 2. SKILL.md outline

```markdown
---
name: ag-grid-datagrid
description: Map AG-Grid DataGrid feature surface onto @lynellf/tablekit-react. Use when an existing AG-Grid DataGrid integration is being migrated, when an AG-Grid feature request needs evaluation against table-kit's v1.0 API, or when reviewing AG-Grid-shaped requirements against the headless state-engine + prop-getters model.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: ag-grid-datagrid
tablekit_packages:
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---

# AG-Grid DataGrid — table-kit concept map

AG-Grid is the dominant feature-rich grid library; the Enterprise tier adds pivoting, row grouping, and master/detail. table-kit v1.0 ships a headless state engine and prop getters — consumers own rendering, styling, and integration with application state. This skill maps AG-Grid's DataGrid (non-pivot) features onto the v1.0 surface. The pivot variant is a separate skill: `./../ag-grid-pivot/SKILL.md`.

## When to use this skill

- "Migrate this AG-Grid DataGrid to table-kit" — start by reading `./guide.md`, then plan the migration around the slice-by-slice mapping in §"State & lifecycle".
- "Can table-kit do X?" — check the concept map first; many AG-Grid features map onto v1.0 slices.
- "Review AG-Grid-shaped requirements against table-kit v1.0" — use the "no v1.0 analog" section to flag gaps (notably cell editing and global quick filter).

## How to use it

1. Read `./guide.md` for the full concept map.
2. For wiring patterns (sticky pinning, virtualization, DnD reorder, keyboard reorder, split-pane), follow `docs/recipes/`.
3. The pivot variant of AG-Grid (`pivotMode`) is a separate skill: `./../ag-grid-pivot/SKILL.md`.

## Out of scope

- Wiring code (this skill is a concept map, not an integration tutorial).
- AG-Grid Enterprise-only features that table-kit has no analog for (Master/Detail, Range Selection, Rich Select, Set Filter, etc.).
- Styling/theming — table-kit ships no CSS.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/recipes/README.md` (consumer-facing patterns)
- `./../ag-grid-pivot/SKILL.md` (AG-Grid Pivot variant)
- `./../webix-datagrid/SKILL.md` (parallel mapping for Webix DataTable)
```

## 3. guide.md outline

### 3.1 Top

```markdown
# AG-Grid DataGrid → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

AG-Grid DataGrid ships column model, sort, filter, paging, resize, pinning, row reorder, multi-row selection, range selection, cell editing, clipboard, export, master/detail, and a wide range of built-in editors. table-kit v1.0 covers the **headless state model and prop getters** for sort, filter, pagination, resize, pinning, drag-reorder via `moveColumn`, and server modes; **no v1.0 analog exists for cell editing, row/range selection, clipboard, export, master/detail, or global quick filter**. Where table-kit is richer: per-slice controlled state, ARIA APG grid pattern, faceting helpers, server modes, i18n announcer, and explicit dependency-inversion seams (every state slice is controllable; every algorithm is replaceable via injection).
```

### 3.2 Concept → feature table (group: Data & schema)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `rowData: T[]` | `useDataTable({ data: rows })` | full | |
| `getRowId: (params) => string` | `getRowId?: (row, index) => string` | full | Required for server modes. |
| `columnDefs: ColDef[]` | `columns: ColumnDef<TRow, unknown>[]` | full | `ColDef.field` → `ColumnDef.id`; note the rename. |
| `defaultColDef: ColDef` | per-`ColumnDef` defaults | full | No global `defaultColDef`; repeat defaults on each `ColumnDef`. |
| `colDef.field: 'name'` | `ColumnDef.id: 'name'` | full | **Rename**: AG-Grid's `field` is the stable identifier; table-kit uses `id` because not every column has a "field" (computed columns use `accessor` only). |
| `colDef.colId: 'name'` | `ColumnDef.id: 'name'` | full | Same role; `id` is the only identifier in table-kit. |
| `colDef.valueGetter: (params) => ...` | `ColumnDef.accessor: (row, index) => TValue` (function form) | full | |
| `colDef.valueFormatter: (params) => string` | `ColumnDef.cell` (consumer render slot) | full | Consumer applies formatting in the cell render slot. |
| `colDef.valueParser` / `valueSetter` | none | none | No editing in v1.0. |
| `colDef.headerName: 'Name'` | `ColumnDef.header` (opaque render slot, typically string) | full | Consumer renders; opaque to core. |
| `colDef.headerComponent: MyHeader` | `ColumnDef.header` (opaque render slot; consumer renders a component) | full | Same mechanism. |
| `colDef.cellRenderer: MyCell` | `ColumnDef.cell` (opaque render slot; consumer renders a component) | full | |
| `colDef.cellRendererParams: {...}` | consumer-controlled via render context | full | Consumer passes params via `cell`'s render context. |
| `colDef.cellClassRules: { ... }` | none | none | Consumer-owned CSS. |
| `colDef.tooltipValueGetter` | none | none | No tooltip in core. |
| `colDef.type: 'numericColumn'` | none | none | No column-type registry; consumer derives type from data shape. |

### 3.3 Concept → feature table (group: State & lifecycle)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `sortable: true` | `ColumnDef.enableSorting?: true` | full | Default off; opt-in. |
| `sort: 'asc' \| 'desc'` | `state.sorting: SortItem[]` (multi-sort supported) | full | Multi-sort: array order is priority. |
| `sortingOrder: ['asc','desc',null]` | consumer controls cycle | partial | Built-in cycle is `none → asc → desc → none`; custom cycle is consumer's job (re-fire `onSortingChange`). |
| `multiSortKey: 'ctrl'` | `enableMultiSort?: boolean` (default `true`) + `onSortingChange` shift detection | partial | table-kit defaults to multi-sort on; the **modifier key** to add a sort is consumer-controlled. AG-Grid exposes `multiSortKey`; table-kit does not — consumers wire the modifier detection in `onSortingChange`. |
| `comparator: (a, b) => number` | `ColumnDef.sortingFn?: string \| SortingFn<TRow>` | full | Built-in registry: `alphanumeric`, `text`, `number`, `datetime`, `basic`; custom via `registerSortingFn('name', fn)`. |
| `filter: true` / `'agTextColumnFilter'` / `'agNumberColumnFilter'` | `ColumnDef.enableFiltering?: true` + `filterFn?: string \| FilterFn<TRow>` | full | Built-in filter registry; custom via `registerFilterFn`. |
| `filterParams: { ... }` | consumer's `filterFn` reads `filterValue` (opaque) | full | Engine exposes `ColumnFilterItem.value`; the consumer's `filterFn` interprets it. |
| `floatingFilter: true` | consumer renders | none | No first-class floating-filter UI; consumer renders one with `getFacetedUniqueValues` / `getFacetedMinMax`. |
| `quickFilterText: 'foo'` (global quick filter) | none | none | v2 candidate (`api-freeze.md` §7). |
| `pagination: true` | `pagination: { pageIndex, pageSize }` slice | full | Client-side or server-side. |
| `paginationPageSize: 25` | `pagination.pageSize` | full | |
| `paginationAutoPageSize: true` | consumer derives `pageSize` from layout | partial | table-kit has no auto-size helper. |
| `rowBuffer: 20` (virtualization overscan) | `useRowVirtualizer({ overscan: 20 })` | full | |
| `rowHeight: 40` | `useRowVirtualizer({ estimateSize: () => 40 })` | full | |
| `rowModelType: 'clientSide'` (default) | (always client-side for `useDataTable` without `dataSource`) | full | |
| `rowModelType: 'serverSide'` | `dataSource?: DataSource<TRow>` (M3 server modes) + `useDataSource` hook | full | `DataSource.fetchRows(query): Promise<RowsResponse>`. |
| `rowModelType: 'infinite'` | `dataSource` (server modes) | partial | Infinite mode is a consumer's `DataSource` implementation pattern; table-kit's contract is the same. |
| `cacheBlockSize: 100` | consumer controls via `DataSource` | full | Engine contract: `DataSource` owns cache. |
| `rowSelection: 'single'` / `'multiple'` | none (v1.0); `rowSelection` slice (v1.5) | none in v1.0 | v1.5 (`api-freeze.md` §7). |
| `enableRangeSelection: true` (Enterprise) | none | none | Enterprise-only; out of scope. |
| `rowDragManaged: true` | none | none | No row drag in v1.0. |
| `rowGroupPanelShow: 'always'` | none | none | Grouping is pivot's job. |
| `columnState: [...]` (saved layout) | `state.columnOrder` + `state.columnVisibility` + `state.columnPinning` + `state.columnSizing` | full | Consumer persists the four slice values; engine restores them on remount. |
| `onSortChanged`, `onFilterChanged`, `onColumnMoved`, `onColumnResized`, `onColumnPinned`, `onColumnVisible` | `onSortingChange`, `onColumnFiltersChange`, `onColumnOrderChange`, `onColumnSizingChange`, `onColumnPinningChange`, `onColumnVisibilityChange` | full | One `on<Slice>Change` per slice + global `onStateChange`. |
| `onRowClicked`, `onCellClicked`, `onCellDoubleClicked`, `onCellContextMenu`, `onCellFocused` | `onRowClick`, `onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellFocusChange` | full | Spec §7.6. |
| `getContextMenuItems` | consumer wires `onCellContextMenu` and renders the menu | full | No built-in menu; consumer's responsibility. |
| `clipboard: true` / `enableCellTextSelection: true` | none | none | Spec §2.3 non-goal. |
| `suppressClipboardPaste`, `processCellFromClipboard` | none | none | No clipboard surface. |
| `processCellForClipboard`, `processCellFromClipboard` | none | none | No clipboard surface. |
| `exportDataAsCsv()`, `exportDataAsExcel()` | none | none | Export is out of scope per spec §2.3. |

### 3.4 Concept → feature table (group: Rendering & layout)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `domLayout: 'normal'` / `'autoHeight'` / `'print'` | consumer's CSS layout + `useRowVirtualizer` | full | Consumer picks the DOM shape; prop getters return semantic attribute maps, not markup. |
| `headerHeight: 48` | consumer's CSS | none | No opinion. |
| `rowHeight: 40` | `useRowVirtualizer({ estimateSize: () => 40 })` | full | Affects virtualization math. |
| `colDef.width: 100` | `ColumnDef.size: 100` | full | |
| `colDef.flex: 1` (flex sizing) | none | none | No flex-grow helper; consumer computes from remaining space. |
| `colDef.minWidth: 50` | `ColumnDef.minSize: 50` | full | |
| `colDef.maxWidth: 300` | `ColumnDef.maxSize: 300` | full | |
| `colDef.resizable: true` | `useResizeHandle()` + consumer wires pointer on `header.getResizeHandleProps()` | full | Spec §7.2. |
| `colDef.pinned: 'left' \| 'right'` | `ColumnDef.pinned?: 'left' \| 'right' \| false` + `columnPinning` slice | full | Spec §7.3. |
| `colDef.lockPosition: 'left'` | none directly; consumer prevents move via `columnPinning.left` (pinned columns don't participate in `columnOrder`) | partial | No first-class "lock" semantics; pinning is the analog. |
| `colDef.hide: true` | `state.columnVisibility[id] = false` | full | |
| `colDef.suppressMovable: true` | consumer ignores drag handlers on the column header | partial | No engine-level suppress; consumer's responsibility. |
| `colDef.suppressSizeToFit: true` | consumer-controlled | partial | |
| `colDef.toolPanel` (Columns / Filters tool panel) | none | none | No tool-panel UI in core. |
| `rowStyle: { ... }`, `rowClass: '...'`, `getRowClass: (params) => string` | consumer's CSS via `row.getRowProps({ className })` | full | Consumer applies via prop getters. |
| `cellStyle: { ... }`, `cellClass: '...'`, `cellClassRules: {...}` | consumer's CSS via `cell.getCellProps({ className })` | full | Same mechanism. |

### 3.5 Concept → feature table (group: Interactions & accessibility)

| Target feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Keyboard navigation (arrow keys, Home/End, PageUp/PageDown, etc.) | `useKeyboardNav()` | full | APG grid pattern + roving `tabindex`; spec §7.5. |
| Tab exits the grid by default | `tabBehavior?: 'exit'` (default) | full | APG-conformant. |
| Tab moves between cells | `tabBehavior?: 'cells'` (opt-in) | partial | M6 phase 2 ships both modes; `'cells'` is opt-in with smoke coverage. |
| Sort toggle (click header) | `header.getSortToggleProps()` | full | Multi-sort supported. |
| Resize via pointer on column edge | `header.getResizeHandleProps()` + `useResizeHandle()` | full | Spec §7.2. |
| Resize via keyboard | same `getResizeHandleProps()` (focusable `role="separator"`) | full | Arrow keys adjust; Enter commits; Escape cancels in `onEnd` mode. |
| Announcer / aria-live | `useDataTable` returns `Announcer` component + `messages?: Partial<MessagesMap>` | full | 18 default keys; per-key overrides. |
| ARIA structure validation | `validate(source, options): ValidationResult` | full | Dev-mode check. |
| `enableCellChangeFlash: true` | none | none | No cell edit state in v1.0. |
| `suppressRowVirtualisation: true` | consumer doesn't use `useRowVirtualizer` | full | Engine is virtualizer-agnostic; consumer chooses. |
| `getDocument: () => Document` (custom document for testing) | consumer's test wrapper | full | Out of core scope; consumers wire their own. |

### 3.6 Where AG-Grid DataGrid has no v1.0 analog

- **Cell editing** (`editable: true`, `editType: 'fullRow'`, `valueSetter`, `valueParser`) — spec §2.3 non-goal.
- **Row / range selection** (`rowSelection: 'single' | 'multiple'`, `enableRangeSelection`) — v1.5 (`api-freeze.md` §7).
- **Clipboard** (`clipboard: true`, `processCellForClipboard`, `processCellFromClipboard`) — spec §2.3 non-goal.
- **Export** (`exportDataAsCsv()`, `exportDataAsExcel()`) — spec §2.3 non-goal.
- **Master/Detail** (Enterprise) — out of scope.
- **Global quick filter** (`quickFilterText`) — v2 candidate.
- **Tree Data** (`treeData: true`, `getDataPath`) — for hierarchical data, use `usePivotTable` instead.
- **Row Grouping** (`rowGroupPanelShow`, `enableRowGroup`) — for grouping, use `usePivotTable` instead.
- **Set Filter / Rich Select / Multi Filter** (Enterprise filter components) — out of scope (built-in filter registry is intentionally minimal).
- **Floating filter UI** — no first-class floating filter; consumer renders one with `getFacetedUniqueValues` / `getFacetedMinMax`.
- **Sparklines / charts on cells** (Enterprise) — out of scope.
- **Row drag** (`rowDragManaged: true`) — out of scope.
- **Column tool panel** — no built-in tool panel UI.
- **Auto-size columns to content / to fit** (`sizeColumnsToFit()`) — v2 (`api-freeze.md` §7).
- **Cell value change flash** — no cell edit state in v1.0.
- **Custom column types** (`colDef.type: 'numericColumn'`) — no column-type registry; consumer derives from data shape.

### 3.7 Where table-kit v1.0 is richer than AG-Grid

- **Per-slice controlled state** — every state slice is independently controllable. AG-Grid's `columnState` and `sortModel` are coarse-grained single-piece snapshots; table-kit exposes 9 individually-controllable slices.
- **ARIA APG grid pattern** — full WAI-ARIA APG grid compliance + roving `tabindex` + `focusedCell` slice. AG-Grid is close to APG but the row group / tree data variants have historical quirks.
- **i18n announcer** — `messages?: Partial<MessagesMap>` per-key overrides with 18 default keys; the consumer wires the same announcer across `useDataTable` and `usePivotTable`.
- **Faceting helpers** — `getFacetedUniqueValues`, `getFacetedMinMax` for filter UI construction; AG-Grid's column-menu value lists are UI-bound and not directly callable.
- **Server modes via `DataSource`** — declarative `DataSource<TRow>` interface; switching client ↔ server is per-instance. AG-Grid's server-side row model is a separate runtime mode.
- **Stable identity everywhere** — every row, column, pivot node has a consumer-controllable stable id (P6), making controlled state + virtualization + server expansion coherent.
- **Registries for cross-boundary serialization** — sort/filter/aggregator registries use string names when crossing worker/server boundaries (P3); AG-Grid has no equivalent seam.
- **Dependency-inversion throughout** — every state slice is controllable; every algorithm is injectable. AG-Grid's customization points are wider but less principled (more callbacks, fewer state contracts).
- **Smaller bundle target** — core + react, DataTable-only usage, ≤ ~15kB min+gzip (`api-freeze.md` §4; perf target from initial-spec §12). AG-Grid Community is ~150kB+ min+gzip.

### 3.8 See also

- `./../ag-grid-pivot/guide.md` — AG-Grid Pivot variant (`pivotMode`).
- `./../webix-datagrid/guide.md` — parallel Webix DataTable mapping (useful for cross-checking overlap).
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

- [ ] `docs/guides/ag-grid-datagrid/SKILL.md` exists, is non-empty, has all 5 required frontmatter keys.
- [ ] `docs/guides/ag-grid-datagrid/guide.md` exists, is non-empty, has all 5 required section headers, and cites `docs/m6-hardening/api-freeze.md`.
- [ ] The four concept-table groups (Data & schema / State & lifecycle / Rendering & layout / Interactions & accessibility) each have at least one row.
- [ ] "Where the target has no v1.0 analog" section names at least: cell editing, row selection, clipboard, export, global quick filter.
- [ ] "Where table-kit v1.0 is richer" section names at least: per-slice controlled state, ARIA APG grid, i18n announcer, faceting helpers, server modes.
- [ ] The cross-reference to `./../ag-grid-pivot/guide.md` is present in "See also".
- [ ] The Phase 1 smoke test passes for this target's describe block.

## 5. Verification

```bash
# 1. Files exist
test -s docs/guides/ag-grid-datagrid/SKILL.md
test -s docs/guides/ag-grid-datagrid/guide.md

# 2. Frontmatter keys
grep -q '^name:'                docs/guides/ag-grid-datagrid/SKILL.md
grep -q '^description:'         docs/guides/ag-grid-datagrid/SKILL.md
grep -q '^verified_against:'    docs/guides/ag-grid-datagrid/SKILL.md
grep -q '^target:'              docs/guides/ag-grid-datagrid/SKILL.md
grep -q '^companion_guide:'     docs/guides/ag-grid-datagrid/SKILL.md

# 3. Section headers + verified-against footer + pivot cross-link
grep -q '## Mapping at a glance'               docs/guides/ag-grid-datagrid/guide.md
grep -q '## Concept → feature table'          docs/guides/ag-grid-datagrid/guide.md
grep -q '## Where the target has no v1.0 analog' docs/guides/ag-grid-datagrid/guide.md
grep -q '## Where table-kit v1.0 is richer'   docs/guides/ag-grid-datagrid/guide.md
grep -q '## Verified against'                 docs/guides/ag-grid-datagrid/guide.md
grep -q 'docs/m6-hardening/api-freeze.md'     docs/guides/ag-grid-datagrid/guide.md
grep -q 'ag-grid-pivot/guide.md'              docs/guides/ag-grid-datagrid/guide.md

# 4. The smoke test passes for this target
pnpm test packages/core/src/__tests__/guides.test.ts 2>&1 | grep -A2 ag-grid-datagrid | head -20
# Expected: ag-grid-datagrid describe block passes; only ag-grid-pivot still fails.
```

## 6. Risks

- **AG-Grid version drift.** AG-Grid's API changed significantly between v28, v29, v30, v31, v32. The guide cites by canonical feature name (e.g., `pivotMode`, `valueGetter`); consumers on older versions may need to translate. Out of scope per the user's "feature-comparison only" constraint.
- **Enterprise vs Community feature split.** Many AG-Grid features (Range Selection, Master/Detail, Set Filter, Rich Select, Multi Filter, Sparklines, Row Grouping, Tree Data, Pivot, Aggregation) are Enterprise-only. The guide names features without Enterprise tags; consumers verify licensing themselves.
- **`colDef.field` vs `ColumnDef.id` rename.** AG-Grid's `field` is the row-data key; table-kit uses `id` because columns don't always have a row-data key (computed columns). The rename is explicitly called out in the Data & schema table so consumers don't silently mis-translate.
- **`valueParser` / `valueSetter` confusion.** AG-Grid's `valueFormatter` is read-only formatting (maps to `cell`); `valueParser` and `valueSetter` are write-side editing (no v1.0 analog). The guide makes this distinction explicit so reviewers don't conflate them.

## 7. Out of scope for this phase

- Writing the AG-Grid Pivot doc pair (Phase 5).
- Final cross-links from `docs/recipes/README.md` (Phase 6).
- Any source code change in `packages/*/src/`.