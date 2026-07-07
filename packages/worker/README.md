# @lynellf/tablekit-worker

Worker pivot engine + message protocol + tiny in-worker data store, plus a server engine reference factory.

**v1.0.0** — stable. The public API is frozen.
[API contract →](https://github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md)

---

## Install

```bash
npm install @lynellf/tablekit-pivot @lynellf/tablekit-worker
```

Requires **Node ≥ 20**. Peer dependency `@lynellf/tablekit-pivot` is installed automatically.

---

## Overview

`tablekit-worker` provides two `AggregationEngine<TRow>` implementations for pivot computation that offloads work from the main thread or the browser altogether:

| Concern | Solution |
|---|---|
| Off-thread aggregation | `createWorkerEngine({ createWorker })` returns an `AggregationEngine<TRow>` that runs in a Web Worker — rows are sent once via `setRows`, queries after that send only the serialized query |
| Server-side aggregation | `createServerEngine` (from `@lynellf/tablekit-worker/server`) returns an `AggregationEngine<TRow>` that wraps an async HTTP/GraphQL/tRPC API — rows never leave the server |
| Worker entry / dispatcher | `createWorkerEntry()` boots the worker side — registers built-in aggregators and dispatches incoming messages |
| Message protocol | `WorkerRequest` / `WorkerResponse` discriminated unions over structured-clone `postMessage` — see `/protocol` subpath |
| Wire serialization | `serializeQuery` strips rows and inline accessors from a `PivotQuery` so it can cross the worker boundary |
| Validation helpers | `validateAggregatorRegistrations`, `validateFilterRegistrations` for fail-fast before worker boot |

---

## Usage

### Quick start — worker engine

```ts
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

```ts
// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import MyWorker from './worker/pivotWorker?worker'; // Vite; see "Bundler-specific wiring"

const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
await engine.setRows(myRows);
const result = await engine.compute(query, { signal: controller.signal });
```

`setRows` is called **once** — the worker holds the rows in memory. Subsequent `compute` calls send only the serialized `WirePivotQuery`, so pivoting is fast after the initial transfer. Call `engine.dispose()` to terminate the worker and reject any pending RPCs.

### Quick start — server engine

```ts
import { createServerEngine } from '@lynellf/tablekit-worker/server';

const engine = createServerEngine<SalesRow>({
  compute: async (q, ctx) => {
    const res = await fetch('/api/pivot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(q),
      signal: ctx.signal,
    });
    return res.json();
  },
  computeChildren: async (path, q, ctx) => {
    const res = await fetch('/api/pivot/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, query: q }),
      signal: ctx.signal,
    });
    return res.json();
  },
  debounceMs: 50,
});
```

The server engine **never holds rows** in the browser. The `data` argument to `createPivotTable` is ignored when an engine is provided. `compute` returns the collapsed top level plus grand totals; `computeChildren` is invoked per-path when the user expands a row. `debounceMs` (default `0`) coalesces rapid expansion churn.

### Bundler-specific wiring

#### Vite

```ts
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';
createWorkerEntry();

// src/main.ts
import MyWorker from './worker/pivotWorker?worker';
const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

→ See [docs/bundler-recipes.md](https://github.com/lynellf/tablekit/blob/main/docs/bundler-recipes.md) for the full Vite pattern.

#### webpack 5

```ts
const engine = createWorkerEngine({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url)),
});
```

→ See [docs/bundler-recipes.md](https://github.com/lynellf/tablekit/blob/main/docs/bundler-recipes.md) for the full webpack pattern.

#### Rollup

```ts
import MyWorker from './worker.ts';
const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

#### esbuild

```ts
const engine = createWorkerEngine({
  createWorker: () => new Worker('/dist/worker.js'),
});
```

### Custom aggregators and filters

```ts
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

const entry = createWorkerEntry();

entry.registerAggregators({
  weightedAvg: {
    init: () => ({ sum: 0, weight: 0 }),
    accumulate: (acc, value, row) => {
      const w =
        row && typeof row === 'object' && 'weight' in row
          ? Number((row as { weight: unknown }).weight)
          : 1;
      return { sum: acc.sum + Number(value) * w, weight: acc.weight + w };
    },
    merge: (a, b) => ({ sum: a.sum + b.sum, weight: a.weight + b.weight }),
    finalize: (acc) => (acc.weight === 0 ? NaN : acc.sum / acc.weight),
  },
});

entry.registerFilterFns({
  // Referenced via `predicateRef` in a `PivotFilter`
  highRevenue: (value, args) =>
    Number(value) > Number((args as { threshold: number }).threshold),
});
```

> **Note:** custom aggregators **must** implement `merge` — it is required for chunked aggregation and server lazy expansion. The main thread can pre-validate registrations with `validateAggregatorRegistrations` and `validateFilterRegistrations` before booting the worker.

### Worker + React integration

The `engine` option is the only piece of glue between the worker and React. `usePivotTable` from `@lynellf/tablekit-react` passes it to `createPivotTable` verbatim.

```tsx
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';
createWorkerEntry();
```

```tsx
// src/MyPivotView.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePivotTable, ReactAnnouncer } from '@lynellf/tablekit-react';
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import type { WorkerEngine } from '@lynellf/tablekit-worker';
import type { SalesRow } from './data';
import MyWorker from './worker/pivotWorker?worker'; // Vite; see "Bundler-specific wiring"

export function MyPivotView({ rows }: { rows: SalesRow[] }) {
  // Memoize the engine so React doesn't recreate the worker on every render.
  const engine = useMemo<WorkerEngine<SalesRow>>(
    () => createWorkerEngine<SalesRow>({ createWorker: () => new MyWorker() }),
    [],
  );

  // Load rows into the worker once. Re-runs if `rows` reference changes.
  useEffect(() => {
    let cancelled = false;
    engine.setRows(rows).catch((err) => {
      if (!cancelled) console.error('setRows failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [engine, rows]);

  // Dispose the worker on unmount.
  useEffect(() => () => engine.dispose(), [engine]);

  const { pivot, state } = usePivotTable<SalesRow>({
    engine,
    data: rows,
    pivot: {
      rows:    ['region', 'product'],
      columns: ['quarter'],
      measures: [{ id: 'revenue', field: 'revenue', aggregator: 'sum' }],
    },
  });

  const leafColumns = pivot.getLeafColumns();
  const visibleRows = pivot.getVisibleRows();
  const gridRef = useRef<HTMLTableElement>(null);

  return (
    <>
      <ReactAnnouncer />
      <table {...pivot.getGridProps()} ref={gridRef}>
        <thead {...pivot.getHeaderProps()}>
          {pivot.getHeaderRows().map((row, rowIdx) => (
            <tr key={rowIdx}>
              {rowIdx === 0 && <th rowSpan={pivot.getHeaderRows().length} />}
              {row.map(({ node, colSpan }) => (
                <th key={node.id} colSpan={colSpan}>
                  {String(node.label)}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...pivot.getBodyProps()}>
          {visibleRows.map((row) => (
            <tr key={row.key} {...pivot.getRowProps(row)}>
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
      </table>
    </>
  );
}
```

Key lifecycle points:
- `createWorkerEngine` is called inside `useMemo` with an empty dependency array — the engine (and the worker) are created once on mount.
- `engine.setRows(rows)` is called in a `useEffect` keyed on `[engine, rows]` — re-runs if the rows reference changes.
- `engine.dispose()` is called in the cleanup of a `useEffect` keyed on `[engine]` — terminates the worker on unmount.
- `<ReactAnnouncer />` is the named component export from `@lynellf/tablekit-react`. It sets the global announcer on mount. Render it once anywhere in the tree (it does not need to be inside the table).

### Controlled pivot config in React

```tsx
import { usePivotTable, ReactAnnouncer } from '@lynellf/tablekit-react';

const [pivotConfig, setPivotConfig] = useState({
  rows:    ['region'],
  columns: ['quarter'],
  measures: [{ id: 'revenue', field: 'revenue', aggregator: 'sum' as const }],
});

const { pivot } = usePivotTable<SalesRow>({
  engine,
  data: rows,
  pivot: pivotConfig,
  state: { pivot: pivotConfig },
  onPivotChange: setPivotConfig,
});
```

---

## Worker-based vs server-side aggregation

Both `createWorkerEngine` and `createServerEngine` satisfy the same `AggregationEngine<TRow>` interface. `createPivotTable({ engine })` accepts either — switching is a one-line change.

### Side-by-side code comparison

```ts
// Worker engine: rows live in the worker, transferred once via setRows.
const workerEngine = createWorkerEngine<SalesRow>({
  createWorker: () => new MyWorker(),
});
await workerEngine.setRows(rows); // 1M rows transferred to worker once
const result = await workerEngine.compute(query, { signal });
```

```ts
// Server engine: rows never leave the server; only WirePivotQuery crosses the wire.
const serverEngine = createServerEngine<SalesRow>({
  compute: async (q, ctx) =>
    fetch('/api/pivot', { method: 'POST', body: JSON.stringify(q), signal: ctx.signal }).then(r =>
      r.json(),
    ),
  computeChildren: async (path, q, ctx) =>
    fetch('/api/pivot/children', {
      method: 'POST',
      body: JSON.stringify({ path, query: q }),
      signal: ctx.signal,
    }).then(r => r.json()),
  debounceMs: 50,
});
const result = await serverEngine.compute(query, { signal });
```

### When to choose

| Concern | Worker engine (`createWorkerEngine`) | Server engine (`createServerEngine`) |
|---|---|---|
| Where do the rows live? | In the **worker** (copied once via `setRows`) | On the **server** (never transferred to client) |
| What crosses the wire? | All rows once, then `WirePivotQuery` per compute | `WirePivotQuery` per request; `PivotResult` / `PivotRowNode[]` per response |
| Typical scale | ~1M rows (§12 perf budget: warm re-pivot < 1.5s) | Unlimited by client RAM |
| Latency model | Cold `setRows` ~2–4 s for 1M rows; warm re-pivots are fast | Per-request network round-trip; latency dominated by server compute + RTT |
| Compute location | Client machine, off the main thread | Server machine |
| Data residency | Data must be downloadable to the browser | Data can stay behind auth, on-prem, or in the database |
| Expansion semantics | Lazy: child rows aggregated but not enumerated until expanded; expansion is instant after first compute | Lazy: children fetched on expand; UI sees `childState: 'loading'` then `'loaded'` |
| Failure mode | Worker error → rejected promise → caller shows banner | Network/server error → `childState: 'error'` per node with `node.error` available for retry UI |
| Setup cost | One bundler config; no backend | Backend endpoint that accepts `WirePivotQuery` and returns `PivotResult` |
| When pivot config changes | Re-compute is local to the worker; no network | Server re-runs the aggregation |

### They are alternatives, not mutually exclusive

Both engines implement the same `AggregationEngine<TRow>` interface from `@lynellf/tablekit-pivot`. `createPivotTable({ engine })` accepts either. Switching from worker to server (or vice versa) is a one-line change — the `data` argument is ignored by the server engine, and `setRows` is a no-op when the engine is swapped in. You can also mix them in a custom composite factory, though `@lynellf/tablekit-worker` does not ship one out of the box.

---

## API reference

### Main exports (`@lynellf/tablekit-worker`)

| Symbol | Kind | Description |
|---|---|---|
| `createWorkerEngine(options)` | function | Factory; returns a `WorkerEngine<TRow>` (an `AggregationEngine<TRow>`) plus `setRows`. |
| `createWorkerEntry()` | function | Factory for the worker side; returns a `WorkerEntryHandle` with `registerAggregators`, `registerFilterFns`, and `dispose`. |
| `serializeQuery(query)` | function | Strip `rows` and inline `accessor` functions from a `PivotQuery` to produce a `WirePivotQuery`. |
| `validateAggregatorRegistrations(regs)` | function | Dev-mode helper: warns if a custom aggregator name is not in the main-thread registry. |
| `validateFilterRegistrations(regs)` | function | Dev-mode helper: warns about filter functions that must be registered on the worker side. |
| `VERSION` | const | The package version string. |

### Subpath: `@lynellf/tablekit-worker/protocol`

Type-only subpath. Exports wire types useful for consumers who want to type their own message-passthrough wrappers or test mocks:

| Type | Description |
|---|---|
| `WirePivotQuery` | Serialized `PivotQuery` — no rows, no inline accessors |
| `RequestId` | Opaque request correlation ID |
| `WorkerRequest` | Discriminated union: `setRows`, `compute`, `computeChildren` |
| `WorkerResponse` | Discriminated union: result or error per request |
| `SerializedError` | Wire-safe error representation |

### Subpath: `@lynellf/tablekit-worker/server`

| Symbol | Kind | Description |
|---|---|---|
| `createServerEngine(options)` | function | Factory; returns an `AggregationEngine<TRow>` that wraps `compute` + `computeChildren` async callbacks. |
| `retryChildren(engine, path, query, ctx)` | function | Re-invokes `engine.computeChildren` for a path that previously errored. Returns the fresh `PivotRowNode[]`. Throws if the engine does not implement `computeChildren`. |
| `createRefetchOrchestrator(options)` | function | Lower-level helper that tracks the per-path children cache and re-fetches paths whose query context changed. Exported for custom server engines that want explicit control over fetch scheduling. Returns `{ schedule, getChildrenAsync, isPathLoading, __state }`. |

### TypeScript types

| Interface / type | Shape summary | Source |
|---|---|---|
| `WorkerEngineOptions` | `{ createWorker: () => Worker }` | `packages/worker/src/engine/createWorkerEngine.ts` |
| `WorkerEngine<TRow>` | `AggregationEngine<TRow> & { setRows(rows: TRow[]): Promise<void> }` | same |
| `WorkerEntryHandle` | `{ registerAggregators, registerFilterFns, dispose }` | `packages/worker/src/entry/createWorkerEntry.ts` |
| `AggregatorRegistration` | `{ name: string; fn: Aggregator }` | `packages/worker/src/aggregators/bulkRegister.ts` |
| `FilterRegistration` | `{ name: string; fn: WorkerFilterFn }` | `packages/worker/src/filters/bulkRegister.ts` |
| `WorkerFilterFn` | `(value: unknown, args: unknown) => boolean` | same |
| `ServerEngineOptions<TRow>` | `{ compute, computeChildren, debounceMs? }` | `packages/worker/src/server/createServerEngine.ts` |
| `ServerEngineComputeFn<TRow>` | `(q, ctx) => Promise<PivotResult<TRow>>` | same |
| `ServerEngineComputeChildrenFn<TRow>` | `(path, q, ctx) => Promise<PivotRowNode<TRow>[]>` | same |
| `RefetchOrchestrator` | `{ schedule, getChildrenAsync, isPathLoading, __state }` — returned by `createRefetchOrchestrator` | same |
| `RefetchState` | `{ cache: Map<string, Promise<PivotRowNode[]>>, prevExpandedPaths: string[], prevQueryKey: string }` | `packages/worker/src/server/refetchOrchestrator.ts` |

---

## Performance characteristics

- **Worker engine:** §12 perf budget — cold `setRows` for 1M rows ≈ 2–4 s on a mid-tier laptop; warm re-pivot < 1.5 s. The UI thread never blocks for > 50 ms.
- **Main-thread engine:** documented in [`packages/pivot/README.md`](/packages/pivot). The pivot docs recommend the worker engine at ≥ ~200 k source rows.
- **Server engine:** latency is dominated by network RTT and server-side pivot execution. `debounceMs` coalesces expansion churn.
- **Reference benchmark:** `packages/worker/bench/worker.bench.ts` — run with `pnpm --filter @lynellf/tablekit-worker bench`. See [examples/m5-pivot-engines](https://github.com/lynellf/tablekit/tree/main/examples/m5-pivot-engines) for a working reference implementation of both engines.

---

## Related packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-pivot`](/packages/pivot) | Framework-free PivotTable primitives. Required peer dependency. |
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine and row model. |
| [`@lynellf/tablekit-react`](/packages/react) | React adapter — consumes the engine option via `usePivotTable`. |

---

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
