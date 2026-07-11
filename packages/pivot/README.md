# @lynellf/tablekit-pivot

Framework-free PivotTable configuration, main-thread aggregation engine, and treegrid rendering primitives.

**v1.0.0** — stable. The public API is frozen.
[API contract →](https://github.com/lynellf/table-kit/tree/main/docs/m6-hardening/api-freeze.md)

---

## Install

```bash
npm install @lynellf/tablekit-pivot
```

Requires **Node ≥ 20**. Peer dependency `@lynellf/tablekit-core` is installed automatically.

---

## Overview

`tablekit-pivot` turns flat row data into a two-dimensional pivot tree. It is framework-agnostic — no React, no DOM — and can be paired with [`@lynellf/tablekit-react`](/packages/react) for a complete React application.

### What it does

| Concern | Solution |
|---|---|
| Row grouping | Group by one or more fields into a collapsible tree |
| Column headers | Group by one or more fields into a multi-level column header |
| Aggregation | Built-in `sum`, `count`, `min`, `max`, `avg`; register custom aggregators |
| Totals | Optional grand-total row and column; per-level subtotals (v1.5) |
| Sorting | Per-level sort by group label or by a measure value |
| Expansion | Lazy expansion — only expanded paths have their children materialized |
| Serialization | Serializable `PivotQuery` format for worker/server engines (v1.5) |
| Prop getters | ARIA-conformant treegrid prop getters for zero-DOM libraries |

---

## Usage

### Quick start

```ts
import { createPivotTable } from '@lynellf/tablekit-pivot';

interface SalesRow {
  region: string;
  product: string;
  quarter: string;
  sales: number;
}

const data: SalesRow[] = [
  { region: 'West',  product: 'A', quarter: 'Q1', sales: 120 },
  { region: 'West',  product: 'A', quarter: 'Q2', sales: 80  },
  { region: 'East',  product: 'B', quarter: 'Q1', sales: 55  },
];

const pivot = createPivotTable({
  data,
  pivot: {
    rows:    ['region', 'product'],
    columns: ['quarter'],
    measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
  },
});

// Subscribe to state changes
const unsubscribe = pivot.subscribe(() => {
  const rows    = pivot.getVisibleRows();
  const headers = pivot.getHeaderRows();
  const cols    = pivot.getLeafColumns();
  console.log(rows, headers, cols);
});

// Imperative expansion
pivot.toggleExpanded(['West']);
pivot.toggleExpanded(['West', 'A']);
```

### Prop getters — treegrid rendering

The instance exposes prop getters for every semantic element of an ARIA `treegrid` role table:

```ts
const { getGridProps, getHeaderProps, getBodyProps,
        getRowProps, getRowHeaderProps, getToggleExpandedProps,
        getFooterProps, getTotalsColumnProps } = pivot;

// Root <table> element
<table {...getGridProps()}>

// Column headers
<thead {...getHeaderProps(columnNode)}>

// Body rowgroup
<tbody {...getBodyProps()}>

// Individual row
<tr {...getRowProps(rowNode)}>

// Row-header cell (first cell in a row)
<td {...getRowHeaderProps(rowNode)}>

// Expand/collapse toggle (typically inside the row-header)
<button {...getToggleExpandedProps(rowNode)}>▶</button>

// Grand-total footer row
<tfoot {...getFooterProps()}>

// Grand-total column cell
<td {...getTotalsColumnProps(leafColumn)}>
```

> **Prop getters** accept an optional `consumerProps` object — your props win on conflicts, enabling style overrides and custom `aria-*` attributes without subclassing.

### Row grouping only (no column headers)

```ts
createPivotTable({
  data,
  pivot: {
    rows:    ['region', 'product'],
    columns: [],             // ← no column grouping
    measures: [
      { id: 'total_sales', field: 'sales', aggregator: 'sum' },
      { id: 'count',       field: 'sales', aggregator: 'count' },
    ],
  },
});
```

### Column grouping only (flat rows)

```ts
createPivotTable({
  data,
  pivot: {
    rows:    [],             // ← flat row order
    columns: ['quarter'],
    measures: [{ id: 'sales_sum', field: 'sales', aggregator: 'sum' }],
  },
});
```

### Controlled expansion state

```ts
// Managed externally — useful for server-side expansion
const [expanded, setExpanded] = useState<Record<string, boolean>>({});

const pivot = createPivotTable({
  data,
  pivot: { rows: ['region'], columns: [], measures: [...] },
  state: { expanded },           // ← seed state
  onExpandedChange: setExpanded,  // ← receive updates
});
```

### Controlled pivot config

```ts
const [pivotConfig, setPivotConfig] = useState({ rows: [], columns: [], measures: [] });

const pivot = createPivotTable({
  data,
  pivot: pivotConfig,
  state: { pivot: pivotConfig },
  onPivotChange: setPivotConfig,
});
```

### Custom getRowId

By default, rows are identified by index (dev mode emits a warning). Provide a stable `getRowId` for row identity across data updates:

```ts
createPivotTable({
  data,
  pivot: { rows: ['region'], columns: [], measures: [...] },
  getRowId: (row, index) => row.id ?? String(index),
});
```

### Sorting

```ts
// Sort level 0 by region label ascending
pivot.setPivotSorting([{ level: 0, by: 'label', desc: false }]);

// Sort level 1 by the 'sales_sum' measure ascending
pivot.setPivotSorting([
  { level: 0, by: 'label', desc: false },
  { level: 1, by: 'measure', measureId: 'sales_sum', desc: false },
]);
```

### Totals

```ts
createPivotTable({
  data,
  pivot: {
    rows:    ['region'],
    columns: [],
    measures: [{ id: 'total', field: 'sales', aggregator: 'sum' }],
    totals: {
      grandTotalRow:       true,   // footer row (default)
      grandTotalColumn:    true,   // right-pinned totals column (default)
      grandTotalColumnPosition: 'end', // or 'start'
      subtotals: 'none',          // 'perLevel' (v1.5)
    },
  },
});
```

### Custom aggregator

```ts
import { registerAggregator } from '@lynellf/tablekit-pivot';

registerAggregator('median', {
  init:       () => [] as number[],
  accumulate: (acc, value) =>
    typeof value === 'number' ? [...acc, value] : acc,
  merge:      (a, b) => [...a, ...b],
  finalize:   (acc) => {
    if (acc.length === 0) return NaN;
    acc.sort((a, b) => a - b);
    const mid = Math.floor(acc.length / 2);
    return acc.length % 2 !== 0 ? acc[mid] : (acc[mid - 1] + acc[mid]) / 2;
  },
});

// Use it in a measure
pivot.setPivot({
  ...pivot.getState().pivot,
  measures: [...pivot.getState().pivot.measures,
             { id: 'median_sales', field: 'sales', aggregator: 'median' }],
});
```

---

## API reference

### `createPivotTable(options) ⇒ PivotTableInstance`

Factory. Accepts `PivotTableOptions<TRow>` and returns a stable `PivotTableInstance<TRow>`.

### `PivotTableOptions<TRow>`

| Property | Type | Default | Description |
|---|---|---|---|
| `data` | `TRow[]` | — | Source rows. |
| `pivot` | `PivotConfig<TRow>` \| `(opts) => PivotConfig<TRow>` | — | Row/column/measures definition. Function form is called with `{ data }` for derived config. |
| `initialState` | `Partial<PivotTableState>` | `{}` | Initial slice values (uncontrolled). |
| `state` | `Partial<PivotTableState>` | — | Controlled slices. Pairs with `on*Change` callbacks. |
| `onPivotChange` | `Updater<PivotConfig<TRow>>` | — | Called when the pivot config changes. |
| `onExpandedChange` | `Updater<PivotExpansionState>` | — | Called when expansion changes. |
| `onPivotSortingChange` | `Updater<PivotSortingState>` | — | Called when sort changes. |
| `onStateChange` | `Updater<PivotTableState>` | — | Called when any slice changes. |
| `engine` | `AggregationEngine<TRow>` | main-thread engine | Aggregation engine. Replace for worker/server modes. |
| `announcer` | `Announcer` | no-op | Screen-reader announcer. React consumers render `<Announcer />` from the hook instead. |
| `getRowId` | `(row: TRow, index: number) => string` | index (dev warning) | Stable row identity. |
| `tabBehavior` | `'exit'` \| `'cells'` | `'exit'` | How Tab moves focus. `'exit'` follows APG (Tab leaves the grid); `'cells'` keeps focus inside. |

### `PivotTableInstance<TRow>`

State accessors and prop getters returned by `createPivotTable`.

**State**

| Method | Returns | Description |
|---|---|---|
| `getState()` | `PivotTableState` | Current full state snapshot. |
| `subscribe(listener)` | `() => void` | Subscribe to any state change. Returns unsubscribe. |
| `getResult()` | `PivotResult<TRow>` | Full engine result (columnRoot, leafColumns, rowRoot, grandTotals). |
| `getStatus()` | `'idle' | 'loading' | 'success' | 'error'` | Lifecycle of the latest engine computation. |
| `getError()` | `Error | undefined` | Error from the latest failed computation, if any. |
| `getVisibleRows()` | `PivotRowNode<TRow>[]` | Rows visible given current expansion. |
| `getHeaderRows()` | `HeaderEntry[][]` | Column header rows for rendering `<thead>`. |
| `getLeafColumns()` | `PivotLeafColumn<TRow>[]` | Flat ordered list of leaf columns. |

**Mutations**

| Method | Description |
|---|---|
| `setOptions(options)` | Update `data`, `pivot`, or engine options. |
| `setPivot(updater)` | Update the `pivot` config. |
| `setExpanded(updater)` | Update the expansion map. |
| `toggleExpanded(path)` | Toggle one row's expanded state. `path` is an array of field values, e.g. `['West', 'A']`. |
| `setPivotSorting(updater)` | Update per-level sort. |
| `dispose()` | Abort work and release engine resources. |

**Announcements**

| Method | Description |
|---|---|
| `announce(message, politeness?)` | Send a message to the announcer. `politeness` defaults to `'polite'`. |

**Prop getters**

| Method | Returns | Description |
|---|---|---|
| `getGridProps(consumerProps?)` | `Record<string, unknown>` | Root treegrid `table` props. |
| `getHeaderProps(node, consumerProps?)` | `Record<string, unknown>` | Column header cell props. |
| `getBodyProps(consumerProps?)` | `Record<string, unknown>` | Body `tbody` props. |
| `getRowProps(row, consumerProps?)` | `Record<string, unknown>` | Row `tr` props. |
| `getRowHeaderProps(row, consumerProps?)` | `Record<string, unknown>` | Row-header `td` props. |
| `getToggleExpandedProps(row, consumerProps?)` | `Record<string, unknown>` | Expand/collapse toggle props. |
| `getFooterProps(consumerProps?)` | `Record<string, unknown> \| null` | Footer `tfoot` props. `null` if `grandTotalRow: false`. |
| `getTotalsColumnProps(leaf, consumerProps?)` | `Record<string, unknown>` | Grand-total column cell props. |

---

### Core types

#### `PivotConfig<TRow>`

```ts
interface PivotConfig<TRow> {
  rows:    Array<FieldRef<TRow>>;
  columns: Array<FieldRef<TRow>>;
  measures: Array<MeasureDef<TRow>>;
  filters?: Array<PivotFilter<TRow>>;
  totals?: TotalsConfig;
}
```

#### `FieldRef<TRow>`

```ts
// String shorthand — use the field name directly.
type FieldRef<TRow> = string;

// Or with full options (main-thread only; worker/server require string form).
type FieldRef<TRow> = {
  field: string;
  accessor?: (row: TRow) => FieldValue; // main-thread only
  label?: unknown;                      // render slot
  sortComparator?: string;               // registry name for label sort
};
```

#### `MeasureDef<TRow>`

```ts
interface MeasureDef<TRow> {
  id:        MeasureId;              // stable identity for this measure
  field?:    string;                 // source field to aggregate
  accessor?: (row: TRow) => TIn;     // inline accessor (main-thread only)
  aggregator?: string | Aggregator; // registry name ('sum', 'count', 'min', 'max', 'avg')
  label?:    unknown;                // render slot
  format?:   string;                 // opaque format hint (e.g. 'currency', 'percent')
}
```

Default aggregator is `'sum'`.

#### `PivotFilter<TRow>`

Three shapes; declarative and registry-name shapes cross worker/server boundaries,
while inline predicate functions are main-thread-only:

```ts
// Declarative — server/worker capable
{ field: 'sales', op: 'equals',  value: 100     }
{ field: 'sales', op: 'in',      value: [1, 2]  }
{ field: 'sales', op: 'notIn',   value: [3, 4]  }
{ field: 'sales', op: 'range',   value: [0, 99] }
{ field: 'name',  op: 'contains', value: 'pro'  }

// Inline predicate — main-thread only
{ predicate: (row) => row.sales > 100 }

// Registry predicate — server/worker capable
{ predicateRef: 'highSales', args: { threshold: 500 } }
```

Declarative filters are applied before grouping, column discovery, aggregation, and
grand totals. Multiple filters use **AND** semantics. `range` is inclusive; `contains`
matches a string substring or an item in an array. Equality uses `Object.is`, so a
missing field is treated as `undefined` and does not equal `null`.

#### `TotalsConfig`

```ts
interface TotalsConfig {
  grandTotalRow?:             boolean;  // default true
  grandTotalColumn?:          boolean;  // default true
  grandTotalColumnPosition?: 'start' | 'end';  // default 'end'
  subtotals?:                'none' | 'perLevel';  // default 'none' (perLevel is v1.5)
}
```

#### `PivotExpansionState`

`Record<RowPathKey, boolean>`. `RowPathKey` is the JSON-stringified path, e.g. `'["West","A"]'`.

#### `PivotSortingState`

```ts
// Sort groups by their label
{ level: number; by: 'label'; desc: boolean; comparator?: string }

// Sort groups by a measure value
{ level: number; by: 'measure'; measureId: MeasureId; columnPath?: FieldValue[]; desc: boolean }
```

#### `Aggregator<TIn, TAcc, TOut>`

```ts
interface Aggregator<TIn, TAcc, TOut> {
  init():        TAcc;                         // zero value
  accumulate(acc: TAcc, value: TIn, row?: TRow): TAcc;
  merge(a: TAcc, b: TAcc): TAcc;               // REQUIRED — enables parallel/chunked aggregation
  finalize?(acc: TAcc): TOut;                  // default: identity
}
```

> **Why is `merge` required?** Aggregators that implement `merge` enable the engine to aggregate chunks in parallel and combine results, and to compute subtotals / grand totals as merges of child accumulators rather than re-scanning source data.

#### Built-in aggregators

| Name | `TIn` | Accumulator | Output | Notes |
|---|---|---|---|---|
| `'sum'` | `number` | `number` | `number` | Skips `undefined`/non-number values |
| `'count'` | `unknown` | `number` | `number` | Counts non-undefined values |
| `'min'` | `number` | `number` | `number` | Returns `NaN` for empty input |
| `'max'` | `number` | `number` | `number` | Returns `NaN` for empty input |
| `'avg'` | `number` | `{sum, count}` | `number` | Returns `NaN` for empty input |

---

### Registry functions

#### `registerAggregator(name, aggregator)`

Register a custom aggregator under `name`. Custom registrations shadow built-ins with a dev warning. Use a different name to replace a built-in.

```ts
import { registerAggregator } from '@lynellf/tablekit-pivot';
registerAggregator('product', { init: () => 1, accumulate: (acc, v) => acc * v, merge: (a, b) => a * b });
```

#### `getAggregator(name) ⇒ Aggregator | undefined`

Look up an aggregator. Custom registrations take precedence over built-ins.

#### `builtInAggregators: Readonly<Record<string, Aggregator>>`

Frozen map of the five built-in aggregators. Use `Object.keys(builtInAggregators)` to enumerate available names.

#### `nameOfAggregator(fn) ⇒ AggregatorName | undefined`

Reverse lookup — find the registry name for a given aggregator function. Returns `undefined` for anonymous inline objects.

---

### Result types

#### `PivotResult<TRow>`

```ts
interface PivotResult<TRow> {
  columnRoot:   PivotColumnNode;             // root of the column tree
  leafColumns:  PivotLeafColumn<TRow>[];     // flat ordered leaf columns
  rowRoot:      PivotRowNode<TRow>;          // synthetic root; its children are level-0 groups
  grandTotals:  Record<LeafColumnId, unknown>;
}
```

#### `PivotRowNode<TRow>`

```ts
interface PivotRowNode<TRow> {
  key:        RowPathKey;          // stable identity (JSON-stringified path)
  path:       FieldValue[];        // path from root, e.g. ['West', 'A']
  level:      number;              // depth from root (0 = top-level group)
  label:      FieldValue;         // label for this row's group
  hasChildren: boolean;
  childState: 'loaded' | 'notLoaded' | 'loading' | 'error';
  children?:  PivotRowNode<TRow>[];  // absent when childState is 'notLoaded'
  values:     Record<LeafColumnId, unknown>;  // per-leaf-column finalized values
  rowTotals:  Record<MeasureId, unknown>;      // per-measure row totals
  error?:     Error;               // populated when childState is 'error'
}
```

`childState` semantics:

- `'loaded'`: children are materialized in `children`.
- `'notLoaded'`: path is not in `expandedPaths`; aggregated values exist but children are not enumerated.
- `'loading'` / `'error'`: used while an asynchronous engine materializes children.

---

## Related packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine and row model. Required peer dependency. |
| [`@lynellf/tablekit-react`](/packages/react) | React adapter with `useDataTable`, `usePivotTable`, announcer, and virtualizers. |
| [`@lynellf/tablekit-worker`](/packages/worker) | Worker-based pivot engine for off-thread aggregation. |

---

## Bugs & Issues

https://github.com/lynellf/table-kit/issues

## License

[MIT](./LICENSE)
