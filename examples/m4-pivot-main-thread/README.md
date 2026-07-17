# M4 Reference App — Pivot, Main Thread

Runnable demo of `@lynellf/tablekit-pivot` + `@lynellf/tablekit-react`'s `usePivotTable` hook.

## Run

```bash
pnpm --filter m4-pivot-main-thread-example dev
# → http://localhost:5174
```

Open `http://localhost:5174/?functional-parity` for the deterministic public
component host. It renders client and delayed-server `DataGrid` scenarios plus
client and server `PivotGrid` scenarios. The client scenarios include
programmatic left/right frozen columns and atomic generated PivotGrid groups.
The host is covered by
`e2e/functional-parity.spec.ts`.

## Build

```bash
pnpm --filter m4-pivot-main-thread-example build
```

## What to look for

- **Pivot panel**: row hierarchy (region × quarter), two measures (sales sum + orders count), grand-total row + grand-total column. Click `+` to expand; click `−` to collapse. The grand-total row is in the footer rowgroup with `data-total="row"`. The grand-total column is right-pinned by default with `data-total="column"`.

- **Sort panel**: row hierarchy (region) sorted by `sales_sum` descending. Change the sort via the SortControls.

- **Column hierarchy panel**: row hierarchy (region) × column hierarchy (year) × single measure (sales sum). `aria-colspan` is emitted on branch column-headers.

- **Perf badge**: shows re-pivot timing in milliseconds. The §12 advisory budget is ≤ ~200k source rows before docs recommend the worker engine (M5); the badge turns red when over budget.

## Spec references

- §9.1 PivotConfig — the `pivot` option shape.
- §9.2 Aggregator interface — built-ins: `sum`, `count`, `min`, `max`, `avg` (the last as a mergeable `{sum, count}` pair).
- §9.3 Main-thread engine — `createMainThreadEngine()` is the default.
- §9.4 Result model — `getVisibleRows()`, `getHeaderRows()`, `getLeafColumns()`.
- §9.5 Expansion — `expandedPaths` controls enumeration; unexpanded subtrees are aggregated.
- §9.6 Totals — `TotalsConfig` defaults to both grand-total row + column.
- §9.7 Pivot sorting — `PivotSortingState` with `by: 'label' | 'measure'`.
- §9.8 Treegrid rendering — `role="treegrid"`, `aria-expanded`, `aria-level`, `role="rowheader"`.

## A11y

Run the integration tests:

```bash
pnpm --filter @lynellf/tablekit-react test -- --run pivot
```

The `pivot-treegrid-a11y.test.tsx` integration test renders the prescribed DOM shape and asserts `validateGridStructure` returns `{ valid: true }`.
