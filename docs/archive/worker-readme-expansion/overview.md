# Worker README Expansion — Overview

**Slug:** `worker-readme-expansion`
**Type:** Documentation-only plan
**Status:** Draft

## Goal

Bring `packages/worker/README.md` up to the API-surface standard of the sibling READMEs (`packages/pivot/README.md`, `packages/react/README.md`), and address two specific user requests that the previous minimal README did not cover:

1. **Concrete React integration example** — show how the worker engine is wired into a React tree via `usePivotTable({ engine })`.
2. **Worker-based vs server-side aggregation comparison** — explain, with code, when to choose each of the two engines this package ships (`createWorkerEngine` vs `createServerEngine`).

This is documentation-only. No source files, no `package.json`, no `docs/m6-hardening/api-freeze.md` changes. The deliverable is one rewritten `packages/worker/README.md`.

## Background and prior work

The current worker README is 39 lines and contains only: title, one-line tagline, install, two 6-line code snippets (worker entry + worker engine), a status badge, a `## Packages` cross-link table, and bugs/license. It does not enumerate the package's API surface, subpath exports, custom aggregator/filter registration, bundler wiring, server engine, or how it integrates with `@lynellf/tablekit-react`.

The previous README pass (`docs/archive/v1-release-readiness/phase-3-per-package-readmes.md`) created the current minimal worker README at v1.0.0 status. The follow-up plan (`docs/archive/readme-api-surface-overhaul/phase-1-rewrite-package-readmes.md`) sketched what a fuller worker README should look like, but was scoped to "core + react + pivot + worker parity" and never executed against `packages/worker/README.md`. This plan finishes that work and adds the two specific sections the user asked for.

## What I found (investigation)

### READMEs examined

| Package README | Lines | API surface documented? | Has React integration example? |
|---|---|---|---|
| `packages/core/README.md` | ~39 | No (minimal) | No |
| `packages/react/README.md` | ~280 | **Yes** (extensive) | N/A (is the React pkg) |
| `packages/pivot/README.md` | ~360 | **Yes** (extensive) | No (only shows framework-free usage; mentions react re-export) |
| `packages/worker/README.md` | **~39 (gap)** | **No** | **No** |

The pivot and react READMEs set the standard: title + one-line tagline + status + install + **Overview** (with a "What it does" table) + **Usage** (multiple subsections with runnable snippets) + **API reference** (type tables) + **Related packages** + bugs + license.

### Current worker README gaps

1. **No "Overview" section** — does not explain what the three execution environments are (main-thread, worker, server) and when each is appropriate.
2. **No full API surface** — does not enumerate `createWorkerEngine`, `createWorkerEntry`, `serializeQuery`, `validateAggregatorRegistrations`, `validateFilterRegistrations`, subpath exports (`/protocol`, `/server`), or the types `WorkerEngineOptions`, `WorkerEngine`, `WorkerEntryHandle`, `AggregatorRegistration`, `FilterRegistration`, `WirePivotQuery`, `WorkerRequest`, `WorkerResponse`, `RequestId`, `SerializedError`.
3. **No custom aggregator / filter registration docs** — `createWorkerEntry().registerAggregators({...})` and `registerFilterFns({...})` are the mechanism for worker-side registries but are not shown.
4. **No bundler recipes** — `docs/bundler-recipes.md` exists with Vite/webpack/Rollup/esbuild patterns, but the README does not link to it or show the Vite/webpack patterns inline.
5. **No React integration example** — the user explicitly asked for one. Today the worker README mentions only `createWorkerEngine` + `createWorkerEntry`; it does not show wiring into `usePivotTable({ engine })` from `@lynellf/tablekit-react`.
6. **No worker-vs-server comparison** — the user explicitly asked for this. The package ships two engines (`createWorkerEngine` for off-thread but data-still-on-client; `createServerEngine` from `/server` subpath for client-never-sees-data); the distinction is not documented.
7. **No performance / scale guidance** — the package's own `bench/worker.bench.ts` references §12 perf budget (1M rows, warm re-pivot < 1.5s), but the README does not state when to pick the worker over the main-thread engine.

### Source-of-truth for API surface

- `packages/worker/src/index.ts` — main exports (6 functions + 4 types)
- `packages/worker/src/engine/createWorkerEngine.ts` — `createWorkerEngine`, `WorkerEngineOptions`, `WorkerEngine`
- `packages/worker/src/entry/createWorkerEntry.ts` — `createWorkerEntry`, `WorkerEntryHandle`
- `packages/worker/src/server/createServerEngine.ts` — `createServerEngine`, `ServerEngineOptions`, `ServerEngineComputeFn`, `ServerEngineComputeChildrenFn`, `RefetchOrchestrator`
- `packages/worker/src/protocol/types.ts` — `WirePivotQuery`, `RequestId`, `WorkerRequest`, `WorkerResponse`, `SerializedError`
- `packages/worker/src/serialization/serializeQuery.ts` — `serializeQuery`
- `packages/worker/src/aggregators/bulkRegister.ts` — `validateAggregatorRegistrations`, `AggregatorRegistration`
- `packages/worker/src/filters/bulkRegister.ts` — `validateFilterRegistrations`, `FilterRegistration`, `WorkerFilterFn`
- `packages/worker/package.json` — subpath exports (`.`, `./protocol`, `./server`); peer dependency `@lynellf/tablekit-pivot`; `engines.node >= 20`
- `docs/m6-hardening/api-freeze.md` §"`@lynellf/tablekit-worker`" — canonical contract for v1.0
- `docs/bundler-recipes.md` — bundler-specific wiring
- `examples/m5-pivot-engines/` — reference app: `src/worker/pivotWorker.ts`, `src/views/WorkerView.tsx`, `src/views/ServerView.tsx`
- `packages/pivot/src/types.ts` line 219 — `AggregationEngine<TRow>` interface (worker/server engines both implement this)

### Worker-vs-server distinction (research finding)

The pivot package's `AggregationEngine<TRow>` interface (`packages/pivot/src/types.ts` line 219) is the plug-in surface. `createPivotTable({ engine })` accepts any implementation. `@lynellf/tablekit-worker` ships **two** engines that satisfy this interface:

| Engine | Subpath | Data location | What crosses the wire | Typical scale | Failure mode |
|---|---|---|---|---|---|
| `createWorkerEngine` | `@lynellf/tablekit-worker` | All rows in the **worker** (sent once via `setRows`) | `WirePivotQuery` (no rows, no inline functions) | ~1M rows (per §12 perf budget) | Worker error surfaces as a rejected promise; UI catches and shows an error |
| `createServerEngine` | `@lynellf/tablekit-worker/server` | All rows on the **server** | `WirePivotQuery` over HTTP; server returns `PivotResult` (top level) or `PivotRowNode[]` (per-path children) | Unlimited by client RAM | Network/server error becomes `childState: 'error'` per node |

The two engines are **not mutually exclusive**. They target different axes (where does compute happen vs. where does data live). The README's comparison section must make this explicit because the package's surface currently mixes them in one import namespace, which is confusing.

### React integration pattern (research finding)

The pivot package's `createPivotTable` accepts `engine: AggregationEngine<TRow>` as an option. The React hook `usePivotTable(options)` from `@lynellf/tablekit-react` passes those options through verbatim. So the worker engine is wired in React exactly the same way as in framework-free code — the only React-specific concern is **lifecycle** (creating the worker inside `useEffect`, disposing on unmount), and **worker import** (which must use the bundler's worker mechanism: Vite `?worker`, webpack `new Worker(new URL(...))`, etc.). The reference example at `examples/m5-pivot-engines/src/views/WorkerView.tsx` shows this lifecycle pattern explicitly.

## Scope

### In scope

1. Rewrite `packages/worker/README.md` from ~39 lines to a parity-level README (~250-350 lines) using the pivot/react README structure as the template.
2. Add a **Worker + React integration** section with a complete, runnable `function MyPivotView()` example using `usePivotTable({ engine })` plus a worker file using `createWorkerEntry()`. Include both Vite and webpack worker import patterns.
3. Add a **Worker-based vs server-side aggregation** comparison section with:
   - A side-by-side code comparison (worker engine vs server engine for the same query).
   - A "When to choose" decision table (rows count, data residency, latency tolerance, latency model, scale ceiling, error model).
   - A clarifying paragraph that the two engines are **not mutually exclusive** — `createPivotTable` accepts either, switching the engine is a one-line change.
4. Add an **API reference** section enumerating every export from `packages/worker/src/index.ts` plus subpath exports (`/protocol`, `/server`) with type signatures.
5. Add a **Custom aggregators and filters** subsection showing `createWorkerEntry().registerAggregators(...)` and `registerFilterFns(...)`.
6. Add **Performance characteristics** guidance pointing at §12 perf budget (1M rows; warm re-pivot < 1.5s) and linking to `packages/worker/bench/worker.bench.ts`.
7. Cross-link to **bundler recipes** (`docs/bundler-recipes.md`) and the **reference app** (`examples/m5-pivot-engines/`).

### Out of scope

- Any change to `packages/worker/src/**`, `packages/worker/package.json`, or `dist/`.
- Any change to `docs/m6-hardening/api-freeze.md` (the canonical contract is correct).
- Any change to the per-package README template structure documented in `.okf/concepts/documentation-conventions.md`.
- Any new recipe document under `docs/recipes/`.
- Any change to the other three package READMEs (`core`, `react`, `pivot`).
- Code refactoring of the worker engine, the RPC layer, or the server engine.
- New tests, new benchmarks, new example apps.

## Acceptance criteria

The plan is complete when **all** of the following hold for the rewritten `packages/worker/README.md`:

### Structure parity with sibling READMEs

1. README begins with the package name `# @lynellf/tablekit-worker`, a one-line description, and the `**v1.0.0** — stable` status block linking to `https://github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md` (GitHub blob URL — relative in-repo paths break in the published tarball, per `.okf/concepts/documentation-conventions.md`).
2. README contains an `## Overview` section with a "What it does" table (mirroring pivot/README.md's table style) listing the three concerns the package addresses: worker-side aggregation engine, server-side aggregation engine reference, and the cross-cutting message protocol.
3. README contains a `## Usage` section with at minimum these subsections: Quick start (worker entry + engine), Custom aggregators and filters, **Worker + React integration** (NEW), and **Server-side aggregation** (NEW).
4. README contains an `## API reference` section with at least three tables (main exports, subpath exports, TypeScript types).
5. README ends with `## Related packages`, `## Bugs & Issues`, `## License` in that order.

### User-requested content

6. README contains a `## Worker + React integration` section showing a runnable React component using `usePivotTable({ engine: createWorkerEngine({...}) })` with proper `useEffect` lifecycle (create on mount, dispose on unmount), `<ReactAnnouncer />` imported from `@lynellf/tablekit-react` and rendered (NOT `<Announcer />` from a non-existent import), and either a Vite or webpack worker import example.
7. README contains a `## Worker-based vs server-side aggregation` section with: (a) a side-by-side code comparison, (b) a "When to choose" decision table, and (c) a clarifying paragraph that the two engines are alternatives on the `engine` option, not mutually exclusive.
8. The server-engine subsection uses `createServerEngine` from `@lynellf/tablekit-worker/server` (the actual subpath), demonstrates `compute` and `computeChildren` callbacks with an HTTP `fetch` shape, and notes the `debounceMs` option.

### Source-of-truth fidelity

9. Every named export in the README's API section appears in `packages/worker/src/index.ts` or in the subpath barrel files (`packages/worker/src/protocol/index.ts`, `packages/worker/src/server/index.ts`). Verified by `grep` over `src/**/index.ts`.
10. The Quick start snippet compiles against the package's actual public exports (cross-checked against `packages/worker/src/index.ts`).
11. All type signatures shown in the API tables match the source `.d.ts` definitions (or the source `.ts` files for non-built subpaths).
12. No README content references `docs/initial-spec.md` or any other in-repo relative path that would break in the published tarball (per `.okf/concepts/documentation-conventions.md` rule).

### Cross-link consistency

13. README links to `docs/bundler-recipes.md` for bundler-specific worker wiring (Vite, webpack, Rollup, esbuild).
14. README links to `examples/m5-pivot-engines/` as the reference implementation.
15. README's `## Related packages` table links to `packages/pivot/README.md` (required peer), `packages/react/README.md` (consumer of the engine option), and `packages/core/README.md`.

## Files to create / edit

- **Edit:** `packages/worker/README.md` — rewrite to ~250-350 lines matching the pivot/react README structure plus the user-requested sections.
- **Do not edit:** anything else.

## Step-by-step

1. Read `packages/worker/src/index.ts`, `packages/worker/src/protocol/index.ts`, `packages/worker/src/server/index.ts` to lock down the exact export names (verification step).
2. Draft the new `packages/worker/README.md` against the structure in `## Acceptance criteria`.
3. Verify every API bullet against `grep -r '^export ' packages/worker/src/` — must be zero discrepancies.
4. Verify the React integration snippet references only symbols exported from `@lynellf/tablekit-react` (cross-check against `packages/react/src/index.ts`).
5. Verify the worker engine snippet uses `createWorkerEngine` from the package root and `createWorkerEntry` from the package root (not the subpaths).
6. Verify the server engine snippet uses `createServerEngine` from `@lynellf/tablekit-worker/server`.
7. Run the verification grep checks (see below).

## Verification

```bash
# 1. New README exists and is meaningfully longer than the old one
wc -l packages/worker/README.md
# Expected: ≥ 200 lines (was 39)

# 2. README enumerates the canonical API surface
grep -q 'createWorkerEngine'    packages/worker/README.md
grep -q 'createWorkerEntry'     packages/worker/README.md
grep -q 'createServerEngine'    packages/worker/README.md
grep -q 'serializeQuery'        packages/worker/README.md
grep -q 'validateAggregatorRegistrations' packages/worker/README.md
grep -q 'validateFilterRegistrations'     packages/worker/README.md

# 3. README documents the two user-requested sections
grep -q 'Worker + React integration'            packages/worker/README.md
grep -q 'Worker-based vs server-side aggregation' packages/worker/README.md

# 4. README mentions the subpaths
grep -q '@lynellf/tablekit-worker/server'      packages/worker/README.md
grep -q '@lynellf/tablekit-worker/protocol'    packages/worker/README.md

# 5. README links to bundler recipes and reference app
grep -q 'docs/bundler-recipes.md'              packages/worker/README.md
grep -q 'examples/m5-pivot-engines'             packages/worker/README.md

# 6. README uses the GitHub blob URL for the api-freeze link (NOT a relative in-repo path)
grep -q 'github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md' packages/worker/README.md
if grep -qE '\]\(\./docs/|\]\(\.\./\.\./docs/|/docs/initial-spec' packages/worker/README.md; then
  echo "FAIL: README contains a broken relative path to in-repo docs"
fi

# 7. README does not advertise exports that don't exist
for sym in createWorkerEngine createWorkerEntry createServerEngine serializeQuery \
           validateAggregatorRegistrations validateFilterRegistrations; do
  if ! grep -q "$sym" packages/worker/README.md; then
    echo "FAIL: README missing canonical export $sym"
  fi
done

# 8. README mentions the required peer dependency
grep -q '@lynellf/tablekit-pivot' packages/worker/README.md

# 9. README status block uses v1.0.0
grep -q 'v1.0.0' packages/worker/README.md
```

Expected output: zero failures.

## Risks

- **Risk:** The React integration example drifts from `usePivotTable`'s actual return shape if I infer types from `packages/react/README.md` rather than from `packages/react/src/index.ts`. *Mitigation:* Phase step 4 cross-checks every imported symbol against `packages/react/src/index.ts` before commit.
- **Risk:** The server engine example uses `createServerEngine` from the wrong subpath (e.g., from package root instead of `/server`). *Mitigation:* Phase step 6 explicitly enforces the subpath; `createServerEngine` is **only** exported from `@lynellf/tablekit-worker/server`, not from the root.
- **Risk:** The README grows so long it stops being useful as a "first read". *Mitigation:* Mirror pivot/README.md (~360 lines) and react/README.md (~280 lines). Anything beyond ~400 lines should defer to `docs/m6-hardening/api-freeze.md` or a recipe doc rather than inlining.

## Telemetry

OKF telemetry for this plan:

- `okf_docs_read`: 1 (`.okf/concepts/documentation-conventions.md`)
- `okf_tokens_read`: ~800
- `files_scanned_before_okf`: 0
- `files_scanned_after_okf`: ~12 (4 README.md, 4 src/index.ts, 4 other source files in worker package, bundler-recipes.md, m5 example)
- `repo_scan_tokens_before_okf`: unknown
- `repo_scan_tokens_after_okf`: unknown
- `planner_cost_before_okf`: unknown
- `planner_cost_after_okf`: unknown
- `stale_okf_hits`: 0
- `missing_okf_hits`: 0

## Out of scope reminders

- Do **not** create a new recipe doc under `docs/recipes/`. The user asked for the comparison **inside the worker README**, not as a standalone recipe.
- Do **not** modify `docs/bundler-recipes.md` — it is already correct; the new README will link to it.
- Do **not** add TypeDoc output or generated API reference. The new README is hand-written documentation that summarizes the surface; the canonical contract remains `docs/m6-hardening/api-freeze.md`.