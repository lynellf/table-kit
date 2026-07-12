<!-- Historical: true -->
# Headless Table Primitives — Design Specification

**Working name:** TableKit (`@tablekit/*` — placeholder pending a name/trademark
search) **Status:** Draft v0.1 for review **Audience:** Library authors and
consuming application teams **Conventions:** TypeScript sketches in this
document are normative for _shape and semantics_, not final naming. "Consumer"
means the application integrating the library.

---

## 1. Purpose and positioning

This library provides two headless table primitives — **DataTable** and
**PivotTable** — targeting the feature territory of premium commercial grids (AG
Grid Enterprise, Webix DataTable/Pivot, MUI X Premium, Handsontable) while
adopting the open, headless model popularized by TanStack Table: the library
computes _models_ and _state_, and the consumer owns rendering, styling, and
integration with application state.

The primitives render nothing themselves. They emit derived structures (header
groups, virtualized row windows, cells, pivot trees) plus spreadable
attribute/handler objects ("prop getters") that produce a `div`-based,
ARIA-correct grid when applied by the consumer. React is the first-class
adapter; the core is framework-free so additional adapters remain possible.

A future goal (explicitly out of scope for v1) is enabling a drop-in
compatibility layer for Webix-based integrations. The architecture should not
preclude this: a stable imperative facade and a well-defined event surface are
the affordances that make such a wrapper feasible later.

## 2. Goals and non-goals

### 2.1 Functional goals

**Shared (DataTable and PivotTable):**

- Row virtualization and column virtualization
- Resizable columns (pointer and keyboard)
- Column pinning (left/right)
- Client-side column sorting
- Interaction event props: single click, double click, context menu, keyboard
  activation, and focus change for cells; click/double-click for rows and
  headers

**DataTable:**

- Client-side and server-side pagination
- Client-side and server-side column filtering
- Client-side and server-side column sorting
- Column re-ordering (state + helpers; drag implementation is the consumer's)

**PivotTable:**

- Configurable row and column hierarchies (ordered field lists)
- Configurable global dataset filters (applied pre-aggregation)
- Configurable aggregation per measure; `sum` is the default aggregator
- Pluggable aggregation engines: main thread (default), Web Worker, and
  server-side
- Server-side (lazy) row expansion
- Grand-total footer row and grand-total column

### 2.2 Architectural goals

- **Headless / primitive-first.** No CSS, no shipped components, no opinions
  about look and feel.
- **Dependency inversion throughout.** All state is externally controllable; all
  behavior (sorting, filtering, aggregation, data access, virtualization
  measurement, announcements) is replaceable via injected implementations.
- **Div-based rendering with first-class accessibility.** The library's prop
  getters emit a correct ARIA grid/treegrid; the documentation prescribes the
  exact DOM shape required for validity.
- **React-first, framework-agnostic core.** Core packages have zero React and
  zero direct DOM dependencies.
- **Moderate extensibility over maximal configurability.** Feature modules with
  clear seams; not a plugin marketplace.
- **Performance is a design concern, not the top priority.** Correctness,
  accessibility, and API ergonomics win ties; budgets in §12 act as guardrails
  against regressions.

### 2.3 Non-goals (v1)

Styling/theming, cell editing, row drag/drop implementation, CSV/Excel export,
clipboard, printing, master-detail rows, tree data in DataTable (use
PivotTable), row grouping in DataTable (use PivotTable), charts, data
fetching/caching framework (only a thin orchestration layer, §5.2), undo/redo,
and the Webix compatibility adapter.

### 2.4 Guiding principles

- **P1 — Models, not markup.** Core computes; consumers render.
- **P2 — Everything is a seam.** Every state slice is controllable; every
  algorithm is injectable; every side effect (focus, announcements, scrolling)
  routes through a replaceable service.
- **P3 — Registries for anything that crosses a serialization boundary.** Sort
  functions, filter predicates, and aggregators are referenced _by name_ when a
  query must travel to a server or worker; inline functions are permitted only
  for main-thread execution.
- **P4 — Client/server symmetry.** Every data operation (sort, filter, paginate,
  pivot, expand) is expressed as a declarative query object. "Client mode" is
  simply the built-in resolver for that query; "server mode" hands the same
  query to the consumer.
- **P5 — Accessibility is part of the contract.** Prop getters emit correct
  roles/ARIA; a dev-mode structure validator catches consumer DOM mistakes;
  keyboard interaction follows the WAI-ARIA APG grid/treegrid patterns.
- **P6 — Stable identity everywhere.** Rows, columns, and pivot nodes have
  consumer-controllable stable IDs, which is what makes controlled state, server
  modes, and virtualization coherent.

## 3. Package architecture

```
@tablekit/core      Framework-free. State engine, DataTable row pipeline
                    (sort/filter/paginate), column model (order/visibility/
                    sizing/pinning), virtualization engine, keyboard
                    navigation model, interaction events, announcer contract.
@tablekit/pivot     Framework-free. Pivot config/state, result model,
                    aggregator registry + built-ins, main-thread engine,
                    engine contract for worker/server implementations.
@tablekit/worker    Worker engine implementation + message protocol +
                    a tiny worker-side data store (rows live in the worker;
                    only configs cross the boundary after initial load).
@tablekit/react     Hooks (useDataTable, usePivotTable, useDataSource),
                    DOM measurement adapter for the virtualizer, prop
                    getters bound to React event props, live-region
                    announcer, dev-mode a11y structure validator.
```

Dependency direction: `react → (core, pivot, worker)`; `pivot → core` (shares
column model, registries, navigation); `worker → pivot`. Feature modules inside
`core` are tree-shakeable; a consumer using only sorting and virtualization
should not pay for filtering or pagination code.

**No DOM in core.** Anything requiring measurement (scroll offsets, element
sizes) is expressed as an adapter interface (`ScrollAdapter`, `SizeObserver`)
implemented in `@tablekit/react`. This is what keeps the core honest for future
Vue/Svelte/Solid adapters and for SSR.

## 4. Core concepts

### 4.1 Instances

```ts
const table = createDataTable<TRow>(options); // core
const pivot = createPivotTable<TRow>(options); // pivot

table.getState();
table.setOptions(nextOptions); // adapters call this on each render
table.subscribe(listener); // notified after any state/model change
```

DataTable and PivotTable are **separate instance types** that share feature
modules (sizing, pinning, column virtualization, navigation, events) but have
distinct row pipelines. This avoids a mega-options type and keeps each
primitive's mental model small.

React adapters wrap creation and subscription:

```ts
const table = useDataTable<TRow>(options); // stable instance identity
const pivot = usePivotTable<TRow>(options);
```

### 4.2 State model — the controlled-slice contract

Every state slice is independently _uncontrolled_ (internal, seeded by
`initialState`) or _controlled_ (owned by the consumer). This is the primary
dependency-inversion mechanism for application-state integration.

```ts
interface DataTableState {
  sorting: SortingState; // { id: string; desc: boolean }[]
  columnFilters: ColumnFiltersState; // { id: string; value: unknown }[]
  pagination: PaginationState; // { pageIndex: number; pageSize: number }
  columnOrder: string[];
  columnVisibility: Record<string, boolean>; // recommended addition, §8.4
  columnPinning: { left: string[]; right: string[] };
  columnSizing: Record<string, number>;
  columnSizingInfo: ColumnResizeSession | null;
  focusedCell: { rowId: string; columnId: string } | null;
}

interface PivotTableState {
  pivot: PivotConfig; // §9.1
  expanded: Record<RowPathKey, boolean>;
  pivotSorting: PivotSortingState; // §9.7
  columnPinning: ColumnPinningState; // applies to leaf columns
  columnSizing: ColumnSizingState;
  columnSizingInfo: ColumnResizeSession | null;
  focusedCell: { rowKey: RowPathKey; columnId: string } | null;
}
```

Contract, per slice:

```ts
interface Options {
  initialState?: Partial<State>
  state?: Partial<State>                       // any provided slice becomes controlled
  onSortingChange?: (updater: Updater<SortingState>) => void
  onColumnFiltersChange?: ...                  // one callback per slice
  onStateChange?: (updater: Updater<State>) => void
}
type Updater<T> = T | ((old: T) => T)
```

Semantics: when a slice is controlled, the instance never mutates it internally
— it _requests_ changes via the callback and re-derives when new `state` arrives
via `setOptions`. Updaters are plain data/functions so consumers can route them
through Redux, Zustand, XState, URL params, etc. All internal state is
JSON-serializable to support persistence (§15).

### 4.3 Dependency-inversion seams

| Seam                       | Injected via                                     | Default                                                                    | Notes                                 |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------- |
| Data access                | `data` array (Level 0) or `DataSource` (Level 1) | —                                                                          | §5                                    |
| Sorting algorithms         | `sortingFns` registry + per-column `sortingFn`   | `alphanumeric`, `text`, `number`, `datetime`, `basic`                      | Name-referenced for server mode (P3)  |
| Filter predicates          | `filterFns` registry + per-column `filterFn`     | `includesString`, `equalsString`, `equals`, `inNumberRange`, `arrIncludes` | Name-referenced for server mode       |
| Aggregation                | `aggregators` registry + per-measure ref         | `sum` (default), `count`, `avg`, `min`, `max`                              | §9.2                                  |
| Aggregation execution      | `engine: AggregationEngine`                      | main-thread engine                                                         | §9.3                                  |
| Virtualization measurement | `ScrollAdapter` / `SizeObserver`                 | DOM adapters in `@tablekit/react`                                          | §7.1                                  |
| Virtualizer itself         | `virtualizer?: VirtualizerLike`                  | built-in                                                                   | Allows e.g. a TanStack Virtual bridge |
| Row identity               | `getRowId(row, index, parent?)`                  | index-based (dev warning)                                                  | Required for server modes             |
| Announcements              | `announcer: Announcer`                           | live-region announcer (react pkg)                                          | §10                                   |
| Messages/i18n              | `messages` map                                   | English strings                                                            | All announcer text routes through it  |

### 4.4 Data model: rows, columns, cells, identity

```ts
interface ColumnDef<TRow, TValue = unknown> {
  id: string;
  accessor?: keyof TRow | ((row: TRow) => TValue);
  header?: unknown; // opaque to core; the React adapter types this as
  cell?: unknown; // ReactNode | (ctx) => ReactNode and renders via renderSlot()
  size?: number;
  minSize?: number;
  maxSize?: number;
  enableSorting?: boolean;
  sortingFn?: string | SortingFn<TRow>;
  enableFiltering?: boolean;
  filterFn?: string | FilterFn<TRow>;
  enableResizing?: boolean;
  enablePinning?: boolean;
  meta?: Record<string, unknown>; // consumer escape hatch, flows to prop-getter contexts
}
```

Derived objects exposed to renderers: `Column` (def + computed state:
`getIsSorted()`, `getIsPinned()`, `getSize()`, `getPinnedOffset()`, …), `Row`
(`id`, `index`, `original`, `getVisibleCells()`), `Cell` (`row`, `column`,
`getValue()`, prop getter). Header/cell renderers are opaque values; adapters
supply the render bridge (`renderSlot(def.header, ctx)` in React, analogous to
TanStack's `flexRender`).

## 5. Data layer

The DataTable supports two integration levels. Level 0 is the primitive; Level 1
is optional sugar built entirely on Level 0. Both express operations as the same
declarative query (P4).

```ts
interface RowsQuery {
  sorting: SortingState;
  filters: ColumnFiltersState; // values + filterFn *names*
  pagination?: PaginationState;
}
```

### 5.1 Level 0 — controlled data (pure primitive)

The consumer passes rows and declares which concerns the library should resolve
client-side:

```ts
useDataTable({
  data: rows,                     // current rows (already server-processed, if applicable)
  columns,
  manualSorting?: boolean,        // true → core does NOT sort; sorting state is still managed
  manualFiltering?: boolean,
  manualPagination?: boolean,
  rowCount?: number,              // total logical rows when manualPagination (else derived)
})
```

The instance never fetches. For any `manual*` concern it simply excludes that
step from the client row pipeline and expects `data` to already reflect it. The
consumer observes state changes (`onSortingChange`, etc.), performs I/O however
it likes, and passes new `data` down. This is maximal inversion and is the layer
all other modes reduce to.

Client row pipeline (each stage skippable via `manual*`):
`data → filter → sort → paginate → rowModel`.

### 5.2 Level 1 — DataSource orchestration (optional)

For consumers who want fetch lifecycle handled, a `DataSource` unifies client
and server modes behind one interface:

```ts
type Capability = 'client' | 'server'

interface DataSource<TRow> {
  capabilities: { sort: Capability; filter: Capability; paginate: Capability }
  getRows(q: RowsQuery, ctx: { signal: AbortSignal }): MaybePromise<{
    rows: TRow[]
    totalRowCount?: number        // required when paginate: 'server'
  }>
}

createClientDataSource(rows, opts?)   // resolves everything synchronously in-memory
```

`useDataSource(table, source)` (or the `dataSource` option) wires it up: it
derives the `manual*` flags from `capabilities`, watches the relevant state
slices, builds `RowsQuery`, aborts stale requests via `AbortSignal`, and exposes
`status: 'idle' | 'loading' | 'error'`, `error`, and `refetch()`. While loading,
the grid sets `aria-busy` and the row model can expose placeholder rows (count =
`pageSize`) so consumers can render skeletons.

Deliberately _not_ included: caching, retries, deduplication, debouncing.
Consumers own those (e.g., implement `getRows` with TanStack Query). Level 1
stays thin so it never becomes a data framework.

### 5.3 Mode resolution and mixed modes

Capabilities are per-concern, so mixes are legal (e.g., server pagination +
client sorting). The library must document the semantic trap: with server
pagination, client-side sort/filter apply _within the current page only_. The
dev build warns on the `paginate: 'server'` + `sort/filter: 'client'`
combination unless `allowWithinPageOperations: true` is set. Server-side
capability for one concern also changes what travels in `RowsQuery` (P4):
concerns marked `client` are resolved locally and omitted from the outbound
query.

## 6. Rendering contract

### 6.1 Prop getters

Every renderable unit exposes a prop getter returning a plain object of
attributes and handlers to spread onto a `div`. Prop getters accept consumer
props and merge them (consumer handlers run first; internal handlers respect
`event.defaultPrevented`).

```tsx
<div {...table.getGridProps()}>
  // role="grid"/"treegrid", aria-rowcount/colcount, onKeyDown, ref
  <div {...table.getHeaderGroupProps()}>
    // role="rowgroup"
    <div {...headerGroup.getRowProps()}>
      // role="row", aria-rowindex
      <div {...header.getHeaderProps()}>
        // role="columnheader", aria-colindex, aria-sort
        {renderSlot(header.column.def.header, ctx)}
        <div {...header.getResizeHandleProps()} />{" "}
        // role="separator" widget, §7.2
      </div>
    </div>
  </div>
  <div {...table.getBodyProps()}>
    // role="rowgroup"
    {table.getVirtualRows().map((vRow) => (
      <div {...vRow.row.getRowProps({ style: vRow.positionStyle })}>
        {vRow.row.getVisibleCells().map((cell) => (
          <div {...cell.getCellProps()}>
            {renderSlot(cell.column.def.cell, cell.getContext())}
          </div>
        ))}
      </div>
    ))}
  </div>
</div>;
```

Prop getters are the accessibility delivery mechanism (P5): if the consumer
spreads them onto the prescribed DOM shape, the result is a valid ARIA grid
without the consumer writing any ARIA by hand.

### 6.2 Required DOM shape

ARIA requires `grid → rowgroup → row → gridcell/columnheader` ownership.
Structural wrappers that consumers inevitably need (scroll viewport,
virtualization spacer, sticky containers) must not break that chain, so the
contract is:

```
div[role=grid][aria-rowcount][aria-colcount][tabindex per §7.5]
├─ div[role=rowgroup]                         header (sticky top recommended)
│   └─ div[role=row][aria-rowindex=1..H]
│       └─ div[role=columnheader][aria-colindex]
├─ div[role=rowgroup]                         body
│   └─ div[role=presentation]                 scroll-height spacer, height = virtualizer.totalSize
│       └─ div[role=row][aria-rowindex]       absolutely positioned rows
│           └─ div[role=gridcell][aria-colindex]
└─ div[role=rowgroup]                         optional footer (pivot grand-total row lives here)
```

Rules: any extra wrapper gets `role="presentation"`;
`aria-rowcount`/`aria-colcount` describe the _logical_ table (header rows
included; `-1` when the server total is unknown); every rendered row/cell
carries 1-based `aria-rowindex`/`aria-colindex` because virtualization removes
siblings from the DOM. `@tablekit/react` ships a dev-mode
`validateGridStructure(rootEl)` that walks the accessibility tree and reports
violations (P5).

### 6.3 Layout recipe: virtualization × sticky pinning

The default recipe uses **one scroll container** (the grid element) for both
axes:

- Vertical: rows are `position: absolute; top: <offset>px; width: max-content`
  inside the spacer. **`top`, not `transform: translateY`** — a transformed
  ancestor becomes the containing block for `position: sticky`, which silently
  breaks pinned columns. This is the single biggest layout footgun and the docs
  treat it as a hard rule.
- Horizontal: pinned cells use
  `position: sticky; left|right: column.getPinnedOffset()px` with a documented
  z-index ladder (pinned header > header > pinned cell > cell). Pinned columns
  are excluded from column virtualization and always rendered (§7.3).
- The header rowgroup is `position: sticky; top: 0` within the same scroll
  container so header and body share one horizontal scrollbar.

An alternative **split-pane recipe** (left/center/right viewports with scroll
sync) is documented for consumers whose surrounding layout imposes transforms;
the library supports it because pinned/unpinned column sets and offsets are
exposed as data, not markup.

### 6.4 Styling hooks

Since no CSS ships, prop getters emit stateful data attributes for consumer
styling: `data-pinned="left|right"`, `data-sorted="asc|desc"`, `data-resizing`,
`data-focused`, `data-expanded`, `data-level="n"`, `data-row-index`,
`data-total="row|column"`, `data-loading`.

## 7. Shared feature specifications

### 7.1 Row and column virtualization

A built-in windowing engine (`core`) computes visible index ranges from scroll
offset and item sizes; DOM specifics live in the adapter.

```ts
interface VirtualizerOptions {
  count: number
  estimateSize: (index: number) => number       // fixed or estimated
  overscan?: number                             // default 4 rows / 2 columns
  keepMounted?: () => number[]                  // indices that must always render (focus, resize session)
  onMeasure?: ...                               // dynamic size feedback from adapter's SizeObserver
}
interface VirtualizerLike { getVirtualItems(): VirtualItem[]; totalSize: number; scrollToIndex(i, align?): void }
```

- Row virtualization operates over the current row model (DataTable:
  post-pipeline rows; PivotTable: flattened visible tree).
- Column virtualization operates over _unpinned_ visible leaf columns; pinned
  columns bypass it.
- Dynamic row heights: supported via measure-after-render feedback;
  `estimateSize` seeds layout. Variable heights interact with scroll anchoring —
  flagged in §16.
- `keepMounted` is the focus-retention mechanism (§7.5): the focused cell's row
  and column are always rendered even when scrolled out of the window, so
  physical focus is never destroyed by virtualization.
- The `virtualizer` option accepts any `VirtualizerLike`, so consumers can
  bridge TanStack Virtual if they prefer it (P2).

### 7.2 Column resizing

- State: `columnSizing` (id → px) and a transient `columnSizingInfo` session
  (start size, delta, mode).
- `columnResizeMode: 'onChange' | 'onEnd'` (live vs. commit-on-release).
- Pointer interaction via `header.getResizeHandleProps()` (pointer capture;
  double-click reserved for future auto-fit).
- Keyboard: the resize handle is a focusable `role="separator"` widget with
  `aria-orientation="vertical"`, `aria-valuenow/min/max` (current/min/max
  width), `aria-controls` pointing at the column's header id, and an
  `aria-label` of "Resize column {name}". Arrow Left/Right adjust by
  `resizeStepPx` (default 10; Shift = 1), Enter commits, Escape cancels (in
  `onEnd` mode). Changes are announced ("{name} column, {width} pixels").
- Constraints: clamped to `minSize`/`maxSize`; resizing a pinned column
  recomputes downstream pinned offsets synchronously.

### 7.3 Column pinning

- State: `columnPinning: { left: string[]; right: string[] }`; order within each
  array is the pinned display order.
- Derived: `column.getIsPinned(): 'left' | 'right' | false`,
  `column.getPinnedOffset(): number` (cumulative width of preceding pinned
  columns on that side), `table.getLeftLeafColumns()` / `getCenterLeafColumns()`
  / `getRightLeafColumns()`.
- Rendering follows §6.3. Pinned columns are excluded from horizontal
  virtualization; center columns virtualize normally. `aria-colindex` reflects
  logical order (left-pinned, center, right-pinned), so pinning changes column
  indices and triggers an announcer message.
- Applies identically to PivotTable leaf columns; the grand-total column
  defaults to right-pinned (§9.6), and pinning the pivot row-header column left
  is the documented default recipe.

### 7.4 Sorting (client-side core; server via §5)

- State: `SortingState = { id, desc }[]`. Multi-sort supported
  (`enableMultiSort`, default true; Shift+interaction appends). Toggle cycle:
  none → asc → desc → none, configurable via `sortDescFirst` and
  `enableSortingRemoval`.
- Client resolution: stable sort using the column's `sortingFn` (registry name
  or inline function). Built-ins: `alphanumeric`, `text`, `number`, `datetime`,
  `basic`; `sortUndefined: 'first' | 'last'` per column.
- Server mode: with `manualSorting` / `capabilities.sort: 'server'`, the
  pipeline skips sorting and the current `SortingState` (function _names_ only,
  per P3) travels in `RowsQuery`.
- Surface: `header.getSortToggleProps()` intended for an interactive element
  _inside_ the header cell (keyboard reachable via §7.5's Enter/F2 cell-entry);
  `aria-sort` is set on the columnheader of the **primary** sorted column only
  (per ARIA guidance); full multi-sort order is conveyed via the announcer
  ("Sorted by Region ascending, then Sales descending").
- PivotTable reuses this module for _group ordering_ (§9.7) rather than raw-row
  ordering.

### 7.5 Keyboard navigation and focus

Follows the WAI-ARIA APG **grid** pattern (DataTable) and **treegrid** pattern
(PivotTable), using a **roving tabindex** — chosen over `aria-activedescendant`
because physical focus composes correctly with virtualization (`keepMounted`)
and gets better screen-reader support.

- `focusedCell` is a state slice (controllable like any other). Exactly one cell
  has `tabIndex=0`; the grid manages `tabIndex=-1` elsewhere.
- Keys: Arrow keys move by cell; Home/End = row start/end; Ctrl+Home/End =
  first/last cell of grid; PageUp/PageDown = one viewport of rows; Tab/Shift+Tab
  **exit the grid** (APG behavior). Enter or F2 enters a cell's interior widgets
  (focus moves inside); Escape returns focus to the cell.
- Treegrid additions (PivotTable): Right on a collapsed row-header cell expands;
  Right on expanded moves inward; Left collapses or moves to the parent row;
  rows carry `aria-expanded` and `aria-level`.
- Navigation into a not-yet-rendered cell calls `virtualizer.scrollToIndex` +
  `keepMounted`, then focuses after render — the adapter guarantees this
  ordering.
- `navigationMode: 'cell' | 'row' | 'none'` lets read-only consumers opt out
  (with `role` downgraded to `table`, see §10).

### 7.6 Interaction events

All interaction callbacks are top-level options wired through prop getters:

```ts
interface InteractionOptions<TRow> {
  onCellClick?;
  onCellDoubleClick?;
  onCellContextMenu?;
  onCellActivate?; // Enter/Space keyboard parity for click affordances
  onCellFocusChange?;
  onRowClick?;
  onRowDoubleClick?;
  onHeaderClick?;
}
// every callback: (ctx: CellEventContext<TRow>, event) => void
interface CellEventContext<TRow> {
  table;
  row;
  column;
  cell;
  value: unknown;
  rowIndex: number;
  colIndex: number; // logical, 0-based
  source: "mouse" | "keyboard" | "touch";
}
```

Semantics: native ordering is preserved (a double-click fires two `onCellClick`
first; no synthetic single/double disambiguation delay — consumers needing
exclusivity implement their own, keeping the primitive honest). Consumer props
passed into a prop getter merge with, and run before, internal handlers;
internal behavior (e.g., focus-on-click) is skipped when
`event.defaultPrevented`. Every pointer affordance the library wires has a
keyboard equivalent (`onCellActivate`), which is an accessibility requirement,
not a convenience.

## 8. DataTable feature specifications

### 8.1 Column filtering (client and server)

- State: `columnFilters: { id, value }[]`. Filter _UI_ is entirely the
  consumer's; the library owns state and resolution only.
- Client resolution: per-column `filterFn` (registry name or inline). Built-ins:
  `includesString` (default for string accessors), `equalsString`, `equals`,
  `inNumberRange`, `arrIncludes`. `enableFiltering` per column.
- Server mode: `manualFiltering` / `capabilities.filter: 'server'`; filter
  values plus filterFn _names_ travel in `RowsQuery` (P3). Value shapes are the
  consumer's contract with their server; the library treats them as opaque.
- Optional faceting helpers for building filter UIs (client data only):
  `column.getFacetedUniqueValues()`, `column.getFacetedMinMax()` —
  tree-shakeable module, recommended addition (§15).
- Filter changes reset `pageIndex` to 0 by default (`autoResetPageIndex`), and
  announce result counts ("128 rows after filtering").

### 8.2 Pagination (client and server)

- State: `pagination: { pageIndex, pageSize }`. Helpers: `getPageCount()`,
  `getCanPreviousPage()`, `getCanNextPage()`, `setPageIndex()`, `nextPage()`,
  `previousPage()`, `setPageSize()`.
- Client mode: page slice is the last pipeline stage. Server mode:
  `manualPagination` + `rowCount` (or `pageCount`); the instance never slices.
- Pagination and row virtualization compose (virtualize within the page); most
  consumers will use one or the other, and the docs say so.
- `aria-rowcount` reflects the full logical row count in both modes; page
  boundaries are announced ("Page 3 of 12").

### 8.3 Column re-ordering

- State: `columnOrder: string[]` (leaf column ids; unlisted columns append in
  definition order).
- Helpers: `table.moveColumn(id, toIndex)`, `column.getIndex()`. Reordering
  across pinning boundaries re-pins to the target region.
- The library deliberately ships **no drag implementation** (P1/P2). Prop
  getters expose stable ids/indices so any DnD library can drive `moveColumn`.
  The docs include a reference recipe (dnd-kit) and the required keyboard
  alternative: a "grab" pattern on the header (Space to lift, Arrows to move,
  Space to drop, Escape to cancel) with announcer messages at each step —
  shipped as a documented recipe built on `moveColumn` + announcer, since it
  needs no internal support.

### 8.4 Column visibility (recommended promotion into v1)

Not in the original requirements, but hide/show is table-stakes alongside
re-ordering, costs almost nothing (`columnVisibility` slice filtering leaf
columns before ordering), and Webix parity will want it. Included in the state
sketch above; flagged here so it's a conscious scope decision.

## 9. PivotTable specification

### 9.1 Pivot configuration

```ts
interface PivotConfig {
  rows: FieldRef[]; // ordered row hierarchy, outermost first
  columns: FieldRef[]; // ordered column hierarchy, outermost first
  measures: MeasureDef[];
  filters?: PivotFilter[]; // global dataset filters, applied BEFORE aggregation
  totals?: TotalsConfig; // §9.6
}

type FieldRef = string | {
  field: string;
  accessor?: (row) => unknown; // main-thread only; use `field` for worker/server (P3)
  label?: unknown; // opaque render slot
  sortComparator?: string; // registry name, for group-label ordering
};

interface MeasureDef {
  id: string;
  field?: string;
  accessor?: (row) => unknown; // main-thread only
  aggregator?: string | Aggregator; // DEFAULT: 'sum'
  label?: unknown;
  format?: string; // opaque hint passed through to render context
}

type PivotFilter =
  | {
    field: string;
    op: "equals" | "in" | "notIn" | "range" | "contains";
    value: unknown;
  }
  | { predicate: (row) => boolean } // main-thread engine only (P3)
  | { predicateRef: string; args?: unknown }; // registry name; worker/server capable
```

`pivot` is a normal controlled/uncontrolled state slice, so a consumer's
pivot-configuration UI (field pickers, drag zones) is just external state
feeding `onPivotChange` — no special API needed.

### 9.2 Aggregation model — mergeable reducer aggregators

Aggregators are reducer-shaped, and the shape is the load-bearing design
decision:

```ts
interface Aggregator<TIn = unknown, TAcc = unknown, TOut = unknown> {
  init(): TAcc;
  accumulate(acc: TAcc, value: TIn, row?: unknown): TAcc;
  merge?(a: TAcc, b: TAcc): TAcc; // REQUIRED for worker/server engines
  finalize?(acc: TAcc): TOut; // default: identity
}
```

`merge` is what makes the three execution environments (§9.3) share one
semantics: a worker can aggregate chunks in parallel and merge; a server can
return partial accumulators for lazily-expanded children that still roll up
correctly; subtotals and grand totals are merges of child accumulators rather
than re-scans. Built-ins (`sum`, `count`, `min`, `max`, and `avg` as a mergeable
`{sum, count}` pair) all implement `merge`. Custom inline aggregator objects are
legal on the main-thread engine; anything crossing a boundary must be a registry
name (P3), with worker-side registration described below.

### 9.3 Aggregation engines

```ts
interface AggregationEngine<TRow> {
  compute(
    q: PivotQuery,
    ctx: { signal: AbortSignal },
  ): MaybePromise<PivotResult>;
  computeChildren?(
    path: FieldValue[],
    q: PivotQuery,
    ctx,
  ): MaybePromise<PivotRowNode[]>;
  dispose?(): void;
}

interface PivotQuery { // fully serializable (P3/P4)
  rows: SerializedFieldRef[];
  columns: SerializedFieldRef[];
  measures: SerializedMeasureDef[];
  filters: SerializedPivotFilter[];
  expandedPaths: RowPathKey[]; // engines MAY use this to skip unexpanded subtrees
}
```

- **Main-thread engine (default).** `createMainThreadEngine()`; synchronous for
  small data, chunked via cooperative yielding above a row threshold to avoid
  long tasks. Accepts inline accessors/predicates/aggregators.
- **Worker engine.** `createWorkerEngine({ createWorker })` from
  `@tablekit/worker`. Protocol: `setRows(rows)` transfers the dataset **once**
  (structured clone; columnar/`Arrow` transfer noted as a future optimization)
  and keeps it in a worker-side store; subsequent `compute` calls send only the
  serialized `PivotQuery`, so re-pivoting never re-ships data. Custom
  aggregators/predicates are registered _inside_ the consumer's worker entry
  (`registerAggregators({...})`) and referenced by name — the library ships a
  worker entry factory so the default registry works with zero setup.
- **Server engine.** Implemented by the consumer against their API: `compute`
  returns the collapsed top level (plus grand totals), `computeChildren(path)`
  resolves §9.5 expansions. Because the engine contract _is_ the seam, "server
  pivot" requires no special mode in the table itself (P4).

Engine choice is per-instance (`engine` option) and hot-swappable; in-flight
computations are aborted via `AbortSignal` when the query or engine changes.

### 9.4 Result model

```ts
interface PivotResult {
  columnRoot: PivotColumnNode; // column hierarchy; leaves = column-path × measure
  leafColumns: PivotLeafColumn[]; // flattened render order, totals column included
  rowRoot: PivotRowNode; // synthetic root; children = level-0 groups
  grandTotals: Record<LeafColumnId, unknown>; // feeds the footer row
}

interface PivotRowNode {
  key: RowPathKey; // stable, serialized path (e.g. '["West","Q3"]')
  path: FieldValue[];
  level: number; // 0-based depth
  label: FieldValue;
  hasChildren: boolean;
  childState: "loaded" | "notLoaded" | "loading" | "error"; // §9.5
  children?: PivotRowNode[];
  values: Record<LeafColumnId, unknown>; // finalized measure values
  rowTotals: Record<MeasureId, unknown>; // feeds the total column
}
```

The renderable model is derived, not recomputed: `pivot.getVisibleRows()`
flattens `rowRoot` by DFS honoring `expanded`, and row virtualization windows
over that array. `pivot.getHeaderRows()` exposes the column hierarchy as N
header rows with computed `colSpan` (rendered as sibling `columnheader` divs
whose widths span their leaves — no real spanning needed in a div grid, but
`aria-colspan` is set). Column virtualization operates over `leafColumns`
(§7.1).

### 9.5 Expansion and server-side expansion

- State: `expanded: Record<RowPathKey, boolean>` (controlled/uncontrolled).
  `row.getToggleExpandedProps()` renders the expander affordance; keyboard
  expansion per §7.5.
- Client/worker engines compute the full tree lazily by `expandedPaths`
  (unexpanded subtrees are aggregated but not enumerated), so expansion is
  instant and memory stays proportional to what's visible.
- Server engine: nodes arrive with `hasChildren` + `childState: 'notLoaded'`.
  Toggling triggers `computeChildren(path, query)`; the node shows
  `childState: 'loading'` (row gets `aria-busy`, a placeholder child row is
  exposed for skeletons), then children merge into the tree. Errors surface on
  the node (`childState: 'error'`, `node.error`) with a `retryChildren(path)`
  helper. Already-expanded paths are re-requested on query change
  (sort/filter/measure edits invalidate the tree; the instance handles refetch
  orchestration since expansion is engine-driven, unlike Level 0 tabular data).

### 9.6 Totals

```ts
interface TotalsConfig {
  grandTotalRow?: boolean; // default true — footer row, all rows aggregated
  grandTotalColumn?: boolean; // default true — per-row totals across the column dimension
  grandTotalColumnPosition?: "start" | "end"; // default 'end'
  subtotals?: "none" | "perLevel"; // recommended addition; default 'none'
}
```

- The grand-total **row** renders in the footer rowgroup (§6.2), outside row
  virtualization, with sticky-bottom as the documented recipe; it carries the
  last `aria-rowindex` and `data-total="row"`.
- The grand-total **column** appends per-measure leaf columns computed from
  `rowTotals`, right-pinned by default (`data-total="column"`), participating in
  `aria-colcount`.
- Both are computed via aggregator `merge` over child accumulators — cheap and
  consistent across engines. With multiple measures, the totals column renders
  one leaf per measure (layout question flagged in §16).
- Subtotal rows per group level are a small extension of the same merge
  mechanism and are recommended for v1.5 (§15) since Webix-style pivots
  typically show them.

### 9.7 Pivot sorting

Client-side sorting (core requirement) manifests in a pivot as **group
ordering**, applied per level within each parent:

```ts
type PivotSortingState = Array<
  | { level: number; by: "label"; desc: boolean; comparator?: string }
  | {
    level: number;
    by: "measure";
    measureId: string;
    columnPath?: FieldValue[];
    desc: boolean;
  }
>;
```

Sort by label (default, using the field's `sortComparator`) or by a measure
value (optionally under a specific column path — "sort regions by Q4 sales").
Executed by the engine (it owns the tree) so it works identically for
main-thread, worker, and server. Column-hierarchy value ordering uses the same
`{ by: 'label' }` form applied to `columns` fields.

### 9.8 Rendering and treegrid specifics

- Root role is `treegrid`; rows carry `aria-expanded` (only when `hasChildren`),
  `aria-level` (= `level + 1`), and optionally `aria-setsize`/`aria-posinset`
  within their parent.
- The row-header cell (group label) uses `role="rowheader"`; indentation is the
  consumer's CSS keyed off `data-level`.
- Expansion, loading, and totals states are all announced ("West expanded, 4
  rows", "Loading West…", "Grand total row").
- Screen-reader support for `treegrid` is historically weaker than `grid`; §13's
  manual matrix is non-negotiable for the pivot.

## 10. Accessibility specification (cross-cutting)

Div-based tables are an accessibility liability by default; this library's
position is that **the ARIA grid pattern, delivered through prop getters and
enforced by a dev-mode validator, is the mitigation** — and that this must be
treated as a launch-blocking requirement, not polish.

- **Roles.** DataTable: `role="grid"` when interactive (default), downgraded to
  `role="table"` with `gridcell → cell` when `navigationMode: 'none'` (read-only
  semantics; grids signal interactivity to AT users). PivotTable:
  `role="treegrid"`.
- **Counts and indices.** `aria-rowcount`/`aria-colcount` on the root (logical
  totals including header rows; `-1` for unknown server totals);
  `aria-rowindex`/`aria-colindex` on every rendered row/cell — mandatory because
  virtualization removes DOM siblings.
- **Sorting.** `aria-sort` on the primary sorted columnheader; multi-sort detail
  via announcer (§7.4).
- **Resize.** Focusable `role="separator"` widget per §7.2.
- **Async.** `aria-busy` on the root (Level 1 loading) or on rows (pivot child
  loading); skeleton/placeholder rows are exposed so loading states are
  perceivable, and load completion is announced with result counts.
- **Announcer.** `interface Announcer { announce(message, politeness?) }` —
  injectable (P2); default implementation is a visually-hidden `aria-live`
  region managed by `@tablekit/react`. Every built-in announcement routes
  through the `messages` map for i18n. Announced events: sort changes, filter
  result counts, page changes, pin/unpin, column move, resize commits,
  expansion, loading start/finish, errors.
- **Keyboard.** Full map in §7.5; documented as a conformance table against the
  APG grid/treegrid patterns.
- **Validator.** `validateGridStructure(rootEl)` (dev builds): verifies role
  ownership chains, presence and monotonicity of indices, `role="presentation"`
  on wrappers, exactly one roving `tabIndex=0`, and separator ARIA on resize
  handles.
- **Known risks.** `treegrid` support varies across AT; `aria-colindex` handling
  with column virtualization has historical quirks in some SR/browser pairs.
  These are accepted risks tracked by the manual test matrix (§13), with the
  split-pane recipe and `role="table"` downgrade as fallbacks.

## 11. Framework strategy and future adapters

- `core`/`pivot`/`worker` contain no React and no direct DOM access. Prop
  getters in core return _semantic descriptors_ (attribute maps + named handler
  intents); the adapter maps them to framework event props (`onClick`,
  `on:click`, …) and supplies `ScrollAdapter`/`SizeObserver`/`Announcer` DOM
  implementations. This is the same split that lets TanStack ship
  Vue/Svelte/Solid adapters cheaply, and it is the cheapest point in the
  project's life to enforce it — retrofitting is expensive.
- v1 ships the React adapter only. A second adapter (likely Vue) is deliberately
  scheduled _after_ v1 as the proof that the boundary held, not as a v1
  deliverable.
- **Webix affordance (out of scope, by design not accident).** Two properties
  keep the future drop-in wrapper feasible: a stable imperative facade
  (`table.setSorting()`, `table.moveColumn()`, `table.scrollToRow()`,
  `getState()/setState()`) and a complete event surface (§7.6 + `onStateChange`)
  that a shim can map onto Webix's `getItem/parse/sort/attachEvent` vocabulary.
  No Webix-specific code enters this library.

## 12. Performance targets (guardrails, not goals)

Correctness, accessibility, and API ergonomics outrank raw speed (per project
goals); these budgets exist to catch regressions and to force the architecture
(virtualization, worker offload, lazy pivot trees) to actually work:

| Scenario                                   | Budget (mid-tier laptop)                                         |
| ------------------------------------------ | ---------------------------------------------------------------- |
| DataTable, client, 100k rows × 50 cols     | ≥ 55fps sustained scroll; sort/filter interaction < 100ms        |
| DataTable, server pagination               | render new page < 16ms after data arrives                        |
| Pivot, main thread                         | ≤ ~200k source rows before docs recommend worker engine          |
| Pivot, worker, 1M rows × 3-level hierarchy | re-pivot < 1.5s; UI thread never blocks > 50ms                   |
| Expansion (client/worker)                  | < 50ms perceived (subtree already aggregated or computed lazily) |
| Bundle                                     | core + react, DataTable-only usage, ≤ ~15kB min+gzip target      |

Benchmarks run in CI (tachometer or mitata) on synthetic datasets; budgets are
tracked, breaches block release only when architectural (e.g., virtualization
stops windowing), otherwise they file issues.

## 13. Testing strategy

- **Unit (core/pivot):** pure-function coverage of pipelines, reducers,
  virtualizer math, aggregator merge laws (property-based tests: `merge`
  associativity/commutativity where claimed, `accumulate` vs. chunked-merge
  equivalence).
- **Integration (react):** Testing Library harnesses rendering the prescribed
  DOM shape; state-controlled and uncontrolled variants of every feature.
- **Accessibility:** axe on harnesses; accessibility-tree snapshots (role/aria
  structure) as regression tests; `validateGridStructure` runs in every
  integration test; Playwright keyboard suites scripted directly from the §7.5
  conformance table.
- **Manual screen-reader matrix (release gate for a11y-affecting changes):**
  NVDA+Chrome, NVDA+Firefox, JAWS+Chrome, VoiceOver+Safari — grid navigation,
  sort announcements, resize widget, pivot expand/collapse, loading states.
- **Serialization contract tests:** `RowsQuery`/`PivotQuery` golden files;
  worker protocol round-trips; registry-name resolution (P3) enforced by types
  _and_ runtime dev warnings when inline functions leak into serializable
  queries.
- **Type tests:** public API typings via `expect-type`; generics ergonomics (row
  type inference through columns/measures) treated as API surface.

## 14. Delivery milestones

| #  | Milestone                 | Scope                                                                                                             | Exit criteria                                                          |
| -- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M0 | Core engine               | Instance/state/controlled-slice contract, column model, registries, React adapter shell                           | Controlled + uncontrolled state round-trips; type tests green          |
| M1 | DataTable client features | Sorting, filtering, pagination, ordering, visibility, events                                                      | Feature integration tests; Level 0 API frozen                          |
| M2 | Layout features           | Row/column virtualization, resizing, pinning, keyboard nav/focus                                                  | 100k-row scroll budget met; APG keyboard suite passes; validator ships |
| M3 | Server modes              | `manual*` semantics, DataSource + `useDataSource`, loading/aria-busy contract                                     | Mixed-mode warnings; server pagination/sort/filter reference app       |
| M4 | Pivot, main thread        | Config, aggregators, result model, expansion, totals, pivot sorting, treegrid rendering                           | Pivot integration + a11y tree tests; sum-default verified              |
| M5 | Pivot engines             | Worker engine + protocol + data store; server engine contract + lazy expansion                                    | 1M-row worker budget; server-expansion reference app                   |
| M6 | Hardening ✓                 | SR manual matrix, docs (recipes: layout, DnD reorder, keyboard reorder, split-pane), benchmarks in CI, API review | v1.0 ✓ — complete 2026-07-06 (`docs/m6-hardening/api-freeze.md`)                                  |

Sequencing rationale: virtualization (M2) lands before server modes and pivot
because focus retention and the layout recipe constrain everything downstream;
pivot engines (M5) come after the main-thread engine proves the result model.

## 15. Recommended additions (feedback on scope)

- **Column visibility → v1** (§8.4). Near-zero cost, expected alongside
  re-ordering, needed for Webix parity.
- **Faceting helpers → v1** (§8.1). Small, high leverage for consumers building
  filter UIs against client data.
- **Row selection state slice → v1.5.** Ubiquitous in real apps; as a pure
  controlled slice (`rowSelection: Record<rowId, boolean>` +
  `aria-selected`/`aria-multiselectable`) it is cheap and fits the model.
  Deferred only to protect v1 scope.
- **Subtotal rows (`perLevel`) → v1.5** (§9.6). Falls out of aggregator `merge`;
  expected in enterprise pivots.
- **State persistence helper → v1.5.** `serializeState()/hydrateState()` with a
  schema version — trivial because all state is JSON-serializable (§4.2), and
  valuable for the app-state integration story.
- **Global quick filter → v2.** Common request; one more pipeline stage plus a
  `globalFilterFn`.
- **Column auto-fit (double-click resize handle) → v2.** Needs measured content
  widths; the resize-handle affordance already reserves the gesture.

## 16. Open questions and risks

1. **Naming/branding** — placeholder needs a real name and npm-scope check.
2. **RTL** — pinning and offsets are physical `left/right` in v1 (matches CSS
   sticky). Decide whether v1 documents an RTL recipe or v2 moves to logical
   `start/end` with a breaking change.
3. **SSR** — core is DOM-free, so server rendering works minus measurements.
   Choose the recommended first-paint story: render N unvirtualized rows, or
   spacer-only with client hydration.
4. **Tab behavior option** — APG says Tab exits the grid; some products want
   Tab-through-cells. Offer `tabBehavior: 'exit' | 'cells'`? Leaning exit-only
   for v1.
5. **Variable row heights + scroll anchoring** — estimate-then-measure causes
   scroll jump under fast reverse scrolling; decide anchoring strategy (offset
   correction vs. locked estimates) in M2.
6. **Multi-measure totals column layout** — one totals leaf per measure vs. a
   single stacked cell; affects `leafColumns` shape. Default: one leaf per
   measure.
7. **Debounce ownership in Level 1** — currently consumer-owned to keep the
   layer thin; revisit if every consumer writes the same debounce.
8. **Worker DX risk** — custom aggregators requiring a consumer worker entry is
   the roughest edge; mitigation is the worker-entry factory plus a
   bundler-recipes doc (Vite/webpack).
9. **AT variance risk** — treegrid and colindex quirks (§10); mitigations
   documented, matrix enforced.
10. **Mixed client/server semantics** — within-page sort/filter is a footgun
    even with warnings; consider hard-gating behind the opt-in flag permanently.

## Appendix A — Feature matrix

| Capability                   | DataTable       | PivotTable                              | Client      | Worker | Server         |
| ---------------------------- | --------------- | --------------------------------------- | ----------- | ------ | -------------- |
| Row virtualization           | ✓               | ✓ (flattened tree)                      | ✓           | n/a    | ✓              |
| Column virtualization        | ✓               | ✓ (leaf columns)                        | ✓           | n/a    | ✓              |
| Column resizing              | ✓               | ✓                                       | ✓           | n/a    | n/a            |
| Column pinning               | ✓               | ✓ (+ totals col default-pinned)         | ✓           | n/a    | n/a            |
| Column re-ordering           | ✓               | — (hierarchy order via `pivot.columns`) | ✓           | n/a    | n/a            |
| Column visibility            | ✓ (recommended) | —                                       | ✓           | n/a    | n/a            |
| Sorting                      | ✓               | ✓ (group ordering, §9.7)                | ✓           | ✓      | ✓              |
| Column filtering             | ✓               | — (global filters instead)              | ✓           | n/a    | ✓              |
| Global dataset filters       | —               | ✓ (pre-aggregation)                     | ✓           | ✓      | ✓              |
| Pagination                   | ✓               | —                                       | ✓           | n/a    | ✓              |
| Aggregation (sum default)    | —               | ✓                                       | ✓ (default) | ✓      | ✓              |
| Row expansion                | —               | ✓                                       | ✓           | ✓      | ✓ (lazy, §9.5) |
| Grand-total row + column     | —               | ✓                                       | ✓           | ✓      | ✓              |
| Cell/row/header events       | ✓               | ✓                                       | ✓           | n/a    | n/a            |
| Keyboard nav (grid/treegrid) | ✓               | ✓                                       | ✓           | n/a    | n/a            |

## Appendix B — React usage sketch (DataTable, virtualized, pinned)

```tsx
function Grid({ rows }: { rows: Person[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useDataTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    state: { sorting }, // controlled slice
    onSortingChange: setSorting,
    columnPinning: { initial: { left: ["name"] } },
    onCellDoubleClick: (ctx) => openEditor(ctx.row.original, ctx.column.id),
  });

  const { rows: vRows, totalSize } = table.getRowVirtualizer();

  return (
    <div {...table.getGridProps({ className: "grid" })}>
      <div {...table.getHeaderGroupProps()}>
        {table.getHeaderGroups().map((hg) => (
          <div {...hg.getRowProps()} key={hg.id}>
            {hg.headers.map((h) => (
              <div
                {...h.getHeaderProps({ style: pinStyle(h.column) })}
                key={h.id}
              >
                <button {...h.getSortToggleProps()}>
                  {renderSlot(h.column.def.header, h.getContext())}
                </button>
                <div {...h.getResizeHandleProps()} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div {...table.getBodyProps()}>
        <div
          role="presentation"
          style={{ height: totalSize, position: "relative" }}
        >
          {vRows.map((v) => (
            <div
              {...v.row.getRowProps({
                style: { position: "absolute", top: v.start },
              })}
              key={v.row.id}
            >
              {v.row.getVisibleCells().map((c) => (
                <div
                  {...c.getCellProps({ style: pinStyle(c.column) })}
                  key={c.id}
                >
                  {renderSlot(c.column.def.cell, c.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const pinStyle = (col: Column<Person>) =>
  col.getIsPinned()
    ? {
      position: "sticky",
      [col.getIsPinned()]: col.getPinnedOffset(),
      zIndex: 1,
    }
    : undefined;
```

Everything visual — class names, indentation, expander icons, skeletons —
belongs to the consumer; everything semantic — roles, indices, focus,
announcements — arrives through the prop getters.
