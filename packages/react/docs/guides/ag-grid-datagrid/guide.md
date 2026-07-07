# AG-Grid DataGrid → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

AG-Grid DataGrid covers an extensive column-grid feature surface: `columnDefs`, `defaultColDef`, row data, row selection, sorting, multi-sort, filtering (built-in + floating filters), column pinning, resizing, hiding, locking, reordering, row dragging, cell editing, cell renderers, header components, tooltips, pagination, server-side row model, client-side row model, column state, context menu, cell flash on change, and more.

Table-kit's `@lynellf/tablekit-react` (`useDataTable`) covers a subset of that surface in v1.0: column model, row data, sorting, per-column filtering, pagination, column visibility, column pinning, column sizing, column reorder (`moveColumn`), row/cell virtualization (`useRowVirtualizer`, `useCenterVirtualizer`), keyboard navigation (`useKeyboardNav`, `useTabBehavior`), live-region announcer (`ReactAnnouncer`, `getReactAnnouncer`), server-side modes (`useDataSource`), and ARIA grid validation (`validate`).

The mapping is 1:1 for column defs, sort, filter, pagination, column ops (visibility, pinning, sizing, reorder). It is asymmetric for multi-sort (AG-Grid sorts all columns simultaneously; table-kit exposes `sorting` as a stable array and consumer wires UI to drive it). It has no v1.0 analog for row selection, cell editing, global quick filter, column state save/restore, context menu, cell flash, or value setter.

## Concept → feature table

### Data & schema

| AG-Grid DataGrid feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `columnDefs` | `Column`, `createColumns` (`@lynellf/tablekit-core`) | Full | 1:1; AG-Grid's `colDef` maps to table-kit `Column` |
| `defaultColDef` | Consumer-constructed shared column defaults | Full | Consumer applies defaults when building each `Column` |
| `rowData` | `dataSource` option on `useDataTable` | Full | Accepts any `TRow[]`; no schema enforcement |
| `getRowId` | Consumer-supplied `getRowId` accessor | Full | Consumer provides row ID; table-kit does not enforce one |
| `valueGetter` | `accessorKey` or custom accessor in `Column` def | Full | Consumer maps field to accessor |
| `valueFormatter` | Consumer-provided `cell` render slot | Full | Consumer renders formatted value in the `cell` render prop |
| `valueParser` | Not in v1.0 | None | Value parsing is part of cell editing (v2) |
| Schema inference | Consumer-constructed column model | Partial | Consumer builds columns from schema; no automatic inference in v1.0 |
| `rowModelType: 'clientSide'` | Default (no server hook) | Full | When `useDataSource` is not used, all data is client-side |
| `rowModelType: 'serverSide'` | `useDataSource` (`@lynellf/tablekit-react`) | Full | `useDataSource(table, { url, onSuccess, onError })` wires server-side lifecycle |
| `cacheBlockSize` | Consumer-controlled | Full | Consumer manages pagination granularity; table-kit exposes `setPageSize` |
| `rowBuffer` | Consumer-controlled via virtualization config | Full | Consumer sets `overscan` on `useRowVirtualizer` |

### State & lifecycle

| AG-Grid DataGrid feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `sortable` / `sort` | `sorting` slice (`onStateChange`) | Full | `sortable: true` → column has sort toggle; `sort: 'asc'|'desc'` sets initial state |
| `sortingOrder` | Consumer-driven | Full | Consumer controls sort priority in UI |
| `multiSortKey: 'ctrl'` | Consumer-driven multi-sort | Full | Consumer wires multi-sort UI; `sorting` slice is a stable array |
| `filter: true` / `filterParams` | `columnFilters` slice + built-in filter functions | Full | AG-Grid built-in filters map to table-kit filter function names (`alphanumeric`, `text`, `number`, `datetime`) |
| `floatingFilter` | Consumer-built filter UI | Partial | No built-in floating filter row; consumer builds filter UI from `columnFilters` slice |
| Global quick filter | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| `pagination: true` | `pagination` slice | Full | `setPageSize`, `setPageIndex`, `computePageCount` |
| `paginationPageSize` | `pagination.pageSize` (initial) | Full | Consumer sets initial `pageSize` on `useDataTable` options |
| `paginationAutoPageSize` | `computePageCount` | Full | Consumer calls `computePageCount` to derive page size from container height |
| `rowSelection` | `rowSelection` slice | None | Deferred to v1.5 (`api-freeze.md` §7) |
| Column visibility (`hide: true`) | `columnVisibility` slice | Full | `toggleColumnVisibility`, `toggleAllColumnsVisibility` |
| Column pinning (`pinned: 'left'|'right'`) | `columnPinning` slice | Full | `left`, `right` pin sets; sticky CSS via recipe |
| Column resizing (`resizable`, `width`, `minWidth`, `maxWidth`, `flex`) | `columnSizing` slice + `useResizeHandle` | Full | `onColumnSizingChange` drives slice; `useResizeHandle` provides drag interaction |
| Column reorder (`suppressMovable: false`) | `moveColumn` + `columnOrder` slice | Full | `moveColumn(id, toIndex)`; combine with dnd-kit per `docs/recipes/dnd-column-reorder.md` |
| Column auto-fit | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| `lockPosition` / `lockPinned` | `columnPinning` + consumer logic | Full | Consumer prevents user from changing pin state |
| `columnState` save/restore | Not in v1.0 | None | Deferred to v1.5 (`api-freeze.md` §7) |
| State persistence | Not in v1.0 | None | Deferred to v1.5 (`api-freeze.md` §7) |

### Rendering & layout

| AG-Grid DataGrid feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `rowHeight` | Consumer CSS / `estimatedSize` on virtualizer | Full | Consumer sets row height via CSS; `useRowVirtualizer` accepts `estimateSize` |
| `domLayout: 'normal'|'print'|'autoHeight'` | Consumer CSS | Full | Consumer controls scroll container height |
| `cellRenderer` | `cell` prop in `Column` def | Full | `cell: (row) => ReactNode`; consumer controls cell rendering |
| `cellClassRules` | Consumer CSS class logic | Full | Consumer applies CSS classes via `cell` render prop |
| `headerComponent` / `headerComponentParams` | `header` in `Column` def | Full | `header` accepts string or `HeaderDef[]`; consumer provides header renderer |
| `tooltipValueGetter` | Consumer-controlled render slot | Partial | No built-in tooltip; consumer renders tooltip in cell via `cell` prop |
| Row spanning | Consumer-controlled | Partial | No built-in row spanning; consumer builds spanning layout with CSS |
| `enableCellChangeFlash` | Not in v1.0 | None | Deferred to v2 (cell flash is part of cell editing surface) |
| `refreshCells` | Consumer-controlled re-render | Full | Consumer controls React re-render lifecycle |

### Interactions & accessibility

| AG-Grid DataGrid feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Keyboard nav (arrow, Tab, Enter) | `useKeyboardNav` + `useTabBehavior` | Full | `useKeyboardNav` handles arrow/Enter; `useTabBehavior('exit' | 'cells')` handles Tab |
| Focus management | `focusedCell` slice | Full | Controlled via `onStateChange`; `useKeyboardNav` drives it |
| ARIA role="grid" | `validate` + ARIA APG grid pattern | Full | `validate(source, options)` from `@lynellf/tablekit-react` |
| Announcer / screen reader | `ReactAnnouncer`, `getReactAnnouncer` + `MessagesMap` | Full | `MessagesMap` covers sort, filter, pagination, resize, expansion, server events |
| `rowDragManaged` | Consumer-controlled | Full | Consumer wires drag (dnd-kit); `columnOrder` slice + `moveColumn` handle reorder result |
| `contextMenuItems` / `getContextMenuItems` | Consumer-controlled | Partial | No built-in context menu; consumer renders one controlled by external state |
| `onSortChanged` / `onFilterChanged` / `onRowClicked` | `onStateChange` | Full | Consumer intercepts state changes and fires side effects |
| Cell editing (`editable`, `editType`, `cellEditor`) | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| `valueSetter` | Not in v1.0 | None | Deferred to v2 (part of cell editing surface) |
| `checkboxChecked` / checkbox selection | `rowSelection` slice | None | Deferred to v1.5 (`api-freeze.md` §7) |

## Where the target has no v1.0 analog

- **Row selection (`rowSelection`, checkbox selection)** — deferred to v1.5. AG-Grid's multi/single row selection with checkboxes has no table-kit equivalent in v1.0.
- **`valueSetter` / `editType: 'fullRow'`** — deferred to v2. Cell editing and row editing are out of scope.
- **`cellEditor`** — deferred to v2. Custom cell editors are out of scope.
- **Global quick filter** — deferred to v2. No built-in global search across all columns.
- **`columnState` save/restore** — deferred to v1.5. `serializeState`/`hydrateState` helpers are out of scope.
- **`enableCellChangeFlash`** — deferred to v2. Cell flash is part of the cell editing surface.
- **`contextMenuItems` / `getContextMenuItems`** — consumer builds their own context menu; no built-in support in v1.0.
- **`floatingFilter` row** — consumer builds the filter UI from the `columnFilters` slice; no built-in floating filter row.

## Where table-kit v1.0 is richer than the target

- **Per-slice controlled-state contract.** AG-Grid exposes `columnState` as a monolithic serialized object. Table-kit exposes individual slices (`sorting`, `columnFilters`, `pagination`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnOrder`, `focusedCell`) as separate state objects, each with a first-class `onChange` callback. This makes incremental UI (update sort without touching filter) possible without AG-Grid's event-bubbling complexity.
- **ARIA APG grid pattern + live-region announcer.** `validate(source, options)` runs ARIA grid structure checks. `ReactAnnouncer` + `MessagesMap` announces sort, filter, pagination, resize, expansion, and server events to screen readers. AG-Grid Community does not ship a comparable announcer; it requires AG-Grid Enterprise for full accessibility support.
- **Faceting helpers (`getFacetedUniqueValues`, `getFacetedMinMax`).** These helpers compute faceted counts over the full dataset for use in filter UIs. AG-Grid's built-in filters do not expose a faceting API in Community edition.
- **Server modes via `useDataSource`.** `useDataSource(table, { url, onSuccess, onError })` wires server-side pagination/sort/filter into `useDataTable`'s state machine cleanly. AG-Grid's server-side row model requires Enterprise and complex `IServerSideDatasource` wiring.
- **Main-thread + worker pivot engine seam.** The pivot package ships `createMainThreadEngine()` and `createWorkerEngine()` with a stable `Aggregator.merge` contract. AG-Grid Enterprise's pivot requires server-side processing for large datasets.
- **`useRowVirtualizer` + `useCenterVirtualizer` + `useSizeObserver`.** Stable virtualization primitives that survive column/state changes and work with any DOM structure.
- **Prop getter pattern (`getRowModel`, `getHeaderGroups`, etc.).** Table-kit's prop getters (`mergeProps`, `chainHandlers`) let consumers compose event handlers without AG-Grid's component-override model.

## See also

- `../ag-grid-pivot/guide.md` (AG-Grid Pivot → table-kit pivot — pivot features are not in scope here)
- `../webix-datagrid/guide.md` (Webix DataTable → table-kit React)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/initial-spec.md` §1, §7–9 (feature surface)
- `docs/recipes/layout.md` (virtualization + sticky pinning)
- `docs/recipes/dnd-column-reorder.md` (column reorder with dnd-kit)
- `docs/recipes/kbd-column-reorder.md` (keyboard column reorder)
- `docs/recipes/split-pane.md` (scroll-sync multi-pane layout)

## Verified against

- `@lynellf/tablekit-react@1.0.0`
- `@lynellf/tablekit-core@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
