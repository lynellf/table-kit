<!-- Historical: true -->
# Webix DataTable → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

Webix DataTable covers a broad column-grid feature surface: columns, rows, data loading, selection, sorting, filtering, pagination, scroll, fixed columns, drag order, resizable columns, header filters, math expressions, editable cells, footer, tooltips, grouping, validation rules, autoConfig, height, export, clipboard, and custom cells.

Table-kit's `@lynellf/tablekit-react` (`useDataTable`) covers a subset of that surface in v1.0: column model, row data, sorting, per-column filtering, pagination, column visibility, column pinning, column sizing, column reorder (`moveColumn`), row/cell virtualization (`useRowVirtualizer`, `useCenterVirtualizer`), keyboard navigation (`useKeyboardNav`, `useTabBehavior`), live-region announcer (`ReactAnnouncer`, `getReactAnnouncer`), server-side modes (`useDataSource`), and ARIA grid validation (`validate`).

The mapping is 1:1 for columns/sort/filter/resize/pinning/virtualization/a11y. It is asymmetric for column-reorder (Webix uses drag; table-kit uses `moveColumn` + dnd-kit recipe). It has no v1.0 analog for cell editing, math expressions, clipboard, export, and footer math.

## Concept → feature table

### Data & schema

| Webix DataTable feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `columns` (col defs with `id`, `header`, `width`, etc.) | `Column`, `createColumns` (`@lynellf/tablekit-core`) | Full | Column model is 1:1; `header` maps to `header`/`footer` in table-kit |
| `data` (row array) | `dataSource` option on `useDataTable` | Full | Accepts any `TRow[]`; no schema enforcement |
| Row identity (`rowId`) | Consumer-supplied `getRowId` | Full | Consumer provides a row ID accessor; table-kit does not enforce one |
| `scheme` (per-row field transformation) | Consumer middleware / pre-processing | Partial | No built-in `scheme` equivalent; consumer applies transformations before passing data |
| `url` / `dataautoheight` | `useDataSource` (`@lynellf/tablekit-react`) | Full | `useDataSource(table, { url, onSuccess, onError })` covers remote data |
| `save` (CRUD persistence) | Not in v1.0 | None | Out of scope per spec |
| `autoConfig` | Consumer-constructed column model | Partial | Consumer builds columns from schema; no automatic inference in v1.0 |

### State & lifecycle

| Webix DataTable feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `select` (row/cell selection) | `rowSelection` slice | None | Deferred to v1.5 (`api-freeze.md` §7) |
| `sorting` (multi-column sort) | `sorting` slice (`onStateChange`) | Full | Built-in sort functions: `alphanumeric`, `text`, `number`, `datetime`, `basic` |
| `filter` (per-column filter) | `columnFilters` slice | Full | Per-column filter state; `setFilter` / `headerFilter` helpers do not exist in v1.0 |
| Global filter | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| `paging` / `Pager` | `pagination` slice | Full | `setPageSize`, `setPageIndex`, `computePageCount` |
| `scroll` | `useScrollAdapter` (`@lynellf/tablekit-react`) | Full | `useScrollAdapter` returns a scroll adapter; `useRowVirtualizer` handles virtual rows |
| Column visibility (`columns[].hidden`) | `columnVisibility` slice | Full | `toggleColumnVisibility`, `toggleAllColumnsVisibility` |
| Column pinning (`columns[].fixed`) | `columnPinning` slice | Full | `left`, `right` pin sets; sticky CSS via recipe |
| Column resizing (`resize`) | `columnSizing` slice + `useResizeHandle` | Full | `onColumnSizingChange` drives the slice; `useResizeHandle` provides the drag interaction |
| Column reorder (drag) | `moveColumn` + `columnOrder` slice | Full | `moveColumn(id, toIndex)`; combine with dnd-kit per `docs/recipes/dnd-column-reorder.md` |
| Column auto-fit | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| `columnGroup` | `createColumns` + header groups | Partial | Header groups via nested column definition; no explicit `columnGroup` API |
| `math` (formula evaluation) | Not in v1.0 | None | Out of scope |
| Cell editing (`editable`) | Not in v1.0 | None | Deferred to v2 (`api-freeze.md` §7) |
| Validation rules (`rules`) | Not in v1.0 | None | Validation surface (`validate`) is a11y-only in v1.0; value validation is out of scope |
| `export` (Excel/CSV) | Not in v1.0 | None | Out of scope |
| `clipboard` | Not in v1.0 | None | Out of scope |
| State persistence (`serialize`) | Not in v1.0 | None | Deferred to v1.5 (`api-freeze.md` §7) |

### Rendering & layout

| Webix DataTable feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `height` / `width` | Consumer-controlled CSS | Full | table-kit provides no fixed-dimension CSS; consumer sets scroll container size |
| `scrollX` / `scrollY` | `useScrollAdapter` | Full | Scroll adapter handles virtual scroll sync |
| Fixed columns (`left`, `right`) | `columnPinning` slice + sticky CSS | Full | Pin slices control which columns stick; consumer applies CSS (`position: sticky`) |
| Row height (`rowHeight`) | Consumer CSS / `estimatedSize` | Full | Consumer sets row height via CSS; `useRowVirtualizer` accepts `estimateSize` |
| `dataSort` (live re-sort on edit) | Consumer-controlled via `onStateChange` | Full | Consumer intercepts state change and re-triggers sort |
| `header`, `footer` cells | `header`/`footer` in `Column` def | Full | `header` accepts string or `HeaderDef[]`; `footer` accepts `FooterDef[]` |
| `tooltip` | Consumer-controlled render slot | Partial | No built-in tooltip; consumer renders tooltip in cell via column `cell` prop |
| `template` (cell render) | `cell` prop in `Column` def | Full | `cell: (row) => ReactNode`; no virtual DOM diffing of cell content |
| `type` (cell css class) | Consumer CSS class logic | Full | Consumer applies CSS classes via `cell` render prop |
| Group header / `span` | Consumer-controlled grouping | Partial | No built-in row spanning; consumer uses `grouping` state or pivot row model |
| `rowLine` | Consumer CSS | Full | Consumer controls `tr` styling via CSS |
| `liveEdit` | Not in v1.0 | None | Deferred to v2 |
| Auto-height (`autoheight`) | Consumer CSS | Full | Consumer sets scroll container height |

### Interactions & accessibility

| Webix DataTable feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Keyboard nav (arrow, Tab, Enter) | `useKeyboardNav` + `useTabBehavior` | Full | `useKeyboardNav` handles arrow/Enter; `useTabBehavior('exit' | 'cells')` handles Tab |
| Focus management | `focusedCell` slice | Full | Controlled via `onStateChange`; `useKeyboardNav` drives it |
| ARIA role="grid" | `validate` + ARIA APG grid pattern | Full | `validate(source, options)` from `@lynellf/tablekit-react`; ARIA APG grid roles wired per recipe |
| Announcer / screen reader | `ReactAnnouncer`, `getReactAnnouncer` + `MessagesMap` | Full | `MessagesMap` covers sort, filter, pagination, resize, expansion, server events |
| `context` (right-click) | Consumer-controlled | Partial | No built-in context menu; consumer renders one controlled by external state |
| `onItemClick` / event handlers | `onStateChange` + consumer event handlers | Full | `onStateChange` is the single state-change hook; consumer wires DOM events separately |
| Drag-and-drop (`drag`) | `moveColumn` + `columnOrder` slice | Full | `moveColumn` drives `columnOrder`; consumer wires drag (dnd-kit or native DnD) |
| `onScroll` | `useScrollAdapter` callbacks | Full | Consumer hooks scroll events via adapter |

## Where the target has no v1.0 analog

- **Cell editing (`editable`, `editType`)** — deferred to v2. Webix's inline edit mode (double-click, custom editors) has no table-kit equivalent in v1.0.
- **Math expressions (`math`)** — deferred to v2. Webix's formula evaluation in cells/footers is out of scope.
- **Clipboard operations** — deferred to v2. Webix's copy/paste support is out of scope.
- **Export (Excel, CSV, PDF)** — not in v1.0. No built-in export pipeline.
- **State serialization (`serialize`/`parse`)** — deferred to v1.5. `serializeState`/`hydrateState` helpers are out of scope.
- **`autoConfig` automatic column inference** — deferred to v2. No automatic column model inference in v1.0.
- **`scheme` per-row field transformation** — consumer middleware is the workaround; no built-in equivalent.

## Where table-kit v1.0 is richer than the target

- **Per-slice controlled-state contract.** Webix exposes global state objects. Table-kit exposes individual slices (`sorting`, `columnFilters`, `pagination`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnOrder`, `focusedCell`) as separate state objects, each with a first-class `onChange` callback. This makes incremental UI (show sort order without re-rendering filter) possible without Webix's event bubbling complexity.
- **ARIA APG grid pattern + live-region announcer.** `validate(source, options)` from `@lynellf/tablekit-react` runs ARIA grid structure checks. `ReactAnnouncer` + `MessagesMap` announces sort, filter, pagination, resize, expansion, and server events to screen readers. Webix DataTable does not expose a comparable announcer surface.
- **Faceting helpers (`getFacetedUniqueValues`, `getFacetedMinMax`).** These helpers compute faceted counts over the full dataset for use in filter UIs. Webix's `headerFilter` does not expose a faceting API.
- **Server-side modes via `useDataSource`.** `useDataSource(table, { url, onSuccess, onError })` wires server-side pagination/sort/filter into `useDataTable`'s state machine. Webix requires manual `url` + event handler wiring.
- **Main-thread + worker pivot engine seam.** The pivot package ships `createMainThreadEngine()` and `createWorkerEngine()` with a stable `Aggregator.merge` contract. Webix's pivot is server-side or client-side without a worker-adapter pattern.
- **`useRowVirtualizer` + `useCenterVirtualizer` + `useSizeObserver`.** Stable virtualization primitives that survive column/state changes. Webix's virtualization is tied to its scroll container.

## See also

- `../webix-pivot/guide.md` (Webix Pivot → table-kit pivot)
- `../ag-grid-datagrid/guide.md` (AG-Grid DataGrid → table-kit)
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
