# @lynellf/tablekit-react

React hooks, announcer component, virtualization adapters, and accessibility primitives for `@lynellf/tablekit-core` and `@lynellf/tablekit-pivot`.

**v1.0.0** — stable. The public API is frozen.
[API contract →](https://github.com/lynellf/tablekit/tree/main/docs/m6-hardening/api-freeze.md)

---

## Install

```bash
npm install @lynellf/tablekit-core @lynellf/tablekit-react
```

Requires **React ≥ 18** and **Node ≥ 20**.

> `@lynellf/tablekit-core` is a peer dependency. `@lynellf/tablekit-pivot` is a transitive peer; its types and hooks (`usePivotTable`, pivot announcers) are also re-exported from this package.

---

## Overview

`tablekit-react` bridges the framework-agnostic tablekit core to React. Its main exports are hooks that return prop getters you spread onto JSX elements, plus an `Announcer` component that drives the screen-reader live region.

### What it does

| Concern | API |
|---|---|
| Data table | `useDataTable` hook + prop getters |
| Pivot table | `usePivotTable` hook + prop getters |
| Screen-reader announcements | `ReactAnnouncer` / `<Announcer />` + `announce` |
| Virtualization | `useRowVirtualizer`, `useCenterVirtualizer`, `useSizeObserver` |
| Column resize | `useResizeHandle` (pointer gesture wiring) |
| Keyboard navigation | APG roving tabindex via `getGridProps`; `useTabBehavior` for Tab routing |
| i18n | `messages` prop on hooks; `defaultMessages` for key inspection |

---

## Usage

### `useDataTable` — Data table with announcements

```tsx
import { useDataTable } from '@lynellf/tablekit-react';

function MyTable({ rows, columns }) {
  const { table, state, Announcer, gridRef } = useDataTable({ rows, columns });

  return (
    <>
      <Announcer />
      <div {...table.getGridProps()} ref={gridRef}>
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th {...header.getHeaderProps()}>
                    {header.isPlaceholder ? null : header.renderNode()}
                    {header.column.getResizeHandleProps && (
                      <div {...header.column.getResizeHandleProps()} />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody {...table.getBodyProps()}>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} {...table.getRowProps({ row })}>
                {row.getCells().map((cell) => (
                  <td {...cell.getCellProps()}>{cell.renderNode()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

#### Options — `UseDataTableOptions<TRow>`

Extends `DataTableOptions<TRow>` from `tablekit-core`. React-specific additions:

| Property | Type | Default | Description |
|---|---|---|---|
| `dataSource` | `DataSource<TRow>` | — | Wire a server-mode data source. Enables `dataSourceState` on the return value. |
| `messages` | `Partial<MessagesMap>` | English defaults | Per-key announcer string overrides for i18n. |
| `tabBehavior` | `'exit'` \| `'cells'` | `'exit'` | `'exit'`: Tab leaves the grid (APG-conformant). `'cells'`: Tab focuses the first cell and stays inside. Assign `gridRef` to the root grid element. |

#### Return value — `UseDataTableResult<TRow>`

| Property | Type | Description |
|---|---|---|
| `table` | `DataTableInstance<TRow>` | Stable state-engine instance. |
| `state` | `DataTableState` | Reactive state snapshot. Updates on every engine notification. |
| `Announcer` | `() => ReactElement` | Render this component once in your tree to mount the announcer. |
| `dataSourceState` | `DataSourceState<TRow>` | Present when `dataSource` option is provided. |
| `gridRef` | `React.RefObject<HTMLDivElement>` | Assign to the root grid element (`<div {...table.getGridProps()} ref={gridRef}>`) for Tab behavior. |

### `usePivotTable` — Pivot table with announcements

```tsx
import { usePivotTable } from '@lynellf/tablekit-react';

function MyPivot({ data }) {
  const { pivot, state, Announcer, gridRef } = usePivotTable({
    data,
    pivot: {
      rows:    ['region', 'product'],
      columns: ['quarter'],
      measures: [{ id: 'total', field: 'sales', aggregator: 'sum' }],
    },
  });

  const leafColumns = pivot.getLeafColumns();
  const visibleRows = pivot.getVisibleRows();

  return (
    <>
      <Announcer />
      <table {...pivot.getGridProps()} ref={gridRef}>
        <thead {...pivot.getHeaderProps()}>
          {pivot.getHeaderRows().map((row, rowIdx) => (
            <tr key={rowIdx}>
              {/* First cell: corner / row-header column header */}
              {rowIdx === 0 && <th rowSpan={pivot.getHeaderRows().length} />}
              {row.map(({ node, colSpan }) => (
                <PivotHeaderCell key={node.id} node={node} colSpan={colSpan} pivot={pivot} />
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...pivot.getBodyProps()}>
          {visibleRows.map((row) => (
            <tr {...pivot.getRowProps(row)}>
              <td {...pivot.getRowHeaderProps(row)}>
                <button {...pivot.getToggleExpandedProps(row)}>
                  {row.hasChildren ? (state.expanded[row.key] ? '▼' : '▶') : null}
                </button>
                {String(row.label)}
              </td>
              {leafColumns.map((col) => (
                <td key={col.id}>{String(row.values[col.id] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {pivot.getFooterProps() && (
          <tfoot {...pivot.getFooterProps()}>
            <tr>
              <td>Grand Total</td>
              {leafColumns.map((col) => (
                <td key={col.id}>{String(state.pivot.grandTotals?.[col.id] ?? '')}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
}
```

#### Options — `UsePivotTableOptions<TRow>`

Extends `PivotTableOptions<TRow>` from `tablekit-pivot`. React-specific additions:

| Property | Type | Default | Description |
|---|---|---|---|
| `announcer` | `Announcer` | no-op (ReactAnnouncer sets it on mount) | Override the announcer. |
| `messages` | `Partial<MessagesMap>` | English defaults | Per-key announcer string overrides for i18n. |
| `tabBehavior` | `'exit'` \| `'cells'` | `'exit'` | `'exit'`: Tab leaves the grid. `'cells'`: Tab stays inside. Assign `gridRef`. |

#### Return value — `UsePivotTableResult<TRow>`

| Property | Type | Description |
|---|---|---|
| `pivot` | `PivotTableInstance<TRow>` | Stable pivot instance. |
| `state` | `PivotTableState` | Reactive state snapshot. |
| `Announcer` | `() => ReactElement` | Render once in your tree to mount the announcer. |
| `gridRef` | `React.RefObject<HTMLDivElement>` | Assign to the root grid element for Tab behavior. |

### `useDataSource` — Server-mode wiring

```tsx
import { useDataSource } from '@lynellf/tablekit-react';
import type { DataSource } from '@lynellf/tablekit-core/dataSource';

const myDataSource: DataSource<SalesRow> = {
  capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
  getRows: async (query, { signal }) => {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal,
    });
    return res.json();
  },
};

function ServerTable() {
  const { table, state, Announcer, dataSourceState } = useDataTable({ dataSource: myDataSource });

  return (
    <>
      <Announcer />
      {dataSourceState.status === 'loading' && <Spinner />}
      {dataSourceState.status === 'error' && <ErrorBanner error={dataSourceState.error} />}
      {/* render table */}
    </>
  );
}
```

#### Return value — `UseDataSourceResult<TRow>`

| Property | Type | Description |
|---|---|---|
| `status` | `'idle' \| 'loading' \| 'error' \| 'success'` | Current fetch status. |
| `data` | `TRow[] \| null` | Latest successful rows. `null` before first load. |
| `totalRowCount` | `number` | Total row count (populated by `getRows` result's `totalRowCount`). |
| `error` | `Error` | Error from the last failed fetch. |
| `refetch` | `() => void` | Manually trigger a refetch. |

---

## API reference

### Hooks

#### `useDataTable(options) ⇒ UseDataTableResult<TRow>`

The primary hook for building data tables.

#### `usePivotTable(options) ⇒ UsePivotTableResult<TRow>`

The primary hook for building pivot tables. Re-exports all pivot types and built-in aggregators for convenience — you can import them from either `tablekit-pivot` or `tablekit-react`.

#### `useDataSource(table, source, translator?) ⇒ UseDataSourceResult<TRow>`

Wires a `DataSource<TRow>` to a `DataTableInstance<TRow>`. Derives the `manual*` flags from the source's capabilities, watches relevant state slices, builds `RowsQuery`, aborts stale requests, and exposes fetch status.

The optional `translator` parameter is a function `(key: AnnouncerKey, ...args: unknown[]) => string`. When provided, announcer calls route through the translator for i18n.

#### `useResizeHandle(instance) ⇒ { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }`

Wires pointer events from a resize handle DOM element to the table instance's resize dispatchers (`startResize`, `adjustResize`, `commitResize`, `cancelResize`).

```tsx
const resize = useResizeHandle(table);
<div {...header.column.getResizeHandleProps(resize)} />
```

#### `useRowVirtualizer(table) ⇒ RowVirtualizerResult<TRow>`

Memoized wrapper around `table.getRowVirtualizer()`. Wraps `measureElement` to persist measured sizes across renders. Pass the result to `useSizeObserver`.

#### `useCenterVirtualizer(table) ⇒ ColumnVirtualizerResult`

Memoized wrapper around `table.getCenterVirtualizer()`. Mirrors `useRowVirtualizer` for columns.

#### `useSizeObserver(options) ⇒ void`

Subscribes a `ResizeObserver` to all `[data-virtual-type="row"]` and `[data-virtual-type="column"]` elements inside the grid. Calls `rowVirtualizer.measureElement(index, size)` and `columnVirtualizer.measureElement(index, size)` as sizes change.

```tsx
const rowVirt = useRowVirtualizer(table);
const colVirt = useCenterVirtualizer(table);
useSizeObserver({ gridRef, rowVirtualizer: rowVirt, columnVirtualizer: colVirt });
```

#### `useTabBehavior(options) ⇒ void`

Owns the Tab key handler for the grid. Does nothing for `navigationMode: 'none'` (role="table" downgrade). Call this automatically when using `useDataTable` or `usePivotTable` with `tabBehavior`.

---

### Component

#### `ReactAnnouncer` / `<Announcer />`

Renders a hidden `aria-live="polite"` region. Sets the global announcer on mount so any engine or hook can call `announce` without a direct prop. Render once at the top of your tree.

```tsx
import { ReactAnnouncer } from '@lynellf/tablekit-react';

// In your root component or layout:
<ReactAnnouncer />
// or
<Announcer />
```

#### `getReactAnnouncer() ⇒ Announcer`

Returns the announcer object directly. Useful when you need the announcer without rendering a component.

---

### i18n

`defaultMessages: MessagesMap` — frozen record of all announcer string keys and their English defaults. Use this to inspect available keys and provide your own `messages` override.

```tsx
// Inspect available keys
import { defaultMessages } from '@lynellf/tablekit-react';
console.log(Object.keys(defaultMessages));
// ['sortAscending', 'sortDescending', 'loadingFinished', ...]

// Override a key
const { table, Announcer } = useDataTable({
  messages: {
    loadingFinished: (n) => `${n} righe caricate`,
  },
});
```

---

### Type exports

The package re-exports the full pivot and core type surfaces so consumers can import everything from one place:

**Pivot types** (`@lynellf/tablekit-pivot`)

```ts
export type {
  Aggregator,
  DEFAULT_PIVOT_STATE,
  FieldValue,
  RowPathKey,
  LeafColumnId,
  MeasureId,
  FieldRef,
  MeasureDef,
  PivotFilter,
  TotalsConfig,
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  PivotTableState,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  PivotColumnNode,
  PivotLeafColumn,
  AggregationEngine,
  PivotTableInstance,
  PivotTableOptions,
} from '@lynellf/tablekit-pivot';
```

**Core types** (`@lynellf/tablekit-core`)

Includes all state types (`DataTableState`, `SortingState`, `ColumnSizingState`, etc.), instance types (`DataTableInstance`, `ColumnDef`, `Row`, `Cell`, etc.), event handler types, and all exports listed in `packages/core/src/index.ts`.

---

### Built-in pivot aggregators (re-exported)

```ts
import {
  createPivotTable,
  sumAggregator,
  countAggregator,
  minAggregator,
  maxAggregator,
  avgAggregator,
  builtInAggregators,
  getAggregator,
  registerAggregator,
  nameOfAggregator,
} from '@lynellf/tablekit-react';
```

See [`@lynellf/tablekit-pivot`](/packages/pivot) for the full aggregator API reference.

---

## Recipes

Consumer-facing integration patterns:

| Recipe | Description |
|---|---|
| [`layout.md`](/docs/recipes/layout.md) | Virtualization + sticky pinning in one scroll container |
| [`dnd-column-reorder.md`](/docs/recipes/dnd-column-reorder.md) | Pointer-based column reordering via dnd-kit |
| [`kbd-column-reorder.md`](/docs/recipes/kbd-column-reorder.md) | Keyboard "grab" pattern (Space → Arrows → Space) |
| [`split-pane.md`](/docs/recipes/split-pane.md) | Three viewports with scroll sync (for transformed parent layouts) |

---

## Related packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine, row pipeline, column model, and event system. |
| [`@lynellf/tablekit-pivot`](/packages/pivot) | PivotTable primitives and aggregation engine. |
| [`@lynellf/tablekit-worker`](/packages/worker) | Worker-based pivot engine for off-thread aggregation. |

---

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
