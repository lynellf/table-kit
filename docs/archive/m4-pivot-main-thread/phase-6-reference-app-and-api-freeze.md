# Phase 6 — Reference App + Serialization Goldens + API Freeze + Final Verify

**Goal:** Ship the §14 exit-criterion "pivot integration + a11y tree tests" reference app (`examples/m4-pivot-main-thread/`), commit serialization golden fixtures for `PivotQuery` (analogous to M3's `RowsQuery` fixtures), finalize `api-freeze.md` with the M4 surface, and run the aggregate `pnpm verify` gate one final time.

After this phase:

- `examples/m4-pivot-main-thread/` is a runnable Vite + React 19 app demonstrating the M4 patterns (row hierarchy + expansion + totals + sorting + treegrid rendering + the §12 perf badge).
- The example builds via `pnpm --filter m4-pivot-main-thread-example build`.
- Serialization golden fixtures committed under `packages/pivot/src/__tests__/fixtures/pivotQuery/`.
- `docs/m4-pivot-main-thread/api-freeze.md` is the M4 surface manifest.
- `pnpm verify` exits 0; new tests pass (~15-25); §14 exit criteria satisfied.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `examples/m4-pivot-main-thread/package.json` | Vite 5 + React 19 + workspace deps |
| `examples/m4-pivot-main-thread/vite.config.ts` | Vite config (port 5174 to avoid clashing with M3's 5173) |
| `examples/m4-pivot-main-thread/index.html` | Root HTML |
| `examples/m4-pivot-main-thread/README.md` | How to run; what to look for; perf badge explanation |
| `examples/m4-pivot-main-thread/src/main.tsx` | Entry point |
| `examples/m4-pivot-main-thread/src/App.tsx` | Tabs: pivot / expand / totals / sort / perf badge |
| `examples/m4-pivot-main-thread/src/DemoPanel.tsx` | Reusable panel for one pattern |
| `examples/m4-pivot-main-thread/src/fakeSales.ts` | Synthetic sales dataset (configurable size, default 10k) |
| `examples/m4-pivot-main-thread/src/styles.css` | Skeleton styles + treegrid indentation + perf badge styles |
| `examples/m4-pivot-main-thread/tsconfig.json` | TS config |
| `examples/m4-pivot-main-thread/src/PerfBadge.tsx` | Re-pivot timing badge (advisory) |
| `examples/m4-pivot-main-thread/src/SortControls.tsx` | Sort-by-label / sort-by-measure controls |
| `packages/pivot/src/serialize/query.ts` | `buildPivotQuery` — pure `PivotConfig` → `PivotQuery` serializer |
| `packages/pivot/src/serialize/warnings.ts` | `validatePivotQuery` — dev warning on inline aggregator/predicate leaks (M5-shaped) |
| `packages/pivot/src/serialize/index.ts` | Replace stub with serialize barrel |
| `packages/pivot/src/__tests__/serialize.test.ts` | `buildPivotQuery` unit tests (empty, pivot-only, expanded-only, sorting-only, totals-only, all-combined) |
| `packages/pivot/src/__tests__/pivotQuery.golden.test.ts` | Snapshot tests against committed fixtures (spec §13) |
| `packages/pivot/src/__tests__/fixtures/pivotQuery/*.json` | Golden fixtures (one per scenario) |
| `docs/m4-pivot-main-thread/api-freeze.md` | M4 surface additions + M0/M1/M2/M3 reaffirmed |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `docs/archive/m3-server-modes/api-freeze.md` | Note added: "M4 adds `@lynellf/tablekit-pivot` + `usePivotTable`; M0/M1/M2/M3 surface unchanged." |
| `README.md` | Add a "Pivot" section linking to the reference app |
| `package.json` (root) | No change — `pnpm verify` continues to typecheck + lint + test + build the workspace packages. The example builds separately via its own filter. |

No source-of-truth library changes in this phase — only docs + examples + fixtures + the serialize stub implementations.

---

## 3. File contents (key files)

### 3.1 `examples/m4-pivot-main-thread/package.json`

```json
{
  "name": "m4-pivot-main-thread-example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b"
  },
  "dependencies": {
    "@lynellf/tablekit-core": "workspace:*",
    "@lynellf/tablekit-pivot": "workspace:*",
    "@lynellf/tablekit-react": "workspace:*",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

### 3.2 `examples/m4-pivot-main-thread/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
```

### 3.3 `examples/m4-pivot-main-thread/src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### 3.4 `examples/m4-pivot-main-thread/src/fakeSales.ts`

```ts
/**
 * Synthetic sales dataset for the M4 reference app.
 *
 * Generates N rows with random region, quarter, year, sales, orders.
 * Default: 10k rows. Configurable for the §12 perf badge demo.
 */

const REGIONS = ['West', 'East', 'North', 'South'] as const;
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const YEARS = [2022, 2023, 2024] as const;

export interface SalesRow {
  id: string;
  region: string;
  quarter: string;
  year: number;
  product: string;
  sales: number;
  orders: number;
}

export const generateSales = (n: number, seed = 1): SalesRow[] => {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const rows: SalesRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: String(i),
      region: REGIONS[i % REGIONS.length]!,
      quarter: QUARTERS[Math.floor(i / REGIONS.length) % QUARTERS.length]!,
      year: YEARS[i % YEARS.length]!,
      product: `P${(i % 5) + 1}`,
      sales: Math.floor(rand() * 1000),
      orders: Math.floor(rand() * 50),
    });
  }
  return rows;
};
```

### 3.5 `examples/m4-pivot-main-thread/src/App.tsx`

```tsx
import { useMemo, useState } from 'react';
import { generateSales, type SalesRow } from './fakeSales';
import { DemoPanel } from './DemoPanel';
import { PerfBadge } from './PerfBadge';

const ROW_COUNTS = [1_000, 10_000, 50_000, 100_000];

export const App = () => {
  const [rowCount, setRowCount] = useState(10_000);
  const data: SalesRow[] = useMemo(() => generateSales(rowCount), [rowCount]);
  const [computeTime, setComputeTime] = useState<number | null>(null);

  return (
    <div className="app">
      <header>
        <h1>@tablekit/pivot — M4 reference app</h1>
        <div className="controls">
          <label>
            Rows:
            <select value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}>
              {ROW_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <PerfBadge rowCount={rowCount} data={data} onMeasure={setComputeTime} />
        </div>
      </header>

      <main>
        <DemoPanel
          title="Pivot: region × quarter, sales sum + count"
          data={data}
          pivot={{
            rows: ['region', 'quarter'],
            columns: [],
            measures: [
              { id: 'sales_sum', field: 'sales' },
              { id: 'orders_count', field: 'orders', aggregator: 'count' },
            ],
            totals: { grandTotalRow: true, grandTotalColumn: true },
          }}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />

        <DemoPanel
          title="Pivot with sort-by-measure"
          data={data}
          pivot={{
            rows: ['region'],
            columns: [],
            measures: [{ id: 'sales_sum', field: 'sales' }],
            totals: { grandTotalRow: true, grandTotalColumn: true },
          }}
          initialPivotSorting={[{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }]}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />

        <DemoPanel
          title="Column hierarchy: year, measure: sales sum"
          data={data}
          pivot={{
            rows: ['region'],
            columns: ['year'],
            measures: [{ id: 'sales_sum', field: 'sales' }],
            totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
          }}
          getRowId={(r) => r.id}
          onMeasure={setComputeTime}
        />
      </main>

      <footer>
        <p>
          Last pivot compute: <strong>{computeTime ?? '—'}</strong> ms.
          Spec §12 budget: ≤ ~200k source rows before docs recommend the worker engine (M5).
        </p>
      </footer>
    </div>
  );
};
```

### 3.6 `examples/m4-pivot-main-thread/src/DemoPanel.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  createPivotTable,
  type PivotConfig,
  type PivotExpansionState,
  type PivotSortingState,
} from '@lynellf/tablekit-pivot';
import { usePivotTable } from '@lynellf/tablekit-react';
import { PerfBadge } from './PerfBadge';

interface Props<TRow> {
  title: string;
  data: TRow[];
  pivot: PivotConfig<TRow>;
  getRowId: (row: TRow, index: number) => string;
  initialPivotSorting?: PivotSortingState;
  onMeasure?: (ms: number) => void;
}

export function DemoPanel<TRow>({ title, data, pivot, getRowId, initialPivotSorting, onMeasure }: Props<TRow>) {
  const [expanded, setExpanded] = useState<PivotExpansionState>({});
  const [sorting, setSorting] = useState<PivotSortingState>(initialPivotSorting ?? []);

  const { pivot: instance, Announcer } = usePivotTable<TRow>({
    data,
    pivot,
    getRowId,
    state: { expanded, pivotSorting: sorting },
    onExpandedChange: setExpanded,
    onPivotSorting: setSorting,
  });

  const visible = instance.getVisibleRows();
  const headerRows = instance.getHeaderRows();
  const leafColumns = instance.getLeafColumns();

  // §12 perf measurement
  useEffect(() => {
    const start = performance.now();
    instance.getResult();
    const end = performance.now();
    onMeasure?.(end - start);
  }, [instance, onMeasure]);

  return (
    <section className="demo-panel">
      <h2>{title}</h2>
      <Announcer />
      <div {...instance.getGridProps({ className: 'pivot-treegrid' })}>
        <div role="rowgroup" className="pivot-header">
          {headerRows.map((row, i) => (
            <div key={i} role="row" className="pivot-header-row">
              <div role="columnheader" className="pivot-row-header-cell" />
              {row.map((entry, j) => {
                const node = entry.node;
                const label = 'label' in node ? String(node.label ?? '') : String(node.measureId);
                const isTotal = 'isTotal' in node && node.isTotal;
                return (
                  <div
                    key={j}
                    role="columnheader"
                    aria-colspan={entry.colSpan}
                    className={`pivot-cell ${isTotal ? 'pivot-cell-total' : ''}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div {...instance.getBodyProps()}>
          {visible.map((row) => (
            <div key={row.key} {...instance.getRowProps(row, { className: 'pivot-row' })}>
              <div {...instance.getRowHeaderProps(row)} className="pivot-row-header">
                {String(row.label ?? '')}
                {row.hasChildren && (
                  <button
                    type="button"
                    {...instance.getToggleExpandedProps(row)}
                    className="pivot-toggle"
                  >
                    {row.childState === 'loaded' ? '−' : '+'}
                  </button>
                )}
              </div>
              {leafColumns.map((leaf) => (
                <div
                  key={leaf.id}
                  role="gridcell"
                  className={`pivot-cell ${leaf.isTotal ? 'pivot-cell-total' : ''}`}
                >
                  {String(row.values[leaf.id] ?? '')}
                </div>
              ))}
            </div>
          ))}
        </div>

        {instance.getFooterProps() && (
          <div {...instance.getFooterProps({ className: 'pivot-footer' })}>
            <div role="row" data-total="row" aria-label="Grand total row">
              <div role="rowheader" className="pivot-row-header">Total</div>
              {leafColumns.map((leaf) => (
                <div
                  key={leaf.id}
                  role="gridcell"
                  className={`pivot-cell ${leaf.isTotal ? 'pivot-cell-total' : ''}`}
                >
                  {String(instance.getResult().grandTotals[leaf.id] ?? '')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
```

### 3.7 `examples/m4-pivot-main-thread/src/PerfBadge.tsx`

```tsx
interface Props<TRow> {
  rowCount: number;
  data: TRow[];
  onMeasure?: (ms: number) => void;
}

import { useEffect, useState } from 'react';
import { createPivotTable } from '@lynellf/tablekit-pivot';

export function PerfBadge<TRow>({ rowCount, data, onMeasure }: Props<TRow>) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const pivot = createPivotTable<TRow>({
      data,
      pivot: {
        rows: ['region', 'quarter'],
        columns: [],
        measures: [{ id: 'sales_sum', field: 'sales' }],
      },
      getRowId: (r: TRow, i: number) => String((r as { id?: string }).id ?? i),
    });
    const start = performance.now();
    pivot.getResult();
    const end = performance.now();
    setMs(end - start);
    onMeasure?.(end - start);
  }, [data, onMeasure]);

  const overBudget = ms !== null && rowCount > 200_000;
  return (
    <span className={`perf-badge ${overBudget ? 'perf-badge-warn' : ''}`}>
      {ms !== null ? `${ms.toFixed(2)} ms / ${rowCount.toLocaleString()} rows` : 'measuring…'}
      {overBudget && ' — over §12 budget; consider worker engine (M5)'}
    </span>
  );
}
```

### 3.8 `examples/m4-pivot-main-thread/src/styles.css`

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  margin: 0;
  padding: 1rem;
  background: #fafafa;
  color: #222;
}

.app header {
  margin-bottom: 1rem;
}

.controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.demo-panel {
  margin-bottom: 2rem;
  background: white;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.pivot-treegrid {
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: auto;
  max-height: 60vh;
}

.pivot-row, .pivot-header-row {
  display: flex;
  border-bottom: 1px solid #eee;
}

.pivot-row-header {
  width: 200px;
  flex-shrink: 0;
  padding: 0.5rem;
  font-weight: 600;
  background: #f7f7f7;
  border-right: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pivot-toggle {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.pivot-cell {
  width: 120px;
  flex-shrink: 0;
  padding: 0.5rem;
  border-right: 1px solid #f0f0f0;
}

.pivot-cell-total {
  background: #fff8e1;
  font-weight: 600;
}

.perf-badge {
  background: #e3f2fd;
  color: #0d47a1;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.perf-badge-warn {
  background: #ffebee;
  color: #b71c1c;
}
```

### 3.9 `examples/m4-pivot-main-thread/README.md`

```markdown
# M4 Reference App — Pivot, Main Thread

Runnable demo of `@lynellf/tablekit-pivot` + `@lynellf/tablekit-react`'s `usePivotTable` hook.

## Run

```bash
pnpm --filter m4-pivot-main-thread-example dev
# → http://localhost:5174
```

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
```

### 3.10 `packages/pivot/src/serialize/query.ts`

```ts
/**
 * @lynellf/tablekit-pivot/serialize — `buildPivotQuery` (spec §13).
 *
 * Pure PivotConfig → PivotQuery serializer. Strips inline forms when crossing
 * a boundary (M5 worker/server); M4's main-thread engine accepts inline forms.
 *
 * Used by the React hook (phase 5) when the engine option changes to a
 * worker/server engine (M5 plumbing). For phase 6, the serializer is exported
 * for consumers building their own worker engines.
 */

import type {
  FieldRef,
  PivotConfig,
  PivotExpansionState,
  PivotQuery,
  PivotSortingState,
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
  TotalsConfig,
} from '../types';

export interface BuildPivotQueryOptions {
  /** Strip inline forms (default: false for main-thread; M5 sets true). */
  serialize?: boolean;
  /** Already-resolved expandedPaths (RowPathKey[]). */
  expandedPaths?: string[];
}

export const buildPivotQuery = <TRow>(
  data: TRow[],
  pivot: PivotConfig<TRow>,
  expanded: PivotExpansionState,
  sorting: PivotSortingState,
  totals: TotalsConfig,
  opts: BuildPivotQueryOptions = {},
): PivotQuery<TRow> => {
  const serialize = opts.serialize === true;

  const serializeFieldRef = (ref: FieldRef<TRow>): SerializedFieldRef => {
    if (typeof ref === 'string') return { field: ref };
    const out: SerializedFieldRef = { field: ref.field };
    if (ref.label !== undefined) out.label = ref.label;
    if (ref.sortComparator !== undefined) out.sortComparator = ref.sortComparator;
    return out;
  };

  const serializeMeasure = (
    m: import('../types').MeasureDef<TRow>,
  ): SerializedMeasureDef => ({
    id: m.id,
    field: m.field,
    aggregator: typeof m.aggregator === 'string' ? m.aggregator : 'sum',
    label: m.label,
    format: m.format,
  });

  const serializeFilter = (f: import('../types').PivotFilter<TRow>): SerializedPivotFilter | null => {
    if ('predicateRef' in f) return { predicateRef: f.predicateRef, args: 'args' in f ? f.args : undefined };
    if ('predicate' in f) {
      if (serialize) return null; // strip inline predicates when serializing
      return { predicate: f.predicate } as never; // main-thread accepts inline
    }
    return { field: f.field, op: f.op, value: f.value };
  };

  const filters = (pivot.filters ?? []).map(serializeFilter).filter((f): f is SerializedPivotFilter => f !== null);

  const expandedPaths = opts.expandedPaths ?? Object.entries(expanded).filter(([, v]) => v).map(([k]) => k);

  return {
    rows: data,
    rowsFieldRef: pivot.rows.map(serializeFieldRef),
    columnsFieldRef: pivot.columns.map(serializeFieldRef),
    measures: pivot.measures.map(serializeMeasure),
    filters,
    totals,
    expandedPaths,
    pivotSorting: sorting,
    ...(serialize
      ? {}
      : {
          inlineAccessors: {
            rows: pivot.rows.filter((r): r is Exclude<FieldRef<TRow>, string> => typeof r !== 'string'),
            columns: pivot.columns.filter((r): r is Exclude<FieldRef<TRow>, string> => typeof r !== 'string'),
            measures: pivot.measures.filter((m) => m.accessor !== undefined),
          },
        }),
  };
};
```

### 3.11 `packages/pivot/src/serialize/warnings.ts`

```ts
/**
 * @lynellf/tablekit-pivot/serialize — `validatePivotQuery` (spec §13 P3).
 *
 * Dev warning on inline aggregator / predicate leaks. M5 ships the worker +
 * server engines that REQUIRE registry-name aggregators + predicates; M4 ships
 * the warning so consumers wiring inline forms today get a forward-looking
 * notice. M4's main-thread engine accepts inline forms without warning.
 */

import type { PivotQuery } from '../types';

let _warned = false;

export const validatePivotQuery = <TRow>(q: PivotQuery<TRow>): void => {
  if (process.env.NODE_ENV === 'production') return;
  if (_warned) return;
  if (!q.inlineAccessors) return;

  const inlineRows = q.inlineAccessors.rows?.filter((r) => r.accessor !== undefined) ?? [];
  const inlineCols = q.inlineAccessors.columns?.filter((c) => c.accessor !== undefined) ?? [];
  const inlineMeas = q.inlineAccessors.measures?.filter((m) => m.accessor !== undefined) ?? [];
  const inlinePreds = q.filters.filter((f) => 'predicate' in f);

  if (inlineRows.length === 0 && inlineCols.length === 0 && inlineMeas.length === 0 && inlinePreds.length === 0) {
    return;
  }

  _warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[tablekit-pivot] PivotQuery contains inline accessors or predicates. Inline forms ' +
      'are legal on the main-thread engine but will be stripped when crossing to worker ' +
      '(M5) or server engines. Use registry-name FieldRef/MeasureDef/PivotFilter shapes ' +
      'when serializing across a boundary.',
  );
};

/** Test-only: reset the one-shot flag. */
export const __resetInlineLeakWarningForTests = (): void => {
  _warned = false;
};
```

### 3.12 `packages/pivot/src/serialize/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/serialize — public barrel.
 */

export type {
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
  PivotQuery,
} from '../types';

export { buildPivotQuery } from './query';
export type { BuildPivotQueryOptions } from './query';

export { validatePivotQuery, __resetInlineLeakWarningForTests } from './warnings';
```

### 3.13 `packages/pivot/src/index.ts` (serialize re-exports)

```ts
// ─── Serialize (phase 6) ────────────────────────────────────────────────────
export {
  buildPivotQuery,
  type BuildPivotQueryOptions,
  validatePivotQuery,
  __resetInlineLeakWarningForTests,
} from './serialize';
```

### 3.14 `packages/pivot/src/__tests__/serialize.test.ts`

```ts
/**
 * Phase 6 — buildPivotQuery + validatePivotQuery tests.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { buildPivotQuery } from '../serialize/query';
import { __resetInlineLeakWarningForTests, validatePivotQuery } from '../serialize/warnings';
import type { PivotConfig, PivotExpansionState, PivotSortingState, TotalsConfig } from '../types';

interface Row {
  region: string;
  sales: number;
}

const data: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
];

const baseConfig = (): PivotConfig<Row> => ({
  rows: ['region'],
  columns: [],
  measures: [{ id: 'sales_sum', field: 'sales' }],
});

const baseExpanded = (): PivotExpansionState => ({});
const baseSorting = (): PivotSortingState => [];
const baseTotals = (): TotalsConfig => ({});

beforeEach(() => {
  __resetInlineLeakWarningForTests();
});

describe('buildPivotQuery', () => {
  it('empty query (no rows, no columns, no measures, no expansion, no sorting)', () => {
    const q = buildPivotQuery(data, { rows: [], columns: [], measures: [] }, baseExpanded(), baseSorting(), baseTotals());
    expect(q.rowsFieldRef).toEqual([]);
    expect(q.columnsFieldRef).toEqual([]);
    expect(q.measures).toEqual([]);
    expect(q.filters).toEqual([]);
    expect(q.expandedPaths).toEqual([]);
    expect(q.pivotSorting).toEqual([]);
  });

  it('pivot-only (rows + measures)', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), baseTotals());
    expect(q.rowsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.measures).toEqual([{ id: 'sales_sum', field: 'sales', aggregator: 'sum', label: undefined, format: undefined }]);
  });

  it('expanded-only', () => {
    const q = buildPivotQuery(data, baseConfig(), { '["West"]': true }, baseSorting(), baseTotals());
    expect(q.expandedPaths).toEqual(['["West"]']);
  });

  it('sorting-only', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), [{ level: 0, by: 'label', desc: true }], baseTotals());
    expect(q.pivotSorting).toEqual([{ level: 0, by: 'label', desc: true }]);
  });

  it('totals-only (grandTotalRow + grandTotalColumn defaults)', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), { grandTotalRow: true, grandTotalColumn: true });
    expect(q.totals).toEqual({ grandTotalRow: true, grandTotalColumn: true });
  });

  it('all combined', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: ['region'],
      measures: [{ id: 'sales_sum', field: 'sales' }, { id: 'count', aggregator: 'count' }],
      filters: [{ field: 'region', op: 'equals', value: 'West' }],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    };
    const expanded: PivotExpansionState = { '["West"]': true };
    const sorting: PivotSortingState = [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }];
    const totals: TotalsConfig = { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' };
    const q = buildPivotQuery(data, config, expanded, sorting, totals);
    expect(q.rowsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.columnsFieldRef).toEqual([{ field: 'region' }]);
    expect(q.measures).toHaveLength(2);
    expect(q.filters).toEqual([{ field: 'region', op: 'equals', value: 'West' }]);
    expect(q.expandedPaths).toEqual(['["West"]']);
    expect(q.pivotSorting).toEqual([{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }]);
    expect(q.totals).toEqual({ grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' });
  });

  it('serialize: true strips inline accessors + predicates', () => {
    const config: PivotConfig<Row> = {
      rows: [{ field: 'region', accessor: (r) => r.region }],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales', accessor: (r) => r.sales }],
      filters: [{ predicate: (r) => r.region === 'West' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals(), { serialize: true });
    expect(q.inlineAccessors).toBeUndefined();
    expect(q.filters).toEqual([]); // inline predicate stripped
  });
});

describe('validatePivotQuery', () => {
  it('does not warn for registry-name-only queries', () => {
    const q = buildPivotQuery(data, baseConfig(), baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns once when inline accessors are present', () => {
    const config: PivotConfig<Row> = {
      rows: [{ field: 'region', accessor: (r) => r.region }],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).toHaveBeenCalledTimes(1);
    validatePivotQuery(q); // one-shot
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('warns when inline predicates are present', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [{ predicate: (r) => r.region === 'West' }],
    };
    const q = buildPivotQuery(data, config, baseExpanded(), baseSorting(), baseTotals());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validatePivotQuery(q);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

### 3.15 `packages/pivot/src/__tests__/pivotQuery.golden.test.ts`

```ts
/**
 * Phase 6 — PivotQuery serialization golden tests (spec §13).
 *
 * Snapshot tests against committed JSON fixtures. Changes to PivotQuery
 * shape require updating the fixtures (intentional break-the-glass).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPivotQuery } from '../serialize/query';
import type {
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  TotalsConfig,
} from '../types';

interface Row {
  region: string;
  sales: number;
}

const data: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
];

const fixturesDir = resolve(__dirname, 'fixtures', 'pivotQuery');

const load = (name: string) =>
  JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8')) as Record<string, unknown>;

const buildAndSerialize = (
  config: PivotConfig<Row>,
  expanded: PivotExpansionState,
  sorting: PivotSortingState,
  totals: TotalsConfig,
) => {
  const q = buildPivotQuery(data, config, expanded, sorting, totals, { serialize: true });
  // Strip `rows` (the dataset) from serialization since the fixtures don't include it.
  const { rows: _rows, ...rest } = q;
  return JSON.parse(JSON.stringify(rest));
};

describe('pivotQuery.golden', () => {
  it('empty fixture', () => {
    const config: PivotConfig<Row> = { rows: [], columns: [], measures: [] };
    const result = buildAndSerialize(config, {}, [], {});
    expect(result).toEqual(load('empty.json'));
  });

  it('pivot-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [], {});
    expect(result).toEqual(load('pivot-only.json'));
  });

  it('expanded-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, { '["West"]': true }, [], {});
    expect(result).toEqual(load('expanded-only.json'));
  });

  it('sorting-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [{ level: 0, by: 'label', desc: true }], {});
    expect(result).toEqual(load('sorting-only.json'));
  });

  it('totals-only fixture', () => {
    const config: PivotConfig<Row> = { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] };
    const result = buildAndSerialize(config, {}, [], { grandTotalRow: true, grandTotalColumn: true });
    expect(result).toEqual(load('totals-only.json'));
  });

  it('all-combined fixture', () => {
    const config: PivotConfig<Row> = {
      rows: ['region'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }, { id: 'count', aggregator: 'count' }],
      filters: [{ field: 'region', op: 'equals', value: 'West' }],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    };
    const result = buildAndSerialize(
      config,
      { '["West"]': true },
      [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }],
      { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'end' },
    );
    expect(result).toEqual(load('all-combined.json'));
  });
});
```

### 3.16 Golden fixture examples (`packages/pivot/src/__tests__/fixtures/pivotQuery/*.json`)

**`empty.json`:**

```json
{
  "rowsFieldRef": [],
  "columnsFieldRef": [],
  "measures": [],
  "filters": [],
  "totals": {},
  "expandedPaths": [],
  "pivotSorting": []
}
```

**`pivot-only.json`:**

```json
{
  "rowsFieldRef": [{ "field": "region" }],
  "columnsFieldRef": [],
  "measures": [{ "id": "sales_sum", "field": "sales", "aggregator": "sum" }],
  "filters": [],
  "totals": {},
  "expandedPaths": [],
  "pivotSorting": []
}
```

**`expanded-only.json`:**

```json
{
  "rowsFieldRef": [{ "field": "region" }],
  "columnsFieldRef": [],
  "measures": [{ "id": "sales_sum", "field": "sales", "aggregator": "sum" }],
  "filters": [],
  "totals": {},
  "expandedPaths": ["[\"West\"]"],
  "pivotSorting": []
}
```

**`sorting-only.json`:**

```json
{
  "rowsFieldRef": [{ "field": "region" }],
  "columnsFieldRef": [],
  "measures": [{ "id": "sales_sum", "field": "sales", "aggregator": "sum" }],
  "filters": [],
  "totals": {},
  "expandedPaths": [],
  "pivotSorting": [{ "level": 0, "by": "label", "desc": true }]
}
```

**`totals-only.json`:**

```json
{
  "rowsFieldRef": [{ "field": "region" }],
  "columnsFieldRef": [],
  "measures": [{ "id": "sales_sum", "field": "sales", "aggregator": "sum" }],
  "filters": [],
  "totals": { "grandTotalRow": true, "grandTotalColumn": true },
  "expandedPaths": [],
  "pivotSorting": []
}
```

**`all-combined.json`:**

```json
{
  "rowsFieldRef": [{ "field": "region" }],
  "columnsFieldRef": [],
  "measures": [
    { "id": "sales_sum", "field": "sales", "aggregator": "sum" },
    { "id": "count", "aggregator": "count" }
  ],
  "filters": [{ "field": "region", "op": "equals", "value": "West" }],
  "totals": { "grandTotalRow": true, "grandTotalColumn": true, "grandTotalColumnPosition": "end" },
  "expandedPaths": ["[\"West\"]"],
  "pivotSorting": [{ "level": 0, "by": "measure", "measureId": "sales_sum", "desc": true }]
}
```

### 3.17 `docs/m4-pivot-main-thread/api-freeze.md`

```markdown
# API Freeze — M4 (Pivot, Main Thread)

**Date:** 2026-07-05
**Milestone:** M4 Pivot, Main Thread
**Status:** Frozen for M4; subject to deprecation only (no removal without major version bump)

---

## M4 additions (additive; no M0/M1/M2/M3 changes)

### New package: `@lynellf/tablekit-pivot`

#### Root export (`@lynellf/tablekit-pivot`)

- `createPivotTable<TRow>(options): PivotTableInstance<TRow>`
- `defaultGetRowId<TRow>(row, index): string` (with dev warning)
- `__resetPivotDefaultGetRowIdWarningForTests(): void`
- `DEFAULT_PIVOT_STATE: PivotTableState`

#### Types

- `FieldValue`
- `RowPathKey`
- `LeafColumnId`
- `MeasureId`
- `FieldRef<TRow>`
- `MeasureDef<TRow, TIn, TAcc, TOut>`
- `PivotFilter<TRow>`
- `TotalsConfig`
- `PivotConfig<TRow>`
- `PivotExpansionState`
- `PivotSortingState`
- `PivotTableState`
- `Aggregator<TIn, TAcc, TOut>`
- `MaybePromise<T>`
- `AggregationEngine<TRow>`
- `SerializedFieldRef`
- `SerializedMeasureDef`
- `SerializedPivotFilter`
- `PivotQuery<TRow>`
- `PivotLeafColumn<TRow>`
- `PivotColumnNode`
- `PivotRowNode<TRow>`
- `PivotResult<TRow>`
- `PivotTableInstance<TRow>`
- `PivotTableOptions<TRow>`

#### Treegrid prop getters

- `getGridProps(consumerProps?)`
- `getBodyProps(consumerProps?)`
- `getRowProps(row, consumerProps?)`
- `getRowHeaderProps(row, consumerProps?)`
- `getHeaderProps(node, consumerProps?)`
- `getToggleExpandedProps(row, consumerProps?)`
- `getFooterProps(consumerProps?)` (returns null when `grandTotalRow: false`)
- `getTotalsColumnProps(leaf, consumerProps?)`

#### Derived accessors

- `getVisibleRows(): PivotRowNode<TRow>[]`
- `getHeaderRows(): HeaderEntry[][]`
- `getLeafColumns(): PivotLeafColumn<TRow>[]`

#### Announcer messages

- `announceExpansion(announcer, path, wasExpanded, childCount)`
- `announceSorting(announcer, sorting)`
- `announceTotals(announcer)`

#### Subpath: `@lynellf/tablekit-pivot/aggregators`

- `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
- `AvgAccumulator`
- `BUILT_IN_AGGREGATORS` (frozen record)
- `BuiltInAggregatorName` (type)
- `builtInAggregators` (frozen record)
- `registerAggregator(name, fn)`
- `getAggregator(name)`
- `nameOfAggregator(fn)`
- `__resetAggregatorRegistryForTests()`
- `AggregatorName` (type)

#### Subpath: `@lynellf/tablekit-pivot/engine`

- `createMainThreadEngine<TRow>(opts?): AggregationEngine<TRow>`
- `MainThreadEngineOptions` (type)
- `PivotResultCache<TRow>` (class)
- `buildPivotResult<TRow>(query): PivotResult<TRow>`
- `applyPivotSortingAtLevel<TRow>(children, level, sorting, config, getMeasureValue, registryLookup)`
- `rowPathKeyOf(path): RowPathKey`
- `__registerCoreFilterFn(name, fn)`

#### Subpath: `@lynellf/tablekit-pivot/pivotTable`

- `createPivotTable<TRow>(options): PivotTableInstance<TRow>` (re-export)
- `getVisibleRows<TRow>(root, expanded): PivotRowNode<TRow>[]`
- `getHeaderRows(root): HeaderEntry[][]`
- `HeaderEntry` (type)
- All treegrid prop getters (re-export)
- All announcer messages (re-export)

#### Subpath: `@lynellf/tablekit-pivot/serialize`

- `buildPivotQuery<TRow>(data, config, expanded, sorting, totals, opts?): PivotQuery<TRow>`
- `BuildPivotQueryOptions` (type)
- `validatePivotQuery<TRow>(q): void` (dev-only warning)
- `__resetInlineLeakWarningForTests(): void`

### `@lynellf/tablekit-react` (new exports)

- `usePivotTable<TRow>(options): UsePivotTableResult<TRow>` (hook)
- `UsePivotTableOptions<TRow>` (type)
- `UsePivotTableResult<TRow>` (type)
- `resolveTreegridKeyAction<TRow>(pivot, focusedRowKey, key): PivotKeyboardAction | null`
- `applyTreegridAction<TRow>(pivot, action, currentFocusedRowKey): RowPathKey | null`
- `PivotKeyboardAction` (type)
- Re-exports of `@lynellf/tablekit-pivot` surface for consumer convenience (`createPivotTable`, built-in aggregators, registry helpers, types, `DEFAULT_PIVOT_STATE`).

### `@lynellf/tablekit-core` (additive changes only)

- `applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices` widened to a generic over `TState extends Record<string, unknown>`. Signature-compatible for existing M0/M1/M2/M3 callers (TS infers `TState = DataTableState`). No removal, no rename, no signature change.

### `@lynellf/tablekit-react/validate` (additive changes only)

- `validateGridStructure` extended with treegrid-specific rules:
  - `treegrid-tabindex`: root must have `tabIndex=0`.
  - `treegrid-row-expanded`: rows with `data-has-children="true"` must have `aria-expanded`.
  - `treegrid-level-monotonic`: `aria-level` strictly increasing across rendered rows.
  - `treegrid-rowheader-ownership`: `role="rowheader"` cells must be inside a row.
- Production tree-shaking preserved (the rules are wrapped in `if (process.env.NODE_ENV === 'production') return noOpResult;`).

## M0/M1/M2/M3 surface reaffirmed

- All M0/M1/M2/M3 exports remain. No renames, no removals, no signature changes.
- `pnpm verify` continues to pass; M0/M1/M2/M3 tests remain green (~380).

## Behavior changes (additive only)

- `createPivotTable` returns an instance with the same controlled-slice contract as `createDataTable`.
- `usePivotTable` mirrors `useDataTable`'s React 19 + `useSyncExternalStore` pattern.
- Treegrid prop getters emit `role="treegrid"`, `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`, `role="rowheader"`.
- `validateGridStructure` accepts `role="treegrid"` and asserts treegrid-specific rules.
- `nameOfAggregator` enables forward-looking inline-leak dev warnings (M5).

## Tests

- ~150-210 new tests added on top of M0/M1/M2/M3's 380.
- Serialization golden fixtures (6 files) committed under `packages/pivot/src/__tests__/fixtures/pivotQuery/`.
- Property-based merge law tests for all 5 built-in aggregators (associativity, commutativity, accumulate ≡ chunked-merge).
- Reference app demonstrates row hierarchy + expansion + totals + sorting + perf badge.

## Exit criteria (spec §14)

- **Pivot integration + a11y tree tests**: ✓ `packages/react/src/__integration__/pivot-*.test.tsx` + `pivot-treegrid-a11y.test.tsx` assert the DOM shape and `validateGridStructure({ valid: true })`.
- **Sum-default verified**: ✓ `aggregators.test.ts` + `engine.test.ts` confirm that omitting `aggregator` from `MeasureDef` defaults to `'sum'`.
```

---

## 4. Commands

```bash
pnpm install
pnpm verify                                                      # aggregate gate — must exit 0
pnpm test                                                         # M0/M1/M2/M3 (~380) + M4 (~150-210) tests, all green

# Pivot subpath smoke
node -e "import('@lynellf/tablekit-pivot').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/aggregators').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/engine').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/pivotTable').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/serialize').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable))"

# Reference app
pnpm --filter m4-pivot-main-thread-example build                 # EXIT 0
pnpm --filter m4-pivot-main-thread-example dev                   # http://localhost:5174

# Golden fixture tests
pnpm --filter @lynellf/tablekit-pivot test -- --run pivotQuery.golden

# Merge law property tests
pnpm --filter @lynellf/tablekit-pivot test -- --run mergeLaws

# §12 advisory bench
pnpm --filter @lynellf/tablekit-pivot bench main-thread.bench
```

---

## 5. Verification

After all 6 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                      # EXIT 0
pnpm test                                                         # ~530-590 tests, all green
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates (typecheck + lint + test + build) must pass with exit code 0.

---

## 6. Out-of-scope reminder

M4 does **not** ship the worker engine, server engine, subtotals (`perLevel`), full announcer polish (i18n + politeness heuristics), screen-reader manual matrix, `validateGridStructure` CLI, layered diagnostics, `tabBehavior` option, split-pane recipe, `rowSelection`, state persistence helper, global quick filter, column auto-fit, or hard-gating behind `allowWithinPageOperations`. These are explicit non-goals per spec §9, §14, §15, and §16.

---

## 7. Risks

- **R10 (`pnpm verify` on new package):** Phase 1 wired `pnpm -F @lynellf/tablekit-pivot build` into the root `build` script. Phase 6's final `pnpm verify` exercises the full path end-to-end. Verified by phase 1-5 tests passing incrementally.
- **R11 (react peer dep):** `@lynellf/tablekit-pivot` is an **optional** peer dep on the react package. Consumers using only DataTable don't install pivot; the bundle tree-shakes correctly.
- **R12 (golden fixture stability):** The 6 fixtures are committed; changes to `PivotQuery` shape require updating fixtures (intentional). The `pivotQuery.golden.test.ts` fails on any mismatch, surfacing the shape change for review.
- **R5 (treegrid + colindex handling):** The reference app renders `aria-colindex` per spec §9.8. SR/browser quirks remain M6's responsibility (manual matrix).
- **R3 (lazy expansion + memoization):** The reference app benchmarks re-pivot on 1k / 10k / 50k / 100k rows; results are advisory. The badge turns red when rowCount > 200k (the §12 boundary). M5's worker engine addresses the over-budget case.
- **Pivot config immutability:** The factory treats `pivot` as a constructor argument + state slice. Consumers who want to swap the entire pivot config mid-render should re-mount the instance; M5 + the §11 future-adapter roadmap may revisit this.

(Risks R1, R2, R4, R6, R7, R8, R9, R13, R14, R15 are tracked in `overview.md` §6 and addressed in their respective phases.)