<!-- Historical: true -->
# AG-Grid Pivot → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

AG-Grid's pivot feature set (Enterprise) covers: `pivotMode` toggle, `pivotResultFields` for derived column names, `aggFunc`/`aggFuncs` for aggregation, `pivotColumnGroupTotals` / `pivotRowTotals` for grand totals, `pivotComparator` for custom sort within pivot hierarchies, `expandablePivotGroup` for lazy expansion, `groupDisplayType` for how pivot group cells render, and `processPivotResultColDef` for manual column override. `pivotMode` itself is not in table-kit's DataTable (`useDataTable`) — it lives in the pivot package (`usePivotTable`).

Table-kit's `@lynellf/tablekit-pivot` (`usePivotTable`, `createPivotTable`) covers a framework-free pivot engine with a stable `PivotConfig` shape (`rows`, `columns`, `measures`, `filters`, `totals`), built-in aggregators (`sum`, `count`, `min`, `max`, `avg`), an aggregator registry (`registerAggregator`), main-thread + worker engine adapters, treegrid prop getters, and ARIA announcer helpers.

The mapping is 1:1 for `pivotMode` → `usePivotTable` (DataGrid vs. PivotTable), `aggFunc` → `MeasureDef.aggregator`, `aggFuncs` → `registerAggregator`, and `expandablePivotGroup` → `expanded` + `toggleExpanded`. It is asymmetric for column hierarchy rendering (AG-Grid allows `processPivotResultColDef` to manually override pivot column headers; table-kit dynamically derives columns and the consumer controls how to flatten/render them). Subtotal rows per level are deferred to v1.5.

## Concept → feature table

### Structure (pivot mode, rows, columns, values)

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `pivotMode: true` | `usePivotTable` (vs. `useDataTable`) | Full | `usePivotTable` replaces `useDataTable` for pivot layout; there is no `pivotMode` toggle in DataTable |
| Row field list | `PivotConfig.rows: FieldRef[]` | Full | Each entry is a field reference string or `{ id, sortDirection }` |
| Column field list | `PivotConfig.columns: FieldRef[]` | Full | Column hierarchy derived from field values in `columns` |
| Value fields (`valueField` + aggregation) | `PivotConfig.measures: MeasureDef[]` | Full | `{ id, field, aggregator }` + optional `format` |
| `pivotResultFields` (derived col names) | Consumer-controlled column rendering | Full | Consumer controls how pivot column values map to display headers; table-kit provides `getHeaderRows` and `getLeafColumns` |
| `processPivotResultColDef` (manual pivot col override) | Consumer-controlled column rendering | Partial | Consumer builds column definitions from `getHeaderRows`/`getLeafColumns`; no automatic override equivalent |
| `groupDisplayType` | Consumer-controlled rendering | Full | Consumer chooses how to render group cells (flat label, hierarchical path, etc.) |
| Pre-aggregation filters | `PivotConfig.filters: PivotFilter[]` | Full | `{ field, operator, value }` applied before aggregation |

### Aggregation & totals

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `aggFunc: 'sum'/'count'/'min'/'max'/'avg'` | `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator` | Full | Built-in; pass by name string or direct reference |
| `aggFuncs` (custom function registry) | `registerAggregator(id, factory)` + `Aggregator.merge` | Full | Custom aggregator must implement `Aggregator.merge` for worker/server compatibility |
| `pivotColumnGroupTotals` | `TotalsConfig.grandTotalColumn: boolean` | Full | `grandTotalColumn: true` adds a grand-total column; `grandTotalColumnPosition: 'start' | 'end'` |
| `pivotRowTotals` | `TotalsConfig.grandTotalRow: boolean` | Full | `grandTotalRow: true` adds a grand-total row at the bottom |
| `pivotTotals` | `TotalsConfig.subtotals: 'none' | 'perLevel'` | Partial | `'perLevel'` is v1.5; v1.0 only honors `'none'` |
| `pivotColumnGroupTotals` + per-group subtotals | `TotalsConfig` | Partial | Grand total column is v1.0 full; per-group subtotals are v1.5 |
| `valueFormatter` on pivot columns | Consumer-provided in column rendering | Full | Consumer applies `Intl.NumberFormat` in the cell render prop |

### Sort within pivot hierarchies

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `pivotComparator` (sort within pivot group) | `FieldRef.sortComparator: (a, b) => number` | Full | Consumer-supplied comparator applied to pivot column values |
| Row field sort | `FieldRef.sortDirection: 'asc' | 'desc'` | Full | Applied per field in `PivotConfig.rows`; same form as DataTable sort |
| Multi-field sort | `PivotSortingState` (array) | Full | Each `FieldRef` in `rows`/`columns` carries its own `sortDirection` |
| `sortingOrder` | Consumer-driven | Full | Consumer controls sort priority in UI |

### Expansion & treegrid

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `expandablePivotGroup` | `expanded` slice + `toggleExpanded` + `getToggleExpandedProps` | Full | Consumer renders expand/collapse toggle; `toggleExpanded(RowPathKey)` updates the slice |
| `getDataPath` (hierarchical row path) | `RowPathKey` (tuple of field values) | Full | Engine drives expansion path as typed tuple; consumer receives expansion events to load children lazily |
| Lazy expansion on demand | Engine-controlled lazy expansion | Full | Engine decides when to aggregate; consumer wires `onStateChange` to load children on expansion |
| Treegrid keyboard (arrow keys) | `resolveTreegridKeyAction` + `applyTreegridAction` (`@lynellf/tablekit-pivot`) | Full | Consumer calls `resolveTreegridKeyAction` on keydown; applies result via state actions |
| `suppressExpandablePivotGroups` | Consumer-controlled `expanded` slice | Full | Consumer initializes `expanded` slice empty to suppress all expansion |

### Engine seam

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Client-side pivot | `createMainThreadEngine()` (`@lynellf/tablekit-pivot`) | Full | Default engine; synchronous aggregation on the main thread |
| Server-side pivot (Enterprise) | `createWorkerEngine()` (`@lynellf/tablekit-worker`) + consumer | Full | Worker engine + `createWorkerEntry()` factory; `Aggregator.merge` contract ensures mergeability |
| `getServerSideGroupLevelParams` | Consumer + `useDataSource` | Partial | Consumer wires server-side aggregation results into the pivot engine; `usePivotTable` does not ship a built-in server engine adapter |
| `cacheBlockSize` (server pivot) | Consumer-controlled | Full | Consumer manages pagination/aggregation granularity; table-kit exposes `setPageSize` |

### Announcer & accessibility

| AG-Grid Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Screen reader expansion announcement | `announceExpansion`, `announceSorting`, `announceTotals` (`@lynellf/tablekit-pivot`) | Full | Consumer calls announcer functions on relevant state changes |
| ARIA treegrid role | Prop getters return ARIA attributes | Full | `getRowProps`, `getRowHeaderProps`, `getToggleExpandedProps` include ARIA roles |
| `messages` (i18n announcer strings) | `usePivotTable({ messages?: Partial<MessagesMap> })` | Full | `MessagesMap` keys cover expansion, sorting, totals; partial override per key |
| AG-Grid Enterprise accessibility | Prop getters + `validate` | Full | Table-kit ships ARIA treegrid support in the Community package; no Enterprise gate required |

## Where the target has no v1.0 analog

- **Subtotal rows per level (`subtotals: 'perLevel'`, `pivotTotals`)** — deferred to v1.5. Per-level subtotal rows in the pivot row axis have no v1.0 table-kit equivalent.
- **`processPivotResultColDef` (manual pivot column override)** — deferred to v2. AG-Grid allows manual override of the auto-generated pivot column headers via this callback. Table-kit dynamically derives pivot column headers from `getHeaderRows`/`getLeafColumns`; the consumer controls the full rendering pipeline, but there is no automatic override hook.
- **`groupDisplayType`** — consumer renders pivot group cells; table-kit provides the tree structure but does not ship a built-in `groupDisplayType` renderer.
- **`suppressExpandablePivotGroups`** — consumer controls the `expanded` slice directly; there is no built-in "collapse all" flag separate from the slice state.
- **AG-Grid Enterprise-only features** — many AG-Grid pivot features (range selection, master-detail, side bar, status bar) are Enterprise-only. Table-kit ships all pivot features in the Community package.

## Where table-kit v1.0 is richer than the target

- **Mergeable reducer aggregators (`Aggregator.merge`)** — table-kit's aggregator interface requires `merge(partial: AggregatorResult): AggregatorResult`. This is load-bearing for worker and server pivot engines: the engine can merge partial results from multiple workers or page requests. AG-Grid Enterprise's server-side row model does not expose a comparable aggregator merge contract; custom `aggFunc`s in AG-Grid are opaque functions.
- **Lazy expansion via `RowPathKey` + engine-controlled expansion** — table-kit's expansion state is driven by the engine as a typed tuple of field values. Consumers receive expansion events and load children lazily without manual `getRows` callback wiring. AG-Grid's `expandablePivotGroup` requires the server-side row model and manual `getRows` callback management.
- **`registerAggregator` + `getAggregator` registry** — table-kit exposes a named aggregator registry. Custom aggregators are registered at startup and referenced by string ID in `MeasureDef.aggregator`. AG-Grid's `aggFuncs` parameter accepts a map of functions, but does not expose a comparable string-keyed registry with a `getAggregator` lookup.
- **ARIA treegrid announcer — Community edition.** Table-kit ships ARIA treegrid support and a live-region announcer in the Community package (`@lynellf/tablekit-react`, `@lynellf/tablekit-pivot`). AG-Grid requires Enterprise for comparable accessibility.
- **Prop getters for every grid zone** (`getGridProps`, `getBodyProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`) — table-kit provides prop getters for every structural zone of the pivot table. AG-Grid's component-override model requires overriding cell/header renderer components rather than composing props.
- **`resolveTreegridKeyAction` + `applyTreegridAction`** — first-class treegrid keyboard action resolution. AG-Grid's treegrid keyboard handling is built into the grid component and not exposed as composable helpers.

## See also

- `../ag-grid-datagrid/guide.md` (AG-Grid DataGrid → table-kit React — non-pivot AG-Grid features are in scope there)
- `../webix-pivot/guide.md` (Webix Pivot → table-kit pivot)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract, pivot exports)
- `docs/initial-spec.md` §1, §9 (positioning and PivotTable specifics)
- `examples/m4-pivot-main-thread/src/App.tsx` (live `PivotConfig` usage reference)

## Verified against

- `@lynellf/tablekit-pivot@1.0.0`
- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
