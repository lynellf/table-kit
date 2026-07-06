# Phase 5 — Reference app + 1M-row perf bench + golden fixtures

**Goal:** Ship `examples/m5-pivot-engines/` (Vite + React 19) demonstrating both the worker engine (1M-row synthetic dataset) and the server engine (mock async API with delayed responses); ship `packages/worker/bench/worker.bench.ts` (1M-row bench asserting the §12 perf budget); ship `protocol.golden.test.ts` (serialization contract tests for the wire types); end-to-end smoke test of a real `new Worker(url)` instantiation.

**Exit criteria:** `pnpm --filter m5-pivot-engines-example dev` boots the reference app at http://localhost:5175; `pnpm --filter @lynellf/tablekit-worker bench` runs and produces the perf badge numbers; `pnpm --filter @lynellf/tablekit-worker test -- --run protocol.golden` passes; the app demonstrates worker re-pivot < 1.5s on a mid-tier laptop AND server expansion loading → loaded transitions.

---

## 1. Files to create

### 1.1 `examples/m5-pivot-engines/`

Vite + React 19 app. Layout: two tabs — "Worker engine" and "Server engine".

**File layout** (mirrors `examples/m4-pivot-main-thread/`):

```
examples/m5-pivot-engines/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── README.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── views/
│   │   ├── WorkerView.tsx
│   │   └── ServerView.tsx
│   ├── data/
│   │   ├── generateRows.ts (1M-row synthetic data)
│   │   └── mockServerApi.ts (setTimeout-based mock async API)
│   ├── worker/
│   │   └── pivotWorker.ts (createWorkerEntry + custom aggregator registrations)
│   └── styles.css
```

**Key files:**

`src/data/generateRows.ts`:

```ts
export interface SalesRow {
  id: number;
  region: 'North' | 'South' | 'East' | 'West';
  category: 'Electronics' | 'Apparel' | 'Home' | 'Sports';
  product: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  revenue: number;
  cost: number;
}

export const generateRows = (n: number, seed = 42): SalesRow[] => {
  // Mulberry32 seeded RNG; deterministic output for bench reproducibility.
  // 1M rows × ~80 bytes each = ~80MB structured-clone transfer.
};
```

`src/worker/pivotWorker.ts`:

```ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';
const entry = createWorkerEntry();
entry.registerAggregators({
  weightedAvg: { /* ... */ },
});
// Vite's ?worker import needs a default export.
export default {};
```

`src/views/WorkerView.tsx`:

```tsx
import { useEffect, useState, useRef } from 'react';
import { usePivotTable } from '@lynellf/tablekit-react';
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import Worker from '../worker/pivotWorker?worker';
import { generateRows } from '../data/generateRows';

export const WorkerView = () => {
  const [perfBadge, setPerfBadge] = useState<string>('');
  const engineRef = useRef<ReturnType<typeof createWorkerEngine> | null>(null);

  useEffect(() => {
    engineRef.current = createWorkerEngine({ createWorker: () => new Worker() });
    return () => { engineRef.current?.dispose(); };
  }, []);

  const { pivot /* ... */ } = usePivotTable({
    data: useMemo(() => generateRows(1_000_000), []),
    config: { rows: ['region', 'category', 'product'], columns: ['quarter'], measures: [{ id: 'rev', field: 'revenue' }, { id: 'cnt', aggregator: 'count' }] },
    engine: engineRef.current!,
  });

  // Perf badge: time the compute() call.
  const handleRepivot = async () => {
    const t0 = performance.now();
    await engineRef.current!.compute(/* ... */);
    setPerfBadge(`Re-pivot: ${(performance.now() - t0).toFixed(0)}ms`);
  };

  return /* JSX with the pivot table + perf badge */;
};
```

`src/views/ServerView.tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import { usePivotTable } from '@lynellf/tablekit-react';
import { createServerEngine } from '@lynellf/tablekit-worker/server';
import { mockServerApi } from '../data/mockServerApi';

export const ServerView = () => {
  const engine = useMemo(() => createServerEngine({
    compute: (q, ctx) => mockServerApi.computeTopLevel(q, ctx),
    computeChildren: (path, q, ctx) => mockServerApi.computeChildren(path, q, ctx),
    debounceMs: 50,
  }), []);

  const { pivot /* ... */ } = usePivotTable({
    data: [],
    config: { rows: ['region', 'category'], columns: ['year'], measures: [{ id: 'rev', field: 'revenue' }] },
    engine,
  });

  return /* JSX with the server-expansion pivot + "Retry" button on error rows */;
};
```

`src/data/mockServerApi.ts`:

```ts
import type { PivotQuery, PivotResult, PivotRowNode, FieldValue } from '@lynellf/tablekit-pivot';

// Returns the collapsed top-level result for a query. Delays 200ms.
export const mockServerApi = {
  async computeTopLevel(q: PivotQuery, ctx: { signal: AbortSignal }): Promise<PivotResult> {
    await sleep(200, ctx.signal);
    return { /* synthesized top level from the query's rows... but the server doesn't have rows; uses a known dataset */ };
  },
  async computeChildren(path: FieldValue[], q: PivotQuery, ctx: { signal: AbortSignal }): Promise<PivotRowNode[]> {
    await sleep(300, ctx.signal);
    return [/* synthesized children */];
  },
};
```

The mock server uses a pre-baked dataset (no client-side data; the server is the source of truth). The `data` prop on `usePivotTable` is unused for server engines but required by the type — pass `[]` or `null as unknown as TRow[]` and document that server engines ignore it.

### 1.2 `examples/m5-pivot-engines/package.json`

```json
{
  "name": "m5-pivot-engines-example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@lynellf/tablekit-react": "workspace:*",
    "@lynellf/tablekit-pivot": "workspace:*",
    "@lynellf/tablekit-worker": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

### 1.3 `examples/m5-pivot-engines/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5175 },
  worker: { format: 'es' },
});
```

### 1.4 `examples/m5-pivot-engines/index.html`

Standard Vite HTML entry; the app root is `#root`.

### 1.5 `packages/worker/bench/worker.bench.ts`

Vitest `bench` mode. 1M-row synthetic dataset, 3-level hierarchy (region → category → product), 2 measures (sum of revenue, count of orders). Methodology:

```ts
import { bench, describe } from 'vitest';
import { createWorkerEngine } from '../src/engine/createWorkerEngine';
import { generateRows } from '../../examples/m5-pivot-engines/src/data/generateRows';

// Use a stub Worker that posts messages to an in-process handler.
class StubWorker { /* see phase 3's TestWorkerShim */ }

describe('worker engine — 1M-row budget', () => {
  const rows = generateRows(1_000_000);
  const query = { rows, /* serialized config */ };

  bench('cold: createWorkerEngine + setRows + first compute', async () => {
    const engine = createWorkerEngine({ createWorker: () => new StubWorker() });
    await engine.setRows!(rows);
    await engine.compute(query, { signal: new AbortController().signal });
    engine.dispose();
  }, { iterations: 3, time: 10_000 });

  bench('warm: re-pivot (config change, no setRows)', async () => {
    const engine = createWorkerEngine({ createWorker: () => new StubWorker() });
    await engine.setRows!(rows);
    await engine.compute(query, { signal: new AbortController().signal }); // warm up
    // Toggle measure: should refire compute, not setRows.
    const nextQuery = { ...query, measures: [...query.measures, { id: 'cost', field: 'cost', aggregator: 'sum' }] };
    await engine.compute(nextQuery, { signal: new AbortController().signal });
    engine.dispose();
  }, { iterations: 5, time: 15_000 });
});
```

The bench is **advisory** — CI runs it and logs numbers, but `pnpm verify` does not gate on the perf numbers (per D9).

### 1.6 `packages/worker/src/__tests__/protocol.golden.test.ts`

Golden fixtures for the wire protocol shape:

```ts
import { describe, it, expect } from 'vitest';
import { serializeQuery } from '../src/serialization/serializeQuery';
import type { PivotQuery, WirePivotQuery } from '@lynellf/tablekit-pivot';

describe('protocol serialization', () => {
  it('serializeQuery strips rows and inlineAccessors', () => {
    const q: PivotQuery = {
      rows: [{ a: 1 }],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
      inlineAccessors: {
        rows: [{ field: 'region', accessor: (r: any) => r.region.toUpperCase() }],
      },
    };
    const wire = serializeQuery(q);
    expect(wire).not.toHaveProperty('rows');
    expect(wire).not.toHaveProperty('inlineAccessors');
    expect(wire.rowsFieldRef).toEqual([{ field: 'region' }]);
  });

  it('WirePivotQuery is structurally a subset of PivotQuery', () => {
    // Compile-time check: WirePivotQuery can be assigned to Omit<PivotQuery, 'rows' | 'inlineAccessors'>.
    const _assignability: WirePivotQuery = {} as Omit<PivotQuery, 'rows' | 'inlineAccessors'>;
    const _reverse: Omit<PivotQuery, 'rows' | 'inlineAccessors'> = {} as WirePivotQuery;
    expect(_assignability).toBeDefined();
    expect(_reverse).toBeDefined();
  });

  // Golden fixtures (6 files, mirrors M4's PivotQuery fixture approach).
  it('golden: top-level pivot config', () => { /* ... */ });
  it('golden: pivot with row + column hierarchy', () => { /* ... */ });
  it('golden: pivot with 2 measures (sum + count)', () => { /* ... */ });
  it('golden: pivot with global filters', () => { /* ... */ });
  it('golden: pivot with expanded paths', () => { /* ... */ });
  it('golden: pivot with pivot sorting', () => { /* ... */ });
});
```

### 1.7 `examples/m5-pivot-engines/README.md`

Brief usage doc: `pnpm install && pnpm --filter m5-pivot-engines-example dev`. Demonstrates the Vite recipe for the worker import (`?worker`).

---

## 2. Files to change

- `pnpm-workspace.yaml`: example entry was added in phase 1; no change.
- `packages/worker/package.json`: `bench` script (added in phase 1) — no change.

---

## 3. Commands

```bash
pnpm install
pnpm --filter m5-pivot-engines-example build                          # EXIT 0
pnpm --filter m5-pivot-engines-example typecheck                      # EXIT 0

# Bench (advisory; logs numbers, does not gate)
pnpm --filter @lynellf/tablekit-worker bench                          # ~2 bench entries, runs

# Golden tests
pnpm --filter @lynellf/tablekit-worker test -- --run protocol.golden  # ~7 tests, all green

# Reference app boot (manual verification)
pnpm --filter m5-pivot-engines-example dev                            # http://localhost:5175
# - Worker tab: click "Re-pivot" 5 times, assert perf badge < 1500ms on mid-tier laptop
# - Server tab: click expander, assert loading then loaded
# - Server tab: simulate network error (toggle a dev mode flag), assert error state, click retry

pnpm verify                                                           # EXIT 0
```

---

## 4. Verification

The bench is advisory; CI logs the numbers and files a regression warning if the warm-re-pivot exceeds 1.5s. The reference app is the manual verification surface (per spec §14's reference app exit criterion).

```bash
# Protocol golden tests
pnpm --filter @lynellf/tablekit-worker test -- --run protocol.golden

# Reference app build
pnpm --filter m5-pivot-engines-example build                          # EXIT 0

# Perf bench numbers (advisory)
pnpm --filter @lynellf/tablekit-worker bench 2>&1 | grep -E "re-pivot|compute"
# Expected: warm re-pivot ~600-1200ms on mid-tier laptop
```

---

## 5. Out-of-scope (deferred to later phases)

- Bundler recipes doc (Vite/webpack/Rollup/esbuild snippets) → M6 docs.
- Tachometer/mitata CI bench integration → M6.
- Server expansion reference (already in phase 4) → done.
- Reference app `pnpm verify` inclusion → NOT included (per M3/M4 convention; examples don't gate verify).

---

## 6. Risks

- **1M-row data generation is O(N) memory**: 1M rows × ~80 bytes = ~80MB structured clone. Acceptable on a mid-tier laptop; CI runners with less memory may fail. Mitigation: bench iterations are configurable; CI uses 3 iterations of cold + 5 warm, totaling ~5 minutes wall time on a small runner. If too slow, reduce to 100k rows for CI; the reference app uses 1M for the perf badge.
- **Mock server data is hard-coded**: the mock API returns a fixed dataset, not the consumer's `data` prop. Server engines ignore the `data` prop by design (the server is the source of truth). The reference app's "data" prop is `[]`. Documentation in the example's README explains this.
- **Vite `?worker` import + Vitest**: Vite's `?worker` import returns a constructor at build time. In Vitest (which uses Vite for transformation), the import works for the bench (`vitest bench` runs in Vite's environment) but not for unit tests (which use Node). The bench is the only place that needs the real constructor; unit tests use the `TestWorkerShim` from phase 3.
- **Bench wall time on shared CI**: if the CI runner is slow, the bench may exceed the default Vitest timeout. Mitigation: bench uses `time: 15_000` and `iterations: 5` (bounded); CI runners should complete in <2 minutes.