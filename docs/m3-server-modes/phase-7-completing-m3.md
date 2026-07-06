# Phase 7 — Completing M3 (Phase 5 + Phase 6 Remediated)

**Status:** Remediation plan — unblocks M3 closure.
**Audience:** `implementer` (after panel approval), `reviewer` (verification).
**Scope:** Three discrete tracks — (a) pre-flight `handleError` blocking bug, (b) Phase 6 render-loop fix, (c) Phase 5 reference app + serialization goldens + api-freeze + workspace.

---

## 0. What I found (investigation notes)

### Current state (verified by running tests, 2026-07-05)

| Surface | State | Evidence |
| --- | --- | --- |
| M3 phases 1-4 implementation | ✅ Complete; tests passing | `packages/core` 323/323, `packages/react` 26/27 (1 skipped, 1 failing) |
| `pnpm verify` (aggregate gate) | ❌ Fails at typecheck | `packages/react/src/useDataSource.ts(172,9): error TS2304: Cannot find name 'handleError'` |
| `abort-stale.test.tsx` | ❌ Fails (1/28 react integration tests) | "Maximum update depth exceeded"; 53 `getRows` calls before any click; stack trace `DataTable.notify (createDataTable.ts:843)` → `setOptions (158)` → `useDataTable.ts:60` |
| `examples/` directory | ❌ Does not exist | `ls examples/` → "No such file or directory" |
| `pnpm-workspace.yaml` | ❌ Does not include `examples` | File lists only `packages/*` |
| Golden fixtures (`fixtures/rowsQuery/`) | ❌ Empty directory | 5 `.json` files planned in Phase 5 do not exist |
| `docs/m3-server-modes/api-freeze.md` | ❌ Missing | M2 file archived at `docs/archive/m2-advanced-features/api-freeze.md`; M3 freeze not yet created |

### OKF consulted first (per workflow)

- `.okf/components/dev-tooling-stack.md` — confirmed `pnpm verify` chain: `typecheck && lint && test && build`; `node-linker=isolated`; subpath export convention.
- `.okf/workflows/dev-tooling-bootstrap.md` — re-read; confirmed archive convention (`docs/archive/<plan-name>/`) and `pnpm verify` gate pattern.

`okf_docs_read`: 2; `okf_tokens_read`: ~3000; `files_scanned_before_okf`: ~3 (initial repo triage); `files_scanned_after_okf`: 14 (M3 phase files + integration test + failing source files + critical tests); `stale_okf_hits`: 0; `missing_okf_hits`: 0.

### Plan-sufficiency assessment

The existing approved Phase 5 and Phase 6 plan artifacts (`docs/m3-server-modes/phase-5-reference-app-and-integration.md`, `docs/m3-server-modes/phase-6-abort-stale-render-loop-fix.md`) are **sufficient for their original scope**. This phase adds three deltas:

1. **Pre-flight fix (NEW):** the `handleError`/`handleResult` scoping bug in `packages/react/src/useDataSource.ts` blocks `pnpm verify` from even reaching `abort-stale.test.tsx`. Not in Phase 6's original scope; addressed here.
2. **Phase 6 delta:** line numbers in the Phase 6 plan (`createDataTable.ts:843`, `:158`) are stale (current source has them at `:838` and `:158`). The fix logic and code remain correct.
3. **Phase 5 stays as-written.** No content change.

---

## 1. Files modified / created

### Track A — Pre-flight `handleError` blocking bug (NEW)

| File | Change |
| --- | --- |
| `packages/react/src/useDataSource.ts` | Hoist `handleError` (and `handleResult` for symmetry) out of the inner `try` block so the `catch (err)` block can call `handleError(err)`. See §3.1. |

### Track B — Phase 6 render-loop fix (per existing plan)

| File | Change |
| --- | --- |
| `packages/core/src/utils.ts` | Add `sliceValuesEqual` helper (additive). [Phase 6 §3.1 Change 1, verbatim] |
| `packages/core/src/state.ts` | Swap `shallowEqual` → `sliceValuesEqual` import + use in `stateChangedOnSlices`. [Phase 6 §3.1 Change 2, verbatim] |
| `packages/react/src/useDataTable.ts` | Move `table.setOptions(options)` from render body into `useEffect([options, table])`. [Phase 6 §3.1 Change 3, verbatim; add inline comment per plan §3.1] |
| `packages/core/src/state.test.ts` | Add 3 regression tests in a new `describe` block. [Phase 6 §3.1 Change 4, verbatim] |
| `packages/core/src/createDataTable.test.ts` | Add 1 regression integration test. [Phase 6 §3.1 Change 5, verbatim] |

### Track C — Phase 5 reference app + goldens + api-freeze

All files in [Phase 5 §1](../m3-server-modes/phase-5-reference-app-and-integration.md); not duplicated here.

| File | Source-of-truth |
| --- | --- |
| `examples/m3-server-modes/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `src/*` | Phase 5 §3.1–3.6 |
| `pnpm-workspace.yaml` | Phase 5 §3.7 |
| `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/{01,02,03,04,05}-*.json` | Phase 5 §3.8 |
| `packages/core/src/dataSource/__tests__/query.golden.test.ts` | Phase 5 §3.9 (new file; additive to existing `query.test.ts`) |
| `docs/m3-server-modes/api-freeze.md` | Phase 5 §3.10 |
| `docs/m3-server-modes/ARCHIVE-MANIFEST.md` | Phase 5 §1 (created when archive is finalized) |
| `README.md` (root) | Phase 5 §2 row 4 — add "Server modes" section linking to the example |
| `docs/archive/m2-advanced-features/api-freeze.md` | Phase 5 §2 row 3 — add M3-cross-reference note |

---

## 2. What I found (continued) — Phase 5 workspace decision

The Phase 5 plan §3.7 identifies a trade-off: broad (`examples/*`) vs. narrow (`examples/m3-server-modes`) pnpm-workspace glob.

**Decision:** use narrow `examples/m3-server-modes` for v1. Rationale:

- M3 verification (`pnpm verify`) does not need to typecheck-build the example to be green; Phase 5 §1 row 2 lists the example build as a separate `pnpm --filter` command. Broad glob adds workspace-package validations to `pnpm install` and to any future CI step, without M3 needing them.
- Future M4 (pivot example) and M6 (recipe docs) can broaden the glob when they ship their own `examples/<slug>/`. Forward-compat cost is one YAML edit.
- Phase 5 plan §3.7 acknowledges the trade-off ("The broader `examples/*` is forward-looking — M4 (pivot example) and M6 (recipe docs as examples) will add to it. Trade-off: broader scope requires every new example to be a valid pnpm workspace package. Decision: use `examples/*` for forward compat; M3 is the first consumer."). The implementer should override to the narrow glob per this decision.

---

## 3. File contents (key files)

### 3.1 Track A — `packages/react/src/useDataSource.ts` (handleError scoping fix)

The current code (lines 99–175) declares `handleResult` and `handleError` inside `try { … }` and then references `handleError` in `catch (err)`. The `const`-bound closures go out of scope after the `try` exits, so `handleError(err)` on line 172 is undefined → `TS2304: Cannot find name 'handleError'` (or, after deleting that line, the closing-time caught exception silently leaks). The `eslint-disable react-hooks/exhaustive-deps` line 184 was suppressing the warning that would otherwise have caught this.

**Minimal fix (recommended):** inline the catch-block error path rather than calling the hoisted handler. Concretely, replace lines 165–174 (`if (result instanceof Promise) { … } …`) and 175–178 (`return true; } catch (err) { handleError(err); … }`) with the structure below. The full block to replace spans lines 99–178 (the entire `runFetch` body).

```ts
const runFetch = () => {
  if (fetchingRef.current) return false;
  fetchingRef.current = true;

  const query = table.__buildRowsQuery(sourceRef.current.capabilities);

  // Abort the in-flight request, if any, before starting a new one.
  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  const priorState = table.__getDataSourceState();
  const loadingState: DataSourceState<TRow> = {
    status: 'loading',
    data: priorState.data,
    refetch,
  };
  if (priorState.error !== undefined) {
    loadingState.error = priorState.error;
  }
  table.__setDataSourceState(loadingState);

  // Hoist handlers so the catch (synchronous getRows throw) can reach them.
  const handleResult = (awaited: { rows: TRow[]; totalRowCount?: number }) => {
    if (controller.signal.aborted) return;

    const successState: DataSourceState<TRow> = {
      status: 'success',
      data: awaited.rows,
      refetch,
    };
    if (awaited.totalRowCount !== undefined) {
      successState.totalRowCount = awaited.totalRowCount;
    }
    table.__setDataSourceState(successState);
    table.announce(`Loaded ${awaited.rows.length} rows`);

    if (
      sourceRef.current.capabilities.paginate === 'server' &&
      typeof awaited.totalRowCount === 'number'
    ) {
      table.setOptions({
        data: [],
        columns: [],
        manualPagination: true,
        rowCount: awaited.totalRowCount,
      });
    }
  };

  const handleError = (err: unknown) => {
    if (controller.signal.aborted) return;
    const errorState: DataSourceState<TRow> = {
      status: 'error',
      data: priorState.data,
      error: err instanceof Error ? err : new Error(String(err)),
      refetch,
    };
    table.__setDataSourceState(errorState);
  };

  try {
    const result = sourceRef.current.getRows(query, { signal: controller.signal });

    if (result instanceof Promise) {
      result.then(handleResult).catch(handleError).finally(() => {
        fetchingRef.current = false;
      });
    } else {
      handleResult(result);
      fetchingRef.current = false;
    }
    return true;
  } catch (err) {
    handleError(err);
    fetchingRef.current = false;
    return false;
  }
};
```

**What changed vs current:**

- Removed the inner `try { … }` wrapper around the `query` building + `__setDataSourceState(loadingState)` (those don't throw under normal use, and `query` is needed outside the try for both handlers).
- Hoisted `handleResult` and `handleError` declarations so they are visible to the `catch (err)` block.
- Kept the `try { sourceRef.current.getRows(...) } catch (err) { handleError(err) }` boundary so synchronous throws from `getRows` are converted to the `'error'` status (matches spec §5.2).

**Verification (Track A standalone):**

```bash
pnpm --filter @lynellf/tablekit-react typecheck    # EXIT 0
# Expected: `handleError` is no longer reported as undefined.
```

If this fails after the edit, the implementer should double-check that all `const handleX` declarations sit between the `const controller = new AbortController();` line and the `try {` line, in the order given above.

### 3.2 Track B — Phase 6 fix (already planned)

**Verbatim from Phase 6 §3.1 (Changes 1–5).** Apply as written. Note the line-number drift:

- Phase 6 plan references `createDataTable.ts:843` (notify) and `:158` (setOptions); current source has `notify` at `:838` and `setOptions` still at `:158`. The edit target (the function bodies, not the line numbers) is unchanged.
- Phase 6 plan references `useDataTable.ts:60`; current source still has `table.setOptions(options);` at line 60 in the render body. Edit target is unchanged.
- Phase 6 plan references `state.ts:142` (`if (!shallowEqual(prev[slice] as object, next[slice] as object))`); current source has the same expression at line 142. Edit target is unchanged.

### 3.3 Track C — Phase 5 reference app

**Verbatim from Phase 5 §3.1–3.10**, with the §2 narrowing decision applied:

- `pnpm-workspace.yaml` adds `examples/m3-server-modes` (narrow), not `examples/*` (broad).
- All other files per Phase 5 plan.

---

## 4. Commands + Verification

```bash
# ── Track A: pre-flight (unblocks typecheck)
pnpm --filter @lynellf/tablekit-react typecheck    # EXIT 0

# ── Track B: Phase 6 regression
cd packages/react && npx vitest run src/__integration__/abort-stale.test.tsx
#   EXPECT: 1 passed; 1 getRows call before click; second call after click with pageIndex=1
cd packages/react && npx vitest run src/__integration__/  # all green
cd packages/core  && npx vitest run src/state.test.ts src/createDataTable.test.ts

# ── Track C: Phase 5 reference app + goldens
pnpm install                                       # picks up pnpm-workspace.yaml change
pnpm --filter m3-server-modes-example build        # EXIT 0
pnpm --filter @lynellf/tablekit-core test -- --run query.golden.test
# All 5 fixture files match the JSON output of buildRowsQuery for the 5 scenarios.

# ── Aggregate gate
pnpm verify                                        # EXIT 0
```

### Acceptance criteria

1. **`pnpm verify` exits 0** (typecheck + lint + test + build). Acceptance of the aggregate M3 closure.
2. **`abort-stale.test.tsx` passes** with the expected call signature (1 fetch before click, 1 fetch after click with `pageIndex === 1`); no "Maximum update depth exceeded" error; no "Cannot update a component while rendering" stderr line.
3. **All M3 integration tests pass:** `mixed-mode-warning.test.tsx`, `loading-announcer.test.tsx` (1 skipped, 2 active), `useDataSource-minimal.test.tsx`, `server-pagination.test.tsx` (5 cases), `async.test.tsx`, `async2.test.tsx`, `async3.test.tsx`, `async4.test.tsx`, `simple.test.tsx`, `virtualized-grid.test.tsx` (13 cases), `abort-stale.test.tsx`. Total: 26 passing tests, 0 failing.
4. **M0/M1/M2 baseline preserved:** core 323 tests, react `useDataTable.test.tsx` + `ReactAnnouncer.test.tsx` + `validate.test.tsx` + `index.test.ts` pass. No regression.
5. **`examples/m3-server-modes/` runs:** `pnpm --filter m3-server-modes-example dev` → http://localhost:5173 → four tabs (pagination, sort, filter, mixed-mode) + perf badge render without console errors. The mixed-mode tab shows the §5.3 warning when `allowWithinPageOperations` is unset, silent when set.
6. **Golden fixtures stable:** `pnpm --filter @lynellf/tablekit-core test -- --run query.golden.test` passes; the 5 `.json` files in `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/` are byte-equal to `JSON.stringify(buildRowsQuery(state, columns, opts))` for the 5 scenarios.
7. **`docs/m3-server-modes/api-freeze.md` exists** and documents the M3 surface additively (§3.10 of Phase 5 plan); `docs/archive/m2-advanced-features/api-freeze.md` carries the cross-reference note.
8. **Workspace glob is narrow:** `pnpm-workspace.yaml` includes `examples/m3-server-modes`, not `examples/*`.
9. **No M0/M1/M2 public API surface changes**: `api-freeze.md` only *adds*; nothing in M0/M1/M2 is renamed, removed, or signature-changed.

---

## 5. Implementation order (suggested)

The three tracks have a strict ordering:

1. **Track A first.** Until `handleError` compiles, `pnpm verify` doesn't reach Track B/C. Track A is the smallest change (single file, single function body).
2. **Track B second.** With Track A applied, run `pnpm --filter @lynellf/tablekit-react typecheck` to confirm green; then apply Phase 6 changes; then run the M3 integration suite to confirm `abort-stale.test.tsx` passes.
3. **Track C third.** Build the example app + commit goldens + write api-freeze. Run `pnpm --filter m3-server-modes-example build` then `pnpm verify` for the aggregate gate.

A single implementer pass with all three tracks in one worktree is the path of least cost (no re-context-switching). If budget requires splitting, Track A → Track B → Track C sequence is non-negotiable.

---

## 6. Risks (added by Phase 7)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **`handleError` fix breaks the `loading-announcer.test.tsx` 2 active tests** | Low | Medium | The behavioral change is moving the `try/catch` boundary around the synchronous `getRows` call; both existing tests use a synchronous-throwing source for one case. Verify after Track A. |
| **Phase 6 `useEffect` dep `[options, table]` causes extra `setOptions` calls in StrictMode** | Confirmed (per Phase 6 §6) | Negligible | Phase 6 plan documents this; `sliceValuesEqual` makes the second `setOptions` a no-op. |
| **Phase 5 example build requires `pnpm install` to pick up workspace glob** | Confirmed | Low | Document the `pnpm install` step in Phase 5 §4. The aggregate `pnpm verify` does not run example-build; the developer must run it manually. |
| **Golden fixture drift if M3 changes `RowsQuery` shape later** | Future | Medium | Phase 5 §6 risk 2 acknowledges this; the byte-equal assertion catches unintentional drift. |
| **Line-number drift across Phase 6 plan files (already noted)** | Confirmed | Low | The Phase 6 plan's code-level edits are correct; only the cited line numbers are stale. Apply by content match, not line number. |
| **One-render lag in controlled-slice changes** | Confirmed (per Phase 6 §3.3) | Negligible | Below perceptual threshold; documented in Phase 6 §3.3 trade-off. |
| **M4 planning starts before M3 closes** | Possible | Medium | See §7 — recommend M4 plan-after-M3-archive to avoid context-switch cost and stale-input risk. |

---

## 7. M4 (PivotTable) — parallel or after?

**Recommendation: wait.** Start M4 planning only after M3 is closed AND archived.

Reasons:

- M4 (Pivot + treegrid) likely depends on the M3 `DataSource` seam for its server-pivot expansion path (spec §9.5 — though that part is M5, the pivot table itself is M4).
- The parallel planner would re-load ~200 KB of spec text already in M3's context; budget cost is non-trivial and the deliverable isn't useful until M3 is provably green.
- The `pnpm verify` gate only closes when both Track B and Track C are green; starting M4 planning against an unverified M3 risks the M4 plan referencing stale surface.
- The mid-level-planner role default is "scoped, low-ambiguity work"; M4 cross-references M3 surface and is therefore *not* low-ambiguity. Sequencing preserves the role-pattern invariant.

If budget is unconstrained, a senior-planner M4 outline could begin in parallel against `docs/initial-spec.md` §9 only — but no implementation work should start until M3 archive is complete. **This decision is the orchestrator's call, not mine.**

---

## 8. Out-of-scope (reaffirmed from M3 plan)

- Caching / retries / dedup / debounce inside `useDataSource` — spec §5.2 explicit non-goal.
- `PivotTable` / treegrid — M4.
- Worker engine — M5.
- Server engine contract for pivot (`computeChildren`) — M5 §9.5.
- Full announcer `messages` map + i18n — M6.
- Screen-reader manual matrix — M6 release gate per spec §13.
- `validateGridStructure` CLI / layered diagnostics — M6.
- Auto-hard-gate behind `allowWithinPageOperations` — v2 discussion (spec §16 risk #10).
- `rowSelection`, subtotals, state persistence, DnD reorder, global quick filter — v1.5/v2.

A reviewer should flag any implementer PR that includes M4+ work as a scope violation.

---

## 9. Verification summary

After all three tracks, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                # typecheck + lint + test + build — EXIT 0
pnpm test                                                  # 323 core + 26+ react tests, all green; abort-stale is green

# Subpath smoke (subpath still works after the changes)
node -e "import('@lynellf/tablekit-core/dataSource').then(m => console.log(Object.keys(m).sort()))"

# Reference app
pnpm --filter m3-server-modes-example build                # EXIT 0
pnpm --filter m3-server-modes-example dev                  # http://localhost:5173

# Golden fixture tests
pnpm --filter @lynellf/tablekit-core test -- --run query.golden.test
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan (see `.okf/components/dev-tooling-stack.md`). All four sub-gates must pass with exit code 0.

---

## 10. Summary

**Three tracks, ordered A → B → C, exactly one deliverable each:** unblock the typecheck (Track A), apply the Phase 6 render-loop fix (Track B, verbatim), ship the Phase 5 reference app + goldens + api-freeze with the narrow workspace glob decision (Track C, verbatim). M3 closes; M4 planning follows after archive. The Phase 5 and Phase 6 plans are accepted artifacts and are reused without modification — this phase is a reconciliation + a pre-flight patch.
