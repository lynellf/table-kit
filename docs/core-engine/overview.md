# Core Engine — Plan Overview

**Slug:** `core-engine`
**Milestone:** M0 (per `docs/initial-spec.md` §14)
**Status:** Draft v2 for review — scope clarified after reviewer-b mismatch finding
**Audience:** implementer (after panel approval)
**Scope:** `@lynellf/tablekit-core` instance + state engine, column model, registries, and `@lynellf/tablekit-react` adapter shell.
**Scope resolution:** The target is **M0: Core engine**, because `docs/initial-spec.md` §14 lists M0 as the first milestone row. See [`scope-resolution-spec.md`](./scope-resolution-spec.md).
**Out of scope:** Row pipeline (sorting/filtering/pagination — M1), full column-ordering and column-visibility feature helpers/behavior (M1), interaction events and prop getters (M1), virtualization/resizing/pinning/keyboard (M2), server modes + DataSource (M3), PivotTable + aggregators (M4–M5), announcer + a11y validator (M3/M6). The M0 surface includes only the **type, instance, and minimal adapter scaffolding** required to satisfy the M0 exit criteria.

---

## 1. Goal

Land M0 per the spec: *“Instance/state/controlled-slice contract, column model, registries, React adapter shell — Controlled + uncontrolled state round-trips; type tests green.”*

Concretely:

1. A `@lynellf/tablekit-core` factory (`createDataTable<TRow>(options)`) that returns a state-engine instance with `getState()`, `setOptions(next)`, and `subscribe(listener)`.
2. The **controlled-slice contract** from §4.2 implemented in full: every state slice is independently controllable via `state`/`initialState` + per-slice `on<Slice>Change` callbacks + global `onStateChange`. Updaters are `T | ((old: T) => T)`.
3. A **column model** that turns `ColumnDef<TRow, TValue>[]` into derived `Column` views with stable ids, accessor resolution, and basic derived getters (`getSize()`, `getIsPinned()`, `getIsVisible()`, `getIndex()`, `getCanSort()`, `getCanFilter()`). Behavior gated on slice state lands in M1/M2; the *shape* and *derived getters* land in M0.
4. **Registries** for sorting functions, filter functions (built-ins only — `sum` aggregator stubbed; full aggregator engine is M4), and column-ids-by-name lookup. Registry references for serialization (P3) are encoded as **string names** in the slice state, with the registry resolving them.
5. `@lynellf/tablekit-react` **adapter shell** — a `useDataTable<TRow>(options)` hook that wraps `createDataTable`, calls `setOptions` on every render, subscribes via React 18’s `useSyncExternalStore`, and returns the current snapshot. No prop getters, no announcer — those are M1+.
6. **Tests** that exercise both uncontrolled and controlled round-trips end-to-end, plus **type tests** that pin the public API surface so unintentional breaking changes are caught by `pnpm verify`.

The deliverable from a fresh clone: `pnpm verify` exits 0 with all M0 tests green and the spec’s M0 exit criteria satisfied.

### 1.1 Change summary for Draft v2

- Added explicit scope resolution: "first milestone" means **M0: Core engine** under `docs/initial-spec.md` §14.
- Added a pointer to [`scope-resolution-spec.md`](./scope-resolution-spec.md), which records the M0/M1 decision and corrected downstream goal language.
- Expanded the out-of-scope line to call out M1 column ordering, column visibility, and interaction events explicitly.
- No implementation phases were expanded to M1; M1 should be planned separately after M0 lands.

---

## 2. What I found (investigation notes)

### 2.1 Sources reviewed

- `docs/initial-spec.md` — full spec, esp. §4 (instances, state model, dependency-inversion seams, data model), §13 (testing strategy), §14 (milestones), §15 (recommended additions).
- `.okf/components/dev-tooling-stack.md` and `.okf/workflows/dev-tooling-bootstrap.md` — established tooling decisions.
- `docs/archive/dev-tooling-bootstrap/{overview,phase-1..7}.md` — reference plan format (this plan mirrors that structure).
- `docs/archive/prepare-for-npm/plan.md` and the per-phase docs — second reference; confirms `pnpm verify` is the aggregate gate.
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `biome.json`, `lefthook.yml`, `vite.config.ts`, `vitest.workspace.ts`, `vitest.config.ts` — toolchain is green at HEAD (`pnpm verify` passes; 2 smoke tests).
- `packages/core/{package.json,tsconfig.json,vite.config.ts,src/index.ts,src/index.test.ts}` — current `core` stub exports `VERSION` only.
- `packages/react/{package.json,tsconfig.json,vite.config.ts,src/index.ts,src/index.test.ts}` — current `react` stub exports `VERSION` and a passthrough `ReactElement` type.
- `.pi-conductor/runs/*.jsonl` — confirmed orchestrator dispatched me after extracting the M0 brief; prior runs (dev-tooling-bootstrap, prepare-for-npm) shipped and archived.

### 2.2 Verified facts

- **Toolchain is locked in.** pnpm 10.33.1, Vite 5, Vitest 2, Biome 1.9, TypeScript 5.6.3. Strict TS includes `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Biome enforces `noExplicitAny: error`, `useImportType: error`, `useExhaustiveDependencies: error`. Lefthook runs `typecheck + lint + test + build` on pre-push.
- **Path aliases already configured.** `tsconfig.base.json` exposes `@lynellf/tablekit-core` and `@lynellf/tablekit-react` as workspace aliases; `vitest.config.ts` mirrors them.
- **Each package has its own `tsconfig.json`** that extends the base and excludes `**/*.test.ts`. Vitest runs both packages via `vitest.workspace.ts`.
- **The `VERSION` stub is already published metadata.** Bumping `0.1.0` is already done in both `src/index.ts` files; M0 work does **not** require touching version fields.
- **`packages/core/tsconfig.json`** excludes `**/*.test.ts` — type checking tests would fail if they live alongside source. Test files are still runnable via Vitest because `vitest.config.ts` doesn’t use the package `tsconfig`.
- **No existing source code in either package** beyond the `VERSION` export. Greenfield for M0.
- **Biome a11y rule**: `useKeyWithClickEvents: warn` — relevant for M2 (resize handles) but not M0.

### 2.3 Spec implications for M0 design

- **§4.2 controlled-slice contract** is the load-bearing design. Every state slice must be controllable independently and atomically. The instance never mutates controlled slices internally — it requests changes through callbacks and re-derives from the consumer-provided `state`. This is the primary dependency-inversion mechanism and the M0 test surface.
- **§4.3 dependency-inversion seams** define the registry pattern. Built-in sorting/filter functions must be addressable by name so `RowsQuery` can be serialized (P3). Registry interfaces must be exported and runtime-extensible.
- **§4.4 column model** — `ColumnDef` is opaque to the core for `header`/`cell` (they can be `unknown` since the React adapter supplies the bridge). Derived `Column` is the public view shape. `meta` is the consumer escape hatch and must flow through.
- **§13 testing strategy** — unit tests for pure-function surfaces (which is all of M0: type helpers, reducers, registry lookup, column derivation). Type tests for the public API. No DOM, no React renderer needed for M0 — but the React adapter needs at least a render test (JSDOM via `@testing-library/react`) to prove `useDataTable` re-renders on subscription and doesn’t tear under `useSyncExternalStore`.
- **§14 exit criteria for M0**: “Controlled + uncontrolled state round-trips; type tests green.” — this is the test matrix I must hit. Nothing more.

### 2.4 Assumptions (applied during planning)

1. **M0 ships `DataTable` only**, not `PivotTable`. The spec’s §4.1 makes them separate types; M0 establishes the `DataTable` surface; `PivotTable` arrives in M4 and reuses the column model + registries (per §3 dependency direction).
2. **Column-derived getters return safe defaults** in M0 even when slice state is empty (`getSize()` → def `size` or 150; `getIsPinned()` → `false`; `getIsVisible()` → `true`; `getIsSorted()` → `false`; etc.). This lets M0 tests assert shape without requiring M1 pipeline code. M1+ fills in real behavior; the *shape* of these getters doesn’t change.
3. **No `getRowModel()` in M0** — the row pipeline (filter→sort→paginate) is M1. `getRowModel()` returns `TRow[]` (the input data) in M0 with a TODO comment that M1 will replace this with the pipeline output.
4. **No `getHeaderGroups()` / prop getters in M0.** Those depend on the row pipeline (cells) and prop-getter infrastructure (§6) and arrive in M1. The React adapter shell in M0 returns the instance itself; consumers can read state, but they can’t yet render.
5. **`useDataTable` uses `useSyncExternalStore`** (React 18+). The package’s peer dep is `react >=18.0.0`; this is the idiomatic store-tee primitive and avoids the snapshot-tearing footguns of `useState` + manual `subscribe`.
6. **No `announcer`, no `messages`, no `ScrollAdapter`/`SizeObserver`** in M0. All listed in §4.3 are deferred.
7. **Registry values for sorting/filter are registered by name** at module load (built-ins only); `register*` exports are provided for consumer extension but not required by M0 tests. Registry mutation during an instance’s lifetime is allowed but emits a dev-only warning (P3 wire — enforced at runtime when an inline function leaks into a controlled slice).
8. **Type tests use hand-rolled compile-time assertions** (`assertType<T>()` style), not `expect-type` — keeps the dependency surface to what we already have.

### 2.5 Out-of-scope items intentionally NOT in this plan

- `getRowModel()` with actual filter/sort/paginate — M1.
- `getHeaderGroups()`, `getVisibleCells()`, prop getters — M1.
- Virtualizer (built-in windowing math) — M2.
- Resize/pinning/focus/navigation — M2.
- `DataSource`/Level 1 orchestration — M3.
- Pivot + aggregator engine — M4.
- Worker engine — M5.
- Announcer, i18n messages, a11y validator — M6.
- `rowSelection` slice (recommended in §15) — v1.5.
- `serializeState`/`hydrateState` — v1.5.

---

## 3. Decisions made (and rationale)

| #  | Decision                                                                                          | Rationale                                                                                                              |
| -- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1  | **`createDataTable<TRow>(options): DataTableInstance<TRow>`** is the only top-level core export. | Matches §4.1 verbatim. No `createTable` alias (README currently says `createTable` — README fix is in scope for M0).    |
| 2  | **Controlled-slice contract implemented as a per-slice reducer map** + a single `applyChange()` dispatcher. | One dispatch path makes `onStateChange` semantics consistent across slices; easier to test in isolation.               |
| 3  | **Updater semantics**: `(old: T) => T` is invoked synchronously when a slice mutation is requested. The reducer returns the new value; the engine never applies `T`-shaped updaters directly (only when the consumer is uncontrolled). | Spec §4.2 says “the instance never mutates it internally — it _requests_ changes via the callback.” We must distinguish between (a) consumer passed a `T`-shaped initial state and (b) consumer passed an updater function. |
| 4  | **`Column` is a class** (not a plain object) with frozen getter methods. Def → derived happens once per options change; the array is memoized. | Stable identity matters for prop-getter comparison and for `useSyncExternalStore` snapshot equality.                    |
| 5  | **Registries are simple `Record<string, T>` modules** behind a frozen `Object.freeze()` export, plus a `get*` lookup that throws in dev for missing keys. | Matches the spec’s P3 (name-referenced serialization) without premature complexity (no namespace, no versioning).       |
| 6  | **`useDataTable` calls `setOptions` on every render via a `useRef` + effect-free render-phase write.** React 18 allows this for objects; we use a layout-effect-free pattern that survives StrictMode double-invoke by comparing references. | Spec §4.1 sketch shows `useDataTable(options)` returning a stable instance. The instance is created once; options are pushed on each render. |
| 7  | **Tests live alongside source as `*.test.ts(x)` files.** Vitest picks them up via the workspace config. The package `tsconfig.json` excludes `*.test.ts(x)` so they don’t break `tsc -b`. | Mirrors the existing `index.test.ts` smoke test pattern.                                                                |
| 8  | **Type tests are colocated** in `src/__types__/*.test-d.ts` and gated by a `tsc -b` step that runs after `pnpm typecheck`. They compile-fail on type regressions. | No `expect-type` dep needed; standard TS-only assertions. Vitest is not required to run type tests — `tsc -b` is the gate. |
| 9  | **No new runtime dependencies.** Plan adds zero `dependencies` to either package. | Keeps bundle size at M0 stub levels (≤ ~15kB target in §12). Adds nothing to lockfile.                                  |
| 10 | **`onStateChange` fires after the slice-specific callback**, in the same microtask, and only when the new state actually differs (shallow equality on slice keys that the consumer passed). | Spec §4.2 implies aggregate notifications; we don’t notify if nothing changed (idempotency saves `useSyncExternalStore` work). |

---

## 4. File inventory

### 4.1 New files (created in this plan)

```
packages/core/src/
  index.ts                              # public surface re-exports (replaces VERSION-only stub)
  index.test.ts                         # VERSION smoke test (kept); + adds public-surface re-export smoke test
  types.ts                              # all public types: Updater, SortingState, ColumnFiltersState, etc.
  types.test-d.ts                       # type tests for types.ts public surface
  columns.ts                            # ColumnDef → derived Column; Column class; column utilities
  columns.test.ts                       # unit tests for column derivation
  registries/
    sorting.ts                          # sortingFn type + built-ins (alphanumeric, text, number, datetime, basic)
    sorting.test.ts                     # unit tests for built-in sort functions
    filtering.ts                        # filterFn type + built-ins (includesString, equalsString, equals, inNumberRange, arrIncludes)
    filtering.test.ts                   # unit tests for built-in filter functions
    index.ts                            # barrel re-export of both registries
  state.ts                              # DataTableState type, slice reducers, applyChange dispatcher
  state.test.ts                         # unit tests for reducers + dispatcher
  createDataTable.ts                    # factory: createDataTable<TRow>(options) → instance
  createDataTable.test.ts               # round-trip tests: uncontrolled, controlled, mixed slices, subscribe
  utils.ts                              # small pure helpers (shallowEqual, identity, assertNever)
  utils.test.ts                         # unit tests for utils

packages/react/src/
  index.ts                              # public surface: useDataTable, re-exports from core
  index.test.ts                         # VERSION smoke + public surface re-export
  useDataTable.ts                       # React hook: wraps createDataTable, subscribes, calls setOptions on render
  useDataTable.test.tsx                 # render tests (controlled/uncontrolled/subscribe-notify) using @testing-library/react

# devDependency additions
packages/react/package.json             # add @testing-library/react + jsdom (or happy-dom) as devDeps
vitest.workspace.ts                     # no edit needed (both packages already listed)
vitest.config.ts                        # environment switch per workspace project (node for core, jsdom for react)
```

### 4.2 Files NOT created in this plan (deferred to later milestones)

- `packages/core/src/rowModel.ts`, `rowModel/filter.ts`, `rowModel/sort.ts`, `rowModel/paginate.ts` — M1.
- `packages/core/src/headers.ts`, `cells.ts`, `propGetters/*` — M1.
- `packages/core/src/virtualizer.ts` — M2.
- `packages/core/src/navigation.ts`, `focus.ts` — M2.
- `packages/core/src/announcer.ts`, `messages.ts` — M6.
- `packages/core/src/a11y/validateGridStructure.ts` — M6.
- `packages/pivot/**` — M4.
- `packages/worker/**` — M5.

### 4.3 Files modified (not created)

| File                                  | Change                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`          | Replace stub with full public surface re-exports. Keep `VERSION`.                                   |
| `packages/react/src/index.ts`         | Replace stub with full public surface: `useDataTable`, `VERSION`, and re-exported core types.        |
| `packages/react/package.json`         | Add devDependencies: `@testing-library/react@^16`, `jsdom@^25`.                                     |
| `vitest.config.ts`                    | Switch workspace projects to per-package environments (node for core, jsdom for react) or rely on per-package config. |
| `README.md` (root)                    | Update quick-start to use `createDataTable` instead of `createTable`.                                |
| `packages/core/README.md`             | Update quick-start to use `createDataTable` instead of `createTable`.                               |

---

## 5. Sequencing overview

Phases are ordered top-down so each step depends only on artifacts from earlier phases. Each phase ends with `pnpm verify` green.

| #  | Phase                                | Output                                                                | Verifies                                              |
| -- | ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 1  | Core types                           | `types.ts`, `utils.ts`, type tests                                     | `tsc -b` clean; type tests compile                    |
| 2  | Registries (sorting + filtering)     | `registries/sorting.ts`, `registries/filtering.ts`, unit tests        | Vitest green for built-ins                            |
| 3  | Column model                         | `columns.ts`, derived `Column`, unit tests                            | Column derivation matches defs; getters return defaults |
| 4  | State engine + factory               | `state.ts`, `createDataTable.ts`, round-trip tests                    | Controlled + uncontrolled round-trips green; subscribe notified |
| 5  | React adapter shell                  | `useDataTable`, render tests with `@testing-library/react`            | Hook returns stable instance; subscription fires re-render; tear-free under StrictMode |
| 6  | Public surface + final verification  | `index.ts` re-exports for both packages; README update; `pnpm verify` | `pnpm verify` green from clean tree; M0 exit criteria satisfied |

Sequencing rationale:
- Types first because every later module imports them; type tests catch public-API drift early.
- Registries before state because state reducers (sorting/filtering slice reducers) reference registry value types.
- Column model before factory because the factory constructs `Column` objects and exposes them.
- React adapter last among code phases because it depends on a stable instance contract from the factory.
- Verification last; one phase, all gates green.

---

## 6. Constraints / non-goals

- **No row pipeline.** `getRowModel()` returns input `data` in M0. M1 replaces it.
- **No prop getters.** M1.
- **No virtualization, no resizing, no pinning UI behavior.** Column model exposes *shape* (e.g., `getIsPinned()` returns the derived value from `columnPinning` slice), but pinning changes do not yet produce derived layout data. M2.
- **No `DataSource`, no server modes.** M3.
- **No `PivotTable`, no aggregator engine.** M4–M5. The `aggregators` registry stub is added in M4; M0 references the type only where unavoidable.
- **No `announcer`, no `messages`, no `ScrollAdapter`, no `SizeObserver`.** M6/M3.
- **No `rowSelection` slice.** Deferred to v1.5 per spec §15.
- **No new runtime dependencies in `@lynellf/tablekit-core`.** Dev-only deps allowed in `@lynellf/tablekit-react` for testing (already have `react` + `@types/react`).
- **No CI changes.** Lefthook pre-push continues to run `typecheck + lint + test + build`.
- **No breaking changes to existing types** — the M0 surface is additive; the existing `VERSION` export is preserved.

---

## 7. Risks and open questions

| Risk / Question                                                                                          | Disposition                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **`exactOptionalPropertyTypes` friction** with the controlled-slice contract (callbacks may be undefined or absent). | **Resolved**: callback fields are declared as `((updater: Updater<T>) => void) \| undefined`. Builders inside the factory tolerate absent callbacks. |
| **`noUncheckedIndexedAccess`** + registry lookup — `record[name]` is `T \| undefined`.                    | **Resolved**: registries expose `get(name)` that throws in dev on miss and returns `T` (asserted) in prod.        |
| **`verbatimModuleSyntax`** requires `import type` for type-only imports.                                 | **Resolved**: all type-only imports use `import type`; the Biome `useImportType` rule enforces this.              |
| **`useDataTable` under StrictMode double-invocation** — `setOptions` runs twice.                          | **Resolved**: `setOptions` is idempotent (reference equality on `options`); the second invocation is a no-op.      |
| **Memoization of `Column` array across renders** — cheap rebuild vs. deep memoization?                    | **Resolved in M0**: rebuild on `setOptions` only (cheap O(cols)); do not memoize column array between renders because that breaks the spec’s promise that consumers always observe the latest derivation. |
| **Type-test gating** — adding `*.test-d.ts` to source includes breaks the package tsconfig.              | **Resolved**: type tests are colocated but matched by a `vitest`-side glob (`typecheck` runs them via `tsc --noEmit` against an explicit project file in phase 6, not via the per-package tsconfig). |
| **`useSyncExternalStore` snapshot identity** — every `setOptions` creates a new state object.            | **Resolved**: factory keeps a cached `_state` and returns the same reference until state actually changes (shallow slice-equality short-circuit). |
| **README `createTable` mismatch** — README claims `createTable` exists.                                   | **Resolved**: README update is in scope for phase 6.                                                              |
| **`jsdom` bundle weight** in CI                                                                         | **Resolved**: `jsdom` is a devDep of `@lynellf/tablekit-react` only, not a runtime dep; CI is unaffected at install time other than ~5MB of extra disk. |
| **Biome `useExhaustiveDependencies`** with `useEffect` deps for subscriptions.                          | **Resolved**: subscription is wired through `useSyncExternalStore`’s `subscribe` argument; the hook’s own `useEffect`-free pattern avoids the rule. |
| **Aggregate `onStateChange` firing on no-op slice updates.**                                             | **Resolved**: shallow slice-equality short-circuit (decision #10).                                                |

---

## 8. Verification plan (final acceptance)

After all phases complete, a fresh clone must pass:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                          # typecheck + lint + test + build
pnpm test                                            # see the new M0 test suites green
node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m)))"
# Expected: ['createDataTable', 'VERSION', ...public-surface re-exports]
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

### 8.1 M0-specific verification commands

```bash
# 1. Public API smoke test (compile-time + runtime)
pnpm --filter @lynellf/tablekit-core test            # unit + round-trip tests
pnpm --filter @lynellf/tablekit-react test           # hook render tests

# 2. Type surface regression
pnpm typecheck                                       # all *.test-d.ts files compile

# 3. Build
pnpm --filter @lynellf/tablekit-core build           # dist/tablekit-core.es.js + .d.ts
pnpm --filter @lynellf/tablekit-react build          # dist/tablekit-react.es.js + .d.ts
```

### 8.2 M0 exit criteria mapping (spec §14)

| Spec criterion                                | How this plan proves it                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Controlled + uncontrolled state round-trips** | `createDataTable.test.ts`: uncontrolled set→get, controlled state+callback round-trip, mixed slice control, subscribe notifies on actual change only. |
| **Type tests green**                           | `types.test-d.ts`: type-level assertions for `Updater<T>`, `ColumnDef<TRow, TValue>` inference, `DataTableState` slice shape, options inference.  |

---

## 9. Knowledge candidates (for `okf-curator`)

- **`docs/core-engine/overview.md`**: durable architecture decision about `Column` as a frozen-getter class with stable identity across `setOptions`. Evidence: phase 3 design + decision #4.
- **`docs/core-engine/phase-4-*.md`**: durable telemetry field semantics around when `onStateChange` fires (shallow-equality short-circuit, dispatch order). Evidence: state engine design + decision #10.
- **`docs/core-engine/phase-5-*.md`**: durable React adapter pattern for `useDataTable` (useSyncExternalStore + per-render `setOptions`). Evidence: hook implementation.

(These are emitted to the orchestrator, not edited into `.okf/` directly. `okf-curator` writes the actual files.)

---

## 10. Phase index

1. [`phase-1-core-types.md`](./phase-1-core-types.md) — `types.ts`, `utils.ts`, type tests.
2. [`phase-2-registries.md`](./phase-2-registries.md) — Sorting + filtering registries with built-ins.
3. [`phase-3-column-model.md`](./phase-3-column-model.md) — `Column` derivation from `ColumnDef`.
4. [`phase-4-state-engine-and-factory.md`](./phase-4-state-engine-and-factory.md) — `state.ts` reducers + `createDataTable.ts` factory + round-trip tests.
5. [`phase-5-react-adapter-shell.md`](./phase-5-react-adapter-shell.md) — `useDataTable` hook + render tests.
6. [`phase-6-public-surface-and-verification.md`](./phase-6-public-surface-and-verification.md) — `index.ts` re-exports, README fix, final `pnpm verify` green.