# M3: Server Modes — Plan Overview

**Slug:** `m3-server-modes`
**Milestone:** M3 (per `docs/initial-spec.md` §14)
**Status:** Draft v1 for review — decisions D1–D6 resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** Level 1 DataSource orchestration (`DataSource<TRow>`, `createClientDataSource`, `useDataSource`), `RowsQuery` serialization contract, mixed-mode warnings, loading/aria-busy contract (placeholder rows + announcer + status state), reference app demonstrating server pagination + sort + filter (§14 exit criterion).
**Scope resolution:** The target is **M3: Server modes** per `docs/initial-spec.md` §14 row 4 (*"`manual*` semantics, DataSource + `useDataSource`, loading/aria-busy contract — Mixed-mode warnings; server pagination/sort/filter reference app"*). The M0/M1/M2 work is complete: state engine, registries, controlled-slice contract, row pipeline, virtualization, pinning, resize, keyboard nav, validator (~302 tests green, `pnpm verify` clean, M2 `api-freeze.md` approved; see [`docs/archive/m2-advanced-features/plan-summary.md`](../archive/m2-advanced-features/plan-summary.md) and [`docs/archive/m2-advanced-features/ARCHIVE-MANIFEST.md`](../archive/m2-advanced-features/ARCHIVE-MANIFEST.md)). M3 extends that surface additively; no M0/M1/M2 export is renamed, removed, or signature-changed. The `manualSorting`/`manualFiltering`/`manualPagination` options and `rowCount` are already declared on `DataTableOptions` and already honored by the M2 pipeline (see `packages/core/src/pipeline/rowModel.ts` and `createDataTable.ts:368-379`); M3 hardens their semantics, adds the mixed-mode trap warning (§5.3), and layers the Level 1 `DataSource` orchestrator on top.

**Out of scope (deferred):**

- Caching, retries, deduplication, debouncing, request batching inside the library — spec §5.2 explicit non-goal ("Consumer owns those e.g. implement `getRows` with TanStack Query. Level 1 stays thin so it never becomes a data framework."). Consumers pair `useDataSource` with TanStack Query / SWR / RTK Query.
- `PivotTable`, aggregators, totals, expansion — M4.
- Worker engine + protocol + data store — M5.
- Server engine contract for pivot (`computeChildren`) — M5 (Pivot §9.5).
- Full announcer `messages` map + i18n + politeness heuristics — M6.
- Screen-reader manual matrix (NVDA+Chrome, etc.) — M6 release gate.
- `rowSelection`, subtotals, state persistence, DnD reorder — v1.5.
- `validateGridStructure` CLI / layered diagnostics / runtime dev-mode auto-run — M6 polish.

---

## 1. Goal

Land M3 per the spec: *"`manual*` semantics, DataSource + `useDataSource`, loading/aria-busy contract"*. Exit criteria (spec §14): **mixed-mode warnings** + **server pagination/sort/filter reference app**.

Concretely:

1. **`RowsQuery` serialization contract** — A pure helper `buildRowsQuery(state, opts)` that produces the JSON-serializable outbound query per spec §5. `SortingState` carries `{ id, desc }`. `ColumnFiltersState` items carry the **name** of the registered `filterFn` (never an inline function); the registry name is what crosses the wire. Inline functions used as `sortingFn`/`filterFn` emit a dev warning when the consumer flips the relevant capability to `'server'`. Pagination is included when `manualPagination=true`.
2. **Mixed-mode trap detection** — A `validateModeConfiguration(opts)` helper invoked from `createDataTable` (and `useDataSource` when its `source` is provided) that emits a one-shot dev `console.warn` when `manualPagination === true` AND (`manualSorting === false` OR `manualFiltering === false`) AND `allowWithinPageOperations` is unset/false. The warning text names the footgun ("client-side sort/filter on a server-paginated dataset only operates within the current page") and points at the opt-in flag. Production strips the warning (process env check).
3. **`DataSource<TRow>` interface + `createClientDataSource`** — Level 1 orchestration seam (spec §5.2). `DataSource<TRow>` declares `capabilities: { sort, filter, paginate: Capability }` and `getRows(q: RowsQuery, ctx: { signal: AbortSignal }): MaybePromise<{ rows: TRow[]; totalRowCount?: number }>`. `createClientDataSource(rows, opts?)` resolves everything synchronously in-memory (filters via `filterRows`, sorts via `sortRows`, paginates via `paginateRows`) — the reference implementation against which real server sources are written.
4. **`useDataSource(table, source)` hook** (React adapter) — Derives the `manual*` flags from `source.capabilities`, watches the relevant state slices (`sorting`, `columnFilters`, `pagination`), builds `RowsQuery` from each change, aborts the in-flight request via `AbortController`, calls `source.getRows(query, { signal })`, manages `status: 'idle' | 'loading' | 'error' | 'success'` (mapped to `loading`/`error`/`success`+`idle` per spec §5.2 wording) plus `error` and `refetch()`. While loading, the grid root emits `aria-busy="true"`, and the instance can expose placeholder rows. Exposed via the `dataSource` option on `useDataTable` as well (for ergonomics; spec §5.2: "or the `dataSource` option").
5. **Loading/aria-busy contract** — Spec §10: `aria-busy` on the root during Level 1 loading; placeholder/loading rows exposed so loading is perceivable; load completion announced with result counts ("Loaded 128 rows"). Implementation: `getGridProps()` emits `aria-busy={status === 'loading' ? 'true' : 'false'}`; `getRowModel()` synthesizes N placeholder `Row<TRow>` objects (`id: '__placeholder_<index>'`, `original: {}`) when `placeholderCount > 0`; the announcer receives "Loaded N rows" on each successful fetch. Error path: `aria-invalid="true"` on the root, error accessible via `table.getDataSourceState().error`.
6. **Reference app** — A runnable Vite app under `examples/m3-server-modes/` demonstrating the three Level 1 server patterns (server pagination only; server pagination + server sort; server pagination + server filter), the mixed-mode trap (server pagination + client sort with explicit `allowWithinPageOperations: true` and a counterfactual without), loading skeletons, error/retry UX, and the §12 perf budget mark for "render new page < 16ms after data arrives". Spec §13 calls this a "reference app" — it is the §14 exit criterion.
7. **Serialization golden tests** — Per spec §13 ("Serialization contract tests: `RowsQuery`/`PivotQuery` golden files"). Stable JSON shape for the outbound query across sorts, multi-sort, filters (single + range), pagination, and the empty state. Pinned columns and visibility slices are deliberately excluded from `RowsQuery` (they are presentation concerns, not query concerns). The registry name rule (no inline fns leaking into the query) is asserted at runtime with a dev warning.

The deliverable from a fresh clone: `pnpm verify` exits 0; M3 tests pass; the M3 reference app boots and demonstrates server pagination/sort/filter; the §14 exit criteria are satisfied.

---

## 2. What I found (investigation notes)

### 2.1 Sources reviewed

- `docs/initial-spec.md` — §4.3 (dependency-inversion seams; registry name rule), §5 (Data layer, Levels 0 and 1, mixed-mode resolution), §7.4 (server sorting — `RowsQuery` carries `SortingState`), §7.4 + §8.1 (server filter — `RowsQuery.filters` carry filterFn names), §8.2 (server pagination — `manualPagination` + `rowCount`), §10 (aria-busy + announcer for async states), §12 (perf: "render new page < 16ms after data arrives"), §13 (serialization contract tests + registry-name dev warnings), §14 (M3 row + exit criteria).
- `docs/archive/m2-advanced-features/overview.md` + phase files — established the phase-file format and decision rationale pattern M3 will reuse; pin/file naming conventions; `pnpm verify` gate.
- `docs/archive/m2-advanced-features/api-freeze.md` — the public API surface M3 must preserve.
- `packages/core/src/{createDataTable,columns,headers,rows,propGetters,types,state,visibility,ordering,events,announcer}.ts` — current source state.
- `packages/core/src/pipeline/{filter,sort,paginate,rowModel,memo}.ts` — the M2 pipeline already honors `manualSorting`/`manualFiltering`/`manualPagination`.
- `packages/core/src/registries/{sorting,filtering}.ts` — registry pattern: built-ins frozen + mutable `customSortingFns`/`customFilterFns` lookup. Inline functions are accepted today (per `ColumnDef.sortingFn: string | SortingFn<TRow>`); M3 adds the dev warning when an inline function is paired with a `'server'` capability.
- `packages/react/src/{useDataTable,ReactAnnouncer,index}.ts(x)` — `useDataTable` already calls `table.setOptions(options)` on every render and exposes an `Announcer` component. M3 threads the new `dataSource` option through `useDataTable` and adds `useDataSource`.
- `.okf/components/dev-tooling-stack.md` — tooling decisions (pnpm 10, Vite 5, Vitest 2, Biome 1.9, TS 5.6.3 strict).

### 2.2 Verified facts

- **`manualSorting`/`manualFiltering`/`manualPagination` options are declared on `DataTableOptions` (M0) and honored by the M2 pipeline.** `packages/core/src/pipeline/rowModel.ts:46-56` shows the conditional skips; `packages/core/src/createDataTable.ts:368-379` shows the same logic inlined for `getRowModel()`. M3 does **not** change the pipeline; it hardens the mixed-mode warning and adds the Level 1 layer on top.
- **`rowCount` is declared and routed through `getRowCount()` / `getPageCount()` for `manualPagination=true`.** M2 already derives `aria-rowcount` from it (see `createDataTable.ts` `getRowCount`).
- **`getRowId` is required in production** (M1 hardened `defaultGetRowId` with a dev warning). Server modes depend on stable row ids — M3 relies on this and adds an additional check: if `dataSource` is provided and `getRowId` resolves to the dev fallback, emit a dev warning on first fetch (one-shot, like the existing `defaultGetRowId` warning).
- **Registries (`sorting`, `filtering`) carry built-ins + custom registrations.** M3 needs `nameOfSortingFn(fn)` / `nameOfFilterFn(fn)` reverse-lookup helpers to assert that outbound `RowsQuery.filters` carry names, not inline functions. The current registries don't expose this reverse lookup (lookup is name → fn). M3 adds a `nameOfSortingFn<TRow>(fn)` / `nameOfFilterFn<TRow>(fn)` helper that searches both maps and returns the name or `undefined`.
- **`Announcer` seam is in place.** M1's `ReactAnnouncer` mounts a visually-hidden `aria-live="polite"` `output` element; M2 routes announcements through `instance.announce(msg)`. M3 reuses this seam — "Loaded 128 rows" announces through the same channel. No new announcer infrastructure needed.
- **`React 19` + `useSyncExternalStore` are the subscription primitives.** M3's `useDataSource` follows the same pattern as `useDataTable` (subscribe + getSnapshot). `useDataSource` adds an internal `useEffect` that subscribes to state changes and triggers fetches; the result is exposed through a state object that `useSyncExternalStore` reads.
- **`verbatimModuleSyntax`** is on. All type-only imports across M3 phase files use `import type`.
- **`noUncheckedIndexedAccess`** is on. `RowsQuery` builders iterate ordered fields with `for…of`; abort-controller state uses `null | AbortController`.
- **`exactOptionalPropertyTypes`** is on. Optional fields that may legitimately be omitted use the convention `key?: T` (not `T | undefined`); `totalRowCount` in the `getRows` return type uses `?: number`.
- **No DOM in core** is the load-bearing boundary from M0. `createClientDataSource`, `buildRowsQuery`, and `validateModeConfiguration` are pure functions; no React, no DOM. The React adapter hosts `useDataSource`.
- **Examples directory does not exist yet.** M3 introduces `examples/m3-server-modes/` (a fresh Vite app under pnpm workspaces, isolated dependencies) to host the reference app. The existing `examples/` directory is empty; this is the first example.
- **`useDataTable`'s `Announcer` is a function component returned from the hook.** Consumers render `<Announcer />` once. M3's `useDataSource` does not change the announcer; it just routes the new "Loaded N rows" message through `instance.announce()`.

### 2.3 Spec implications for M3 design

- **§5.1 — Level 0 is the primitive.** The `manual*` flags work today via pipeline skip. M3 hardens the contract: docs (api-freeze) call out that mixed-mode is legal but warns about the trap. `getRowCount()` returns `rowCount` when `manualPagination=true`; this is already correct.
- **§5.2 — Level 1 wraps Level 0.** `DataSource` interface + `createClientDataSource` + `useDataSource` are the deliverables. The hook derives `manual*` from `source.capabilities`, watches relevant state slices, builds `RowsQuery`, aborts stale requests, exposes `status`/`error`/`refetch`. While loading, "the row model can expose placeholder rows (count = `pageSize`) so consumers can render skeletons."
- **§5.3 — Mixed modes are legal but warn.** `paginate: 'server' + sort/filter: 'client'` is the footgun. Library emits a dev warning unless `allowWithinPageOperations: true`. The §16 risk #10 says "consider hard-gating behind the opt-in flag permanently" — for v1 the warning suffices; a hard gate is M6/v2 discussion.
- **§7.4 — Server sorting.** `RowsQuery.sorting: SortItem[]` is `{ id, desc }` — no function references cross the wire.
- **§7.4 / §8.1 — Server filter.** `RowsQuery.filters: ColumnFilterItem[]` is `{ id, value }` where the `ColumnFilterItem.id` is the **column id** AND the outbound query includes the `filterFn` name separately. Spec §5.1: "`filters: ColumnFiltersState; // values + filterFn *names*`". Implementation: serialize filter as `{ id, value, filterFn?: string }` where `filterFn` is the registry name (omitted when the column's `filterFn` resolves to `equals` or matches the column default). Spec §13 makes the runtime check: "registry-name resolution (P3) enforced by types _and_ runtime dev warnings when inline functions leak into serializable queries."
- **§8.2 — Server pagination.** `manualPagination` + `rowCount` + the page slice is the consumer's responsibility. The instance never slices.
- **§10 — Async UX.** `aria-busy` on root during Level 1 loading; placeholder rows so loading is perceivable; load completion announced with counts ("Loaded 128 rows"). Errors surface as `node.error` analogues (for DataTable: root `aria-invalid="true"` + consumer renders error UI).
- **§12 perf.** "DataTable, server pagination: render new page < 16ms after data arrives." This is a measurement, not a hard gate; the reference app reports the time in the UI (a small dev-only badge) and a micro-benchmark in the bench suite captures it.
- **§13 testing.** Serialization golden files for `RowsQuery`; registry-name dev warnings; the standard pure-function coverage for the pipeline helpers.

### 2.4 Assumptions (applied during planning)

1. **`DataSource` interface and `createClientDataSource` live in `packages/core/src/dataSource/`**. The interface is framework-free; `createClientDataSource` is a pure factory. The new subpath `@lynellf/tablekit-core/dataSource` exposes them tree-shakeably, mirroring M2's per-feature subpaths.
2. **`useDataSource` lives in `packages/react/src/useDataSource.ts`**. It is React-specific (uses `useEffect`, `useState`, `useSyncExternalStore`). The hook wraps `useDataTable` rather than being a peer; consumers who want server modes use `useDataTable({ ..., dataSource })` and the hook internally orchestrates fetches. A standalone `useDataSource(table, source)` variant is also exported for consumers who manage their own `useDataTable` instance (e.g., for advanced compositions).
3. **`RowsQuery` shape is the spec's shape verbatim:** `{ sorting: SortItem[]; filters: SerializedFilter[]; pagination?: PaginationState }`. `SerializedFilter = { id: string; value: unknown; filterFn?: string }`. The serializer strips `filterFn` from items whose `filterFn` is the registered `equals` default (saves bytes; consumers can always include it explicitly).
4. **Status state machine:** `'idle' | 'loading' | 'success' | 'error'`. Mapping to spec §5.2 wording ("`status: 'idle' | 'loading' | 'error'`"): `idle` covers "no fetch in flight, no error, no fresh data"; `success` is "previous fetch completed, data is fresh, no error in flight" — needed because `useDataTable`'s row model reads from `data` and we need to know whether to render `data` or placeholder rows. The spec lists three states but four are clearer for the implementation; the public type uses the four-state model and `idle` maps to "no data, no error, no loading".
5. **AbortController ownership.** The `useDataSource` hook holds a single `AbortController` per fetch; on every relevant state change it calls `controller.abort()` then creates a new one and calls `source.getRows(query, { signal })`. Stale fetches are dropped on the consumer side via `signal.aborted` checks (the reference implementation does this; the doc tells consumers to do the same).
6. **Placeholder rows.** The instance exposes `table.setPlaceholderCount(n: number)` (or accepts `placeholderRows: number` on the `DataSource` state returned by `useDataSource`). When `placeholderCount > 0`, `getRowModel()` returns `n` synthetic rows with `id: '__placeholder_<index>'`, `original: {} as TRow`, `index: 0..n-1`. The `__placeholder_` prefix prevents collision with real ids (real ids are consumer-controlled). Renderers see the placeholder and render skeletons.
7. **Registry name reverse lookup** lives in `packages/core/src/registries/` — new exports `nameOfSortingFn<TRow>(fn)` and `nameOfFilterFn<TRow>(fn)` that scan the same `customSortingFns` / `builtInSortingFns` maps. Returns `string | undefined`. The dev warning fires when a column's `sortingFn` or `filterFn` is an inline function AND the relevant capability is `'server'`.
8. **Mixed-mode warning** fires once per `createDataTable` instance (one-shot, like `defaultGetRowId`'s warning). The check runs in the constructor and again on `setOptions` whenever the option set changes. Production (`process.env.NODE_ENV === 'production'`) suppresses the warning entirely. The text reads: `"[tablekit] Server pagination with client-side sort/filter applies within the current page only. Set allowWithinPageOperations: true to confirm this intent, or set manualSorting/manualFiltering to true."`
9. **The `dataSource` option on `useDataTable`** is sugar over the standalone `useDataSource` hook. `useDataTable({ ..., dataSource })` is equivalent to calling `useDataSource(table, source)` inside the same component. Both forms are tested. The `dataSource` option is preferred (single hook call, lower ceremony); the standalone hook is exported for advanced cases.
10. **Reference app architecture.** A fresh Vite + React 19 app under `examples/m3-server-modes/`. Adds `examples` to `pnpm-workspace.yaml` (already `packages/*`, but `examples/*` is a separate concern). The app uses `@lynellf/tablekit-react` from the workspace (via `link-workspace-packages=true` in `.npmrc`); data source is a `vi`-style fake that returns synthetic rows after a configurable delay (default 300ms) with a `signal` that respects `AbortController`. Three panels: server pagination only, server pagination + server sort, server pagination + server filter; a fourth panel demonstrates the mixed-mode trap with and without `allowWithinPageOperations`.
11. **Serialization golden tests** snapshot `buildRowsQuery(state, { columns, capabilities })` against fixed inputs in `packages/core/src/dataSource/__tests__/rowsQuery.golden.test.ts`. The test asserts byte-equal JSON against committed fixtures; changes to `RowsQuery` shape require updating the fixtures.
12. **`getGridProps()` / `getBodyProps()` gain `aria-busy` + `aria-invalid` attributes in this milestone**, but only when a `dataSource` is wired. Without a data source, the attributes are absent (preserving M0/M1/M2 behavior).

### 2.5 Out-of-scope items intentionally NOT in this plan

- **Caching / retries / deduplication / debouncing** — spec §5.2 explicit non-goal; consumers own these via TanStack Query / SWR.
- **`PivotTable` + treegrid + server engine contract for expansion** — M4/M5.
- **Worker engine** — M5.
- **Full announcer `messages` map + i18n** — M6.
- **Screen-reader manual matrix** — M6 release gate per §13.
- **CLI validator; layered diagnostics** — M6.
- **`rowSelection`, subtotals, state persistence, DnD reorder, global quick filter** — v1.5 or v2.
- **`validateGridStructure` auto-run on every render in dev** — M6.
- **Hard gate behind `allowWithinPageOperations`** — v2 discussion per §16 risk #10.
- **In-source `debounce` for `useDataSource`** — spec §16 risk #7 says "currently consumer-owned to keep the layer thin; revisit if every consumer writes the same debounce." M3 does not add it; a follow-up consumer survey is the trigger.

---

## 3. Decisions made (and rationale)

The six open decisions identified below are resolved here. Each includes the include/defer choice, the rationale, and the consequence for downstream phases.

### Decision D1 — Where does `DataSource` live? **CORE; `useDataSource` IN REACT**

**Rationale:** Spec §5.2 calls out the interface (DataSource), the factory (createClientDataSource), and the hook (useDataSource) as separate concerns. The interface and factory are framework-free pure code; the hook is React-specific. Mirroring the existing core/react split keeps the load-bearing "no React in core" boundary intact and lets `createClientDataSource` be tested with vanilla Vitest (no jsdom) and consumed by any framework that builds an adapter.

**Consequence:** Phase 2 ships `packages/core/src/dataSource/{types.ts,client.ts,query.ts,warnings.ts}` and re-exports via `@lynellf/tablekit-core/dataSource` subpath. Phase 3 ships `packages/react/src/useDataSource.ts` and re-exports from `@lynellf/tablekit-react`. `useDataTable` gains a `dataSource?: DataSource<TRow>` option that internally calls `useDataSource`.

### Decision D2 — `RowsQuery` shape: **PER-SPEC VERBATIM**

**Rationale:** Spec §5.1 gives the shape explicitly: `{ sorting, filters, pagination? }` with the note "`filters: ColumnFiltersState; // values + filterFn *names*`". M3 uses the spec's shape verbatim and surfaces `filterFn` on each filter item. The serializer strips `filterFn` only when it equals the column default (saves bytes without changing semantics).

**Consequence:** Phase 1 ships `SerializedFilter = { id: string; value: unknown; filterFn?: string }` and `buildRowsQuery(state, opts): RowsQuery`. The dev warning fires when a column has an inline `sortingFn`/`filterFn` and the relevant capability is `'server'`.

### Decision D3 — Status state machine: **FOUR STATES (`idle | loading | success | error`)**

**Rationale:** Spec §5.2 lists three states (`idle | loading | error`), but `idle` and `success` are different things — `idle` means "no data, no error, no fetch in flight"; `success` means "data is fresh, no error". `getRowModel()` needs to know which to render (`data` vs. placeholder rows). The four-state model is unambiguous and aligns with React Query's mental model. The public type exposes all four; `useDataSource`'s return type narrows `'success' | 'idle'` to a single `data: TRow[]` field with `null` when not in `'success'`.

**Consequence:** Phase 3 ships `DataSourceState<TRow> = { status: 'idle' | 'loading' | 'success' | 'error'; data: TRow[] | null; error?: Error; totalRowCount?: number; refetch: () => void }`. `error` is `undefined` unless `status === 'error'`.

### Decision D4 — Mixed-mode enforcement: **DEV WARNING ONLY (NOT HARD GATE)**

**Rationale:** Spec §5.3 says "The dev build warns on the `paginate: 'server'` + `sort/filter: 'client'` combination unless `allowWithinPageOperations: true` is set." The §16 risk #10 raises the question of a hard gate; the spec does not commit to one. M3 ships the dev warning (spec-literal), not the hard gate (v2 discussion). The warning text names the trap and points at the opt-in flag, mirroring how `defaultGetRowId` warns.

**Consequence:** Phase 1 ships `validateModeConfiguration(opts)` that fires once per instance in dev. The check is mirrored in `useDataSource` so consumers wiring a `DataSource` directly also see it.

### Decision D5 — Loading UX: **PLACEHOLDER ROWS + `aria-busy` + ANNOUNCER**

**Rationale:** Spec §10: "`aria-busy` on the root (Level 1 loading); skeleton/placeholder rows are exposed so loading states are perceivable, and load completion is announced with result counts." M3 ships all three: `aria-busy="true"` on root when loading, N placeholder rows (configurable via `placeholderRows` option), and "Loaded N rows" announcement on success.

**Consequence:** Phase 4 wires `getGridProps()` to emit `aria-busy` / `aria-invalid` based on `dataSourceState.status`; phase 4 adds `placeholderCount` plumbing through `getRowModel()`. The announcer message routes through the existing `Announcer` seam.

### Decision D6 — Reference app: **FRESH VITE APP UNDER `examples/m3-server-modes/`**

**Rationale:** Spec §14 exit criterion is a "server pagination/sort/filter reference app". M2 already establishes that examples are isolated workspaces (`packages/*` is the source of truth; examples are demonstration, not publishable). M3 introduces `examples/m3-server-modes/` as the first example, demonstrating three patterns + the mixed-mode trap + loading/error UX + a 16ms-perf badge.

**Consequence:** Phase 5 ships a fresh `examples/m3-server-modes/` Vite + React 19 app, wired to workspace sources via pnpm's `link-workspace-packages=true`. The app is not part of `pnpm verify` (it has its own `pnpm dev` / `pnpm build` scripts); CI smoke-runs it via `pnpm --filter m3-server-modes-example build` to catch dependency-resolution regressions. The smoke gate is documented but not blocking for v1.

### Summary of decisions

| # | Decision | Choice | Why |
| -- | -------- | ------ | --- |
| D1 | `DataSource` location | **CORE; `useDataSource` IN REACT** | Framework-free pure logic in core; React hook in react. Mirrors M0/M1 boundary. |
| D2 | `RowsQuery` shape | **PER-SPEC VERBATIM** | Spec §5.1 shape is the contract; dev warning on inline-fn leak per §13. |
| D3 | Status state machine | **FOUR STATES** | `idle` and `success` differ; `getRowModel` needs to know which to render. Aligns with TanStack Query. |
| D4 | Mixed-mode enforcement | **DEV WARNING ONLY** | Spec §5.3 + §16 risk #10 — warning, not gate. |
| D5 | Loading UX | **PLACEHOLDER ROWS + `aria-busy` + ANNOUNCER** | Spec §10 verbatim. |
| D6 | Reference app | **FRESH `examples/m3-server-modes/`** | Spec §14 exit criterion. |

Full file contents, command sequences, and verification steps for each decision live in the per-phase files (§4).

---

## 4. Architecture overview

### 4.1 New surface in `packages/core` (dataSource subpath)

```
packages/core/src/dataSource/
├── types.ts            # DataSource<TRow>, DataSourceCapabilities, Capability, SerializedFilter, RowsQuery, DataSourceState, MaybePromise
├── client.ts           # createClientDataSource(rows, opts?) — synchronous in-memory implementation
├── query.ts            # buildRowsQuery(state, opts) — serializes state → RowsQuery; nameOfSortingFn / nameOfFilterFn reverse lookups
├── warnings.ts         # validateModeConfiguration(opts) — fires one-shot dev warning on the mixed-mode trap
├── placeholderRows.ts  # synthesizePlaceholderRows(n) — N synthetic rows with id '__placeholder_<i>', original: {}
├── index.ts            # Barrel re-export
└── __tests__/
    ├── query.test.ts                 # RowsQuery serialization unit tests
    ├── query.golden.test.ts          # Snapshot golden files for spec §13
    ├── client.test.ts                # createClientDataSource end-to-end (filter + sort + paginate)
    ├── warnings.test.ts              # Mixed-mode trap detection
    ├── placeholder.test.ts           # Placeholder row shape + id uniqueness
    └── integration.test.ts           # Full pipeline: createClientDataSource + createDataTable + state changes
```

Subpath export: `@lynellf/tablekit-core/dataSource` (added to `packages/core/package.json`'s `exports` map + `vite.subpaths.config.ts`).

### 4.2 New surface in `packages/react`

```
packages/react/src/
├── useDataSource.ts                # Standalone hook (advanced use)
├── useDataSource.test.tsx          # Hook unit tests (fake timers, vi.fn() data source)
├── useDataTable.ts                 # + `dataSource?: DataSource<TRow>` option (sugar)
└── __integration__/
    ├── server-pagination.test.tsx           # End-to-end: server pagination + aria-busy + placeholder rows
    ├── server-sort.test.tsx                 # End-to-end: server sort (RowsQuery carries sort)
    ├── server-filter.test.tsx               # End-to-end: server filter (RowsQuery carries filter + filterFn name)
    ├── mixed-mode-warning.test.tsx          # console.warn captured; allowWithinPageOperations suppresses
    ├── abort-stale.test.tsx                 # AbortController aborts in-flight fetch on state change
    └── loading-announcer.test.tsx           # "Loaded N rows" announces via the live region
```

### 4.3 New example (reference app)

```
examples/m3-server-modes/
├── package.json              # Vite 5 + React 19 + workspace deps
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx              # Mounts the demo
│   ├── App.tsx               # Tabs: pagination / sort / filter / mixed-mode trap / perf badge
│   ├── fakeServer.ts         # Synthetic data source with configurable delay + signal
│   ├── DemoPanel.tsx         # One panel per pattern
│   ├── styles.css            # Skeleton styles + perf badge
│   └── useFakeDataSource.ts  # Wraps createClientDataSource with a setTimeout for demo realism
└── README.md                 # How to run; what to look for
```

### 4.4 Data flow (Level 1)

```
Consumer component
   │
   ├── const { table, state, dataSourceState, Announcer } = useDataTable({
   │     data: dataSourceState.data ?? [],   // <-- new field
   │     columns,
   │     dataSource: myServerSource,         // <-- new option
   │     // manual* flags derived from dataSource.capabilities inside useDataSource
   │   })
   │
   │   <Announcer />
   │   <div {...table.getGridProps()}>      // aria-busy="true" while loading
   │     ...
   │
   └── useDataSource(table, myServerSource)  // <-- standalone alternative
         │
         │ subscribes to table state changes (sorting, columnFilters, pagination)
         │ aborts in-flight fetch on each change
         │ calls myServerSource.getRows(query, { signal })
         │ updates dataSourceState: status, data, error
         │ calls instance.setOptions({ data: dataSourceState.data ?? [], manual*: ... })
         │ calls instance.announce("Loaded N rows") on success
```

### 4.5 Validation timeline

- After phase 1: `pnpm --filter @lynellf/tablekit-core test` passes with the new query/warnings/placeholder tests; `pnpm verify` exits 0.
- After phase 2: `pnpm --filter @lynellf/tablekit-core test` passes with the client data source tests; `@lynellf/tablekit-core/dataSource` subpath is importable and tree-shakes correctly.
- After phase 3: `pnpm --filter @lynellf/tablekit-react test` passes with the hook tests; `dataSource` option on `useDataTable` works.
- After phase 4: integration tests in `__integration__/` cover server pagination, sort, filter, mixed-mode warning, abort-stale, and announcer paths.
- After phase 5: `examples/m3-server-modes/` builds (`pnpm --filter m3-server-modes-example build`) and dev-serves (`pnpm --filter m3-server-modes-example dev`); §12 perf badge reports `< 16ms` per page render.

---

## 5. Risks and unknowns

1. **AbortController race conditions.** A `setOptions` call may race with an in-flight fetch; the hook must guard against applying stale results to fresh state. Mitigation: each fetch captures the controller it was started with and bails out if `signal.aborted === true` before applying the result. Test: `abort-stale.test.tsx` fires a state change mid-fetch and asserts the stale fetch's result is dropped.

2. **`placeholderRows` count change during loading.** If `placeholderCount` changes while loading (e.g., `pageSize` changes), the synthetic rows must reflect the new count. The simplest model: `placeholderCount` is derived from `state.pagination.pageSize` by default; consumers can override. Test: a unit test for `synthesizePlaceholderRows` + an integration test that flips `pageSize` mid-fetch.

3. **`buildRowsQuery` shape stability.** Spec §13 names serialization golden files; any change to `RowsQuery` shape is a breaking API change. Mitigation: commit fixtures under `__tests__/fixtures/rowsQuery/*.json` and assert byte-equal output. The serializer is a pure function with no hidden inputs.

4. **Mixed-mode warning noise.** Some consumers intentionally mix modes for legitimate reasons; the warning should not become background noise. Mitigation: one-shot per instance, clear text naming the flag to set, and `allowWithinPageOperations: true` silences it. The reference app demonstrates the right pattern.

5. **`useDataSource` with controlled slices.** When `useDataTable`'s `state.sorting` is controlled by the consumer (i.e., the consumer owns the slice), `useDataSource`'s state subscriptions still trigger fetches when the slice changes — the consumer's update path runs first. The hook doesn't need to know about controlled vs uncontrolled; it observes via `table.subscribe`. Test: a controlled-slice variant of `server-sort.test.tsx`.

6. **`getRowId` + placeholder rows.** Placeholder rows use synthetic ids (`__placeholder_<index>`); the dev warning for missing `getRowId` should NOT fire when the row is a placeholder. Mitigation: `defaultGetRowId` only fires when the row is a real consumer row; placeholders bypass the helper entirely.

7. **Reference app dependency resolution.** The new `examples/m3-server-modes/` package depends on `@lynellf/tablekit-react` from the workspace. CI must run `pnpm install` from the root before the example builds. Mitigation: `pnpm-workspace.yaml` gains `examples/*` (or `examples/m3-server-modes`); root `package.json`'s `pnpm verify` does not include the example build (the example has its own CI step).

8. **§12 "render new page < 16ms after data arrives"** is a measurement, not a hard gate (spec §12: "breaches block release only when architectural"). The reference app shows a badge with the actual ms; the bench suite (`packages/core/bench/server-render.bench.ts`) reports the median over 100 runs. Architectural regression (e.g., virtualization stops windowing on a page) would fail CI; UX-tier regression (e.g., 25ms instead of 16ms) is logged.

9. **`pnpm-workspace.yaml` change.** Adding `examples/*` is a config-level change. Mitigated by documenting in phase 5 + verifying `pnpm install` succeeds.

10. **Bundle size.** M3 lands at +~3-5 kB min+gzip (core dataSource subpath + React hook). The §12 15 kB guardrail is already exceeded by M2 (~27 kB total); the M3 delta is small and remains tree-shakeable. Consumers using only `createClientDataSource` (no React) pay only the core delta.

---

## 6. Files modified (summary; full detail in phase files)

| File | Change |
| --- | --- |
| `packages/core/src/types.ts` | Add `MaybePromise<T>`; add `DataSource<TRow>`, `DataSourceCapabilities`, `Capability`, `DataSourceState<TRow>`, `SerializedFilter`, `RowsQuery` types. |
| `packages/core/src/createDataTable.ts` | `validateModeConfiguration(opts)` on construction + `setOptions`; `aria-busy` / `aria-invalid` emission in `getGridProps()` when `dataSourceState` is provided (read via new `__setDataSourceState` internal seam); placeholder row synthesis in `getRowModel()` when `placeholderCount > 0`. |
| `packages/core/src/registries/sorting.ts` | Export `nameOfSortingFn<TRow>(fn)`. |
| `packages/core/src/registries/filtering.ts` | Export `nameOfFilterFn<TRow>(fn)`. |
| `packages/core/src/index.ts` | Re-export `dataSource` subpath via type-only + `dataSource` barrel. |
| `packages/core/package.json` | Add `./dataSource` subpath export. |
| `packages/core/vite.subpaths.config.ts` | Add `dataSource` entry. |
| `packages/react/src/useDataTable.ts` | Add `dataSource?: DataSource<TRow>` option; internally call `useDataSource`; expose `dataSourceState` on the result. |
| `packages/react/src/useDataSource.ts` | New file (hook). |
| `packages/react/src/index.ts` | Re-export `useDataSource`, `useDataTable` (updated return type). |
| `packages/react/package.json` | (No new subpath; the hook is in the main entry.) |
| `pnpm-workspace.yaml` | Add `examples/*` (phase 5). |
| `examples/m3-server-modes/**` | New directory (phase 5). |
| `docs/archive/m2-advanced-features/api-freeze.md` | Updated to note M3 additions (no M2 changes). |

No new packages added; `packages/pivot` and `packages/worker` remain reserved for M4/M5.

---

## 7. Phase index

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [RowsQuery serialization + validation](./phase-1-rows-query-and-validation.md) | `buildRowsQuery`, `validateModeConfiguration`, `nameOfSortingFn`/`nameOfFilterFn`, dev warning plumbing | ~25-35 |
| 2 | [DataSource interface + client impl](./phase-2-data-source-interface.md) | `DataSource<TRow>` type, `createClientDataSource`, subpath export, `dataSource` types in core | ~25-35 |
| 3 | [React `useDataSource` hook](./phase-3-react-data-source-hook.md) | `useDataSource` hook, `dataSource` option on `useDataTable`, abort wiring, status state | ~20-30 |
| 4 | [Loading / aria-busy contract](./phase-4-loading-and-aria-busy.md) | Placeholder rows, `aria-busy`/`aria-invalid` emission, "Loaded N rows" announcer, integration tests | ~25-35 |
| 5 | [Reference app + serialization goldens + API freeze](./phase-5-reference-app-and-integration.md) | `examples/m3-server-modes/` Vite app, serialization golden fixtures, api-freeze update | ~15-25 |
| | **Total M3 tests** | | **~110-160** (on top of M0/M1/M2's 302) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 8. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D6** in this overview — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D3 (four-state vs three-state machine) and D4 (dev warning vs hard gate).
2. **§4 architecture overview** — confirm the core/react split mirrors M0–M2 conventions and the new subpath export pattern is consistent with M2 (`/virtualization`, `/resize`, etc.).
3. **Phase 1 (RowsQuery + validation)** — `SerializedFilter` shape; `buildRowsQuery` deterministic output for golden tests; one-shot warning pattern (mirroring `defaultGetRowId`).
4. **Phase 2 (DataSource + client)** — `createClientDataSource` correctly threads `manual*` semantics through the existing M2 pipeline; `MaybePromise<T>` utility; subpath export registration.
5. **Phase 3 (React hook)** — `useEffect` cleanup with `AbortController`; controlled vs uncontrolled slice observation via `table.subscribe`; the `dataSource` option sugar on `useDataTable`.
6. **Phase 4 (loading UX)** — placeholder row id collision avoidance; `aria-busy` only emitted when a `dataSource` is wired (M0/M1/M2 preserved); announcer route through existing seam.
7. **Phase 5 (reference app)** — `pnpm-workspace.yaml` change scope; build-vs-verify separation; the §12 perf badge is advisory.
8. **§5 risks** — especially abort-stale, controlled-slice interactions, and `pnpm-workspace.yaml` change blast radius.

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).