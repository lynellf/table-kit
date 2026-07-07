# Phase 1 — Rewrite the Worker README

**Slug:** `worker-readme-expansion`
**Phase:** 1 of 1
**Status:** Revised (v2)

## Revision history

- **v1** — initial draft. Plan-reviewer returned `REQUEST-CHANGES`:
  - **Blocker:** `Announcer` is not a value export of `@lynellf/tablekit-react`. The actual named component export is `ReactAnnouncer`. The v1 snippet imported `Announcer` and destructured it from `usePivotTable`, then rendered `<PivotAnnouncer />`. The fix is to import `ReactAnnouncer` directly and render `<ReactAnnouncer />` — no destructuring alias needed.
- **v2 (this revision)** — applied fixes:
  1. **React integration snippet:** changed `import { usePivotTable, Announcer } from '@lynellf/tablekit-react'` → `import { usePivotTable, ReactAnnouncer } from '@lynellf/tablekit-react'`. Removed `Announcer: PivotAnnouncer` from the `usePivotTable` destructuring in both the main React integration snippet and the "Controlled pivot config in React" snippet. Replaced `<PivotAnnouncer />` with `<ReactAnnouncer />` in both JSX blocks. Updated the "source-of-truth files to read" list and the step-by-step cross-check text accordingly.
  2. **Server barrel scope clarified:** the `@lynellf/tablekit-worker/server` API table now lists `retryChildren` and `createRefetchOrchestrator` (both value exports from `packages/worker/src/server/index.ts`), not just `createServerEngine`. The TypeScript types table now includes `RefetchOrchestrator` and `RefetchState` (the latter re-exported from `refetchOrchestrator.ts`).

## Goal

Replace `packages/worker/README.md` with a parity-level README that:

1. Matches the structure of `packages/pivot/README.md` and `packages/react/README.md` (title → tagline → install → **Overview** → **Usage** → **API reference** → **Related packages** → bugs → license).
2. Adds the two user-requested sections:
   - **Worker + React integration** — runnable `usePivotTable({ engine })` example.
   - **Worker-based vs server-side aggregation** — side-by-side comparison with decision table.
3. Enumerates the package's full API surface (main exports + subpath exports + types).
4. Cross-links to bundler recipes, the reference app, and the api-freeze doc via the GitHub blob URL.

## File to edit

- `packages/worker/README.md` — full rewrite (currently 39 lines; target ~280-360 lines).

No other files.

## Source-of-truth files to read before drafting

Read these in order before writing the new README. They are the canonical source for every export name and type signature in the new README.

1. `packages/worker/src/index.ts` — main barrel (6 functions, 4 types).
2. `packages/worker/src/engine/createWorkerEngine.ts` — `createWorkerEngine`, `WorkerEngineOptions`, `WorkerEngine`.
3. `packages/worker/src/entry/createWorkerEntry.ts` — `createWorkerEntry`, `WorkerEntryHandle`.
4. `packages/worker/src/server/createServerEngine.ts` — `createServerEngine`, `ServerEngineOptions`, `ServerEngineComputeFn`, `ServerEngineComputeChildrenFn`.
5. `packages/worker/src/protocol/types.ts` — `WirePivotQuery`, `RequestId`, `WorkerRequest`, `WorkerResponse`, `SerializedError`.
6. `packages/worker/src/serialization/serializeQuery.ts` — `serializeQuery`.
7. `packages/worker/src/aggregators/bulkRegister.ts` — `validateAggregatorRegistrations`, `AggregatorRegistration`.
8. `packages/worker/src/filters/bulkRegister.ts` — `validateFilterRegistrations`, `FilterRegistration`, `WorkerFilterFn`.
9. `packages/react/src/index.ts` — confirm `usePivotTable`, `ReactAnnouncer` exports (for the React integration snippet). Note: `Announcer` is **not** a value export from `@lynellf/tablekit-react`; it is only a type re-exported from `@lynellf/tablekit-core` and a property on the object returned by `usePivotTable`. The component to render is `ReactAnnouncer`.
10. `examples/m5-pivot-engines/src/worker/pivotWorker.ts` and `examples/m5-pivot-engines/src/views/WorkerView.tsx` — reference patterns.

## Proposed README structure

The new README uses the following section order. **Bold** = required new section; *italic* = enhanced from minimal README; rest = parity with sibling READMEs.

```
# @lynellf/tablekit-worker
[one-line tagline — from packages/worker/package.json `description`]
**v1.0.0** — stable. The public API is frozen.
[API contract → GitHub blob URL]

---

## Install
[pip install style — show full peer-dep command]

## Overview
[one-sentence "what it is" + "What it does" table]
- Three concerns: worker engine, server engine, message protocol

## Usage

### Quick start — worker engine
[worker entry file + main-thread snippet]

### Quick start — server engine
[createServerEngine snippet with fetch]

### Bundler-specific wiring
[Vite, webpack, Rollup, esbuild — short snippets linking to docs/bundler-recipes.md]

### Custom aggregators and filters
[createWorkerEntry().registerAggregators + registerFilterFns]

### Worker + React integration   ← NEW (user request)
[Runnable usePivotTable({ engine }) component, with Vite worker import]

### Controlled pivot config in React
[setPivot updater pattern when engine changes]

## Worker-based vs server-side aggregation   ← NEW (user request)
[Side-by-side code comparison + decision table + "alternatives, not mutually exclusive" paragraph]

## API reference

### Main exports (`@lynellf/tablekit-worker`)
[Table: symbol | kind | description]

### Subpath: `@lynellf/tablekit-worker/protocol`
[Types only: WirePivotQuery, RequestId, WorkerRequest, WorkerResponse, SerializedError]

### Subpath: `@lynellf/tablekit-worker/server`
[createServerEngine + types]

### TypeScript types
[Table: interface | shape | location]

## Performance characteristics
[When to use worker vs main thread; §12 budget reference]

## Related packages
[Cross-link table]

## Bugs & Issues

## License
```

## Section specifications

### Title + tagline + status (lines 1-10)

Mirror pivot/README.md lines 1-5. Tagline (verbatim from `packages/worker/package.json` `description`):

> Worker pivot engine + message protocol + tiny in-worker data store, plus a server engine reference factory.

Status block:

```
**v1.0.0** — stable. The public API is frozen.
[API contract →](https://github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md)
```

Use the **GitHub blob URL** — relative paths to `docs/` break in the published tarball (per `.okf/concepts/documentation-conventions.md`).

### Install (lines 11-25)

```bash
npm install @lynellf/tablekit-pivot @lynellf/tablekit-worker
```

Peer dep note: `@lynellf/tablekit-pivot` is required. Engines: Node ≥ 20.

### Overview (lines 26-65)

One-sentence pitch, then a "What it does" table mirroring the pivot/react README table style:

| Concern | Solution |
|---|---|
| Off-thread aggregation | `createWorkerEngine({ createWorker })` returns an `AggregationEngine<TRow>` that runs in a Web Worker — rows sent once via `setRows`, queries after that |
| Server-side aggregation | `createServerEngine` (from `@lynellf/tablekit-worker/server`) returns an `AggregationEngine<TRow>` that wraps an async HTTP/GraphQL/tRPC API |
| Worker entry / dispatcher | `createWorkerEntry()` boots the worker side — registers built-in aggregators and dispatches incoming messages |
| Message protocol | `WorkerRequest` / `WorkerResponse` discriminated unions over structured-clone `postMessage` — see `/protocol` subpath |
| Wire serialization | `serializeQuery` strips rows and inline accessors from a `PivotQuery` so it can cross the worker boundary |
| Validation helpers | `validateAggregatorRegistrations`, `validateFilterRegistrations` for fail-fast before worker boot |

### Usage → Quick start — worker engine (lines 66-130)

Worker entry file:

```ts
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

Main-thread engine:

```ts
// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import MyWorker from './worker/pivotWorker?worker'; // Vite syntax; see "Bundler-specific wiring"

const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
await engine.setRows(myRows);
const result = await engine.compute(query, { signal: controller.signal });
```

Explain:
- `setRows` is called **once**; subsequent `compute` calls send only the serialized `WirePivotQuery`.
- `engine.dispose()` terminates the worker and rejects any pending RPCs.

### Usage → Quick start — server engine (lines 131-180)

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

Explain:
- The server engine **never holds rows**. The `data` argument to `createPivotTable` is ignored when `engine` is set.
- `compute` returns the collapsed top level + grand totals. `computeChildren` is invoked per-path when the user expands a row.
- `debounceMs` (default 0) coalesces rapid expansion churn.

### Usage → Bundler-specific wiring (lines 181-230)

Four short subsections, each with one snippet. Each subsection ends with a `→ See [docs/bundler-recipes.md](/docs/bundler-recipes.md) for the full pattern.`

#### Vite

```ts
// Worker file: src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';
createWorkerEntry();

// Main thread:
import MyWorker from './worker.ts?worker';
const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

#### webpack 5

```ts
// Main thread:
const engine = createWorkerEngine({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url)),
});
```

#### Rollup

```ts
// Main thread:
import MyWorker from './worker.ts';
const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

#### esbuild

```ts
// Main thread:
const engine = createWorkerEngine({
  createWorker: () => new Worker('/dist/worker.js'),
});
```

### Usage → Custom aggregators and filters (lines 231-290)

```ts
// src/worker/pivotWorker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

const entry = createWorkerEntry();

entry.registerAggregators({
  weightedAvg: {
    init: () => ({ sum: 0, weight: 0 }),
    accumulate: (acc, value, row) => {
      const w = row && typeof row === 'object' && 'weight' in row
        ? Number((row as { weight: unknown }).weight) : 1;
      return { sum: acc.sum + Number(value) * w, weight: acc.weight + w };
    },
    merge: (a, b) => ({ sum: a.sum + b.sum, weight: a.weight + b.weight }),
    finalize: (acc) => acc.weight === 0 ? NaN : acc.sum / acc.weight,
  },
});

entry.registerFilterFns({
  // Filter functions used inside a registry-name filter (`predicateRef`)
  highRevenue: (value, args) => Number(value) > Number((args as { threshold: number }).threshold),
});
```

Notes:
- Custom aggregators **must** implement `merge` (required for worker chunked aggregation and server lazy expansion).
- Custom filter functions are referenced by `predicateRef` in `PivotFilter` (see pivot README §`PivotFilter`).
- The main thread can pre-validate with `validateAggregatorRegistrations` and `validateFilterRegistrations` before booting the worker.

### Usage → Worker + React integration (lines 291-380) ★ NEW ★

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
                <th key={node.id} colSpan={colSpan}>{String(node.label)}</th>
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

Notes for this section:
- The `engine` option is the only piece of glue between worker and react; `usePivotTable` passes it to `createPivotTable` verbatim.
- `engine.setRows` is called **once** per `rows` reference; React's `useEffect` dependency array handles that.
- `engine.dispose` on unmount terminates the worker and rejects pending RPCs.
- `ReactAnnouncer` is the named component export from `@lynellf/tablekit-react`; it sets the global announcer on mount. Render it once anywhere in the tree (does not need to be inside the table).
- The same component works with `createServerEngine` — swap the import and remove the `setRows` effect.

### Usage → Controlled pivot config in React (lines 381-420)

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

// ...render <ReactAnnouncer /> and the pivot table as above...
```

### Worker-based vs server-side aggregation (lines 421-560) ★ NEW ★

This is the headline user-requested section. Structure:

#### Side-by-side code comparison

Show the **same** pivot query run against both engines, side by side, in fenced ```ts blocks with explicit headings. Roughly:

```ts
// Worker engine: rows live in the worker, sent once via setRows.
const workerEngine = createWorkerEngine<SalesRow>({
  createWorker: () => new MyWorker(),
});
await workerEngine.setRows(rows); // 1M rows transferred to worker once
const result = await workerEngine.compute(query, { signal });
```

```ts
// Server engine: rows never leave the server; only PivotQuery and PivotResult cross the wire.
const serverEngine = createServerEngine<SalesRow>({
  compute:        (q, ctx) => fetch('/api/pivot', { method: 'POST', body: JSON.stringify(q), signal: ctx.signal }).then(r => r.json()),
  computeChildren: (path, q, ctx) => fetch('/api/pivot/children', { method: 'POST', body: JSON.stringify({ path, query: q }), signal: ctx.signal }).then(r => r.json()),
  debounceMs: 50,
});
const result = await serverEngine.compute(query, { signal });
```

#### When to choose — decision table

| Concern | Worker engine (`createWorkerEngine`) | Server engine (`createServerEngine`) |
|---|---|---|
| Where do the rows live? | In the **worker** (copy sent once via `setRows`) | On the **server** (never transferred to client) |
| What crosses the wire? | All rows once, then `WirePivotQuery` per compute | `WirePivotQuery` per request, `PivotResult` / `PivotRowNode[]` per response |
| Typical scale | ~1M rows (§12 perf budget: warm re-pivot < 1.5s) | Unlimited by client RAM |
| Latency model | Cold `setRows` (~2-4s for 1M rows); warm re-pivots are fast | Per-request network round-trip; latency dominated by server compute + RTT |
| Compute location | Client machine, off-main-thread | Server machine |
| Data residency | Data must be downloadable to the browser | Data can stay behind auth, on-prem, or in DB |
| Expansion semantics | Lazy: child rows are aggregated but not enumerated until expanded; expansion is **instant** after first compute | Lazy: child rows are fetched on expand; user sees `childState: 'loading'` then `'loaded'` |
| Failure mode | Worker error → rejected promise → caller shows banner | Network/server error → `childState: 'error'` per node + `node.error` available for retry UI |
| Setup cost | One bundler config; no backend | Backend endpoint that accepts `WirePivotQuery` and returns `PivotResult` |
| When pivot config changes | Re-compute is local to the worker; no network | Server re-runs the aggregation |

#### They are alternatives, not mutually exclusive

Closing paragraph: both engines implement the same `AggregationEngine<TRow>` interface from `@lynellf/tablekit-pivot`. `createPivotTable({ engine })` accepts either. Switching from worker to server (or vice versa) is a one-line change — the `data` argument is ignored by the server engine, and `setRows` is a no-op when the engine is replaced. You can also mix them: top level via server, expansion children via worker — though the package does not ship a "composite" engine factory, so that composition is a small custom factory in consumer code.

### API reference (lines 561-720)

Three subsections with tables.

#### Main exports (`@lynellf/tablekit-worker`)

| Symbol | Kind | Description |
|---|---|---|
| `createWorkerEngine(options)` | function | Factory; returns `WorkerEngine<TRow>` (an `AggregationEngine<TRow>`) plus `setRows`. |
| `createWorkerEntry()` | function | Factory for the worker side; returns `WorkerEntryHandle` with `registerAggregators`, `registerFilterFns`, `dispose`. |
| `serializeQuery(query)` | function | Strip `rows` and `inlineAccessors` from a `PivotQuery` to produce a `WirePivotQuery`. |
| `validateAggregatorRegistrations(regs)` | function | Dev-mode helper: warns if a name is not in the main-thread registry. |
| `validateFilterRegistrations(regs)` | function | Dev-mode helper: warns about filter functions that must be registered on the worker side. |
| `VERSION` | const | The package version string. |

#### Subpath: `@lynellf/tablekit-worker/protocol`

Type-only subpath. Exports `WirePivotQuery`, `RequestId`, `WorkerRequest`, `WorkerResponse`, `SerializedError`. Useful for consumers who want to type their own message-passthrough wrappers or test mocks.

#### Subpath: `@lynellf/tablekit-worker/server`

| Symbol | Kind | Description |
|---|---|---|
| `createServerEngine(options)` | function | Factory; returns an `AggregationEngine<TRow>` that wraps `compute` + `computeChildren` async callbacks. |
| `retryChildren(engine, path, query, ctx)` | function | Re-invokes `engine.computeChildren(path, query, ctx)` for a path that previously errored. Returns the fresh `PivotRowNode[]`. Throws if the engine does not implement `computeChildren`. |
| `createRefetchOrchestrator(options)` | function | Lower-level helper used internally by `createServerEngine`. Tracks the per-path children cache and re-fetches paths whose query context changed. Most consumers do not need this directly; it is exported for custom server engines that want explicit control over fetch scheduling. Returns `{ schedule, getChildrenAsync, isPathLoading, __state }`. |

> **Scope note:** the three function exports above plus the five types below are the **entire** `@lynellf/tablekit-worker/server` surface as of v1.0.0. There are no other exports from this subpath.

### TypeScript types (in main export and `/server` subpath)

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
| `RefetchOrchestrator` | `{ schedule, getChildrenAsync, isPathLoading, __state }` returned by `createRefetchOrchestrator` | `packages/worker/src/server/createServerEngine.ts` |
| `RefetchState` | `{ cache: Map<string, Promise<PivotRowNode[]>>, prevExpandedPaths: string[], prevQueryKey: string }` | `packages/worker/src/server/refetchOrchestrator.ts` |

### Performance characteristics (lines 721-770)

- Worker engine: §12 perf budget. Cold `setRows` for 1M rows ≈ 2-4s on mid-tier laptop. Warm re-pivot < 1.5s. UI thread never blocks > 50ms.
- Main-thread engine: documented in `packages/pivot/README.md`. Pivot docs recommend the worker engine at ≥ ~200k source rows.
- Server engine: latency is dominated by network RTT + server-side pivot execution. `debounceMs` coalesces expansion churn.
- Reference benchmark: `packages/worker/bench/worker.bench.ts` (run with `pnpm --filter @lynellf/tablekit-worker bench`).

### Related packages (lines 771-810)

| Package | Description |
|---|---|
| [`@lynellf/tablekit-pivot`](/packages/pivot) | Framework-free PivotTable primitives. Required peer dependency. |
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine and row model. |
| [`@lynellf/tablekit-react`](/packages/react) | React adapter — consumes the engine option via `usePivotTable`. |

### Bugs & Issues + License (lines 811-end)

Mirror the format used in pivot/README.md and react/README.md.

```
## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
```

## Step-by-step

1. Read the 10 source-of-truth files listed above. (No source changes.)
2. Open `packages/worker/README.md` and replace its contents with the new structure.
3. Use the section specifications above as the outline. Fill in code snippets verbatim from `examples/m5-pivot-engines/src/views/WorkerView.tsx` and `ServerView.tsx` (lightly adapted to use `usePivotTable`).
4. Cross-check every named export in the API section against `packages/worker/src/index.ts`, `packages/worker/src/server/index.ts`, `packages/worker/src/protocol/index.ts` via `grep '^export '`. **Zero discrepancies** allowed. The server subpath barrel must enumerate `createServerEngine`, `retryChildren`, `createRefetchOrchestrator`, plus types `ServerEngineOptions`, `ServerEngineComputeFn`, `ServerEngineComputeChildrenFn`, `RefetchOrchestrator`, `RefetchState` — all 8 declarations from `packages/worker/src/server/index.ts`.
5. Cross-check every named symbol in the React integration snippet against `packages/react/src/index.ts`. `usePivotTable`, `ReactAnnouncer` are confirmed; if you reach for any other symbol, verify it's exported. Note that `Announcer` is **not** a value export — only `ReactAnnouncer` (component) and `getReactAnnouncer` (function returning the global instance) are exported from `@lynellf/tablekit-react`.
6. Run the verification grep script in `overview.md` → **expected: zero failures**.

## Verification

The 9-step grep verification script in `docs/worker-readme-expansion/overview.md` §**Verification**. Expected outcome: zero failures. The script covers:

1. Length ≥ 200 lines.
2. Canonical exports present.
3. User-requested sections present.
4. Subpaths documented.
5. Cross-links present.
6. No broken relative paths; uses GitHub blob URL for api-freeze.
7. No phantom exports.
8. Peer dependency mentioned.
9. Status block uses v1.0.0.

Additionally, manually inspect:

- The Worker + React integration example compiles in the sense that every imported symbol is exported from its named package.
- The worker-vs-server comparison's decision table renders correctly in GitHub-flavored markdown.

## Risks

(Mirrors the overview; phase-level mitigations added.)

- **Risk: React integration example uses symbols not exported from `@lynellf/tablekit-react`.** *Mitigation:* Step 5 grep-checks `packages/react/src/index.ts` for every symbol used.
- **Risk: Server engine example uses `createServerEngine` from the wrong subpath.** *Mitigation:* Step 4 grep-checks `packages/worker/src/server/index.ts` and confirms the import is `from '@lynellf/tablekit-worker/server'`.
- **Risk: README grows too long.** *Mitigation:* Target length is ~280-360 lines (pivot is 360, react is 280). Anything beyond 400 lines must defer to `docs/m6-hardening/api-freeze.md`.

## Out of scope (re-stated)

- No source code, `package.json`, or `dist/` changes.
- No `docs/m6-hardening/api-freeze.md` changes.
- No new recipe under `docs/recipes/`.
- No changes to `packages/{core,react,pivot}/README.md`.
- No new tests, benchmarks, or example apps.

## Reference

- Plan overview: `docs/worker-readme-expansion/overview.md`
- Plan summary: `docs/worker-readme-expansion/plan-summary.md`
- Sibling README standard: `packages/pivot/README.md`, `packages/react/README.md`
- Canonical API contract: `docs/m6-hardening/api-freeze.md`
- Documentation conventions: `.okf/concepts/documentation-conventions.md`
- Reference app: `examples/m5-pivot-engines/`
- Bundler recipes: `docs/bundler-recipes.md`
- Historical context: `docs/archive/v1-release-readiness/phase-3-per-package-readmes.md`, `docs/archive/readme-api-surface-overhaul/phase-1-rewrite-package-readmes.md`