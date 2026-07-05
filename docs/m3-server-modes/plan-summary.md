# M3: Server Modes — Plan Summary

**Audience:** `plan-reviewer-a`, `plan-reviewer-b`
**Goal:** Review-ready summary of the M3 plan.
**Full plan:** [`overview.md`](./overview.md) + 5 phase files + [`api-freeze.md`](./api-freeze.md) (drafted in phase 5).

---

## 1. Goal recap

Land M3 per `docs/initial-spec.md` §14 row 4: **`manual*` semantics, DataSource + `useDataSource`, loading/aria-busy contract**. Exit criteria: **mixed-mode warnings** + **server pagination/sort/filter reference app**.

M0–M2 are complete (~302 tests green across 30 files, `pnpm verify` clean, M2 `api-freeze.md` approved). The `manualSorting`/`manualFiltering`/`manualPagination` options and `rowCount` are already declared and honored by the M2 pipeline; M3 hardens their semantics, adds the mixed-mode trap warning (§5.3), and layers the Level 1 `DataSource` orchestrator on top. M3 extends the surface additively; no M0/M1/M2 export is renamed, removed, or signature-changed.

---

## 2. Scope (what's in, what's out)

### In M3

| Feature | Spec section | New surface |
| --- | --- | --- |
| `RowsQuery` serialization | §5.1 | `buildRowsQuery(state, columns, opts)` (core subpath) |
| `SerializedFilter` shape | §5.1 + §13 | `{ id, value, filterFn?: string }` |
| Registry reverse lookup | §13 P3 | `nameOfSortingFn(fn)`, `nameOfFilterFn(fn)` |
| Mixed-mode trap warning | §5.3 | `validateModeConfiguration(opts)` (dev-only, one-shot) |
| `allowWithinPageOperations` opt-in | §5.3 | `DataTableOptions.allowWithinPageOperations?: boolean` |
| `DataSource<TRow>` interface | §5.2 | Type in `@lynellf/tablekit-core/dataSource` |
| `createClientDataSource` | §5.2 | Synchronous in-memory factory (reference impl) |
| `useDataSource` hook | §5.2 | `@lynellf/tablekit-react` |
| `dataSource` option on `useDataTable` | §5.2 | Sugar over `useDataSource` |
| `DataSourceState<TRow>` | §5.2 | `{ status, data, totalRowCount?, error?, refetch }` |
| Abort-stale fetches | §5.2 + §9.3 | `AbortController` per fetch; abort on state change |
| `aria-busy` on grid root | §10 | `getGridProps()` emits when loading |
| `aria-busy` on body rowgroup | §10 | `getBodyProps()` emits when loading |
| `aria-invalid` on error | §10 | `getGridProps()` emits when error |
| `data-loading` styling hook | §6.4 | `getGridProps()` + `getBodyProps()` emit `data-loading="true"` when loading |
| Placeholder rows | §10 | `synthesizePlaceholderRows(n)`; `placeholderRows` option |
| "Loaded N rows" announcer | §10 | Routes through existing `ReactAnnouncer` |
| `placeholderRows` option | §10 | `DataTableOptions.placeholderRows?: number` |
| `getRowId` warning on data source | §4.4 | Dev warning if `dataSource` is wired without `getRowId` |
| Serialization golden tests | §13 | 5 fixtures under `dataSource/__tests__/fixtures/rowsQuery/` |
| Reference app | §14 | `examples/m3-server-modes/` Vite + React 19 |

### Out of M3 (deferred)

- **Caching / retries / dedup / debounce inside `useDataSource`** — spec §5.2 explicit non-goal; consumer-owned (TanStack Query / SWR).
- **`PivotTable` + treegrid** — M4.
- **Worker engine** — M5.
- **Server engine contract for pivot expansion** — M5 (§9.5).
- **Full announcer `messages` map + i18n** — M6.
- **Screen-reader manual matrix** — M6 release gate.
- **`validateGridStructure` CLI / layered diagnostics** — M6.
- **Hard gate behind `allowWithinPageOperations`** — v2 (§16 risk #10).
- **`rowSelection`, subtotals, state persistence, DnD reorder, global quick filter** — v1.5/v2.
- **Hardened `defaultGetRowId` enforcement for `dataSource`** — implemented as a dev warning; production keeps the fallback (consistent with M1 hardening).

---

## 3. Resolved decisions (six open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | `DataSource` location? | **CORE; `useDataSource` IN REACT** | Framework-free pure logic in core; React hook in react. Mirrors M0/M1 boundary. |
| D2 | `RowsQuery` shape? | **PER-SPEC VERBATIM** | Spec §5.1 shape is the contract; dev warning on inline-fn leak per §13. |
| D3 | Status state machine? | **FOUR STATES (`idle|loading|success|error`)** | `idle` and `success` differ; `getRowModel` needs to know which to render. Aligns with TanStack Query. |
| D4 | Mixed-mode enforcement? | **DEV WARNING ONLY** | Spec §5.3 + §16 risk #10 — warning, not gate. |
| D5 | Loading UX? | **PLACEHOLDER ROWS + `aria-busy` + ANNOUNCER** | Spec §10 verbatim. |
| D6 | Reference app layout? | **FRESH `examples/m3-server-modes/`** | Spec §14 exit criterion. |

Full rationale for each is in [`overview.md` §3](../m3-server-modes/overview.md).

---

## 4. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [RowsQuery + validation](./phase-1-rows-query-and-validation.md) | `buildRowsQuery`, `validateModeConfiguration`, `nameOfSortingFn`/`nameOfFilterFn`, dev warning plumbing, `dataSource` subpath registered | ~25-35 |
| 2 | [DataSource interface + client impl](./phase-2-data-source-interface.md) | `DataSource<TRow>` type, `createClientDataSource`, subpath runtime export, all four capability combinations | ~25-35 |
| 3 | [React `useDataSource` hook](./phase-3-react-data-source-hook.md) | `useDataSource` hook, `dataSource` option on `useDataTable`, abort wiring, status state, refetch | ~20-30 |
| 4 | [Loading / aria-busy contract](./phase-4-loading-and-aria-busy.md) | Placeholder rows, `aria-busy`/`aria-invalid` emission, "Loaded N rows" announcer, integration tests for the four patterns | ~25-35 |
| 5 | [Reference app + goldens + api-freeze](./phase-5-reference-app-and-integration.md) | `examples/m3-server-modes/` Vite app, serialization golden fixtures, api-freeze update | ~15-25 |
| | **Total M3 tests** | | **~110-160** (on top of M0/M1/M2's 302) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 5. Key risks

1. **AbortController race conditions** — stale fetches must not overwrite fresh state. Mitigation: per-fetch controller + `signal.aborted` checks. Tested in `abort-stale.test.tsx`.
2. **Mixed-mode warning noise** — easy to dismiss. Mitigation: one-shot per instance, clear text, opt-in flag documented in the reference app.
3. **`buildRowsQuery` shape stability** — spec §13 names serialization golden files; any shape change breaks consumers. Mitigation: committed fixtures; PR review of `query.ts`.
4. **Placeholder row id collision** — synthetic prefix (`__placeholder_`) prevents collision with real ids; the dev warning for missing `getRowId` does not fire for placeholders.
5. **`getOptions` / `getResolvedColumns` public exposure** — needed by the hook but normally internal. Mitigation: alternative is an internal `__buildRowsQuery` seam that the hook calls; phase 3 evaluates both approaches.
6. **`pnpm-workspace.yaml` change** — adds `examples/*`. CI/build must continue to succeed; mitigation: smoke build of the example in CI, not gating `pnpm verify`.
7. **§12 perf badge measurement** — uses between-fetches timing, not mark-based. Acceptable for v1; mark-based polish is M6.
8. **Bundle size** — M3 adds ~3-5 kB min+gzip to the M2 baseline (~27 kB total). Tree-shakeable subpath mitigates; consumers using only `createClientDataSource` pay only the core delta.
9. **`useDataSource` re-init on source change** — consumer should memoize their `source`; the hook's `useEffect` dep array re-runs on source change (correct behavior).
10. **Concurrent state changes** — one fetch per state change; debouncing is consumer-owned (TanStack Query's `keepPreviousData` + `staleTime` is the recommended mitigation per §16 risk #7).

Full risk table in [`overview.md` §5](../m3-server-modes/overview.md).

---

## 6. Verification

After all 5 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                # typecheck + lint + test + build — EXIT 0
pnpm test                                                  # M0/M1/M2 (~302) + M3 (~110-160) tests, all green

# Subpath smoke
node -e "import('@lynellf/tablekit-core/dataSource').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"

# Reference app
pnpm --filter m3-server-modes-example build                # EXIT 0
pnpm --filter m3-server-modes-example dev                  # http://localhost:5173

# Golden fixture tests
pnpm --filter @lynellf/tablekit-core test -- --run query.golden
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 7. M3 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **`manual*` semantics** | `packages/core/src/createDataTable.ts:368-379` (existing M2); `validateModeConfiguration` adds the dev warning when mixed-mode is detected. `packages/core/src/dataSource/__tests__/warnings.test.ts` asserts the warning fires and is one-shot. |
| **`DataSource` + `useDataSource`** | `packages/core/src/dataSource/types.ts` (`DataSource<TRow>`); `packages/core/src/dataSource/client.ts` (`createClientDataSource`); `packages/react/src/useDataSource.ts` (hook). Unit tests in `__tests__/client.test.ts` + `useDataSource.test.tsx`. |
| **Loading / aria-busy contract** | `getGridProps()` / `getBodyProps()` emit `aria-busy`/`aria-invalid` when `dataSourceState.status` changes; `synthesizePlaceholderRows(n)` returns N synthetic rows when loading with no data. Integration tests in `__integration__/server-{pagination,sort,filter}.test.tsx` + `loading-announcer.test.tsx`. |
| **Mixed-mode warnings** | `validateModeConfiguration` (dev-only, one-shot) — verified in `warnings.test.ts` + `mixed-mode-warning.test.tsx`. |
| **Server pagination/sort/filter reference app** | `examples/m3-server-modes/` — Vite + React 19 app demonstrating all four patterns + the mixed-mode trap + the §12 perf badge. Builds via `pnpm --filter m3-server-modes-example build`. |

---

## 8. Out-of-scope reminder

M3 does **not** ship caching/retries/dedup/debounce, PivotTable, worker engine, full announcer polish, screen-reader manual matrix, rowSelection, subtotals, state persistence, DnD reorder, or hard-gating behind `allowWithinPageOperations`. These are explicit non-goals per spec §5.2, §14, and §16. A reviewer should flag any phase file that includes M4+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D6** in `overview.md` — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D3 (four-state vs three-state machine) and D4 (dev warning vs hard gate).
2. **§4 architecture overview** — confirm the core/react split mirrors M0–M2 conventions and the new subpath export pattern is consistent with M2 (`/virtualization`, `/resize`, etc.).
3. **Phase 1 (RowsQuery + validation)** — `SerializedFilter` shape; `buildRowsQuery` deterministic output for golden tests; one-shot warning pattern (mirroring `defaultGetRowId`).
4. **Phase 2 (DataSource + client)** — `createClientDataSource` correctly threads `manual*` semantics through the existing M2 pipeline; `MaybePromise<T>` utility; subpath export registration.
5. **Phase 3 (React hook)** — `useEffect` cleanup with `AbortController`; controlled vs uncontrolled slice observation via `table.subscribe`; the `dataSource` option sugar on `useDataTable`.
6. **Phase 4 (loading UX)** — placeholder row id collision avoidance; `aria-busy` only emitted when a `dataSource` is wired (M0/M1/M2 preserved); announcer route through existing seam.
7. **Phase 5 (reference app)** — `pnpm-workspace.yaml` change scope; build-vs-verify separation; the §12 perf badge is advisory.
8. **§5 risks** — especially abort-stale, controlled-slice interactions, and `pnpm-workspace.yaml` change blast radius.

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview) of `overview.md`.