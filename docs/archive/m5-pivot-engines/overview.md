# M5: Pivot Engines — Architecture Overview

**Status:** Companion to `plan-summary.md`. Decisions D1–D9 live here with full rationale; the summary links here for §3 and §6.

---

## 1. Recap

M5 ships the worker pivot engine + protocol + data store (new `@lynellf/tablekit-worker` package), the server engine reference factory, and a reference app demonstrating both engines. The exit criteria (spec §14) are **1M-row worker budget** and **server-expansion reference app**.

M0–M4 surface is unchanged. The M4 `AggregationEngine<TRow>` seam is filled in by M5 for two of its three implementations; the main-thread engine shipped in M4.

---

## 2. Spec mapping

| Spec section | M5 deliverable |
| --- | --- |
| §3 package architecture (`@tablekit/worker`) | `packages/worker/` package, dependency direction `worker → pivot` enforced via peer dep |
| §9.2 aggregator `merge` required for worker/server | M4 already ships `merge`; M5 worker engine uses it identically |
| §9.3 worker engine + protocol + data store | `createWorkerEngine`, `createWorkerEntry`, `WorkerProtocol`, in-worker rows store |
| §9.5 server engine + lazy expansion | `createServerEngine`, `PivotTableInstance.retryChildren` |
| §12 1M-row worker budget | `packages/worker/bench/worker.bench.ts` + reference app perf badge |
| §13 serialization contract tests | `protocol.golden.test.ts` + `engine.test.ts` + `server.test.ts` |
| §13 P3 registry-name enforcement | `validatePivotQuery` (M4) wired into `createWorkerEngine` |
| §14 M5 exit criteria | 1M-row worker budget + server-expansion reference app |
| §16 #8 worker DX risk | `createWorkerEntry()` factory + reference app recipes |
| §16 #10 mixed client/server semantics | N/A for M5 (pivot engines are pure server-side expansion) |

---

## 3. Decisions — full rationale

### D1 — Worker location: new `@lynellf/tablekit-worker` package

**Resolution:** New package.

The spec §3 dependency direction is explicit: `worker → pivot`. The worker engine is a separate execution environment from the main-thread engine and ships its own protocol surface, in-worker data store, and registry. It is not a small additive (~600-800 LOC of protocol code, store code, and registry code), so it doesn't belong in the pivot package as a subpath.

Counter-considered: putting the worker code under `@lynellf/tablekit-pivot/worker` as a subpath. Rejected because (a) the worker bundle must be tiny (it loads before the data) and a subpath forces all pivot consumers to know about the worker module path, (b) the protocol types are shared by main and worker; a subpath forces a circular import problem if main-thread adapter is in pivot and protocol is in worker, (c) the empty `packages/worker/` directory is reserved per `.okf/components/dev-tooling-stack.md` ("all four directories reserved from day one"). Matches M3's `DataSource` separation (core vs. react) and M4's `pivot` separation.

### D2 — Wire shape: `WirePivotQuery` derived from `PivotQuery`

**Resolution:** New type `WirePivotQuery = Omit<PivotQuery<unknown>, 'rows' | 'inlineAccessors'>`.

`PivotQuery<TRow>` carries `rows: TRow[]` (the dataset) and `inlineAccessors` (main-thread-only forms). Neither crosses a worker boundary — rows are sent once via `setRows`, and inline forms are stripped by `buildPivotQuery({ serialize: true })`. A distinct `WirePivotQuery` type makes the boundary contract self-documenting: any code that takes a `WirePivotQuery` is provably not passing rows or functions.

The protocol types live in `@lynellf/tablekit-worker/protocol` so the worker and main-thread sides import them from the same module (no version skew). The pivot package re-exports `WirePivotQuery` (re-exported type only — no runtime dep) for consumers building custom engines.

Counter-considered: structural generic `PivotQuery<TRow, Wire extends boolean>` flag. Rejected because it leaks worker-concerns into the pivot types, where the main-thread engine has no use for them.

### D3 — Request correlation: monotonic `requestId` in payloads

**Resolution:** Every request carries a monotonic `requestId: number`; the worker echoes it on the response; the main-thread adapter keeps a `Map<requestId, { resolve, reject, controller }>` and resolves the right promise.

Out-of-order responses (e.g., a slow `compute` arrives after a fast one) are dropped by the main-thread adapter (`response.requestId < currentRequestId → drop`). The user's `AbortSignal` cancels the in-flight request: the adapter calls `controller.abort()`, removes the entry from the map, and the worker's per-request `AbortController` fires; the worker checks `signal.aborted` between chunked yields and aborts cleanly.

Counter-considered: per-call `MessageChannel` (one port per request). Rejected because it creates one transferable port per `compute` call, which is heavy under high-frequency re-pivots (every config change). For comparison: 60fps input on a slider = 60 messages/sec; MessageChannel allocates a port each time. The monotonic-id approach allocates one number.

### D4 — Worker entry: factory, not a shipped `worker.ts`

**Resolution:** `createWorkerEntry()` returns a function that, when called inside a worker context, boots the in-worker side (pre-registers built-in aggregators, dispatches incoming messages, manages per-request AbortControllers). The consumer wires it to their bundler:

```ts
// Vite
import Worker from './worker.ts?worker';
import { createWorkerEntry } from '@lynellf/tablekit-worker';
const worker = new Worker();
worker.postMessage({ type: 'init', entry: createWorkerEntry() });

// webpack
const worker = new Worker(new URL('./worker.ts', import.meta.url));
// (worker entry initializes itself by calling createWorkerEntry() at module top level)
```

Spec §9.3: *"the library ships a worker entry factory so the default registry works with zero setup"*. §16 #8 names the entry factory as the mitigation. The factory shape is the same for both Vite and webpack (the consumer picks the bundler mechanism).

Counter-considered: shipping a default `worker.ts` file in the package. Rejected because (a) bundlers hash and fingerprint worker entries; a pre-shipped file forces the consumer to copy it into their project (defeats the purpose), (b) the factory lets the consumer add their own custom aggregator registrations at boot time without monkey-patching the default entry.

### D5 — Worker-side aggregator registration: bulk

**Resolution:** `registerAggregators({ name1: fn1, name2: fn2, ... })` bulk API on the worker side. Existing per-name `registerAggregator(name, fn)` (M4) stays for the main-thread / cross-boundary case.

A consumer's worker entry typically registers several aggregators at boot time (e.g., a `weightedAvg` and a `percentile`). A bulk API matches the boot-time ergonomics; the per-name API still exists for the rare "register one at runtime" case.

The worker entry factory calls `registerAggregators(BUILT_IN_AGGREGATORS)` internally, so the built-ins are always available. Consumer-supplied registrations are merged in via a second `registerAggregators({...})` call from the consumer's entry.

### D6 — Server engine: reference factory

**Resolution:** `createServerEngine({ compute, computeChildren })` returns an `AggregationEngine<TRow>` that wraps the consumer's async API.

The contract per spec §9.5: `compute` returns the collapsed top level (plus grand totals), `computeChildren(path)` resolves §9.5 expansions. The factory handles `AbortSignal` plumbing, request-id correlation on the consumer side (so out-of-order responses don't overwrite fresh state), and the refetch-on-query-change semantics. The factory does **not** know how to talk to a server; the consumer wires their fetch / GraphQL / tRPC.

Counter-considered: docs-only (no factory). Rejected because (a) the spec's "Implemented by the consumer" wording means the **contract** is the seam — the contract is `AggregationEngine<TRow>` plus the §9.5 lazy expansion semantics, both of which are testable surfaces, (b) shipping a thin factory prevents foot-guns (`AbortSignal` plumbing is easy to get wrong), (c) the reference app needs a real shape to demonstrate against.

### D7 — Server refetch orchestration: engine-driven

**Resolution:** The engine decides when to refetch; the React hook just observes the result.

Spec §9.5 verbatim: *"Already-expanded paths are re-requested on query change (sort/filter/measure edits invalidate the tree; the instance handles refetch orchestration since expansion is engine-driven, unlike Level 0 tabular data)."*

Implementation: `createServerEngine` keeps a `Map<RowPathKey, Promise<PivotRowNode[]>>` cache. On every `compute(q, ctx)` call, it diffs `q.expandedPaths` against the previously-seen expansion set, fires `computeChildren(path)` for each newly-expanded path (and for paths that changed sort/filter/measure context), and merges results. Diff + dispatch happens in microtask granularity so the hook sees a single atomic state update per query change (consistent with the M4 main-thread engine's `PivotResultCache`).

### D8 — Worker disposal: terminate immediately

**Resolution:** `dispose()` calls `worker.terminate()`; in-flight `compute` / `computeChildren` promises reject with `AbortError`. The consumer can create a new engine after dispose.

`worker.terminate()` does not run the worker's `dispose` handler on its side, so the rows store and pending requests are GC'd by the engine teardown. The main-thread side rejects in-flight promises synchronously so consumers see a clean error rather than a hung await.

Counter-considered: drain-then-terminate (wait for in-flight requests to complete before terminating). Rejected because (a) the consumer may explicitly want to cancel (e.g., user navigates away mid-pivot), (b) drain semantics are racy with the `AbortSignal` (which may already be aborted), (c) terminate is the only way to free worker memory deterministically.

### D9 — 1M-row perf budget: advisory in CI

**Resolution:** Bench is advisory in CI (Vitest `bench` mode, runs in CI but does not fail the build). The reference app displays a perf badge that recomputes on demand.

Mirrors M4's bench approach. The §12 perf budget is tracked; CI logs a regression warning, not a hard fail. A hard CI gate would be flaky on shared runners. M6 may add tachometer for tighter tracking.

The bench methodology:
- Synthesize 1M rows × 3-level hierarchy (region × category × product) × 2 measures (sum of revenue, count of orders).
- Cold worker (first `setRows` after creation): not measured.
- Warm worker: re-pivot under 5 config changes (toggle measure, change sort, expand/collapse, change totals); measure wall time per change.
- Assert: max wall time < 1.5s, mean < 1.0s. Assert: main-thread blocked time < 50ms (measured by `performance.measure` around the RPC call, not the worker work).

---

## 4. Architecture

### 4.1 New package: `@lynellf/tablekit-worker`

Per spec §3:

```
@lynellf/tablekit-worker
  Framework-free. Worker pivot engine + message protocol + tiny in-worker
  data store (rows live in the worker; only configs cross the boundary
  after initial load).

  Exports:
    .                       — createWorkerEngine + registerAggregators (re-exports)
    /protocol               — WorkerRequest / WorkerResponse / WirePivotQuery / RequestId types
    /server                 — createServerEngine (no worker code; pure client-side)

  Peer deps: @lynellf/tablekit-pivot
```

Dependency direction (per `dev-tooling-stack.md` and spec §3): `worker → pivot`. The pivot package re-exports `WirePivotQuery` (type-only re-export from `worker/protocol`) for consumers building custom engines.

### 4.2 Wire protocol

```
┌────────────────────────────────┐                ┌─────────────────────────────────┐
│           Main thread          │                │            Worker               │
│                                │                │                                 │
│  createWorkerEngine(           │   postMessage  │  createWorkerEntry()            │
│    { createWorker }            ├───────────────►│    registers BUILT_IN_AGG…     │
│  )                             │                │    listens for {type:'init'}    │
│                                │                │    dispatches messages          │
│  returns AggregationEngine<TR> │                │                                 │
│                                │                │  state:                         │
│  .compute(q, ctx) ─────────────┼── { type:      │    rowsStore: TRow[] | null     │
│                                │   'compute',   │    aggregators: Map             │
│                                │   requestId,   │    filterFns: Map               │
│                                │   query } ────►│    pending: Map<id, {…}>        │
│  ◄─────────────────────────────┤── { type:      │                                 │
│        Promise<PivotResult>    │   'compute:ok',│    compute(q) → result          │
│                                │   requestId,   │    (checks signal.aborted       │
│                                │   result }     │     between chunked yields)     │
│                                │                │                                 │
│  .computeChildren(...) ────────┼── { type:      │    computeChildren(path, q)      │
│                                │   'compute:    │      → PivotRowNode[]           │
│                                │    children',  │                                 │
│                                │   … }          │                                 │
│                                │                │                                 │
│  .dispose() ───────────────────┼── { type:      │    dispose() →                  │
│                                │   'dispose' }  │      rowsStore = null           │
│                                │                │      pending.clear()            │
│  worker.terminate()            │                │                                 │
└────────────────────────────────┘                └─────────────────────────────────┘
```

### 4.3 WirePivotQuery shape

```ts
// In @lynellf/tablekit-worker/protocol
export type WirePivotQuery = Omit<PivotQuery<unknown>, 'rows' | 'inlineAccessors'>;

export type RequestId = number;

export type WorkerRequest =
  | { type: 'init'; entry: WorkerEntryHandle }   // not sent from main to worker; used by entry factory
  | { type: 'setRows'; requestId: RequestId; rows: unknown[] }
  | { type: 'compute'; requestId: RequestId; query: WirePivotQuery }
  | { type: 'computeChildren'; requestId: RequestId; path: FieldValue[]; query: WirePivotQuery }
  | { type: 'dispose'; requestId: RequestId };

export type WorkerResponse =
  | { type: 'setRows:ok'; requestId: RequestId }
  | { type: 'compute:ok'; requestId: RequestId; result: PivotResult }
  | { type: 'computeChildren:ok'; requestId: RequestId; children: PivotRowNode[] }
  | { type: 'dispose:ok'; requestId: RequestId }
  | { type: 'error'; requestId: RequestId; error: { name: string; message: string } };
```

The `init` message is internal: the consumer's worker entry calls `createWorkerEntry()` at module top level, which calls `self.addEventListener('message', ...)` to register the dispatcher. The main thread never sends `init`. The `setRows` message uses structured clone; rows are not deep-copied in the main thread (the transfer is one-way — `postMessage` semantics).

### 4.4 Server engine architecture

```
Consumer's API                 createServerEngine                React (usePivotTable)
   (async fns)                     (engine adapter)                    (observer)

compute(config) ──┐
                 ├──► engine.compute(q, ctx) ──► Promise<PivotResult> ──► instance.setState
computeChildren  ─┘        │
(path, config)            ├──► engine.computeChildren(path, q, ctx) ──► Promise<PivotRowNode[]>
                          │                                                       │
                          │   refetch-on-query-change                              │
                          │   diff(q.expandedPaths, prev.expandedPaths)            │
                          │   fire computeChildren(path) for each delta             │
                          │                                                       ▼
                          └──────────────────────────────────────────►  instance merges children into tree
```

`createServerEngine({ compute, computeChildren, debounceMs? })` returns an `AggregationEngine<TRow>`. The factory:
- Tracks `currentQuery` and `currentExpandedPaths` per engine instance.
- On every `compute(q, ctx)`: diffs `q.expandedPaths` against the previous set; for each path that needs to be loaded or re-loaded (query context changed), calls `computeChildren(path, q, ctx)` (debounced per path if `debounceMs > 0`).
- Returns `PivotResult` with all loaded children merged into the tree; un-loaded paths get `childState: 'notLoaded'` and `hasChildren: true`.
- `retryChildren(path)` is exposed on `PivotTableInstance` (additive API; not on the engine contract). The instance calls `engine.computeChildren(path, currentQuery, ctx)` and merges.

### 4.5 Worker entry factory

```ts
// @lynellf/tablekit-worker
export const createWorkerEntry = (): WorkerEntryHandle => {
  const rowsStore: { rows: unknown[] | null } = { rows: null };
  const aggregators = new Map<string, Aggregator>(Object.entries(BUILT_IN_AGGREGATORS));
  const filterFns = new Map<string, (value: unknown, args: unknown) => boolean>();
  const pending = new Map<RequestId, { controller: AbortController; resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  let nextRequestId = 0;

  const dispatcher = (event: MessageEvent<WorkerRequest>) => {
    const req = event.data;
    switch (req.type) {
      case 'setRows':
        rowsStore.rows = req.rows;
        reply({ type: 'setRows:ok', requestId: req.requestId });
        break;
      case 'compute': {
        const controller = new AbortController();
        pending.set(req.requestId, { controller, resolve: (v) => reply({ type: 'compute:ok', requestId: req.requestId, result: v as PivotResult }), reject });
        computeWithRows(rowsStore.rows!, req.query, aggregators, filterFns, controller.signal)
          .then((result) => pending.get(req.requestId)?.resolve(result))
          .catch((err) => pending.get(req.requestId)?.reject(err));
        break;
      }
      // ... similar for computeChildren, dispose
    }
  };

  self.addEventListener('message', dispatcher);

  return {
    registerAggregators(map) { for (const [name, fn] of Object.entries(map)) aggregators.set(name, fn as Aggregator); },
    registerFilterFns(map) { for (const [name, fn] of Object.entries(map)) filterFns.set(name, fn); },
    dispose() { pending.forEach((p) => p.controller.abort()); pending.clear(); rowsStore.rows = null; self.removeEventListener('message', dispatcher); },
  };
};
```

The consumer's worker entry module looks like:

```ts
// consumer-app/src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';
const entry = createWorkerEntry();
entry.registerAggregators({
  weightedAvg: { init: () => ({ sum: 0, weight: 0 }), accumulate: …, merge: …, finalize: … },
});
export default {}; // Vite's ?worker import needs a default export
```

The main thread then does:

```ts
import Worker from './worker.ts?worker';
const engine = createWorkerEngine({ createWorker: () => new Worker() });
await engine.setRows!(rows); // first call sends rows
const result = await engine.compute(q, { signal });
```

### 4.6 Worker engine main-thread RPC

```ts
// @lynellf/tablekit-worker
export const createWorkerEngine = <TRow>(opts: { createWorker: () => Worker }): AggregationEngine<TRow> => {
  const worker = opts.createWorker();
  let nextRequestId = 0;
  let lastSeenRequestId = -1;
  const pending = new Map<RequestId, { resolve: (v: unknown) => void; reject: (e: unknown) => void; controller: AbortController }>();

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    const entry = pending.get(res.requestId);
    if (!entry) return;
    if (res.type === 'error') entry.reject(new Error(res.error.message));
    else entry.resolve((res as any).result ?? (res as any).children ?? res);
    pending.delete(res.requestId);
  });

  const send = <T>(message: WorkerRequest): { promise: Promise<T>; controller: AbortController } => {
    const requestId = ++nextRequestId;
    lastSeenRequestId = requestId;
    const controller = new AbortController();
    const promise = new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject, controller });
      worker.postMessage({ ...message, requestId });
    });
    return { promise, controller };
  };

  return {
    async compute(q, ctx) {
      validatePivotQuery(q); // M4 dev warning; fires once per non-serialized query
      const wireQuery = serializeQuery(q); // strips rows + inlineAccessors
      const { promise, controller } = send<WirePivotQuery, PivotResult>({ type: 'compute', query: wireQuery });
      ctx.signal.addEventListener('abort', () => controller.abort());
      return promise;
    },
    async computeChildren(path, q, ctx) {
      const wireQuery = serializeQuery(q);
      const { promise, controller } = send({ type: 'computeChildren', path, query: wireQuery });
      ctx.signal.addEventListener('abort', () => controller.abort());
      return promise;
    },
    dispose() {
      pending.forEach((p) => p.controller.abort());
      pending.clear();
      worker.terminate();
    },
  };
};
```

The `serializeQuery` helper strips `rows` and `inlineAccessors` and forwards the rest as `WirePivotQuery`. It does NOT re-serialize the field/measure/filter forms — those are already in their serialized shape when the consumer calls `buildPivotQuery({ serialize: true })` (M4 plumbing).

---

## 5. Phase summary

| # | Phase | Files (new / changed) | LOC est. |
| -- | ----- | --------------------- | -------- |
| 1 | Worker package scaffold + protocol types + wire-in | `packages/worker/package.json`, `tsconfig.json`, `vite.config.ts`, `vite.subpaths.config.mjs`, `vitest.config.ts`, `src/index.ts`, `src/protocol/index.ts`, `src/protocol/types.ts`, `src/serialization/serializeQuery.ts`; root `package.json` (build scripts), `pnpm-workspace.yaml` (examples) | ~250 |
| 2 | Worker entry factory + store + registries | `src/entry/createWorkerEntry.ts`, `src/entry/dispatcher.ts`, `src/entry/rowsStore.ts`, `src/aggregators/bulkRegister.ts`, `src/filters/bulkRegister.ts` | ~400 |
| 3 | Protocol round-trips + main-thread RPC | `src/engine/createWorkerEngine.ts`, `src/engine/rpc.ts`, `src/__tests__/engine.test.ts`, `src/__tests__/protocol.test.ts` | ~350 |
| 4 | Server engine reference factory + retry | `src/server/createServerEngine.ts`, `src/server/refetchOrchestrator.ts`, `src/server/retry.ts`; `packages/pivot/src/pivotTable/factory.ts` (additive: `retryChildren` method) | ~300 |
| 5 | Reference app + perf bench | `examples/m5-pivot-engines/` (Vite + React 19), `packages/worker/bench/worker.bench.ts` | ~600 |
| 6 | API freeze + final verify | `docs/m5-pivot-engines/api-freeze.md` | ~50 |
| | **Total** | | **~1950** |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 6. Risks — full table

| # | Risk | Severity | Mitigation |
| -- | ---- | -------- | ---------- |
| R1 | Worker RPC + AbortController race conditions | High | Per-request `AbortController` + monotonic `requestId`; main-thread adapter drops responses whose id is below `lastSeenRequestId`. Synthetic out-of-order response test in phase 3. |
| R2 | Worker DX risk (spec §16 #8) | High | `createWorkerEntry()` factory + reference app demonstrating Vite and webpack patterns. Written recipes doc is M6. |
| R3 | 1M-row bench on shared CI flakiness | Medium | Bench is advisory in CI (Vitest `bench` mode); regression warning is logged, not a hard fail. Reference app's "perf badge" is also advisory. |
| R4 | Worker termination leaks | Medium | `worker.terminate()` rejects in-flight promises synchronously with `AbortError`; worker side releases the rows store in the `dispose` handler (best-effort) before the main thread terminates. Store GC'd on teardown. |
| R5 | Inline-form leakage across the boundary | Medium | `WirePivotQuery = Omit<PivotQuery, 'rows' \| 'inlineAccessors'>` makes the type system prevent structural leaks. `createWorkerEngine` calls `validatePivotQuery` (M4) at the boundary and warns. |
| R6 | Server engine refetch storms | High | `createServerEngine` debounces per path (`debounceMs?: number`, default 0 = no debounce); consumer can tune. Internal `Map<RowPathKey, Promise<PivotRowNode[]>>` cache with TTL = current `requestId` prevents redundant fetches. |
| R7 | `pnpm verify` exit on a new package | Medium | Root `build` script must include `pnpm -F @lynellf/tablekit-worker build` and `build:worker:subpaths`. Phase 1 wires this. Reference app's dev script is not gated by `pnpm verify` (matches M3/M4). |
| R8 | React package peer dep additions | Low | M5 does not add a peer dep to `@lynellf/tablekit-react`. `usePivotTable` already accepts an `engine` option (M4); the consumer passes `createWorkerEngine(...)` as the value. React package remains unchanged. |
| R9 | Bundle size | Low | M5 adds ~5-7 kB min+gzip for the main-thread RPC adapter. Worker entry ships in the consumer's worker bundle (separate from the main bundle). Three subpaths (`@lynellf/tablekit-worker`, `/protocol`, `/server`) so server-only consumers don't pay for worker code. |
| R10 | `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` strictness | Low | Protocol types use `key?: T` convention consistently. Type tests assert optional absence vs. explicit `undefined`. |
| R11 | Server expansion memory | Low | Lazy semantics only hold when the consumer expands selectively. The reference app demonstrates selective expansion; the API docstring warns that fully-expanded trees defeat the lazy memory benefit. |
| R12 | TS worker types + Vite `?worker` import | Low | `createWorkerEngine({ createWorker: () => Worker })` callback signature accepts the lib's own `Worker` type from `lib.dom`. Works with Vite (`new MyWorker()`), webpack (`new Worker(new URL(...))`), and native (`new Worker(url)`). Type test in phase 3 asserts all three. |
| R13 | M4 cleanup items remaining | Low | Per the orchestrator's milestone status report, 2 minor cleanup items remain. They are M4 polish (likely the inline-leak warning firing twice in dev mode + a memoization tweak). They do not block M5 — phase 1 can run them in parallel as a separate `cleanup-M4-items` task. Flagged as an `open_concern`. |

---

## 7. Telemetry for `okf-curator`

This plan surfaces the following durable knowledge candidates (for `okf-curator` to file under `.okf/` after the plan is approved):

- **Worker DX recipe** (component-behavior): "createWorkerEntry() factory + reference app demonstrate the worker bootstrap for Vite and webpack; bundled recipes doc deferred to M6." Evidence: plan-summary §2 (out-of-scope), overview §3 D4. Confidence: high.
- **Inline-form leakage prevention** (pitfall): "WirePivotQuery = Omit<PivotQuery, 'rows' | 'inlineAccessors'>; validatePivotQuery (M4) wired into createWorkerEngine." Evidence: overview §3 D2, §4.2, §6 R5. Confidence: high.
- **Server refetch orchestration** (component-behavior): "createServerEngine tracks currentQuery + expandedPaths; engine-driven refetch on query change (spec §9.5)." Evidence: overview §3 D7. Confidence: high.
- **1M-row bench methodology** (workflow): "Vitest bench mode, advisory in CI; assertion on max < 1.5s + UI thread blocked time < 50ms via performance.measure." Evidence: overview §3 D9, plan-summary §7. Confidence: medium (subject to bench tuning).

These are not emitted by the planner; they will be filed by `okf-curator` after M5 lands. The mid-level planner does not directly write to `.okf/`.