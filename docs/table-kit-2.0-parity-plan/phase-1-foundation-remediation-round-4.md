# Phase 1 Foundation — consolidated repair plan (round 4)

**Request class:** remediation
**Status:** `REQUEST-CHANGES`; implementation remains blocked from Phase 2
**Prior accepted scope:** [`spec.md`](./spec.md), [`phase-1-foundation.md`](./phase-1-foundation.md)
**Prior remediation:** [`phase-1-foundation-remediation-round-3.md`](./phase-1-foundation-remediation-round-3.md)
**Status record:** [`phase-1-foundation/review-decision.md`](./phase-1-foundation/review-decision.md)
**Revision delta:** resolves the plan-reviewer findings by naming the cursor/version owners and shapes, making stale-while-revalidate unconditional, specifying the packed-artifact command boundary, and marking round 3 historical.

## Goal and current delta

Repair the existing R1–R6 Foundation implementation rather than adding product scope. Three implementer/reviewer cycles reproduced the same findings. This delta converts the findings into bounded, ordered implementation slices with tests that exercise the failing paths, not only green aggregate verification.

The R7.1 dispatch gate is already in the required `REQUEST-CHANGES` state with R1–R7 open. An implementer must verify that state before touching code. No change in this document authorizes Phase 2.

## Consolidated reviewer findings

The following findings are carried forward verbatim from the current review decision:

| Area | Current decision | Required evidence before the Foundation gate can reopen |
|---|---|---|
| **R1 — state reconciliation, reset, and pruning** | `REQUEST-CHANGES` | Regression tests prove partial `next.state` retains every omitted slice, controlled transitions retain/adopt effective values, reset restores the constructor-effective baseline, `resetState` emits one atomic notification, and every ID-bearing slice removes IDs for deleted columns while preserving valid values. |
| **R2 — pagination wire types and data identity** | `REQUEST-CHANGES` | Offset sources receive `{ type: 'offset', offset, limit }`; cursor sources receive cursor/direction/limit and publish next/previous cursors; direct and data-source boundaries expose version identity; same-reference unchanged-version data is a no-op and changed-version data publishes. |
| **R3 — nullable data-source lifecycle and races** | `REQUEST-CHANGES` | Hooks/effects remain unconditional; null sources are idle and unsubscribed; source identity/capabilities/query inputs are key material; superseding requests abort and cannot publish; sync throws, aborts, source replacement, out-of-order results, stale-while-revalidate, one-request-per-key, and no-sparse-write cases are covered. |
| **R4 — pivot callbacks, resize, and leaf metadata** | `REQUEST-CHANGES` | Dedicated public callbacks accept React setters and ordinary updaters; controlled resize dispatches raw updaters without local mutation; uncontrolled resize works; sizing, ordinary pinning, total-column defaults, and deterministic cumulative offsets are state-derived without mutating engine results. |
| **R5 — instance-owned announcers** | `REQUEST-CHANGES` | Two live DataTables and two live PivotTables retain matching messages after either sibling unmount order and under Strict Mode; no singleton/last-mounted routing or global no-op cleanup remains. DOM-node existence alone is not evidence. |
| **R6 — v2 release evidence** | `REQUEST-CHANGES` | Public-surface imports execute against built/packed artifacts; clean v2 fixtures compile without workspace/source/declaration-path escapes; live documentation/version drift fails; historical archives are exempt; checks are wired into package-artifact verification; runtime versions derive from metadata. |
| **R7 — re-gate and evidence closeout** | `REQUEST-CHANGES` | Exact focused results, test counts, build/package boundary output, export matrix, fixture compilation, docs-drift output, and a complete F0.1–F0.6 decision matrix are recorded after R1–R6. An independent reviewer must sign the Foundation gate. |

## Verified implementation blockers

The current source explains why the previous green runs did not close the findings:

- `packages/react/src/useDataSource.ts` returns before its effect when the source is null, subscribes through `useSyncExternalStore` even for null, omits source changes from the effect dependencies, and builds a key containing `dataLen` while omitting capabilities, version, and cursor identity. A successful response therefore changes its own key; the focused pagination test currently observes two requests for the same new offset.
- `buildPaginationWire` accepts a cursor only as an unused optional argument. `DataTable.__buildRowsQuery` and `useDataSource` do not own or pass cursor state, and `useDataSource` drops `nextCursor`/`previousCursor` from `RowsResult`.
- `DataTable.__setDataSourceState` compares a new version to `getDataVersion()` from the current options, so a changed mutable-data version can be compared with itself. The row-model cache is keyed only by array reference and does not include a version token.
- Column pruning is exposed as an adapter-only `__pruneColumnIds` operation rather than being part of the core option reconciliation path; direct factory consumers can retain deleted IDs. Pivot still contains recursive `sameData` equality.
- Pivot options declare no dedicated pinning, sizing, sizing-info, or focused-cell callbacks. Controlled setters cast `onStateChange` and synthesize a whole-state updater. `getLeafColumns()` applies widths and the total-column default but does not resolve ordinary pinning or cumulative pinned offsets from current state.
- Core `DataTable.announce` prefers the process-wide global channel even when an instance announcer is supplied. `ReactAnnouncer` replaces `announcer.announce` in an effect, and the existing isolation tests mostly count live-region nodes rather than asserting post-unmount message ownership.
- `fixtures/consumers/v2/*` contain package manifests but no source fixtures and use `workspace:*`. `check-public-surface.mjs` mostly greps declaration text, includes names that are not documented/runtime exports, and does not import packed tarballs. `check-docs-version.mjs` emits warnings and exits successfully for live stale claims; package versions/runtime literals are maintained independently.

## Corrected public contracts and verification boundary

These decisions close the plan-review findings without authorizing new product scope. The implementation must use these names and paths rather than inventing a second contract.

### Cursor ownership and query shape

`DataTableState` remains the offset-oriented table state; cursor navigation is owned by the data-source boundary so offset consumers do not carry cursor fields. Add these shared data-source types in `packages/core/src/dataSource/types.ts`:

```ts
export type DataVersionToken = string | number;
export type CursorDirection = 'next' | 'previous';
export interface CursorSelection {
  cursor: string | null;
  direction: CursorDirection;
}
export interface CursorState {
  nextCursor?: string | null;
  previousCursor?: string | null;
}
```

`RowsQuery.pagination` is `PaginationWire`; `buildRowsQuery` and the internal `DataTable.__buildRowsQuery` seam accept an optional `CursorSelection`. Offset requests remain `{ type: 'offset', offset: pageIndex * pageSize, limit: pageSize }`; cursor requests are `{ type: 'cursor', cursor, direction, limit }`, with the initial selection `{ cursor: null, direction: 'next' }`. The selected cursor is never derived from `pageIndex`.

`DataSourceState` and `UseDataSourceResult` gain optional `cursor?: CursorState` and `dataVersion?: DataVersionToken`. `UseDataSourceResult` also exposes optional `selectCursor(cursor: string | null, direction: CursorDirection): void` for cursor-capable sources. `selectCursor` updates the data-source selection and starts one query for that selection; an offset source omits the command. `RowsResult.nextCursor`/`previousCursor` are copied into state and are therefore observable after every accepted response. `DataSourceStateWithCursor` remains a compatibility alias for the cursor-bearing state, not a second shape.

### One version identity contract

`DataVersionToken` and the existing object shape are canonical. Export `DataVersion<TRow> = { version?: DataVersionToken; getVersion?: (data: TRow[]) => DataVersionToken }` from `@lynellf/tablekit-core/dataSource`. Use that exact type at `DataTableOptions.dataVersion`, `DataSource.dataVersion`, `CreateClientDataSourceOptions.dataVersion`, and `PivotTableOptions.dataVersion`. A client source copies its configured version policy to `DataSource.dataVersion`; a remote source may return `RowsResult.dataVersion`.

Every publisher resolves one token from its own incoming data/result and compares it with the previously published token (not the current option object). The resolved token is included in query identity and publication state; `RowModelCache` and pivot compute identity compare both array reference and token. Same reference plus the same token is a no-op; same reference plus a different token publishes/recomputes. No deep equality is permitted.

### Stale-while-revalidate contract

There is no `staleWhileRevalidate` option in 2.0. Preservation is unconditional: after a successful response, a new query sets `status: 'loading'` while retaining prior `data`, `totalRowCount`, and cursor metadata; a failed replacement sets `status: 'error'` while retaining prior data; before the first success and after source removal, `data` is `null`. Update `DataSourceState`/`UseDataSourceResult` comments and focused tests so `data` is not documented as non-null only for `success`.

### Packed-consumer command boundary

`pnpm check:package-artifacts` is the single R6 checker. After `pnpm build`, `scripts/check-package-artifacts.mjs` must create a temporary directory outside the workspace, run `pnpm pack --pack-destination <tmp>/tarballs` for all four packages, generate temporary fixture manifests whose dependencies point only to those `.tgz` files, install them with `pnpm install --ignore-workspace`, compile every `fixtures/consumers/v2/*/src/index.ts` with NodeNext resolution, and execute the documented root/subpath imports with `node`. It must fail on `workspace:*`, repository/source imports, `packages/*/dist` path aliases, or any dependency resolved outside the temporary install. `scripts/check-public-surface.mjs` consumes that temporary install (not repository `dist`) for its runtime/export matrix. The checker removes the temporary directory in `finally` and prints the tarball, install, typecheck, and runtime-import results.

Committed fixture manifests use package version placeholders, never `workspace:*`; the checker substitutes local tarball paths only in its temporary copies. `tsconfig.package-artifact-fixture.json` no longer maps package names to `packages/*/dist`; it checks the fixture source against installed package exports. `check-docs-version.mjs` exits nonzero for any unmarked live drift and accepts only `docs/archive/**` or an explicit `Historical: true` marker. `pnpm verify` invokes the checker, so the exact command above is also the R6 full-boundary command.

## Constraints and non-goals

- Reuse the accepted 2.0 contract; do not start grouped columns, DataGrid UI, PivotGrid UI, compatibility adapters, or a second renderer.
- Preserve the four package boundaries. Core, pivot, and worker remain DOM-free. Do not add a data-fetching/cache framework.
- Do not solve races by restoring a `fetchingRef`/early-return lock. A new query must supersede the old query.
- Do not solve announcements with last-mounted/global routing or a global no-op cleanup.
- Do not claim packed-consumer evidence from `dist` path aliases, `workspace:*`, repository source paths, or declaration greps.
- Do not use the existing e2e screenshots or generic pivot smoke tests as evidence for these Foundation contract findings; they do not exercise the failing paths.
- Mutable data is supported only through an explicit version token. No recursive equality of row arrays is permitted on an update path.

## Ordered repair phases

### Phase 0 — R7.1 dispatch gate (must precede code)

1. Confirm `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md` says `Status: REQUEST-CHANGES`, names R1–R6 as open, and contains no Phase 2 authorization.
2. Run:

```bash
grep -n "Status.*REQUEST-CHANGES\|APPROVED\|Phase 2" docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md
```

3. Stop without code if the status is not the required blocked state. Do not rewrite an approval into evidence.

**Exit evidence:** the status file is committed in the blocked state. This is a hard gate, not a test shortcut.

### Phase 1 — R1 core state and column reconciliation

**Files:** `packages/core/src/createDataTable.ts`, `packages/core/src/state.ts`, `packages/core/src/types.ts`, `packages/core/src/pipeline/memo.ts`, `packages/core/src/createDataTable.test.ts`, `packages/core/src/state.test.ts`, `packages/core/src/columns.test.ts`, `packages/core/src/pipeline/memo.test.ts`, and the closest React state regression in `packages/react/src/useDataTable.test.tsx`.

1. Make state reconciliation explicit per slice: absent keys retain the current effective value; present keys adopt the supplied value; later `initialState` is ignored. Track controlled-slice presence separately from the effective state so controlled-to-uncontrolled retention and uncontrolled-to-controlled adoption are testable across repeated `setOptions` calls.
2. Keep the constructor-effective baseline immutable for reset operations. `resetState` must apply all uncontrolled baseline values in one state assignment/notification; `resetSlice` must use that baseline. Preserve callback semantics for controlled reset requests.
3. Move column-ID pruning into the core option reconciliation path (the React adapter may remain a caller, but direct `createDataTable(...).setOptions({ columns })` must also prune). Cover sorting, filters, order, visibility, both pin sides, sizing, resize-session, and focus; retain valid IDs and dispatch pruned values through the dedicated callback for controlled slices.
4. Use the canonical `DataVersion<TRow>`/`DataVersionToken` contract from the corrected-contract section. Resolve the token from the incoming options, compare it with the previously published token, and add it to row-model memo identity. Same reference plus same token reuses; same reference plus changed token recomputes. Do not add deep row comparison.

**Focused acceptance:** direct and React consumers retain every omitted slice through inline option updates; controlled transitions retain/adopt correctly; reset emits once; removed IDs are absent from every listed slice; same-reference same-version data reuses the row model while a changed version recomputes.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/core/src/pipeline/memo.test.ts packages/react/src/useDataTable.test.tsx
```

**Stop condition:** any state loss, reset to `DEFAULT_STATE` instead of constructor baseline, second reset notification, or stale deleted-column ID returns the phase to implementation; do not proceed to R2.

### Phase 2 — R2 pagination and identity wire contract

**Files:** `packages/core/src/dataSource/types.ts`, `packages/core/src/dataSource/query.ts`, `packages/core/src/dataSource/client.ts`, `packages/core/src/dataSource/index.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/types.ts`, `packages/core/src/dataSource/__tests__/query.test.ts`, `packages/core/src/dataSource/__tests__/query.golden.test.ts`, `packages/core/src/dataSource/__tests__/client.test.ts`, and data-source integration fixtures.

1. Keep offset and cursor pagination as the discriminated `PaginationWire` union. Normalize offset to the actual row offset (`pageIndex * pageSize`). Add the named `CursorSelection` input to `BuildRowsQueryOptions`, `buildRowsQuery`, and `DataTable.__buildRowsQuery`; use `{ cursor: null, direction: 'next' }` initially and never translate a cursor through `pageIndex`. Include the configured pagination strategy in capabilities.
2. Make `useDataSource` the cursor owner. Store the current `CursorSelection` in the hook, expose `selectCursor(cursor, direction)` only on cursor-capable `UseDataSourceResult`, and include it in the query key. Copy `RowsResult.nextCursor` and `previousCursor` into `DataSourceState.cursor` and `UseDataSourceResult.cursor`; selecting one of those values starts exactly one replacement request. Add golden fixtures/assertions for first, next, previous, and offset requests, including the exact `RowsQuery` object received by `getRows`.
3. Normalize the existing version object to the shared `DataVersion<TRow>`/`DataVersionToken` contract. Add `dataVersion?: DataVersion<TRow>` to `DataSource` and `PivotTableOptions`, add `dataVersion?: DataVersionToken` to `RowsResult`, `RowsQuery`, `DataSourceState`, and `UseDataSourceResult`, and have `createClientDataSource` resolve and return its configured token. Track the previous published token rather than comparing against the current option token; include it in query/publication identity and memo invalidation. Add assertions for same-reference/same-token no-op and same-reference/changed-token publication at direct-table, client-source, hook, and pivot boundaries.

**Focused acceptance:** offset sources receive `{ type: 'offset', offset, limit }`; cursor sources receive `{ type: 'cursor', cursor, direction, limit }` with `direction` explicit; returned cursors are observable and selecting one feeds the next request; same reference plus unchanged version is a no-op; same reference plus changed version publishes/recomputes at every named boundary.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/core/src/dataSource/__tests__/client.test.ts packages/core/src/createDataTable.test.ts
```

**Stop condition:** if a cursor is converted to `pageIndex`, result cursors are discarded, or version changes cannot be observed at the boundary, stop before R3.

### Phase 3 — R3 unconditional nullable lifecycle and request races

**Files:** `packages/react/src/useDataSource.ts`, `packages/react/src/useDataTable.ts`, `packages/react/src/__integration__/abort-stale.test.tsx`, `packages/react/src/__integration__/async.test.tsx`, `packages/react/src/__integration__/server-pagination.test.tsx`, `packages/react/src/__integration__/useDataSource-minimal.test.tsx`, plus new `packages/react/src/__integration__/nullable-source-lifecycle.test.tsx` and `packages/react/src/__integration__/cursor-pagination.test.tsx`.

1. Call every hook, `useSyncExternalStore`, and effect unconditionally. Use a stable idle snapshot for a null source and a no-op subscribe function for that branch; do not subscribe a null source to the table. The effect must abort/retire prior work and clear to idle (`data: null`, with no cursor metadata) when a source is removed.
2. Make the request effect depend on source identity, capabilities, serialized query inputs (including real table columns/filter names), pagination/cursor selection, resolved data-version token, and refetch nonce. Keep source identity reference-based through a stable token. Remove the `dataLen` key component and the table-subscription `runFetch` loop; a key change starts one request, while status/data notifications only update the snapshot. `selectCursor` changes only the hook-owned selection and therefore starts one replacement request.
3. For each request, abort the previous controller, increment a request token, and accept a result/error only when token, signal, source identity, and current key still match. Handle synchronous throws, thenables, aborts, source replacement, out-of-order responses, and refetch. Apply the unconditional stale-while-revalidate contract: after first success, loading and error retain prior rows, total count, and cursor metadata; only initial/no-source state has `data: null`.
4. Keep capability changes private and sparse-write-free. No `setOptions` path from this hook may write `data`, `columns`, or `rowCount`; total count, cursor metadata, and result version remain in data-source state.

**Focused acceptance:** adding/removing/replacing the source never changes hook order; null is idle/unsubscribed with `data: null`; each changed key or cursor selection produces exactly one current request; a sort/filter/page change during an in-flight request is not dropped; stale responses cannot publish; loading/error after a prior success retain prior rows under the unconditional stale-while-revalidate contract; real columns remain available for filter serialization; no sparse options patch is observable.

**Verification:**

```bash
pnpm exec vitest run packages/react/src/__integration__/nullable-source-lifecycle.test.tsx packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx packages/react/src/__integration__/useDataSource-minimal.test.tsx packages/react/src/__integration__/cursor-pagination.test.tsx
```

**Stop condition:** any hook-order warning, duplicate same-key call, stale result publication, dropped in-flight state change, or sparse write blocks the Foundation gate and all later phases.

### Phase 4 — R4 Pivot controlled contracts, resize, and leaf metadata

**Files:** `packages/pivot/src/types.ts`, `packages/pivot/src/index.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/pivot/src/__tests__/types.test.ts`, `packages/pivot/src/__tests__/pivotTable.test.ts`, `packages/pivot/src/__tests__/propGetters.test.ts`, and new focused controlled-slice tests (or an extension of the existing controlled integration fixture).

1. Add and export dedicated `OnChangeFn` options for `columnPinning`, `columnSizing`, `columnSizingInfo`, and `focusedCell`. Declaration tests must assign both React `Dispatch<SetStateAction<T>>` and ordinary `(updater) => void` callbacks for every advertised slice.
2. Route controlled setters and all resize-session commands through the corresponding raw updater callback. Controlled paths must not mutate local state or use an `onStateChange` cast as a substitute. Uncontrolled paths update local state and notify once per effective change. Ensure `setOptions` preserves effective slices across inline options, data changes, and controlled transitions.
3. Derive `getLeafColumns()` from the current result plus current state: sizing widths, ordinary-leaf left/right pinning, total-column default-right pinning, explicit overrides, stable leaf ordering, and cumulative pinned offsets. Return new metadata objects without mutating the engine result. Add assertions for left and right offset accumulation and total-column overrides.
4. Replace pivot recursive data equality with reference identity plus the canonical `DataVersion<TRow>`/`DataVersionToken` contract used by core and data sources. The pivot query/cache key compares the previous token, and stale compute cancellation remains token/signal guarded.

**Focused acceptance:** root `@lynellf/tablekit-pivot` exports `OnChangeFn`; controlled callbacks receive raw updaters and local state remains unchanged until the parent supplies state; uncontrolled resize works; leaf metadata reflects current sizing/pinning/offsets; same-reference unchanged-version data does not recompute and changed-version data does.

**Verification:**

```bash
pnpm exec vitest run packages/pivot/src/__tests__/types.test.ts packages/pivot/src/__tests__/pivotTable.test.ts packages/pivot/src/__tests__/propGetters.test.ts packages/pivot/src/__tests__/serialize.test.ts
```

**Stop condition:** any whole-state callback cast, controlled local mutation, mutable engine-result mutation, missing ordinary pinning/offset, or recursive row comparison is a failed R4 gate.

### Phase 5 — R5 instance-owned announcement channels

**Files:** `packages/core/src/announcer.ts`, `packages/core/src/createDataTable.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/react/src/ReactAnnouncer.tsx`, `packages/react/src/useDataTable.ts`, `packages/react/src/usePivotTable.ts`, `packages/core/src/announcer.test.ts`, `packages/react/src/ReactAnnouncer.test.tsx`, `packages/react/src/__integration__/multi-instance-announcer.test.tsx`, `packages/react/src/__integration__/loading-announcer.test.tsx`, and `packages/react/src/__integration__/pivot-announcer.test.tsx`.

1. Give each hook-created table/pivot one stable channel and pass that channel to both the factory and its live-region component. Core must prefer the explicit instance/options announcer; global announcer access remains only an explicit direct-core fallback and cannot override an instance channel.
2. Replace method-overwrite cleanup with an instance-owned subscription/channel mechanism. Mount/unmount and Strict Mode cleanup may release only that instance's listener. Remove all global no-op cleanup/last-mounted registration behavior.
3. Strengthen tests to announce unique messages after both siblings mount, unmount either sibling in both orders, announce again from the survivor, and assert the matching live region text—not merely node count. Repeat for two DataTables, two PivotTables, mixed siblings, and Strict Mode.

**Focused acceptance:** messages remain in the matching survivor region after sibling unmount and no message crosses channels or disappears due to a global reset.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/announcer.test.ts packages/core/src/createDataTable.test.ts packages/react/src/ReactAnnouncer.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx packages/react/src/__integration__/loading-announcer.test.tsx packages/react/src/__integration__/pivot-announcer.test.tsx
```

**Stop condition:** a global announcer call, no-op cleanup, DOM-count-only assertion, or cross-instance message fails the phase.

### Phase 6 — R6 packed exports, clean fixtures, versions, and live docs

**Files:** `scripts/check-public-surface.mjs`, `scripts/check-package-artifacts.mjs`, `scripts/check-docs-version.mjs`, `scripts/package-artifact-fixture.ts`, `tsconfig.package-artifact-fixture.json`, `fixtures/consumers/v2/{core,react,pivot,worker}/package.json`, new `fixtures/consumers/v2/*/src/index.ts`, root/package manifests and Vite/build version inputs, `packages/*/src/index.ts`, `packages/worker/src/version.ts`, `docs/m6-hardening/api-freeze.md`, live migration/release/README docs, and `package.json`.

1. Make the documented export matrix the source of truth. Remove nonexistent names or add the intentionally documented export; compile-time imports must cover every documented type/value and runtime imports must execute from the temporary `node_modules` populated with packed `.tgz` files. Include documented subpaths and verify their package `exports` entries. `check-public-surface.mjs` must accept the temporary install root rather than reading repository `dist`.
2. Add real `src/index.ts` files to each clean consumer fixture. Committed manifests use version placeholders and contain no `workspace:*`; the checker copies them to a temporary consumer, substitutes `file:<tmp>/tarballs/*.tgz` dependencies for all four packages, runs `pnpm install --ignore-workspace`, and resolves only that install. The checker must fail on workspace/source imports, repository-relative paths, `packages/*/dist` aliases, or dependency resolutions outside the temporary consumer.
3. Make runtime `VERSION` values derive from one root/package metadata source during build, then assert package manifests, generated runtime values, and packed fixture imports agree. Generate the worker version file (or equivalent build input) from metadata; do not retain a separately edited worker literal.
4. Replace warning-only docs drift with a failing live-doc check. Explicitly mark historical/superseded v1 documents (including the v1 freeze) and exempt only `docs/archive/**` or files with `Historical: true`; correct live claims and migration examples rather than globally weakening the scanner. Wire `node scripts/check-docs-version.mjs` into `scripts/check-package-artifacts.mjs`/`pnpm verify` so a green package check includes docs evidence.

**Focused acceptance:** `pnpm check:package-artifacts` prints successful pack, isolated install, TypeScript compile, runtime root/subpath import, version, public-surface, and docs-drift checks; invalid export claims fail; no workspace/source/declaration escape exists; runtime/manifest versions agree; live stale claims fail while explicitly marked historical files pass.

**Verification:**

```bash
pnpm build
pnpm check:package-artifacts
```

The checker itself must invoke the fixture compiler, packed runtime/public-surface checks, and failing docs check. For direct diagnosis, these exact commands are also supported:

```bash
pnpm exec tsc -p tsconfig.package-artifact-fixture.json
node scripts/check-public-surface.mjs --artifact-root "$TABLEKIT_ARTIFACT_ROOT"
node scripts/check-docs-version.mjs
```

**Stop condition:** any type-only grep standing in for an import, workspace fixture dependency, warning-only live drift, or independently maintained runtime version leaves R6 open.

### Phase 7 — R7.2–R7.5 evidence closeout and independent re-gate

Only after Phases 1–6 pass:

1. Remove build output and temporary fixture installations; run the focused commands from each phase and record exact files/tests/counts.
2. Run the full repository gate from a clean checkout/build output:

```bash
pnpm verify
```

3. Record packed tarball names/contents, isolated-install dependency roots, executed root/subpath export matrix, cursor first/next/previous assertions, version-token publication assertions, clean fixture compiler output, docs drift output, and the R1–R6 decision matrix in `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md` (or its explicitly linked evidence note). Do not claim approval from the implementer.
4. Route to an independent reviewer. Only that reviewer may change the decision to `APPROVED` and authorize `phase-2-column-hierarchy-and-sizing.md`.

**Closeout acceptance:** every required reviewer row is backed by a focused regression and exact artifact evidence; no Phase 2 authorization appears before independent approval.

## Risks and rollback

| Risk | Mitigation | Stop/rollback |
|---|---|---|
| Refactoring `useDataSource` can reintroduce React render loops | Derive one query key, keep status out of it, and test one-request-per-key before broad verification | Revert only the R3 slice if the key changes on loading/success or hook order changes |
| Controlled callback and resize semantics can diverge between parent renders | Test raw updater delivery and parent-controlled rerender separately from uncontrolled behavior | Stop R4; do not silently fall back to `onStateChange` |
| Channel ownership can regress direct-core compatibility | Keep global routing only when no instance announcer is supplied and test both paths | Stop R5; never restore last-mounted cleanup |
| Packed fixture setup can accidentally resolve workspace packages | Pack to a temporary directory and inspect dependency resolution before TypeScript compilation | Reject the evidence and rebuild fixtures; do not weaken the boundary check |
| Version/docs automation can misclassify history | Require explicit historical markers and maintain a small reviewed allowlist | Stop R6 until every live warning is corrected or explicitly documented |

Rollback is phase-scoped: revert only the current repair phase and its focused tests. Do not alter archive documents to hide a failed gate, and do not start Phase 2 while any row remains open.

## User decisions and assumptions

No new product decision is required. This plan assumes the already accepted additive Pivot 2.0 direction, the constructor-baseline reset semantics, the fixed package names, and the explicit C0 compatibility stop from `spec.md`. The current e2e additions are treated as unrelated smoke evidence, not as closure of R1–R7.

## Planning telemetry

- `okf_docs_read`: 0 (`.okf/` is absent in this checkout)
- `okf_tokens_read`: 0
- `source_files_read`: 63 (48 from the initial round-4 package plus 15 directly read in this correction cycle; grouped reads counted once; grep output not counted)
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 (no repository OKF map available)

## Artifact index

- `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-4.md` — this consolidated repair plan (new).
- `docs/table-kit-2.0-parity-plan/spec.md` — reused accepted scope and global contract.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation.md` — reused F0 requirements.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-3.md` — superseded tactical delta; retained as historical prior context.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md` — current blocked status and reviewer evidence requirements; unchanged by this plan.

**Implementation routing:** after plan review, dispatch one implementer for Phase 0 verification, then Phase 1. Require a focused test result and stop/continue decision after every phase; route back to the independent reviewer only after Phase 7 evidence is complete.
