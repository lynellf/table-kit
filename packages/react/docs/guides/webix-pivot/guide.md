# Webix Pivot → table-kit concept map

> Guide — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Mapping at a glance

Webix Pivot covers a full pivot-table UX: field picker (structure: rows, columns, values, filters), readonly mode, footer totals, grand-total column, field mapping/formatting, sort, open/close row groups, lazy load mode, and datatype handling.

Table-kit's `@lynellf/tablekit-pivot` (`usePivotTable`, `createPivotTable`) covers a framework-free pivot engine with a stable `PivotConfig` shape (`rows`, `columns`, `measures`, `filters`, `totals`), built-in aggregators (`sum`, `count`, `min`, `max`, `avg`), an aggregator registry (`registerAggregator`), main-thread + worker engine adapters, treegrid prop getters (`getRowProps`, `getToggleExpandedProps`, etc.), and ARIA announcer helpers (`announceExpansion`, `announceSorting`, `announceTotals`).

The mapping is 1:1 for structure (rows/columns/measures → `PivotConfig` fields), aggregation (valueField + operation → `MeasureDef`), filtering (pre-aggregation filters → `PivotFilter`), grand totals (row/column → `TotalsConfig`), expansion (open/close → `expanded` slice + `toggleExpanded`), and sort (field sort → `FieldRef.sortDirection` + `PivotSortingState`). It has no v1.0 analog for subtotal rows per level (`subtotals: 'perLevel'` is v1.5), and table-kit is richer in its mergeable aggregator contract (required for worker/server pivot engines) and lazy expansion via `RowPathKey`.

## Concept → feature table

### Structure (rows / columns / measures / filters)

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `structure.rows` (row field list) | `PivotConfig.rows: FieldRef[]` | Full | Each entry is a field reference string or `{ id, sortDirection }` |
| `structure.columns` (column field list) | `PivotConfig.columns: FieldRef[]` | Full | Column hierarchy derived from field values; consumer renders flatten/collapse |
| `structure.values` (aggregation defs) | `PivotConfig.measures: MeasureDef[]` | Full | `{ id, field, aggregator }` + optional `format` |
| `structure.filters` (pre-agg filter) | `PivotConfig.filters: PivotFilter[]` | Full | `{ field, operator, value }` applied before aggregation engine |
| Field add/remove (UI) | Consumer UI wiring `PivotConfig` | Full | Consumer builds field picker UI; changes call `table.setConfig()` |
| `readonly` mode | Consumer-controlled `PivotConfig` | Full | No readonly flag; consumer holds config in read-only state |
| `fields` (field registry) | Consumer-constructed field list | Full | Consumer defines which fields are available; table-kit does not infer schema |
| `datatype` | Consumer data typing | Partial | Consumer ensures typed data; `sortRows` applies typed comparators |

### Aggregation & totals

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| `sum` | `sumAggregator` (`@lynellf/tablekit-pivot`) | Full | Built-in; pass by name string `'sum'` or reference |
| `count` | `countAggregator` | Full | Built-in |
| `min` | `minAggregator` | Full | Built-in |
| `max` | `maxAggregator` | Full | Built-in |
| `avg` | `avgAggregator` | Full | Built-in |
| Custom aggregation operation | `registerAggregator(id, factory)` + `Aggregator.merge` | Full | Custom aggregator must implement `Aggregator.merge` for worker/server compatibility |
| `structure.totalColumn` | `TotalsConfig.grandTotalColumn: boolean` | Full | `grandTotalColumn: true` adds a grand-total column; `grandTotalColumnPosition: 'start' | 'end'` |
| `footer` (per-column totals) | `TotalsConfig.grandTotalRow: boolean` | Full | `grandTotalRow: true` adds a grand-total row at the bottom |
| Subtotal rows per level | `TotalsConfig.subtotals: 'none' | 'perLevel'` | Partial | `'perLevel'` is v1.5; v1.0 only honors `'none'` |
| `format` (value formatter) | Consumer-provided in `MeasureDef` or render slot | Full | No built-in number formatting; consumer applies `Intl.NumberFormat` |

### Expansion & navigation

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Open/close row group | `expanded` slice + `toggleExpanded` + `getToggleExpandedProps` | Full | Consumer renders expand/collapse toggle; `toggleExpanded(RowPathKey)` updates slice |
| `open` (initial open state) | `expanded` slice (consumer-initialized) | Full | Consumer sets `expanded` slice to initial open paths on `createPivotTable` |
| Lazy load (`lazy`) | Consumer + engine-controlled lazy expansion | Full | Engine drives expansion; consumer wires `onStateChange` to load children on expansion |
| `onAfterRefresh` | `usePivotTable` + consumer `onStateChange` | Full | Consumer intercepts state changes to react to pivot recompute |
| Treegrid keyboard (arrow keys) | `resolveTreegridKeyAction` + `applyTreegridAction` (`@lynellf/tablekit-pivot`) | Full | Consumer calls `resolveTreegridKeyAction` on keydown; applies result via state actions |

### Sort

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Row field sort | `FieldRef.sortDirection: 'asc' | 'desc'` | Full | Applied per field in `PivotConfig.rows` |
| `structure.sort` (sort on load) | `PivotSortingState` initialized at config time | Full | Consumer sets sort order in initial state |
| Multi-field sort | `PivotSortingState` (array) | Full | Each `FieldRef` in `rows`/`columns` carries its own `sortDirection` |
| `sortComparator` (custom sort) | `FieldRef.sortComparator: (a, b) => number` | Full | Consumer-supplied comparator function |

### Announcer & accessibility

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Screen reader expansion announcement | `announceExpansion`, `announceSorting`, `announceTotals` (`@lynellf/tablekit-pivot`) | Full | Consumer calls announcer functions on relevant state changes |
| ARIA treegrid role | Prop getters return ARIA attributes | Full | `getRowProps`, `getRowHeaderProps`, `getToggleExpandedProps` include ARIA roles |
| `messages` (i18n announcer strings) | `usePivotTable({ messages?: Partial<MessagesMap> })` | Full | `MessagesMap` keys cover expansion, sorting, totals; partial override per key |

### Engine seam

| Webix Pivot feature | table-kit analog | v1.0 coverage | Notes |
| --- | --- | --- | --- |
| Client-side pivot | `createMainThreadEngine()` (`@lynellf/tablekit-pivot`) | Full | Default engine; synchronous aggregation on the main thread |
| Worker pivot | `createWorkerEngine()` (`@lynellf/tablekit-worker`) | Full | `createWorkerEntry()` factory for the worker file; stable `Aggregator.merge` contract required |
| Server-side pivot | Consumer + `useDataSource` | Partial | Consumer wires server-side aggregation results into `pivot` slice; `usePivotTable` does not ship a server engine adapter |
| Engine `lazy` (on-demand aggregation) | Engine-controlled lazy expansion | Full | Engine decides when to aggregate; consumer provides expansion data via `onStateChange` |

## Where the target has no v1.0 analog

- **Subtotal rows per level (`subtotals: 'perLevel'`)** — deferred to v1.5. Webix's per-level subtotal rows have no v1.0 table-kit equivalent.
- **`structure.map` / value mapping** — deferred to v2. No built-in value mapping/transformation in v1.0; consumer applies pre-processing.
- **`structure.format` on fields (non-aggregate values)** — deferred to v2. Measure-level formatting only; field-level formatting is consumer responsibility.
- **`onBeforeCalc`** — deferred to v2. No pre-aggregation lifecycle hook in v1.0.
- **`filterHandler`** (custom filter logic per field) — consumer must implement via `PivotFilter.operator`; no custom handler registration in v1.0.
- **Pivot UI scaffolding** — Webix ships a full UI with field drag-and-drop. Table-kit ships only the engine and prop getters; the UI is 100% consumer-built.

## Where table-kit v1.0 is richer than the target

- **Mergeable reducer aggregators (`Aggregator.merge`)** — table-kit's aggregator interface requires `merge(partial: AggregatorResult): AggregatorResult`. This is load-bearing for worker and server pivot engines: the engine can merge partial results from multiple workers or page requests. Webix's pivot does not expose a comparable merge contract; aggregators are opaque functions that do not survive cross-worker boundaries.
- **Lazy expansion via `RowPathKey` + `expanded` slice** — table-kit's expansion state is driven by the engine (`RowPathKey` is a typed tuple of field values). Consumers receive expansion events and load children lazily. Webix's `lazy` mode requires manual `onAfterRefresh` + `load` wiring; table-kit's engine controls the expansion contract.
- **`registerAggregator` + `getAggregator` registry** — table-kit exposes a named aggregator registry. Custom aggregators are registered at startup and referenced by string ID in `MeasureDef.aggregator`. Webix requires operator-name strings without a comparable registry surface.
- **Prop getters for every grid zone** (`getGridProps`, `getBodyProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`) — table-kit provides prop getters for every structural zone of the pivot table. Webix's pivot ships a rendered component; prop getters give the consumer full control over the DOM.
- **ARIA treegrid announcer** — `announceExpansion`, `announceSorting`, `announceTotals` are first-class exports. Webix's pivot does not expose a comparable announcer surface for screen readers.

## See also

- `../webix-datagrid/guide.md` (Webix DataTable → table-kit React)
- `../ag-grid-pivot/guide.md` (AG-Grid Pivot → table-kit pivot)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract, pivot exports)
- `docs/initial-spec.md` §9 (PivotTable specifics)
- `docs/initial-spec.md` §11 (Webix affordance — drop-in compatibility layer rationale)
- `examples/m4-pivot-main-thread/src/App.tsx` (live `PivotConfig` usage reference)

## Verified against

- `@lynellf/tablekit-pivot@1.0.0`
- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
