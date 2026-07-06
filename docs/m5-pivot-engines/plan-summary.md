# M5: Pivot Engines — Plan Summary

**Slug:** `m5-pivot-engines`
**Milestone:** M5 (per `docs/initial-spec.md` §14 row 6)
**Status:** Draft v1 for review — decisions D1–D9 resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** Worker pivot engine + message protocol + worker-side data store (new `@lynellf/tablekit-worker` package), server engine contract + lazy expansion helpers, and a reference app demonstrating both engines against a 1M-row synthetic dataset.
**Scope resolution:** The target is **M5: Pivot engines** per `docs/initial-spec.md` §14 row 6 (*"Worker engine + protocol + data store; server engine contract + lazy expansion"*). Exit criteria: **1M-row worker budget; server-expansion reference app**.

M0–M4 are complete (state engine, controlled-slice contract, row pipeline, virtualization, pinning, resize, keyboard nav, validator, DataSource, useDataSource, `@lynellf/tablekit-pivot` package with main-thread engine + reducer-shaped aggregators + serialization + treegrid rendering, ~530 tests green, `pnpm verify` clean, M4 `api-freeze.md` approved — see [`docs/m4-pivot-main-thread/api-freeze.md`](../m4-pivot-main-thread/api-freeze.md)). M5 extends that surface additively and adds one new package (`@lynellf/tablekit-worker`).

> **Two M4 cleanup items** (per the orchestrator's milestone status report): not in the M4 plan-summary; documented in the M4 phase files as polish items. They do not block M5 and can run in parallel.

## 1. Goal

Land M5 per the spec: *"Worker engine + protocol + data store; server engine contract + lazy expansion"*. Exit criteria (spec §14):

1. **1M-row worker budget**: re-pivot < 1.5s, UI thread never blocks > 50ms (spec §12 perf target).
2. **Server-expansion reference app**: a Vite + React 19 demo showing lazy server-side expansion (`childState: 'notLoaded' → 'loading' → 'loaded'`), error retry, `aria-busy`, and `aria-expanded` on the row.

Concretely:

1. **`@lynellf/tablekit-worker` package** — New framework-free workspace package per spec §3 (dependency direction: `worker → pivot`). Worker-side aggregation engine + tiny in-worker data store + a structured-clone message protocol. **No DOM access.** Library ships a worker entry factory (mitigates spec §16 risk #8: "Worker DX risk").
2. **Structured-clone message protocol** — Worker boundary uses a strict wire format: rows transferred **once** via `setRows`; subsequent `compute` and `computeChildren` calls send only the serialized `WirePivotQuery` (no rows, no inline functions). Inline forms are stripped before crossing the boundary (M4's `buildPivotQuery(..., { serialize: true })` is reused). Request/response correlation via monotonic `requestId`.
3. **Worker-side aggregator registry** — `registerAggregators({ name: fn })` API for the consumer's worker entry to register custom aggregators against the protocol (mirrors M4's per-name `registerAggregator` but bulk + worker-only). Built-in aggregators are pre-registered when the worker entry boots.
4. **`createWorkerEngine({ createWorker })` factory** — Main-thread side. Wraps `Worker` with a promise-based RPC layer, owns the lifecycle (create/abort/dispose), and returns an object that satisfies `AggregationEngine<TRow>`. The factory accepts a `createWorker` callback so the consumer controls bundler-specific worker instantiation (Vite's `?worker` import, webpack's `new Worker(new URL(...))`, etc.).
5. **Worker entry factory** — `createWorkerEntry()` boots the in-worker side: pre-registers built-in aggregators, dispatches incoming messages, manages per-request `AbortController`s, exposes a public `setRows`/`compute`/`computeChildren`/`dispose` protocol surface.
6. **Server engine reference contract** — Spec §9.5 already defines the engine contract; M5 ships a reference server engine (a thin adapter that wraps an async `compute`/`computeChildren` consumer API) plus a `retryChildren(path)` helper on `PivotTableInstance`. The reference app demonstrates the pattern against a mock async API.
7. **Server expansion integration** — When `engine.computeChildren` returns, children merge into the tree; loading state surfaces as `aria-busy` on the row + `childState: 'loading'` (spec §10). Errors surface as `childState: 'error'` with `retryChildren(path)`. Already-expanded paths re-request on query change (engine-driven refetch — different from the M3 DataSource model which is consumer-driven).
8. **Perf bench** — Synthetic 1M-row × 3-level dataset; asserts re-pivot < 1.5s (worker) and UI thread < 50ms (main thread blocked-time check via `performance.measure`). Bench is advisory in CI per M3/M4 convention; the worker budget is tracked.
9. **Reference app** — `examples/m5-pivot-engines/` (Vite + React 19) demonstrating:
   - Worker engine against a 1M-row synthetic dataset with a perf badge.
   - Server engine against a mock API with delayed responses (`setTimeout`-based) showing loading → loaded transitions and error retry.
10. **`api-freeze.md`** — M5 additions only; M0–M4 surface reaffirmed; `pnpm verify` continues to pass.

The deliverable from a fresh clone: `pnpm verify` exits 0; M5 tests pass; the M5 reference app boots and demonstrates worker re-pivot + server lazy expansion; the §14 exit criteria are satisfied.

---

## 2. Scope

### In M5

| Feature | Spec section | New surface |
| --- | --- | --- |
| `@lynellf/tablekit-worker` package | §3 | New workspace package; peer-deps `@lynellf/tablekit-pivot` |
| `WorkerProtocol` types | §9.3 | `WorkerRequest`, `WorkerResponse`, `WirePivotQuery`, `RequestId` |
| Worker-side data store | §9.3 | `setRows(rows)` keeps the dataset in worker memory |
| Worker-side aggregator registry | §9.3 | `registerAggregators({ name, fn })` (bulk) |
| Worker-side filter registry | §9.3 P3 | `registerFilterFns({ name, fn })` (bulk) |
| `createWorkerEngine({ createWorker })` | §9.3 | Main-thread `AggregationEngine` factory |
| `createWorkerEntry()` worker-entry factory | §9.3 / §16 #8 | Bundler-agnostic worker bootstrap |
| `dispose()` on worker engine | §9.3 | Worker termination + store release |
| Server engine reference impl | §9.5 | `createServerEngine({ compute, computeChildren, retryChildren })` |
| `retryChildren(path)` on `PivotTableInstance` | §9.5 | Helper that re-invokes `engine.computeChildren` for an error path |
| Server-expansion reference app | §14 | `examples/m5-pivot-engines/` Vite + React 19 |
| 1M-row worker perf bench | §12 | `packages/worker/bench/worker.bench.ts` |
| Worker protocol round-trip tests | §13 | `protocol.test.ts`, golden fixtures |
| Inline-leak dev warnings (M5 plumbing) | §13 P3 | `validatePivotQuery` already in M4; M5 wires it into `createWorkerEngine` |
| `api-freeze.md` M5 update | §14 | `docs/m5-pivot-engines/api-freeze.md` |

### Out of M5 (deferred)

- **Subtotal rows (`perLevel`)** — v1.5 per spec §15. The M4 type already reserves `subtotals?: 'none' | 'perLevel'`; only `'none'` is honored in M4 and M5.
- **Full `messages` map + i18n + politeness heuristics** — M6.
- **Screen-reader manual matrix (NVDA, JAWS, VoiceOver)** — M6 release gate. The worker/server engines inherit the M4 treegrid a11y surface; the matrix is documentation + manual work, not engine code.
- **`validateGridStructure` CLI / layered diagnostics** — M6.
- **`tabBehavior` option** — §16 risk #4, M6.
- **Split-pane recipe docs** — M6 docs.
- **`rowSelection`, state persistence helper, global quick filter, column auto-fit** — v1.5/v2.
- **Hard gate behind `allowWithinPageOperations`** — v2 per spec §16 risk #10.
- **Columnar / `Arrow` transfer for `setRows`** — spec §9.3 names this as "a future optimization". M5 ships the structured-clone transfer; `Arrow` is v2+.
- **Tachometer/mitata CI bench integration** — M6. M5 uses Vitest's built-in `bench` mode (advisory, parallelizable like M4).
- **Custom WebWorker bundler recipes doc (Vite/webpack)** — Spec §16 #8 explicitly calls this out as a mitigation. M5 ships the entry factory + the reference app (which is itself a Vite recipe). A written recipes doc with copy-paste snippets for Vite, webpack, Rollup, and esbuild is M6 docs polish (consistent with M2's split-pane recipe deferral).
- **Inline `accessor`/`predicate`/`aggregator` round-trip in `WirePivotQuery`** — M4 strips them when `serialize: true`; M5 enforces this at the worker boundary with a dev warning (already wired via `validatePivotQuery`).

---

## 3. Resolved decisions (nine open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | Worker location: in `@lynellf/tablekit-pivot` or new package? | **NEW `@lynellf/tablekit-worker` PACKAGE** | Spec §3 dependency direction `worker → pivot` is explicit. The `AggregationEngine<TRow>` seam is already in place; the worker implementation is a separate execution environment and a ~600-800 LOC module. The empty `packages/worker/` directory is reserved per `.okf/components/dev-tooling-stack.md`. |
| D2 | Wire shape: separate `WirePivotQuery` type or reuse `PivotQuery` minus rows/inline? | **NEW `WirePivotQuery` TYPE** (derived from `PivotQuery`) | A `WirePivotQuery = Omit<PivotQuery, 'rows' \| 'inlineAccessors'>` makes the contract self-documenting at the protocol boundary. The protocol types live in `@lynellf/tablekit-worker/protocol` so the worker and main-thread sides share them. Mirrors M3's `RowsQuery` / `SerializedFilter` split. |
| D3 | Request correlation: per-call `MessageChannel` or `requestId` in payloads? | **`requestId` IN PAYLOADS** | `MessageChannel` creates per-call ports — heavy for high-frequency re-pivots (every config change). A monotonic `requestId` + a single `Map<requestId, { resolve, reject, controller }>` is cheap; out-of-order responses resolve the right promise. Aborts use the existing `AbortSignal`; the main-thread adapter cancels the in-flight request and the worker side checks `signal.aborted` between chunked yields. |
| D4 | Worker entry bundling: ship a default `worker.ts` or a factory? | **FACTORY: `createWorkerEntry()`** | Spec §9.3: *"the library ships a worker entry factory so the default registry works with zero setup"*. §16 #8 names the entry factory as the mitigation. The consumer imports `createWorkerEntry` from the package and wires it to their bundler's worker mechanism (Vite's `?worker` import returns a constructor; webpack needs `new Worker(new URL('./worker.ts', import.meta.url))`). The reference app demonstrates both. |
| D5 | Worker-side aggregator registration: bulk or per-name? | **BULK `registerAggregators({ name: fn })`** | The consumer's worker entry typically registers several aggregators at boot time; a bulk API matches the ergonomics. The existing per-name `registerAggregator` from M4 stays for the main-thread / cross-boundary cases. The bulk API is a thin wrapper that calls per-name in a loop. |
| D6 | Server engine: ship a `createServerEngine` reference or just docs? | **REFERENCE FACTORY `createServerEngine({ compute, computeChildren })`** | Spec §9.5 is explicit: *"Implemented by the consumer against their API"* — the contract is the seam, not the impl. But shipping a thin factory that adapts an async consumer API to `AggregationEngine<TRow>` (handles `AbortSignal`, owns the request id correlation on the consumer side) is cheap, prevents foot-guns, and gives the reference app a real shape. The factory does **not** know how to talk to a server; the consumer wires their fetch / GraphQL / tRPC. |
| D7 | Server expansion refetch on query change: engine-driven or hook-driven? | **ENGINE-DRIVEN** (consistent with spec §9.5) | Spec §9.5: *"Already-expanded paths are re-requested on query change (sort/filter/measure edits invalidate the tree; the instance handles refetch orchestration since expansion is engine-driven, unlike Level 0 tabular data)."* M5 implements this inside `createServerEngine` (not in the React hook). The hook just observes `result`; the engine decides when to refetch. |
| D8 | Worker disposal semantics: terminate immediately or drain? | **TERMINATE IMMEDIATELY + REJECT IN-FLIGHT** | `dispose()` calls `worker.terminate()`; in-flight `compute` / `computeChildren` promises reject with `AbortError`. The consumer can create a new engine after dispose; the store and pending requests are released. This matches the spec §9.3 `dispose?()` signature and prevents leaks in long-lived SPAs that swap engines. |
| D9 | 1M-row perf budget: bench in CI or advisory? | **ADVISORY IN CI** (Vitest `bench` mode) | Mirrors M4's bench approach. The §12 perf budget is tracked; CI runs the bench and files a regression warning, not a hard fail. A hard CI gate would be flaky on shared CI runners. M6 may add tachometer for tighter tracking. |

Full rationale for each is in [`overview.md` §3](./overview.md).

---

## 4. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [Worker package scaffold + protocol types + wire-in to monorepo](./phase-1-worker-package-scaffold.md) | `packages/worker/` package, `WorkerProtocol` types (`WorkerRequest`/`WorkerResponse`/`WirePivotQuery`/`RequestId`), subpath build, root build scripts, smoke test | ~15-25 |
| 2 | [Worker entry factory + in-worker data store + aggregator/filter registry](./phase-2-worker-entry-and-store.md) | `createWorkerEntry()`, in-worker rows store, `registerAggregators({...})`, `registerFilterFns({...})`, `setRows` / `compute` / `computeChildren` / `dispose` message handlers, AbortController per request | ~30-40 |
| 3 | [Worker protocol round-trips + main-thread RPC adapter](./phase-3-protocol-and-rpc.md) | `createWorkerEngine({ createWorker })` main-thread factory, request-id correlation, structured-clone serialization, `validatePivotQuery` dev-warning wiring, end-to-end test using real `Worker` | ~25-35 |
| 4 | [Server engine reference factory + `retryChildren` helper + server expansion integration](./phase-4-server-engine-and-retry.md) | `createServerEngine({ compute, computeChildren })`, `PivotTableInstance.retryChildren(path)`, server-expansion integration test, `aria-busy`/error path tests | ~20-30 |
| 5 | [Reference app + 1M-row perf bench + golden fixtures](./phase-5-reference-app-and-perf-bench.md) | `examples/m5-pivot-engines/` Vite app (worker + server engines), 1M-row synthetic dataset bench (`worker.bench.ts`), protocol golden fixtures, server-expansion demo | ~10-20 |
| 6 | [API freeze + final verify + dev-mode docs](./phase-6-api-freeze-and-final-verify.md) | `docs/m5-pivot-engines/api-freeze.md`, M0–M4 surface reaffirmed, `pnpm verify` exit 0, §14 exit criteria satisfied | ~5-10 |
| | **Total M5 tests** | | **~105-160** (on top of M0–M4's ~530) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 5. Key risks

1. **Worker RPC + AbortController race conditions** — Stale worker responses must not overwrite fresh state. Per-request `AbortController` + monotonic `requestId`; the main-thread adapter drops responses whose id is below the current `lastSeenRequestId`. Tested by injecting synthetic out-of-order responses (phase 3).
2. **Worker DX risk** — Spec §16 #8 explicitly flags this. Mitigation: `createWorkerEntry()` factory + reference app demonstrating Vite and webpack patterns. A written recipes doc is deferred to M6.
3. **1M-row bench on shared CI** — Flaky if CI runners vary. Bench is advisory (Vitest `bench` mode); a regression warning is logged, not a hard fail. The reference app's "perf badge" is also advisory (UI text, not assertion).
4. **Worker termination leaks** — `worker.terminate()` doesn't run `dispose` handlers on the worker side. Mitigation: in-flight promises reject with `AbortError` immediately on dispose; the worker side releases the rows store synchronously in the `dispose` handler **before** the main thread terminates (best-effort). The store is GC'd when the worker is torn down.
5. **Inline-form leakage across the boundary** — The protocol types prevent structural leaks (`WirePivotQuery` excludes `rows` + `inlineAccessors`). Runtime guard in `createWorkerEngine` calls `validatePivotQuery(q)` and warns if a non-serialized form was passed. M4 ships `validatePivotQuery`; M5 wires it in (no new warning code).
6. **Server engine refetch storms** — Spec §9.5: query changes invalidate the tree; the engine refetches already-expanded paths. A naive impl could refetch N paths in parallel per keystroke. Mitigation: `createServerEngine` debounces per path (or batches via a single request, depending on consumer config); debounce config is exposed for the consumer to tune. Reference impl uses an internal `Map<RowPathKey, Promise<PivotRowNode[]>>` cache with TTL = the current `requestId`.
7. **`pnpm verify` exit on a new package** — Root `build` script must include `pnpm -F @lynellf/tablekit-worker build` and `build:worker:subpaths`. Phase 1 wires this. The reference app's dev script (`pnpm --filter m5-pivot-engines-example dev`) is not gated by `pnpm verify` (matches M3/M4 convention).
8. **`@lynellf/tablekit-react` peer dependency addition** — Adding `@lynellf/tablekit-worker` as a peer dep to the react package may surface install-time warnings for consumers who don't install the worker package. Mitigation: peer dep is **optional** (`peerDependenciesMeta.worker.optional: true`). The react adapter imports from worker only when an explicit worker engine is consumed (tree-shaking). M5 does not change the React package — `usePivotTable` already accepts an `engine` option (M4); the consumer passes `createWorkerEngine(...)` as the value.
9. **Bundle size** — M5 adds ~5-7 kB min+gzip for the main-thread RPC adapter (worker entry itself ships in the consumer's worker bundle, not the main bundle). The new package exports three subpaths (`@lynellf/tablekit-worker`, `/protocol`, `/server`) so consumers using only the server engine don't pay for the worker code.
10. **`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` strictness** — The protocol types use optional fields per spec. Mitigation: phase 1 uses `key?: T` convention consistently; tests assert optional absence vs. explicit `undefined`.
11. **Server expansion memory** — If the consumer expands every path, the server engine's result tree mirrors the full dataset (no different from main-thread/worker). The lazy semantics (only `expandedPaths` materializes children) only hold when the consumer expands selectively. The reference app demonstrates selective expansion; the API docstring warns that fully-expanded trees defeat the lazy memory benefit (consistent with spec §9.5's "memory stays proportional to what's visible").
12. **TS worker types + Vite `?worker` import** — Vite's `?worker` import returns a constructor with a `Worker` type that's a build-time-only type. The `createWorkerEngine({ createWorker })` callback's signature accepts a `() => Worker` (the lib's own `Worker` type from `lib.dom`) so the consumer passes `() => new MyWorker()` — works with Vite, webpack, and native `new Worker(url)`. Type test in phase 3 asserts the callback signature is compatible with all three.

Full risk table is in [`overview.md` §6](./overview.md).

---

## 6. Verification

After all 6 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                      # typecheck + lint + test + build — EXIT 0
pnpm test                                                         # M0–M4 (~530) + M5 (~105-160) tests, all green

# Worker subpath smoke
node -e "import('@lynellf/tablekit-worker').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-worker/protocol').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-worker/server').then(m => console.log(Object.keys(m).sort()))"

# React pivot hook still works with the worker engine (smoke)
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable))"

# Reference app
pnpm --filter m5-pivot-engines-example build                      # EXIT 0
pnpm --filter m5-pivot-engines-example dev                        # http://localhost:5175

# Worker protocol round-trip tests
pnpm --filter @lynellf/tablekit-worker test -- --run protocol

# Server engine tests
pnpm --filter @lynellf/tablekit-worker test -- --run server

# 1M-row perf bench (advisory)
pnpm --filter @lynellf/tablekit-worker bench worker.bench.ts
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 7. M5 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **1M-row worker budget** | `packages/worker/bench/worker.bench.ts` synthesizes 1M rows × 3-level hierarchy (`region` → `category` → `product`) × 2 measures. Bench asserts re-pivot < 1.5s on a mid-tier laptop; UI-thread blocked-time is asserted via a `performance.measure` around `createWorkerEngine().compute(q)`. Bench is advisory in CI; the reference app displays a perf badge that recomputes on demand. |
| **Server-expansion reference app** | `examples/m5-pivot-engines/` (Vite + React 19) demonstrates the server engine against a mock async API with `setTimeout`-based delays. The demo shows: top-level result renders immediately (collapsed), `aria-busy` on rows during `computeChildren`, `childState: 'loading' → 'loaded'`, error retry via the "Retry" button on an error node, `aria-expanded` on rows with `hasChildren`. Integration test `packages/react/src/__integration__/pivot-server-expansion.test.tsx` asserts the DOM shape transitions and `validateGridStructure({ valid: true })`. |
| **Worker engine contract (§9.3)** | `packages/worker/src/engine/createWorkerEngine.ts` returns an object satisfying `AggregationEngine<TRow>`; `packages/worker/src/__tests__/engine.test.ts` runs the main-thread engine + the worker engine against the same 100k-row fixture and asserts identical `PivotResult` structure (modulo timing). |
| **Server engine contract (§9.5)** | `packages/worker/src/server/createServerEngine.ts` adapts an async `compute`/`computeChildren` consumer API to `AggregationEngine<TRow>`. `packages/worker/src/__tests__/server.test.ts` runs the server engine against a mock async API and asserts lazy expansion, refetch on query change, error retry, and `AbortSignal` honoring. |
| **§16 #8 worker DX mitigation** | `createWorkerEntry()` factory + reference app demonstrate the worker bootstrap for both Vite (`?worker` import) and webpack (`new Worker(new URL(...))`) patterns. Phase 1's verification step imports `createWorkerEntry` and asserts the API surface. |
| **§13 P3 registry-name enforcement** | `validatePivotQuery` (M4) is wired into `createWorkerEngine`; dev warning fires when an inline form is passed. Test in `packages/worker/src/__tests__/engine.test.ts` asserts the warning fires once per non-serialized query. |
| **Inline-leak dev warnings** | M4's `validatePivotQuery` is reused; M5 does not add new warning code. Test in `packages/worker/src/__tests__/engine.test.ts` exercises the warning path. |

---

## 8. Out-of-scope reminder

M5 does **not** ship subtotals (`perLevel`), full announcer polish, screen-reader manual matrix, `validateGridStructure` CLI / layered diagnostics, `tabBehavior` option, split-pane recipe, `rowSelection`, state persistence helper, global quick filter, column auto-fit, hard-gating behind `allowWithinPageOperations`, columnar/`Arrow` transfer, or a written bundler-recipes doc. These are explicit non-goals per spec §9, §14, §15, and §16. A reviewer should flag any phase file that includes M6+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D9** in [`overview.md`](./overview.md) — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D4 (worker entry factory vs. shipped worker), D6 (server reference factory vs. docs only), and D7 (engine-driven refetch).
2. **§4 architecture overview** — confirm the new `@lynellf/tablekit-worker` package mirrors M2/M3/M4 conventions (subpath exports, subpath build runner, peer deps). Confirm `WirePivotQuery` is a clean `Omit<PivotQuery, 'rows' \| 'inlineAccessors'>` and the protocol types are structured-clone-safe.
3. **Phase 1 (package scaffold + protocol types)** — `WorkerRequest`/`WorkerResponse`/`WirePivotQuery`/`RequestId` shape; root build-script wiring; subpath layout (`@lynellf/tablekit-worker`, `/protocol`, `/server`).
4. **Phase 2 (worker entry + store + registries)** — `createWorkerEntry()` factory; rows store lifecycle (setRows replaces the store atomically); `registerAggregators` / `registerFilterFns` bulk registration; per-request `AbortController`.
5. **Phase 3 (protocol round-trips + RPC adapter)** — `createWorkerEngine({ createWorker })` main-thread factory; request-id correlation; `AbortSignal` honoring; out-of-order response handling; `validatePivotQuery` wiring.
6. **Phase 4 (server engine + retry)** — `createServerEngine({ compute, computeChildren })`; `PivotTableInstance.retryChildren(path)`; debounced refetch on query change; error path; `aria-busy` integration with the existing treegrid surface.
7. **Phase 5 (reference app + perf bench)** — 1M-row synthetic dataset; bench methodology; server-expansion demo with mock async API; Vite recipe for the worker import.
8. **Phase 6 (api-freeze + final verify)** — `api-freeze.md` completeness; M0–M4 surface reaffirmed; `pnpm verify` green; §14 exit criteria satisfied.
9. **§6 risks** — especially worker RPC + abort races (R1), server refetch storms (R6), and the new package's impact on `pnpm verify` (R7) and the react package's peer deps (R8).

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).