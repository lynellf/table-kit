# Phase 5 — Reference App + Serialization Goldens + API Freeze

**Goal:** Ship the §14 exit-criterion "server pagination/sort/filter reference app" (`examples/m3-server-modes/`), commit the serialization golden fixtures for §13 contract tests, update `api-freeze.md` with the M3 surface, and run the aggregate `pnpm verify` gate one final time.

After this phase:

- `examples/m3-server-modes/` is a runnable Vite + React 19 app demonstrating the four M3 patterns (server pagination only; server pagination + server sort; server pagination + server filter; mixed-mode trap with/without `allowWithinPageOperations`).
- `examples/m3-server-modes/` builds cleanly (`pnpm --filter m3-server-modes-example build`).
- Serialization golden fixtures committed under `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/`.
- `api-freeze.md` updated with the M3 surface.
- `pnpm verify` exits 0; new tests pass (~15-25); §14 exit criteria satisfied.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `examples/m3-server-modes/package.json` | Vite 5 + React 19 + workspace deps |
| `examples/m3-server-modes/vite.config.ts` | Vite config (port 5173, alias workspace sources) |
| `examples/m3-server-modes/index.html` | Root HTML |
| `examples/m3-server-modes/README.md` | How to run; what to look for; perf badge explanation |
| `examples/m3-server-modes/src/main.tsx` | Entry point |
| `examples/m3-server-modes/src/App.tsx` | Tabs: pagination / sort / filter / mixed-mode / perf badge |
| `examples/m3-server-modes/src/fakeServer.ts` | Synthetic data source with configurable delay + signal |
| `examples/m3-server-modes/src/DemoPanel.tsx` | Reusable panel for one pattern |
| `examples/m3-server-modes/src/styles.css` | Skeleton styles + perf badge styles |
| `examples/m3-server-modes/src/useFakeDataSource.ts` | Wraps `createClientDataSource` with `setTimeout` + signal abort for demo realism |
| `examples/m3-server-modes/tsconfig.json` | TS config |
| `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/*.json` | Golden fixtures (one per scenario) |
| `docs/m3-server-modes/api-freeze.md` | M3 surface additions + M0/M1/M2 reaffirmed |
| `docs/m3-server-modes/ARCHIVE-MANIFEST.md` | M3 archive manifest (created when archive is finalized) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `pnpm-workspace.yaml` | Add `examples/*` (or `examples/m3-server-modes` — single-package scope is safer) |
| `package.json` (root) | No change — `pnpm verify` continues to typecheck + lint + test + build the workspace packages. The example builds separately via its own filter. |
| `docs/archive/m2-advanced-features/api-freeze.md` | Note added: "M3 adds the `dataSource` subpath and `useDataSource`; M0/M1/M2 surface unchanged." |
| `README.md` | Add a "Server modes" section linking to the reference app |

No source-of-truth library changes in this phase — only docs + examples + fixtures.

---

## 3. File contents (key files)

### 3.1 `examples/m3-server-modes/package.json`

```json
{
  "name": "m3-server-modes-example",
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

### 3.2 `examples/m3-server-modes/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Workspace sources are already resolvable via pnpm's link-workspace-packages
  // (set in .npmrc); no alias needed.
});
```

### 3.3 `examples/m3-server-modes/src/fakeServer.ts`

```ts
/**
 * Synthetic data source that mimics a real server: configurable delay,
 * respects AbortSignal, returns totalRowCount on every call.
 */

import type { DataSource, RowsQuery } from '@lynellf/tablekit-core/dataSource';

export interface FakeServerOptions {
  /** Synthetic dataset size. Default 10_000. */
  totalRows?: number;
  /** Delay in ms before resolving. Default 300. */
  delayMs?: number;
  /** Probability (0-1) of throwing an error per call. Default 0 (no errors). */
  errorRate?: number;
}

interface Row { id: string; name: string; region: 'West' | 'East' | 'North' | 'South'; sales: number; }

const REGIONS = ['West', 'East', 'North', 'South'] as const;

export const createFakeServer = (opts: FakeServerOptions = {}): DataSource<Row> => {
  const totalRows = opts.totalRows ?? 10_000;
  const delayMs = opts.delayMs ?? 300;
  const errorRate = opts.errorRate ?? 0;

  // Generate the synthetic dataset once.
  const allRows: Row[] = Array.from({ length: totalRows }, (_, i) => ({
    id: String(i + 1),
    name: `Person ${i + 1}`,
    region: REGIONS[i % 4] as 'West' | 'East' | 'North' | 'South',
    sales: Math.round(Math.random() * 1000),
  }));

  return {
    capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    getRows: async (q: RowsQuery, { signal }) => {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const t = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        const onAbort = () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort);
      });

      if (Math.random() < errorRate) {
        throw new Error('Synthetic server error');
      }

      // Apply filters.
      let filtered = allRows;
      for (const f of q.filters) {
        if (f.id === 'region' && typeof f.value === 'string') {
          filtered = filtered.filter((r) => r.region === f.value);
        } else if (f.id === 'sales' && Array.isArray(f.value) && f.value.length === 2) {
          const [min, max] = f.value as [number, number];
          filtered = filtered.filter((r) => r.sales >= min && r.sales <= max);
        }
      }

      // Apply sort.
      if (q.sorting[0]) {
        const { id, desc } = q.sorting[0];
        filtered = [...filtered].sort((a, b) => {
          const av = a[id as keyof Row];
          const bv = b[id as keyof Row];
          if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
          return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
        });
      }

      // Paginate.
      const pageIndex = q.pagination?.pageIndex ?? 0;
      const pageSize = q.pagination?.pageSize ?? 25;
      const start = pageIndex * pageSize;
      const end = start + pageSize;

      return { rows: filtered.slice(start, end), totalRowCount: filtered.length };
    },
  };
};
```

### 3.4 `examples/m3-server-modes/src/App.tsx` (sketch)

```tsx
/** @jsxImportSource react */
import { useState } from 'react';
import { DemoPanel } from './DemoPanel';
import { PerfBadge } from './PerfBadge';
import './styles.css';

type Tab = 'pagination' | 'sort' | 'filter' | 'mixed' | 'perf';

export const App = () => {
  const [tab, setTab] = useState<Tab>('pagination');
  return (
    <div className="app">
      <nav>
        <button data-active={tab === 'pagination'} onClick={() => setTab('pagination')}>Server pagination</button>
        <button data-active={tab === 'sort'} onClick={() => setTab('sort')}>Server sort</button>
        <button data-active={tab === 'filter'} onClick={() => setTab('filter')}>Server filter</button>
        <button data-active={tab === 'mixed'} onClick={() => setTab('mixed')}>Mixed-mode trap</button>
        <button data-active={tab === 'perf'} onClick={() => setTab('perf')}>§12 perf budget</button>
      </nav>
      <main>
        {tab === 'pagination' && <DemoPanel scenario="pagination" />}
        {tab === 'sort' && <DemoPanel scenario="sort" />}
        {tab === 'filter' && <DemoPanel scenario="filter" />}
        {tab === 'mixed' && <DemoPanel scenario="mixed" />}
        {tab === 'perf' && <PerfBadge />}
      </main>
    </div>
  );
};
```

### 3.5 `examples/m3-server-modes/src/DemoPanel.tsx` (sketch)

```tsx
/** @jsxImportSource react */
import { useDataTable } from '@lynellf/tablekit-react';
import { createFakeServer } from './fakeServer';

export const DemoPanel = ({ scenario }: { scenario: 'pagination' | 'sort' | 'filter' | 'mixed' }) => {
  // Each scenario configures the data source capabilities differently.
  const source = createFakeServer({ delayMs: 300 });

  // For the "mixed" scenario, we override capabilities to paginate: server + sort: client.
  const effectiveSource = scenario === 'mixed'
    ? { ...source, capabilities: { sort: 'client' as const, filter: 'client' as const, paginate: 'server' as const } }
    : source;

  const { table, dataSourceState, Announcer } = useDataTable({
    data: [],
    columns: [
      { id: 'id', accessor: 'id' },
      { id: 'name', accessor: 'name' },
      { id: 'region', accessor: 'region', enableFiltering: true, filterFn: 'equalsString' },
      { id: 'sales', accessor: 'sales', enableSorting: true, enableFiltering: true, filterFn: 'inNumberRange' },
    ],
    dataSource: effectiveSource,
    allowWithinPageOperations: scenario === 'mixed' ? false : undefined,
  });

  return (
    <div>
      <Announcer />
      <p>Status: <strong>{dataSourceState?.status}</strong></p>
      <div {...table.getGridProps()} className="grid">
        <div {...table.getHeaderGroupProps()} className="header">
          {table.getHeaderGroups()[0]?.headers.map((h) => (
            <div key={h.id} {...h.getHeaderProps()} className="cell header-cell">
              {String(h.column.def.header ?? h.id)}
            </div>
          ))}
        </div>
        <div {...table.getBodyProps()} className="body">
          {table.getRowModel().map((row) => (
            <div key={row.id} {...row.getRowProps()} className="row">
              {row.getVisibleCells().map((c) => (
                <div key={c.id} {...c.getCellProps()} className="cell">
                  {row.isPlaceholder ? <span className="skeleton" /> : String(c.getValue())}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

### 3.6 `examples/m3-server-modes/src/PerfBadge.tsx` (sketch)

```tsx
/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { useDataTable } from '@lynellf/tablekit-react';
import { createFakeServer } from './fakeServer';

export const PerfBadge = () => {
  const source = createFakeServer({ delayMs: 50, totalRows: 100_000 });
  const { table, dataSourceState, Announcer } = useDataTable({
    data: [],
    columns: [{ id: 'name', accessor: 'name' }, { id: 'sales', accessor: 'sales' }],
    dataSource: source,
  });
  const lastFetchTime = useRef<number | null>(null);
  const [badge, setBadge] = useState<string>('—');

  useEffect(() => {
    if (dataSourceState?.status === 'success' && dataSourceState.data) {
      // Measure the time from previous success to next.
      const now = performance.now();
      if (lastFetchTime.current !== null) {
        const ms = now - lastFetchTime.current;
        const verdict = ms < 16 ? '✓ within §12 budget' : '✗ over §12 budget';
        setBadge(`${ms.toFixed(1)}ms ${verdict}`);
      }
      lastFetchTime.current = now;
    }
  }, [dataSourceState?.status, dataSourceState?.data]);

  return (
    <div>
      <Announcer />
      <div className="perf-badge">Page render time: {badge}</div>
      <div {...table.getGridProps()} className="grid">
        {/* Minimal render — just the count badge */}
      </div>
    </div>
  );
};
```

### 3.7 `pnpm-workspace.yaml` — change

Current content (from M0):

```yaml
packages:
  - 'packages/*'
```

Change to:

```yaml
packages:
  - 'packages/*'
  - 'examples/*'
```

(Or scope to `examples/m3-server-modes` to limit the workspace to just the M3 example. The broader `examples/*` is forward-looking — M4 (pivot example) and M6 (recipe docs as examples) will add to it. Trade-off: broader scope requires every new example to be a valid pnpm workspace package. Decision: use `examples/*` for forward compat; M3 is the first consumer.)

### 3.8 Golden fixtures (`packages/core/src/dataSource/__tests__/fixtures/rowsQuery/`)

Five committed JSON files:

```jsonc
// 01-empty.json
{
  "sorting": [],
  "filters": []
  // pagination omitted (capabilities.paginate === 'client')
}

// 02-sort-asc.json
{
  "sorting": [{ "id": "name", "desc": false }],
  "filters": []
}

// 03-multi-sort.json
{
  "sorting": [
    { "id": "region", "desc": false },
    { "id": "sales", "desc": true }
  ],
  "filters": []
}

// 04-filter-range.json
{
  "sorting": [],
  "filters": [
    { "id": "sales", "value": [100, 500] } // filterFn omitted (equals is default)
  ]
}

// 05-paginated.json
{
  "sorting": [{ "id": "name", "desc": false }],
  "filters": [
    { "id": "region", "value": "West", "filterFn": "equalsString" }
  ],
  "pagination": { "pageIndex": 2, "pageSize": 25 }
}
```

### 3.9 `packages/core/src/dataSource/__tests__/query.golden.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRowsQuery } from '../query';
import type { DataTableState } from '../../types';
import type { ColumnDef } from '../../types';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, `fixtures/rowsQuery/${name}.json`), 'utf8');

const baseState: DataTableState = {
  sorting: [],
  columnFilters: [],
  pagination: { pageIndex: 0, pageSize: 25 },
  columnOrder: [],
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
};

const baseColumns: Array<ColumnDef<unknown, unknown>> = [
  { id: 'name', accessor: 'name' },
  { id: 'region', accessor: 'region', enableFiltering: true, filterFn: 'equalsString' },
  { id: 'sales', accessor: 'sales', enableSorting: true, enableFiltering: true, filterFn: 'inNumberRange' },
];

describe('RowsQuery serialization golden tests (spec §13)', () => {
  it('empty state → empty query', () => {
    const out = buildRowsQuery(baseState, [], { capabilities: { sort: 'client', filter: 'client', paginate: 'client' } });
    expect(JSON.stringify(out)).toBe(fixture('01-empty'));
  });

  it('sort by name asc → sort + empty filters', () => {
    const state = { ...baseState, sorting: [{ id: 'name', desc: false }] };
    const out = buildRowsQuery(state, [], { capabilities: { sort: 'server', filter: 'client', paginate: 'client' } });
    expect(JSON.stringify(out)).toBe(fixture('02-sort-asc'));
  });

  it('multi-sort → two sort items', () => {
    const state = { ...baseState, sorting: [{ id: 'region', desc: false }, { id: 'sales', desc: true }] };
    const out = buildRowsQuery(state, [], { capabilities: { sort: 'server', filter: 'client', paginate: 'client' } });
    expect(JSON.stringify(out)).toBe(fixture('03-multi-sort'));
  });

  it('range filter → filter with array value, no filterFn', () => {
    const state = { ...baseState, columnFilters: [{ id: 'sales', value: [100, 500] }] };
    const out = buildRowsQuery(state, [], { capabilities: { sort: 'client', filter: 'server', paginate: 'client' } });
    expect(JSON.stringify(out)).toBe(fixture('04-filter-range'));
  });

  it('paginated query → all three sections', () => {
    const state = {
      ...baseState,
      sorting: [{ id: 'name', desc: false }],
      columnFilters: [{ id: 'region', value: 'West' }],
      pagination: { pageIndex: 2, pageSize: 25 },
    };
    const out = buildRowsQuery(state, [], { capabilities: { sort: 'server', filter: 'server', paginate: 'server' } });
    expect(JSON.stringify(out)).toBe(fixture('05-paginated'));
  });
});
```

(Note: the golden tests use empty columns array because the filter-Fn-name resolution needs the resolved `Column<TRow>` objects. For pure serialization tests, the columns don't affect the output unless `filterFn` is set on a column. The golden fixtures commit to "filterFn omitted when it equals the default" behavior.)

### 3.10 `docs/m3-server-modes/api-freeze.md`

Document the M3 additions (no M0/M1/M2 changes):

```md
# API Freeze — M3 (Server Modes)

## M3 additions (additive; no M0/M1/M2 changes)

### `@lynellf/tablekit-core/dataSource` (new subpath)

- `MaybePromise<T>` (type)
- `Capability` (type: 'client' | 'server')
- `DataSourceCapabilities` (type)
- `SerializedFilter` (type: { id, value, filterFn? })
- `RowsQuery` (type: { sorting, filters, pagination? })
- `DataSourceStatus` (type: 'idle' | 'loading' | 'success' | 'error')
- `DataSourceState<TRow>` (type)
- `DataSource<TRow>` (interface)
- `BuildRowsQueryOptions` (type)
- `CreateClientDataSourceOptions<TRow>` (type)
- `buildRowsQuery(state, columns, opts)` (function)
- `createClientDataSource(rows, columns, opts?)` (function)
- `validateModeConfiguration(options)` (function — dev-only warning)
- `synthesizePlaceholderRows(n)` (function)
- `nameOfSortingFn(fn)` (function — reverse registry lookup)
- `nameOfFilterFn(fn)` (function — reverse registry lookup)
- `__resetMixedModeWarningForTests()` (function — test-only)

### `@lynellf/tablekit-core` (type-only exports from dataSource)

- All type-only exports from above (for consumers using the main entry)

### `DataTableOptions` (new field)

- `allowWithinPageOperations?: boolean`
- `placeholderRows?: number`

### `@lynellf/tablekit-react` (new exports)

- `useDataSource(table, source)` (hook)
- `UseDataSourceResult<TRow>` (type)
- `useDataTable` (extended): `dataSource?: DataSource<TRow>` option; `dataSourceState?: DataSourceState<TRow>` on the return

### Behavior changes (additive only)

- `createDataTable` calls `validateModeConfiguration` on construction and on `setOptions` (dev-only).
- `getGridProps()` emits `aria-busy="true"` when `dataSourceState.status === 'loading'`; `aria-invalid="true"` on error.
- `getBodyProps()` mirrors `aria-busy` on the body rowgroup.
- `getRowModel()` returns placeholder rows when the data source is loading and no fresh data is available.
- `setOptions` accepts the `dataSource`-driven `manual*` overrides without breaking controlled-slice semantics.

## M0/M1/M2 surface reaffirmed

- All M0/M1/M2 exports remain. No renames, no removals, no signature changes.
- The `manualSorting` / `manualFiltering` / `manualPagination` / `rowCount` options remain on `DataTableOptions`; M3 layers `DataSource` on top.
- The `Announcer` interface is unchanged; M3 routes "Loaded N rows" through it.

## Tests

- ~110-160 new tests added on top of M0/M1/M2's 302.
- Serialization golden fixtures (5 files) committed under `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/`.
- Reference app demonstrates the four M3 patterns and the mixed-mode trap.

## Exit criteria (spec §14)

- Mixed-mode warnings: ✓ `validateModeConfiguration` fires once per instance in dev.
- Server pagination/sort/filter reference app: ✓ `examples/m3-server-modes/` runs and demonstrates all patterns.
```

---

## 4. Commands + Verification

```bash
# 1. Typecheck + lint + test + build for workspace packages
pnpm verify                                                # EXIT 0

# 2. Build the reference app
pnpm install                                               # pick up pnpm-workspace.yaml change
pnpm --filter m3-server-modes-example build                # EXIT 0

# 3. Dev-serve the reference app (manual)
pnpm --filter m3-server-modes-example dev
# Open http://localhost:5173 — verify each tab works.

# 4. Golden fixture tests
pnpm --filter @lynellf/tablekit-core test -- --run query.golden
# All 5 fixtures should match.

# 5. Aggregate gate
pnpm verify                                                # EXIT 0

# 6. Bundle size check
pnpm --filter @lynellf/tablekit-core build
pnpm --filter @lynellf/tablekit-react build
# Inspect dist/ sizes; expect M3 delta: ~3-5 kB min+gzip on top of M2's ~27 kB.
```

### Acceptance criteria

- `pnpm verify` exits 0.
- `pnpm --filter m3-server-modes-example build` exits 0.
- Golden tests pass; fixtures committed.
- Reference app demonstrates the four patterns + perf badge.
- `api-freeze.md` documents the M3 surface additively.
- M0/M1/M2 tests still pass (~302 tests, no regressions).
- §14 exit criteria satisfied:
  - **Mixed-mode warnings** — `validateModeConfiguration` fires; verified via integration test.
  - **Server pagination/sort/filter reference app** — `examples/m3-server-modes/` runs and demonstrates all patterns.

---

## 5. Out-of-scope (deferred to M4+)

- Pivot reference app — M4.
- Worker engine bench — M5.
- Full announcer `messages` map + i18n — M6.
- Screen-reader manual matrix — M6.
- `validateGridStructure` CLI / layered diagnostics — M6.
- More example apps (DnD recipe, split-pane recipe, server-side expansion reference) — M6.
- Hard gate behind `allowWithinPageOperations` — v2.

---

## 6. Risks (phase 5 specific)

1. **`pnpm-workspace.yaml` change blast radius.** Adding `examples/*` makes any directory under `examples/` a workspace package. CI must continue to succeed with the new directory; consumers' local `pnpm install` runs must not fail. Mitigation: the new package.json in `examples/m3-server-modes/` declares only its own deps (no extras). The CI workflow remains unchanged; only a new optional `pnpm --filter m3-server-modes-example build` step is added (documented but not gating `pnpm verify`).
2. **Golden fixture drift.** Future changes to `RowsQuery` shape (e.g., adding `meta`, changing `filterFn` default) break the golden tests. Mitigation: the test asserts byte-equal JSON; the implementation review process catches intentional changes before they land. The fixture files are reviewed in any PR that touches `query.ts`.
3. **Reference app dependency resolution.** The example depends on `@lynellf/tablekit-core` and `@lynellf/tablekit-react` from the workspace. If a workspace source change breaks the example's import, the example build fails. Mitigation: phase 5 includes a smoke build in CI (documented as advisory; not gating).
4. **§12 perf badge measurement.** The badge measures `performance.now()` between consecutive successful fetches, not "render time after data arrives". The spec says "render new page < 16ms after data arrives" — a more accurate measurement would use `performance.mark('data-arrived')` + `performance.mark('rendered')` + `performance.measure(...)`. The reference app uses the simpler between-fetches timing; a follow-up polish (M6) refines to mark-based measurement.
5. **Reference app accessibility.** The example uses the prop getters correctly (data-placeholder, role="grid", etc.) but does not run axe or the `validateGridStructure` validator. A follow-up integration test in the example (or a CI step) runs axe on each demo panel.
6. **`pnpm-workspace.yaml` and `node-linker=isolated`.** The existing `.npmrc` sets `node-linker=isolated`, which means the example gets its own dependency graph. This is correct (the example should not share deps with `packages/react`); it does mean a full `pnpm install` is needed before the example builds.