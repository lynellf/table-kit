# Phase 1 Foundation — remediation round 7 bounded correction

**Request class:** remediation follow-up
**Status:** `REQUEST-CHANGES`; Phase 2 remains blocked
**Reuses:** [`spec.md`](./spec.md), [`phase-1-foundation.md`](./phase-1-foundation.md), and the blocked decision in [`phase-1-foundation/review-decision.md`](./phase-1-foundation/review-decision.md)
**Supersedes for implementation routing:** [`phase-1-foundation-remediation-round-4.md`](./phase-1-foundation-remediation-round-4.md), which remains historical evidence of the prior round
**Active artifact path:** this file remains the single active remediation package; this bounded correction does not create a parallel plan
**Current delta:** address six additional blocking execution and verification gaps identified after the round-6 revision: request triggering, serializer errors, cursor metadata, manual capability persistence, Strict Mode ownership, and row-model identity. Do not add renderer/UI scope or authorize Phase 2.

## Goal and current request

Close the remaining Foundation contract findings in the current worktree, with regression tests that fail against the present implementation and exact evidence from an isolated packed-consumer boundary. The accepted 2.0 scope does not change. The implementer must begin by confirming that the authoritative review decision is still blocked, then work in the ordered slices below. The decision file must remain `REQUEST-CHANGES` until an independent reviewer signs the re-gate.

## Verbatim consolidated reviewer findings

The following is the current reviewer's consolidated finding set, carried forward verbatim. Every item is addressed by an implementation task or an evidence task below.

> **R2-CURSOR-001** — **Required** — `packages/react/src/useDataSource.ts:148-159,208; packages/core/src/createDataTable.ts:316-338; packages/core/src/dataSource/query.ts:95-102,125-149; packages/core/src/dataSource/types.ts:243-252`
> **Evidence:** `selectCursor` stores `cursorSelectionRef` and increments a nonce, but `__buildRowsQuery` accepts only capabilities and is called without the selection. `buildRowsQuery` has no selection option and always calls `buildPaginationWire` without its cursor argument, so every hook request remains cursor:null/direction:next. `createClientDataSource` also reconstructs capabilities without copying `opts.capabilities.pagination`.
> **Consequence:** A cursor-capable source exposes `selectCursor` but cannot navigate: selecting next/previous triggers another request for the first page. Cursor strategy can also be silently downgraded to offset, making the advertised public API operationally wrong.
> **Smallest correction:** Thread `CursorSelection` through `BuildRowsQueryOptions`, `buildRowsQuery`, `DataTable.__buildRowsQuery`, and `useDataSource`; preserve pagination strategy in client-source capabilities; add first/next/previous golden and hook assertions on the exact `RowsQuery`.
>
> **R2-VERSION-002** — **Required** — `packages/core/src/dataSource/types.ts:36-64,187-224,233-264; packages/core/src/pipeline/memo.ts:1-80; packages/core/src/createDataTable.ts:258-271,365-374; packages/react/src/useDataSource.ts:211-218,269-282; packages/pivot/src/types.ts:459-480`
> **Evidence:** The canonical `DataVersionToken` type is absent. RowsQuery and RowsResult have no dataVersion, DataSource has no dataVersion policy, PivotTableOptions has no dataVersion, and RowModelCache/getRowModel have no version key. useDataSource resolves only table.getDataVersion and ignores a result token. The existing direct-table tests only assert getDataVersion(), not same-reference/same-version reuse versus same-reference/changed-version recomputation.
> **Consequence:** Mutable rows with the same array reference can remain cached and unrendered after a version change; remote result identity cannot cross the data-source boundary; public types do not match the round-4 contract.
> **Smallest correction:** Introduce/export DataVersionToken and use the shared DataVersion shape at every named boundary; publish/compare the previous token (including RowsResult.dataVersion); add the token to row-model/pivot identities; add direct, client, hook, and pivot regression tests.
>
> **R3-RACE-003** — **Required** — `packages/react/src/useDataSource.ts:234-248,323-326`
> **Evidence:** `runFetch` publishes loading via `__setDataSourceState` before the table subscription is installed for the initial run, but on later state changes the subscription calls `runFetch` and that loading publication synchronously notifies the same subscription. The reentrant `runFetch` sees the same key while status is loading, bypasses the only skip condition (which requires success), aborts the first request, and starts a duplicate. The focused abort-stale test output shows 3 calls total after one page change (initial plus two new calls), while its assertion only checks that any new offset exists.
> **Consequence:** One query-key change produces duplicate network requests and artificial abort/race traffic, violating the explicit one-request-per-key and superseding-request contract.
> **Smallest correction:** Separate query-key/request orchestration from data-source status notifications or guard an in-flight key/token so state publication cannot recursively start the same request; make the regression assert exactly one call for each key and assert abort/stale behavior.
>
> **R3-SWR-004** — **Required** — `packages/react/src/useDataSource.ts:234-247,269-282,290-301; packages/core/src/dataSource/types.ts:209-223`
> **Evidence:** The loading and error states retain prior data and cursor but omit prior totalRowCount. The state comment still says data is non-null iff success, contradicting the unconditional stale-while-revalidate contract. The nullable/race tests do not assert retained rows, total count, or cursor on replacement loading/error.
> **Consequence:** Consumers lose total counts during a replacement request or failed refresh and receive a documented state contract that is false during stale-while-revalidate.
> **Smallest correction:** Carry prior totalRowCount (and the canonical prior token/cursor metadata) through loading/error; update comments and add post-success replacement loading/error assertions.
>
> **R1-PRUNE-005** — **Required** — `packages/core/src/createDataTable.ts:202-208; packages/react/src/useDataTable.ts:118-135`
> **Evidence:** Core `setOptions` now invokes `__pruneColumnIds` when columns change, but the React adapter still independently invokes the same method for the same column-ID transition. For a controlled slice, the parent has not yet rerendered when the adapter's second call runs, so the invalid effective state remains and the dedicated callback can be delivered twice. The current tests exercise `__pruneColumnIds` directly and have no setOptions/React controlled column replacement regression.
> **Consequence:** Controlled consumers can receive duplicate pruning callbacks and schedule duplicate parent updates, despite the comments calling the path idempotent.
> **Smallest correction:** Make one layer authoritative (prefer core `setOptions`) and remove the adapter duplicate, or track the transition so the adapter cannot repeat it; add a controlled React column-replacement test asserting one callback and unchanged valid slices.
>
> **R4-CALLBACK-006** — **Required** — `packages/pivot/src/pivotTable/factory.ts:495-565,604-624`
> **Evidence:** When a shared slice is controlled and its dedicated callback is absent, each setter falls back to `onStateChange as OnChangeFn<PivotTableState>` and synthesizes a whole-state updater. The active round-4 stop condition explicitly rejects a whole-state callback cast as the controlled path; dedicated callbacks must receive the raw updater. Resize commands additionally read local state immediately after dispatching a controlled sizing-info callback, so ordinary controlled callbacks that do not synchronously rerender can commit against stale session state.
> **Consequence:** Controlled pivot consumers either receive the wrong callback contract or silently do nothing when only the dedicated controlled contract is supplied; resize can lose or misapply deltas before parent state is supplied back.
> **Smallest correction:** Use the dedicated callback as the sole controlled route for each slice (or make the aggregate route an explicitly separate legacy contract), retain no local controlled mutation, and drive resize commands from the effective controlled state with focused raw-updater/parent-rerender tests.
>
> **R4-LEAF-007** — **Required** — `packages/pivot/src/pivotTable/factory.ts:713-722; packages/pivot/src/types.ts:300-330`
> **Evidence:** `getLeafColumns` applies sizing and a total-column default, but never consults `state.columnPinning` for ordinary leaves, never applies explicit left/right overrides, and exposes no cumulative pinned offset metadata. The acceptance requires state-derived ordinary pinning, total defaults/overrides, stable order, and deterministic cumulative offsets.
> **Consequence:** Pinning commands change pivot state but do not affect returned leaf metadata, so a renderer cannot align pinned columns or compute their offsets.
> **Smallest correction:** Derive effective pin side from current state with explicit overrides and total-column defaults, compute deterministic cumulative left/right offsets without mutating engine results, and extend the result type/tests for the metadata.
>
> **R4-IDENTITY-008** — **Required** — `packages/pivot/src/pivotTable/factory.ts:143-174,680`
> **Evidence:** The recursive `sameValue`/`sameData` comparison remains in the pivot update path. It traverses row arrays/objects and treats same-reference data as equal before any version contract is considered.
> **Consequence:** Every changed-reference dataset can incur row-count-proportional deep work; same-reference mutable changes are hidden, while a new array containing equal values is incorrectly treated as unchanged. This directly violates the no-recursive-equality and reference-plus-version requirements.
> **Smallest correction:** Delete recursive dataset equality from the update path and compare data reference plus a previously published canonical version token; add same-reference same-version and changed-version pivot compute tests.
>
> **R6-ARTIFACT-009** — **Required** — `scripts/check-package-artifacts.mjs:26-80; scripts/check-public-surface.mjs:172-232; tsconfig.package-artifact-fixture.json:8-19`
> **Evidence:** The package checker uses `npm pack --dry-run` and checks repository dist files, then compiles `scripts/package-artifact-fixture.ts` through tsconfig paths mapped to `packages/*/dist`. It never creates a temporary tarball directory, installs copied fixture manifests with `--ignore-workspace`, compiles `fixtures/consumers/v2/*/src/index.ts`, or executes imports from an isolated node_modules. `check-public-surface` only greps declarations in repository dist; its publicSurfaces matrix is dead data. The green `pnpm check:package-artifacts` output therefore does not prove the required packed-consumer boundary.
> **Consequence:** Workspace/source/declaration escapes and invalid export claims can pass the Foundation gate; a consumer can fail after publication despite all reported checks being green.
> **Smallest correction:** Implement the round-4 temporary pack/install boundary, compile and execute every clean fixture/root/subpath import from that install, reject workspace/source/dist escapes, and make the checker print the isolated roots and matrix.
>
> **R6-DOCS-010** — **Required** — `scripts/check-docs-version.mjs:146-152`
> **Evidence:** Live stale-doc findings increment `issuesFound` but only emit a warning; the script exits zero. The active round-4 acceptance requires unmarked live drift to fail, and `pnpm verify` merely invokes the insufficient package checker.
> **Consequence:** A stale live migration/release/API claim can be introduced while all required gates remain green.
> **Smallest correction:** Exit nonzero when `issuesFound` is nonzero, limit exemptions to `docs/archive/**` or an explicit `Historical: true` marker, and wire this failing check into the isolated package-artifact checker.
>
> **R7-EVIDENCE-011** — **Required** — `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md; docs/implementer-r1-r7-remediation-round-3/trivial.md`
> **Evidence:** The authoritative review decision still says Status: REQUEST-CHANGES with R1-R7 open. The only new evidence artifact is under a round-3 implementer directory, claims R3/R5/R6 were previously approved, and records no exact export matrix, isolated install roots, cursor first/next/previous assertions, version-token publication assertions, docs-drift failure output, or complete F0.1-F0.6 decision matrix.
> **Consequence:** The Foundation closeout/re-gate acceptance is not met even apart from the code defects, and the artifact's approval claim conflicts with the active blocked decision.
> **Smallest correction:** After remediation, record exact focused counts/outcomes and isolated package evidence in the active phase-1 review/evidence path, preserve the blocked status until an independent reviewer signs, then update the decision and only then authorize Phase 2.

## Independent round-5 review findings carried forward verbatim

Plan Reviewer B returned `REQUEST-CHANGES` after reviewing this active package. These six blocking findings are the exact remediation delta for this revision; each must be closed by an implementation task and an evidence assertion before the package can be re-reviewed.

> **B1-CURSOR-CONTEXT-RESET** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Contract decisions—Cursor ownership; §Phase 2 steps 2-3 and regression requirements (around lines 87, 149-153)`
> **Evidence:** The plan gives `useDataSource` a persistent hook-owned `CursorSelection` and includes it in the request key, but never resets it when source identity, sort, filter, pagination strategy, or page size changes. It only specifies clearing metadata on source removal.
> **Consequence:** After navigating to cursor C, changing sort/filter/page-size or replacing the source can send C to an incompatible query, yielding wrong or empty pages while appearing to honor the new query.
> **Smallest acceptable correction:** Specify and implement reset to `{cursor:null,direction:'next'}` for source changes and every non-cursor query-context change; preserve selection only for explicit cursor navigation. Add negative tests for cursor→sort/filter/page-size/source transitions and assert exact wire queries.
>
> **B2-REQUEST-KEY-DETERMINISM** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Contract decisions—Request identity; §Phase 2 step 2 (around lines 89, 150) and packages/react/src/useDataSource.ts:87-101`
> **Evidence:** The plan requires a stable serialized key but does not define canonical serialization or rejection of unsupported values. Existing key construction uses `JSON.stringify` over `RowsQuery` values, whose filter value is `unknown`; key ordering, `undefined`/function values, cyclic values, and other non-JSON inputs are unspecified. The effect cleanup/replay path also has no stated React Strict Mode one-request policy despite the absolute “one key starts one request” claim.
> **Consequence:** Equivalent queries can issue duplicate requests, unsupported values can collide, disappear, or throw, and Strict Mode effect replay can produce extra abort/request traffic that violates the advertised race contract.
> **Smallest acceptable correction:** Define a canonical JSON-safe query-key serializer (or explicit validation/error contract) covering object-key order, unsupported values, cycles, and registry-only functions. Add exact collision/determinism tests and a Strict Mode request test; either guarantee one request per key across effect replay or explicitly narrow/document the guarantee.
>
> **B3-VERSION-LIFECYCLE** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Contract decisions—Canonical identity; §Phase 1 steps 1, 3-5 (around lines 88, 124-128) and packages/core/src/createDataTable.ts`
> **Evidence:** The plan adds `dataVersion` to `RowsQuery`, `RowsResult`, `DataSource`, state, memo keys, and pivot identity, but does not define precedence or flow between an outgoing request token, a source-configured token, and a remote `RowsResult` token. It also does not explicitly require `DataTable.setOptions` to invalidate/notify when the same data reference receives a changed token (or token removal), even though the direct `setOptions`/`getRowModel` acceptance depends on it.
> **Consequence:** A remote result token may be incorrectly reused as the next request identity or ignored, and direct mutable data can remain cached/unrendered when only the version changes. Different boundaries can disagree on whether a token transition is a no-op.
> **Smallest acceptable correction:** Document the token state machine: outgoing query token source and precedence; accepted result token; retention through SWR; and when result tokens do or do not feed the next query. Require same-ref token change/removal to invalidate memo, publish a notification, and recompute at direct/client/hook/pivot boundaries; add negative tests for each transition.
>
> **B4-PIVOT-CONTROLLEDNESS** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Contract decisions—Pivot controlled slices; §Phase 4 steps 1-2 (around lines 91, 191-192) and packages/pivot/src/pivotTable/factory.ts:495-565`
> **Evidence:** The plan says a controlled slice uses a dedicated callback and that an absent dedicated callback must not fall back or mutate, but does not define behavior when a dedicated callback is supplied without the corresponding state slice. The current factory checks callback presence before controlledness, so an uncontrolled consumer can have local updates suppressed or receive callback-only behavior.
> **Consequence:** Resize/pinning/focus can silently stop updating for an otherwise uncontrolled consumer that supplies a callback, or callbacks can be invoked without a parent-controlled value, producing stale UI and ambiguous ownership.
> **Smallest acceptable correction:** Define controlledness by own-property presence in state (or explicitly make callback presence the contract), then implement all combinations consistently. Add tests for controlled+dedicated, controlled+missing, uncontrolled+dedicated, and uncontrolled+aggregate paths, including resize start/adjust/commit/cancel.
>
> **B5-ANNOUNCER-COMPATIBILITY** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Phase 5 step 1 (around lines 205-210), packages/core/src/types.ts:340-343, packages/react/src/ReactAnnouncer.tsx`
> **Evidence:** The plan requires replacing `ReactAnnouncer` method-overwrite wiring with a listener mechanism but names no channel type, subscribe/dispose lifecycle, or compatibility rule. The public `Announcer` currently requires only `announce(message, politeness)`, and direct consumers/fixtures can provide that minimal object.
> **Consequence:** Adding a required listener method would be a breaking public API change; leaving it optional without a defined channel fallback can reintroduce method overwrite or lose announcements during mount/unmount/Strict Mode transitions.
> **Smallest acceptable correction:** Specify a non-breaking internal `AnnouncerChannel` (or optional listener extension) while preserving announce-only custom announcers and explicit global fallback. Define stable subscription/disposal and announce-before/after-mount behavior, and add tests for minimal custom announcers plus sibling and Strict Mode lifecycles.
>
> **B6-PACKED-PEER-CLOSURE** — **Blocking** — `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation-round-5.md §Contract decisions—Packed evidence; §Phase 6 steps 2-3 (around lines 93, 225-226), `fixtures/consumers/v2/*/package.json`
> **Evidence:** The plan says to substitute temporary tarball dependencies and reject non-temporary resolutions, but does not require closing the internal peer graph. Current clean fixtures do not all list internal peers directly: the React fixture depends on `tablekit-react/pivot` but not core; the Pivot fixture depends on pivot but not core; worker depends on worker but not pivot. Published package manifests declare internal peers using `workspace:*` in source metadata.
> **Consequence:** `pnpm install --ignore-workspace` can fail on missing peers or silently resolve internal peers from the registry, so a green compile/runtime check may not exercise one coherent set of four local packed artifacts.
> **Smallest acceptable correction:** Build an explicit temporary dependency/peer closure: inject every required internal tarball as a direct temp file dependency (or equivalent pnpm peer override) for each fixture, rewrite/check packed peer metadata, and fail if any `@lynellf/tablekit-*` resolution is outside the temporary `node_modules`/tarballs. Record the resolved graph and use pinned external dependencies/lock metadata for reproducibility.

## Findings from local inspection

The review findings remain reproducible in the current source:

- `buildRowsQuery` never receives the hook's cursor selection; `DataTable.__buildRowsQuery` exposes only capabilities; `createClientDataSource` drops `capabilities.pagination`.
- `RowsQuery`, `RowsResult`, `DataSource`, `DataSourceState`, `PivotTableOptions`, and row-model memo identity do not share one version-token contract. `DataTable.__setDataSourceState` can compare against the current option-derived token rather than the previously published token.
- `useDataSource` subscribes its fetch runner to the same table notifications used for loading/result state, so a loading notification can recursively start the same key. It also omits `totalRowCount` while retaining stale rows.
- `useDataTable` calls `__pruneColumnIds` after `setOptions`, although core now calls it inside `setOptions`; controlled column replacement can therefore deliver the same callback twice.
- Pivot's dedicated callback additions still leave whole-state casts, local controlled resize assumptions, missing ordinary pinning/offset metadata, and recursive `sameData`.
- The artifact checker still uses dry-run/repository `dist`/path aliases; fixtures are not compiled or executed from an isolated install; docs drift is warning-only.

## Contract decisions for this round

These are tactical corrections to the accepted 2.0 contract, not new product scope:

1. **Cursor ownership and reset:** `useDataSource` owns `CursorSelection`; `buildRowsQuery` receives it through `BuildRowsQueryOptions`; `DataTable.__buildRowsQuery` accepts it. Cursor requests are exactly `{ type: 'cursor', cursor, direction, limit }`, with `{ cursor: null, direction: 'next' }` initially. Offset requests remain `{ type: 'offset', offset: pageIndex * pageSize, limit }`, and the selection is never derived from `pageIndex`. After a source reference, sort, filter, pagination capability/strategy, or page-size change, reset to `{ cursor: null, direction: 'next' }` before constructing the replacement query. An explicit `selectCursor` call is the only operation that preserves a non-null selection; `refetch` repeats the current selection. Source removal clears it.
2. **Canonical identity and token lifecycle:** Export `DataVersionToken = string | number` and `DataVersion<TRow> = { version?: DataVersionToken; getVersion?: (data: TRow[]) => DataVersionToken }` from `@lynellf/tablekit-core/dataSource`. Use the same shape in `DataTableOptions`, `DataSource`, `CreateClientDataSourceOptions`, and `PivotTableOptions`; add the resolved token to `RowsQuery`, `RowsResult`, `DataSourceState`, `UseDataSourceResult`, row-model memo keys, and pivot compute identity. The outgoing token is resolved from `source.dataVersion` when the source owns a configured token, otherwise from the table's configured `dataVersion`; a remote source may provide a literal source token and a result token, while a `RowsResult.dataVersion` never becomes the next outgoing token automatically. The accepted result token is `RowsResult.dataVersion` when present, otherwise the outgoing token, and it is retained through stale-while-revalidate. Every publisher compares an incoming token, including a transition to token removal, with its own previously published token using an explicit unset sentinel; it never compares against a freshly read current option token. No recursive/deep row equality is allowed.
3. **Request-key determinism and concurrency:** The effect key contains source reference identity, capabilities including pagination strategy, the canonical serialized query (including cursor and outgoing version token), and a refetch nonce. Canonical serialization sorts plain-object keys, preserves array order, emits finite JSON-safe primitives only, and rejects `undefined`, functions (including unregistered filter predicates), symbols, bigint, non-finite numbers, unsupported objects, and cycles with a deterministic query-key error before `getRows` is called. Table data-source status is not key material. One committed hook key starts one `getRows` call, including React Strict Mode effect replay; a replay reattaches to the same short-lived in-flight entry rather than invoking or aborting it twice. A real key replacement or unmount aborts the prior controller. Every publication requires matching request token, signal, source identity, and current key.
4. **Stale-while-revalidate:** Preservation is unconditional in 2.0. After success, replacement loading and error retain prior rows, `totalRowCount`, cursor metadata, and accepted data-version token. Before first success and after source removal, data is `null` and cursor/version metadata is cleared. The public state comments must describe this rather than claiming `data !== null` only for success. A rejected replacement retains the prior accepted token; a successful result with no token explicitly transitions the accepted token to unset and invalidates same-reference caches.
5. **Pivot controlled slices:** Controlledness is determined by own-property presence in `options.state`, never by callback presence. For controlled+dedicated, dispatch the raw updater only to the dedicated callback; for controlled+missing, do not mutate local state and do not synthesize an aggregate whole-state updater; for uncontrolled+dedicated, update local state and may notify the dedicated callback as an additive raw-updater observer without suppressing local state; for uncontrolled+aggregate, update local state and notify `onStateChange`. Resize commands use the effective slice from the latest options and tests rerender the parent between callback and the next command. No `onStateChange as OnChangeFn<PivotTableState>` fallback is permitted for a controlled slice.
6. **Announcer compatibility and lifecycle:** Keep the required public `Announcer.announce(message, politeness?)` shape unchanged. Add an optional `AnnouncerChannel`/`subscribe` extension implemented by hook-owned channels; `ReactAnnouncer` subscribes and disposes instead of overwriting `announce`. A hook wraps an announce-only custom announcer with its private channel so minimal custom objects still receive synchronous announcements and the live region receives post-mount messages. Subscription is stable per instance, disposal removes only that listener, and messages emitted before a live-region subscription are delivered to the supplied announcer but are not replayed; messages emitted after mount are delivered once. Direct core keeps the explicit instance announcer first and uses the global fallback only when no instance announcer exists.
7. **Pivot leaf metadata:** Preserve engine leaf order. Explicit `columnPinning.left/right` membership wins over the total-column right default; an explicit side override is the only way to move a total leaf. Return copied leaves with `size`, `pinned`, and `pinnedOffset`; `pinnedOffset` is `0` for the first leaf at its pinned edge, increases by preceding/following effective pinned widths in deterministic pin-array order, and is `undefined` for unpinned leaves. No engine result object is mutated.
8. **Packed evidence boundary and peer closure:** `pnpm check:package-artifacts` is the single R6 boundary command. It packs all four packages into a temporary directory outside the workspace, inspects packed manifests for rewritten peer ranges, creates a closed temporary dependency graph (core; pivot+core; react+core+pivot; worker+pivot+core), copies clean v2 fixture manifests/sources, substitutes only temporary `.tgz` dependencies, uses exact external versions plus generated lock metadata, installs with `pnpm install --ignore-workspace`, compiles every fixture with NodeNext resolution, and executes every documented root/subpath runtime import from the temporary `node_modules`. It rejects `workspace:*`, registry fallback for an internal package, source/repository-dist/path-alias escapes, or any internal resolution outside the temporary tarballs/install. It prints tarballs, peer/dependency closure, install roots, compiler output, runtime matrix, versions, and docs output.
9. **Evidence authority:** The active review decision remains blocked. Round-3 evidence is not a decision and must not claim approvals. The implementer writes exact results to `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-evidence-round-7.md`; only an independent reviewer may update `review-decision.md` to `APPROVED`. Closeout must name the pristine committed checkout/commit used; no generated `dist` or temporary fixture directory may be mistaken for a clean checkout.

## Non-blocking observations retained from the same review

- **N1-PINNED-OFFSET:** `pinnedOffset` is `undefined` for unpinned leaves and `0` for the first pinned leaf at its edge; the type comment and golden fixture must include left/right and total-column examples.
- **N2-ARTIFACT-DIAGNOSTIC:** the checker-generated isolated invocation is authoritative. Standalone `check-public-surface`/`tsc` commands are diagnostics only and must print/name the artifact root; the older no-argument commands in the blocked decision are not packed-boundary proof.

## Scope boundaries and non-goals

- In scope: R1/R2/R3/R4 corrections, R5 matching-message regression evidence, R6 checker/docs/version boundary, and R7 closeout evidence.
- Out of scope: grouped columns, DataGrid/PivotGrid UI, a second renderer, compatibility adapters, new dependencies, broad cache/retry infrastructure, screenshot/e2e evidence, or changing the accepted reset/controlled-state contract.
- Core, pivot, and worker remain DOM-free; no browser globals are introduced in package initialization.
- Do not hide a duplicate request with a fetch lock, restore global/last-mounted announcer routing, weaken tests to check only that a request exists, or treat repository `dist` aliases as consumer evidence.

## Ordered implementation phases

### Phase 0 — blocked-gate verification (must precede code)

**Files/commands:** `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md`.

1. Verify the decision file contains `Status: REQUEST-CHANGES`, names R1–R7 as open, and grants no Phase 2 authorization.
2. Run:

```bash
grep -n "Status.*REQUEST-CHANGES\|APPROVED\|Phase 2" docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md
```

3. Do not edit the decision to represent implementation progress. Record the blocked gate in the round-7 evidence file only after implementation exists.

**Exit:** the blocked status is confirmed; otherwise stop with `REQUEST-CHANGES`.

### Phase 1 — canonical cursor/version wire contract (R2)

**Files:** `packages/core/src/dataSource/types.ts`, `packages/core/src/dataSource/index.ts`, `packages/core/src/dataSource/query.ts`, `packages/core/src/dataSource/client.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/types.ts`, `packages/core/src/pipeline/memo.ts`, `packages/react/src/useDataSource.ts`, `packages/pivot/src/types.ts`, and their focused tests.

1. Define/export `DataVersionToken`, reuse `DataVersion<TRow>` at every named public boundary, and add optional resolved `dataVersion` fields to `RowsQuery`, `RowsResult`, `DataSourceState`, and `UseDataSourceResult`. Do not retain duplicate object shapes or a second token alias.
2. Add `cursor?: CursorSelection` and `dataVersion?: DataVersionToken` to the query-builder options. Thread the selection through `buildRowsQuery`, `buildPaginationWire`, `DataTable.__buildRowsQuery`, and the hook. Make cursor direction required on the wire; keep offset and cursor as a discriminated union.
3. Make `createClientDataSource` preserve the configured pagination strategy and resolve/publish its configured version token. Define the outgoing-token precedence in code and types: source-owned configured token wins, table-configured token is the fallback, and a remote `RowsResult.dataVersion` is accepted-result metadata only. Keep result tokens observable through hook state without feeding them into the next query automatically.
4. Store the previously published token at each boundary with an explicit unset sentinel. Extend `MemoKey`/`RowModelCache` and the pivot compute identity with the token. Same array reference + same token reuses; same array reference + changed token or token removal invalidates, notifies, and recomputes; a new array recomputes even when values are deeply equal. Remove any recursive row comparison from update paths.
5. Ensure direct `setOptions`/`getRowModel`, client-source, hook, and pivot paths use the same semantics and never compare a new token with `getDataVersion()` freshly read from current options. Add a direct same-reference A→B→unset transition test and assert one notification/recompute per actual transition, including result-token retention during SWR and explicit clearing after a tokenless accepted result.

**Focused tests to add/update:**

- `packages/core/src/dataSource/__tests__/query.test.ts`, `query.golden.test.ts`, and `client.test.ts`: exact offset, first cursor, next cursor, previous cursor, capabilities, outgoing token precedence, and query/result version fields.
- `packages/core/src/pipeline/memo.test.ts` and `packages/core/src/createDataTable.test.ts`: same-reference/same-token reuse plus A→B→unset transitions, notification counts, and same-reference/changed-token recomputation.
- `packages/pivot/src/__tests__/pivotTable.test.ts`: same-reference/version identity, changed-reference equal-values recomputation, and token-removal recomputation.
- `packages/react/src/__integration__/cursor-pagination.test.tsx` and a data-version integration fixture: exact `RowsQuery` objects, returned cursors, selected cursor, source-vs-table token precedence, accepted result token retention, and tokenless-result clearing.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/core/src/dataSource/__tests__/client.test.ts packages/core/src/createDataTable.test.ts packages/core/src/pipeline/memo.test.ts packages/pivot/src/__tests__/pivotTable.test.ts
```

**Stop/rollback:** if a cursor selection is converted through `pageIndex`, a result cursor/version is dropped, deep equality remains, or same-reference changed-version data is cached, revert only Phase 1 and do not start Phase 2.

### Phase 2 — request-key orchestration and stale-while-revalidate (R3)

**Files:** `packages/react/src/useDataSource.ts`, `packages/react/src/useDataTable.ts` only if a seam type changes, `packages/react/src/__integration__/abort-stale.test.tsx`, `async.test.tsx`, `server-pagination.test.tsx`, `useDataSource-minimal.test.tsx`, `nullable-source-lifecycle.test.tsx`, and `cursor-pagination.test.tsx`.

1. Keep hook calls, `useSyncExternalStore`, and effects unconditional. Use a stable idle snapshot and no-op subscription for a null source; source removal aborts/retirements all work, resets the owned selection to `{ cursor: null, direction: 'next' }`, and clears data/cursor/version metadata.
2. Move request orchestration to a key-driven effect. Build the key from source identity, capabilities including pagination strategy, query inputs, cursor selection, outgoing version token, and refetch nonce using the canonical serializer in the contract. Before constructing a replacement query, compare the non-cursor query context (source, sort, filter, pagination capability/strategy, and page size) with the prior context; reset the selection on any change, then build the exact first-page wire query. Do not subscribe a `runFetch` callback to table notifications; table subscriptions update the snapshot only. Status/data notifications must not change the key. A changed key starts exactly one request.
3. Before each request, abort the prior controller and increment a request token. Maintain only a short-lived per-hook in-flight entry keyed by the canonical key so React Strict Mode effect cleanup/replay reattaches to the same request rather than calling `getRows` twice; a true key replacement or unmount retires and aborts it. Accept a result/error only when token, signal, source identity, and current key all match. Handle synchronous throws, thenables, aborts, source replacement, out-of-order results, refetch, and cursor selection.
4. Publish loading/error by copying prior `data`, `totalRowCount`, cursor metadata, and accepted version token. Publish `data: null` only for initial idle/loading or after source removal. Update `DataSourceState` comments and `UseDataSourceResult` to document the unconditional stale-while-revalidate contract.
5. Keep capability changes private through `__setManualFlags`; no path in this hook may call `setOptions` with `data`, `columns`, or `rowCount`.

**Regression requirements:**

- `abort-stale.test.tsx` asserts call count exactly one for initial key and exactly one for the replacement key, records the aborted signal, and resolves the stale promise after the current response to prove it cannot publish.
- Add a canonical-key unit fixture for reordered object keys, array ordering, unsupported `undefined`/function/symbol/bigint/non-finite values, cycles, and registry-only filter functions; equivalent queries must have byte-identical keys and unsupported values must publish a deterministic error without calling `getRows`.
- Add a Strict Mode integration test that mounts one committed source and asserts exactly one `getRows` invocation for the initial key, while a real source replacement still invokes exactly one new request and aborts the old one.
- `nullable-source-lifecycle.test.tsx` replaces the empty `waitFor` bodies with assertions for current-source rows, status, total count, cursor, and version after stale resolution; adding/removing the source is rendered without hook-order warnings and resets the cursor selection.
- `cursor-pagination.test.tsx` asserts first/next/previous exact queries, exactly one request per selection, and negative cursor→sort/filter/page-size/source transitions that all send `{ cursor: null, direction: 'next' }`.
- Add a loading/error replacement test that verifies prior rows, total count, cursor metadata, and accepted version remain visible; a tokenless success clears the accepted token.
- Add a sparse-write regression that spies on the table's public `setOptions` boundary and fails if a data-source operation supplies `data`, `columns`, or `rowCount` as a patch.

**Verification:**

```bash
pnpm exec vitest run packages/react/src/__integration__/nullable-source-lifecycle.test.tsx packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx packages/react/src/__integration__/useDataSource-minimal.test.tsx packages/react/src/__integration__/cursor-pagination.test.tsx
```

**Stop/rollback:** duplicate calls for one serialized key, stale publication, lost stale metadata, hook-order changes, or any sparse write blocks the Foundation gate; revert only the request-orchestration slice before continuing.

### Phase 3 — one authoritative core pruning path (R1)

**Files:** `packages/core/src/createDataTable.ts`, `packages/react/src/useDataTable.ts`, `packages/core/src/createDataTable.test.ts`, `packages/core/src/columns.test.ts`, `packages/react/src/useDataTable.test.tsx`, and a new focused React controlled-column integration test.

1. Keep core `setOptions` as the sole column-ID pruning owner for direct and React consumers. Remove `prevColumnIdsRef`, `setsAreEqual`, and the adapter's post-`setOptions` `__pruneColumnIds` call.
2. Preserve the controlled-slice rule: prune only invalid IDs, deliver the dedicated callback once, and retain all valid values/other slices. Ensure direct `createDataTable(...).setOptions({ columns })` and React column replacement take the same path.
3. Assert one callback for controlled sorting/filter/order/visibility/pinning/sizing/resize-session/focus pruning, unchanged valid slices, and no duplicate callback after the adapter rerenders.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/react/src/useDataTable.test.tsx
```

**Stop/rollback:** any duplicate callback, valid-ID loss, or adapter-only behavior returns the slice to implementation. Do not add a second idempotence workaround in React.

### Phase 4 — pivot controlled slices, leaf metadata, and identity (R4)

**Files:** `packages/pivot/src/types.ts`, `packages/pivot/src/index.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/pivot/src/__tests__/types.test.ts`, `pivotTable.test.ts`, `propGetters.test.ts`, `serialize.test.ts`, and a controlled integration fixture under `packages/react/src/__integration__/pivot-controlled.test.tsx`.

1. Remove whole-state casts for controlled `columnPinning`, `columnSizing`, `columnSizingInfo`, and `focusedCell`. Determine controlledness with `Object.prototype.hasOwnProperty.call(options.state ?? {}, slice)`: controlled+dedicated dispatches the raw updater only through that callback; controlled+missing does not mutate local state and does not synthesize an aggregate updater; uncontrolled+dedicated updates local state and treats the dedicated callback only as an additive raw-updater notification; uncontrolled+aggregate updates local state and notifies `onStateChange`. Callback presence alone must never suppress an uncontrolled local update.
2. Add an `effectiveSlice` read that uses the latest supplied controlled state. Resize commands must dispatch raw sizing/session updaters and must not read a stale local session after a controlled callback; `adjustResize`, `commitResize`, and `cancelResize` must no-op or use the latest effective session when the parent has not yet rerendered. Tests must cover controlled+dedicated, controlled+missing, uncontrolled+dedicated, and uncontrolled+aggregate for pinning/focus and resize start/adjust/commit/cancel, including callback capture followed by a parent rerender. Uncontrolled resize must still update locally once per effective change.
3. Extend `PivotLeafColumn` with `pinnedOffset?: number`. Implement `getLeafColumns()` as copied metadata in engine order: explicit left/right state membership overrides the total default; total leaves default right only when unlisted; offsets are deterministic sums of effective widths from the corresponding edge; the first pinned leaf has offset `0`, later offsets add the widths of preceding/following pinned leaves, and unpinned leaves have `undefined`; no result mutation occurs. Document these semantics in the type and golden fixture.
4. Delete `sameValue`/`sameData` from pivot dataset update logic. Resolve a canonical previous data-version token with an unset sentinel and include `{ dataReference, dataVersion, pivot/state identity }` in compute identity. Same-reference/same-token skips; same-reference/changed-token or token removal recomputes; changed-reference recomputes even when values match.
5. Add declaration assignments for React setters and ordinary updater callbacks for every advertised pivot slice, and verify root export of `OnChangeFn` plus all documented runtime/type exports. The controlledness matrix is part of the declaration/integration evidence, not an inferred callback convention.

**Verification:**

```bash
pnpm exec vitest run packages/pivot/src/__tests__/types.test.ts packages/pivot/src/__tests__/pivotTable.test.ts packages/pivot/src/__tests__/propGetters.test.ts packages/pivot/src/__tests__/serialize.test.ts packages/react/src/__integration__/pivot-controlled.test.tsx
```

**Stop/rollback:** any whole-state cast, controlled local mutation, missing offset/pinning metadata, engine-result mutation, or recursive dataset comparison fails R4; revert only Phase 4 and keep the gate blocked.

### Phase 5 — R5 channel evidence and instance ownership verification

**Files:** `packages/core/src/announcer.ts`, `packages/core/src/createDataTable.ts`, `packages/react/src/ReactAnnouncer.tsx`, `packages/react/src/useDataTable.ts`, `packages/react/src/usePivotTable.ts`, `packages/core/src/announcer.test.ts`, `packages/react/src/ReactAnnouncer.test.tsx`, `packages/react/src/__integration__/multi-instance-announcer.test.tsx`, `loading-announcer.test.tsx`, and `pivot-announcer.test.tsx`.

1. Retain the explicit per-instance channel passed by each hook. Define the non-breaking boundary as `Announcer.announce(message, politeness?)` plus an optional `subscribe(listener): Unsubscribe` extension (or an internal `AnnouncerChannel` with the same lifecycle); do not make subscription required for custom announcers. Replace method-overwrite wiring in `ReactAnnouncer` with subscription/disposal, and ensure the hook wraps announce-only custom announcers with its private channel so core announcements remain synchronous while the live region receives messages after mount. Direct core prefers the explicit instance announcer and uses the global fallback only when no instance announcer is supplied.
2. Define lifecycle behavior: a subscription is stable for the instance, receives each post-subscription announcement once with its politeness, and disposal removes only that listener; announcements before mount are not replayed, while announcements after mount reach the matching live region. Strengthen tests to announce unique messages from both DataTables, both PivotTables, and mixed siblings; test a minimal `{ announce }` custom announcer, sibling unmount in both orders, survivor announcements, and Strict Mode. Assert matching live-region text, not node count, and keep the global no-op cleanup absent.

**Verification:**

```bash
pnpm exec vitest run packages/core/src/announcer.test.ts packages/core/src/createDataTable.test.ts packages/react/src/ReactAnnouncer.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx packages/react/src/__integration__/loading-announcer.test.tsx packages/react/src/__integration__/pivot-announcer.test.tsx
```

**Stop/rollback:** any cross-instance message, lost survivor message, singleton routing, global no-op cleanup, or DOM-count-only assertion leaves R5 open.

### Phase 6 — isolated packed artifacts, versions, and live-doc failure (R6)

**Files:** `scripts/check-package-artifacts.mjs`, `scripts/check-public-surface.mjs`, `scripts/check-docs-version.mjs`, `scripts/package-artifact-fixture.ts`, `tsconfig.package-artifact-fixture.json`, `fixtures/consumers/v2/{core,react,pivot,worker}/package.json`, every `fixtures/consumers/v2/*/src/index.ts`, root/package manifests, `packages/{core,react,pivot,worker}/src/index.ts`, `packages/worker/src/version.ts`, and live docs/version inputs.

1. Make the documented export matrix executable rather than a declaration grep. Derive package/subpath entries from the checked-in package `exports` plus explicit documented symbol expectations; remove nonexistent names or add the intentionally documented export. Runtime imports must execute from the temporary install, and type imports must compile from installed declarations.
2. Make all clean fixtures real source consumers and close their internal peer graph. Committed manifests contain version placeholders only (never `workspace:*`); the checker copies them to a temp root and injects this direct temporary closure: core fixture → core; pivot fixture → pivot+core; React fixture → react+core+pivot; worker fixture → worker+pivot+core. It substitutes `file:<temp>/tarballs/*.tgz` for every internal dependency/peer, pins external versions from the repository lock metadata, runs `pnpm install --ignore-workspace`, records `pnpm why`/resolved package roots, and compiles each `src/index.ts` with NodeNext resolution. Fix fixture imports such as missing React runtime imports and avoid calling a hook outside a component in runtime fixtures.
3. Replace dry-run/repository-dist checks with `pnpm pack --pack-destination <temp>/tarballs` for all four packages. Inspect each packed manifest and require every internal peer range to be a concrete compatible version or the checker-generated temporary override—never `workspace:*`. For every fixture, assert that every `@lynellf/tablekit-*` package resolves from the temporary tarball/install closure and that no registry, workspace, source, repository-relative, or `packages/*/dist` path is used. Execute root and every documented subpath import with Node from that install. Print tarball names, packed peer graph, install roots, resolved internal package paths, compiler results, runtime matrix, and version matrix.
4. Remove path mappings to `packages/*/dist` from `tsconfig.package-artifact-fixture.json`; use the temporary install root or checker-generated config. The checker itself invokes fixture compile, isolated runtime/public-surface checks, peer-closure/resolution inspection, and docs drift so `pnpm check:package-artifacts` is the single boundary gate. Standalone public-surface or `tsc` commands must require an explicit generated artifact root and are diagnostics only, never Foundation boundary proof.
5. Make runtime `VERSION` values derive from root/package metadata during build, including worker, and assert packed runtime values match all manifests. Do not leave independently edited literals as the source of truth.
6. Make `check-docs-version.mjs` fail nonzero for unmarked live drift. Exempt only `docs/archive/**` and files containing `Historical: true`; preserve explicit historical markers and correct live claims. Wire this command into the package-artifact checker.

**Verification:**

```bash
pnpm build
pnpm check:package-artifacts
node scripts/check-docs-version.mjs
```

The direct diagnostics are allowed only when they point at the isolated artifact root and must be labeled non-authoritative in evidence:

```bash
node scripts/check-public-surface.mjs --artifact-root "$TABLEKIT_ARTIFACT_ROOT"
pnpm exec tsc -p "$TABLEKIT_ARTIFACT_ROOT/tsconfig.package-artifact-fixture.json"
```

**Stop/rollback:** any repository-dist alias, type-only grep, workspace dependency, missing fixture source, runtime import from the workspace, warning-only docs drift, or manifest/runtime version mismatch rejects R6 evidence. Revert only the checker/fixture slice and rebuild from a clean temporary root.

### Phase 7 — evidence closeout and independent re-gate (R7)

**Files:** new `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-evidence-round-7.md`; `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md` remains blocked and is not changed by the implementer.

1. Start from a pristine committed checkout: record the implementation commit SHA, require `git status --porcelain` to be empty before building, remove prior `dist` and temporary fixture roots, and create the generated artifact root outside the workspace. Run every focused command from Phases 1–6 and record exact file/test counts and outputs, including exact first/next/previous cursor objects and reset transitions, canonical-key collision/rejection results, Strict Mode one-call counts, stale metadata retention, A→B→unset version publication/recompute assertions, callback delivery counts for all controlledness combinations, pinned offsets including undefined/zero semantics, packed tarball names, packed peer closure, isolated install roots, resolved internal package paths, runtime export matrix, fixture compiler result, version matrix, docs drift result, and the commit SHA.
2. Run the repository gate from that same clean checkout/build output:

```bash
pnpm verify
```

3. Record a complete F0.1–F0.6/R1–R7 decision matrix in `review-evidence-round-7.md`, including N1 pinned-offset semantics, N2 diagnostic-vs-authoritative command labeling, and the six B7 exact assertions. Do not claim R3/R5/R6 approval based on the historical round-3 artifact. Preserve `review-decision.md` as `REQUEST-CHANGES` and explicitly state that only an independent reviewer can change it; evidence generation may be committed only after the clean-checkout run is captured.
4. Route the complete evidence package to Plan Reviewer B first for this change request, then to the standard independent reviewer sequence. Phase 2 remains stopped until the independent reviewer updates the decision.

**Closeout acceptance:** every required finding has a regression that fails under the old behavior, exact isolated artifact evidence is present, the decision remains blocked until independent review, and no Phase 2 authorization appears prematurely.

## Round-7 bounded correction — six additional blocking findings

This section has precedence over any earlier sentence in this file that leaves one of these six contracts implicit. It is a correction to the Foundation execution/evidence plan, not new product scope. The handoff supplied the following six authoritative finding labels; the operational wording below makes each one implementable and testable.

### B7-REQUEST-TRIGGERING — request ownership and trigger matrix

`useDataSource` must derive a request descriptor from the latest committed table snapshot and source reference. The descriptor contains only request inputs: source reference identity, all source capabilities including `pagination` strategy, serialized sorting and filters, the relevant pagination state, hook-owned cursor selection, the outgoing data-version token, and the refetch nonce. It must not contain status, rows, total count, returned cursor metadata, error, or any other publication state.

The following matrix is the complete request policy:

| Event | Cursor selection | Request behavior |
|---|---|---|
| Non-null source mount/add | initialize to `{ cursor: null, direction: 'next' }` | Start exactly one request. |
| Source reference replacement, capability/strategy change, sort change, filter change, or page-size change | reset to `{ cursor: null, direction: 'next' }` before building the query | Abort/retire the old request and start exactly one replacement request. |
| Offset `pageIndex` change | not applicable | Start exactly one request with the new offset. |
| Explicit `selectCursor(cursor, direction)` on a cursor source | use the supplied selection, including an explicit `null` | Start exactly one request; never translate the cursor through `pageIndex`. |
| `refetch()` | preserve the current selection | Start exactly one request with a new nonce. |
| Source removal/null | clear selection and response metadata | Abort/retire work and publish idle; never call `getRows`. |
| Status/data/error/total/cursor/version publication, or an unchanged options render | unchanged | Update the snapshot only; never start a request. |

A cursor selection is preserved only by explicit cursor navigation or `refetch`; every other query-context change resets it before query construction. A table subscription may cause a render through `useSyncExternalStore`, but it must not call a fetch runner. The effect is keyed by the canonical descriptor result, so a loading or success notification cannot recursively create another request. A descriptor key is attempted once per committed hook instance; a real key replacement or unmount retires the prior entry. The latest descriptor, not a stale closure or `sourceRef` value, supplies `getRows` and the acceptance guards.

**Execution files:** `packages/react/src/useDataSource.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/dataSource/query.ts`, and `packages/core/src/dataSource/types.ts`.

**Required evidence:** extend `packages/react/src/__integration__/data-source-contract.test.tsx` (new) and `abort-stale.test.tsx` to cover mount, source replacement, every reset trigger, offset page changes, cursor selection, refetch, publication-only notifications, and exactly one call per descriptor key. Assert the exact received `RowsQuery`, abort signal, and stale-result rejection.

### B7-SERIALIZER-ERRORS — canonical query-key serialization and failure behavior

Add one internal canonical serializer at `packages/core/src/dataSource/queryKey.ts` (or an explicitly approved equivalent) and use it for the hook request descriptor. Its accepted grammar is: `null`, booleans, strings, finite numbers, arrays preserving order, and plain objects with recursively sorted own string keys. It rejects `undefined` (including array members), functions, symbols, bigint, `NaN`, positive/negative infinity, cyclic graphs, `Date`, `Map`, `Set`, class instances, and other non-plain objects. Registry names are the only function representation allowed across the query boundary; an inline/unregistered filter predicate or a function-valued filter value is an error, never an `equals` fallback and never an omitted key field.

Rejected input produces a typed deterministic `QueryKeySerializationError` with a stable code, value kind, and property path (for example `filters[0].value.term`). Equivalent plain objects with different insertion order produce byte-identical keys; array order remains significant. The descriptor builder returns a valid key or an invalid descriptor carrying that error, rather than throwing during render. The request effect catches the invalid descriptor, publishes `status: 'error'`, retains the prior stale-while-revalidate rows/total/cursor/version metadata, does not call `getRows`, and does not treat the error as an abort. The invalid descriptor is marked as handled so repeated status notifications publish neither duplicate errors nor duplicate attempts. A subsequent valid descriptor recovers normally.

**Required evidence:** add `packages/core/src/dataSource/__tests__/query-key.test.ts` for canonical ordering, array ordering, each rejected value kind, cycles, registry-only functions, stable error paths/codes, and collision resistance. The React contract fixture must assert that serializer errors are observable in state, preserve stale metadata, call `getRows` zero times, and recover on the next valid query.

### B7-CURSOR-METADATA — response metadata versus request selection

Keep the two concepts separate. The hook-owned `CursorSelection` is request identity and is never published as `DataSourceState.cursor`. `DataSourceState.cursor` and `UseDataSourceResult.cursor` are response navigation metadata with the existing `CursorState` shape. For an accepted result from a cursor-capable source, always publish both keys as `{ nextCursor: result.nextCursor ?? null, previousCursor: result.previousCursor ?? null }`; omitted response fields therefore clear stale controls. An accepted offset result omits cursor metadata. Before the first accepted result and after source removal, cursor metadata is absent.

Replacement loading and error retain the last accepted rows, total count, response cursor metadata, and accepted version token when the new source strategy is compatible. A source removal, source-strategy change, or accepted offset result clears cursor metadata; a non-null source replacement may retain rows under SWR but must not use the old selection in its query. A successful result's cursor fields are authoritative even when they are `null`. `selectCursor` is exposed only for cursor-capable sources, preserves no selection across a source/sort/filter/page-size/capability transition, and `refetch` repeats the current selection.

**Required evidence:** in `cursor-pagination.test.tsx` and the new contract fixture assert exact first/next/previous queries, selected direction, returned `null`/omitted cursor normalization, loading/error retention, source removal clearing, offset-source omission, and reset-to-first-page queries after each non-cursor context transition.

### B7-MANUAL-CAPABILITY-PERSISTENCE — source-scoped private capability overlay

Manual flags derived from a source are private effective options, not a sparse public `setOptions` patch. Replace the boolean-only seam with an idempotent source-scoped capability seam (or equivalent) that records `{ sourceIdentity, sort, filter, paginate, paginationStrategy }`. While that source identity is active, row-model and row-count decisions use the derived flags even when the React adapter subsequently calls `table.setOptions(options)` with a new object. A source capability/strategy change replaces the overlay before the next query; the same capability snapshot is a no-op. Removing the source clears the overlay and restores the consumer's explicit `manualSorting`, `manualFiltering`, and `manualPagination` options.

The overlay must never replace `data`, `columns`, `rowCount`, state, or any other consumer option. The query descriptor uses source capabilities (including strategy), not a status notification or a derived manual-flag object, so applying the overlay cannot itself loop. Direct consumers without a source retain their public manual options unchanged. Source add, replacement, capability flip, and removal are all explicit ownership transitions.

**Required evidence:** add `manual-capability-persistence.test.tsx` or keep the cases in `data-source-contract.test.tsx`. Render a source, rerender with new inline options, swap source capabilities from offset to cursor and back, remove the source, and assert effective row-model behavior, exact queries, restored consumer flags, no `data`/`columns`/`rowCount` option writes, and no duplicate requests.

### B7-STRICT-MODE-OWNERSHIP — one hook instance owns one request lease

The one-request-per-key guarantee is scoped to one committed hook instance, including React Strict Mode effect setup/cleanup/replay. Implement a short-lived per-hook in-flight entry `{ key, controller, requestToken, status }` with a replay lease: effect cleanup schedules release in a microtask, and an immediate setup for the same hook instance and key reattaches to that entry instead of calling `getRows` again or aborting it. A true key replacement retires and aborts the old entry before creating the new one; a real unmount with no replay retires/aborts it. Entries are never shared between sibling hook instances, and a source replacement cannot reattach to an old key.

Every result/error publication must match the entry token, non-aborted signal, current source identity, and current descriptor key. Strict Mode behavior must be tested as ownership/lifetime, not inferred from a request count alone: the first request's signal remains live through replay, exactly one call is made for the committed key, a replacement makes exactly one new call and aborts the old signal, and unmount eventually aborts the owned entry. Invalid serializer descriptors use the same per-key lease and do not invoke transport.

**Required evidence:** add a Strict Mode case to `data-source-contract.test.tsx` (or a focused `strict-mode-data-source.test.tsx`) with a deferred source and explicit signal assertions, plus sibling-instance isolation to prove no global/shared request registry exists.

### B7-ROW-MODEL-IDENTITY — reference plus canonical version is the cache contract

Define one resolved row identity at every boundary: `(data array reference, DataVersionToken | UNSET)`. The token is resolved from the source-owned configured policy first, then the table policy; an accepted `RowsResult.dataVersion` is publication metadata and never silently becomes the next outgoing token. Use an explicit internal `UNSET_DATA_VERSION` sentinel so token removal is a real transition. No publisher may compare an incoming token to a freshly read current option; it compares against its own previously published token.

`RowModelCache`/`MemoKey` must include data reference, resolved token, every effective pipeline slice, resolved column identity/schema, row-id accessor identity, and effective manual flags. A cache hit returns the exact prior row-model array only when all those identities match. Same reference/same token reuses; same reference with token A→B or B→UNSET invalidates, publishes one notification, and recomputes; a new reference recomputes even when its values are deeply equal. No recursive/deep row equality is permitted. Data-source result replacement applies the same rule to `getRowModel`; pivot compute identity uses the same pair and must follow the same A→B→UNSET cases.

**Execution files:** `packages/core/src/dataSource/types.ts`, `packages/core/src/createDataTable.ts`, `packages/core/src/pipeline/memo.ts`, `packages/pivot/src/types.ts`, and `packages/pivot/src/pivotTable/factory.ts`.

**Required evidence:** extend `packages/core/src/pipeline/memo.test.ts` and `createDataTable.test.ts` with exact array-reference cache-hit and A→B→UNSET notification/recompute tests, including token removal and a deeply equal new array. Extend `packages/pivot/src/__tests__/pivotTable.test.ts` with the same identity matrix. Assert that direct, client-source, remote-result, hook, and pivot boundaries all retain the accepted token through SWR and clear it on a tokenless success.

## Round-7 ordered correction tasks and verification

The following tasks are ordered and must complete before the corresponding existing phase may pass its gate:

1. **Contract seams and serializer (before existing Phase 1/2):** add the canonical token/sentinel, request descriptor, cursor input/metadata contract, typed serializer result/error, and source-scoped capability seam. Update public/internal types without introducing a second public data-source shape. Verify with:
   ```bash
   pnpm exec vitest run packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/core/src/dataSource/__tests__/query-key.test.ts packages/core/src/pipeline/memo.test.ts
   ```
2. **Hook orchestration and metadata (existing Phase 2):** implement the trigger matrix, reset selection before replacement query construction, SWR metadata copying/clearing rules, serializer-error publication, and one-request-per-key orchestration. Verify with:
   ```bash
   pnpm exec vitest run packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/cursor-pagination.test.tsx packages/react/src/__integration__/nullable-source-lifecycle.test.tsx packages/react/src/__integration__/data-source-contract.test.tsx
   ```
3. **Capability persistence (existing Phase 2):** prove the private overlay survives the adapter's normal options effect and is cleared/restored on source removal. Include this in the contract fixture and no-sparse-write spy; do not proceed on any effective-flag drift.
4. **Cache/pivot identity (existing Phase 1/4):** finish the row-model and pivot identity matrix, then run:
   ```bash
   pnpm exec vitest run packages/core/src/createDataTable.test.ts packages/core/src/pipeline/memo.test.ts packages/pivot/src/__tests__/pivotTable.test.ts packages/pivot/src/__tests__/types.test.ts
   ```
5. **Strict Mode and closeout evidence (existing Phase 7):** run the focused commands above plus `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm check:package-artifacts`, and `pnpm verify` from a clean checkout. Record exact request counts/signals, serializer error code/path, cursor metadata transitions, effective capability transitions, and cache identities in `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-evidence-round-7.md`.

## Round-7 acceptance and stop conditions

The correction is ready for Plan Reviewer B only when all six findings have both implementation rules and passing evidence: (1) every trigger in the matrix starts one and only one current request; (2) unsupported/cyclic query inputs fail deterministically without transport and with retained stale metadata; (3) cursor selection never leaks into response metadata and response metadata is normalized/cleared as specified; (4) source-derived manual flags survive normal option updates and restore on removal without sparse writes; (5) Strict Mode replay reuses one hook-owned live request while replacement/unmount retires it; and (6) row-model/pivot identities obey reference-plus-token semantics including token removal, without deep equality. The active review decision remains `REQUEST-CHANGES`; this correction does not authorize implementation Phase 2 or update the decision file.

A failed exact call count, serializer path/error, metadata transition, capability restoration, Strict Mode signal assertion, or identity/notification assertion is a stop condition for the relevant slice. Roll back only the current correction slice and keep the Foundation gate blocked; do not paper over failures with a fetch lock, global request registry, deep equality, or repository-dist evidence.

## Risks, rollback, and unknowns

| Risk/unknown | Mitigation | Stop/rollback |
|---|---|---|
| Query key can accidentally include status and loop | Key only serialized request inputs; status is snapshot data; assert one request per key | Revert Phase 2 if loading/success changes the key |
| Canonical serialization can collapse equivalent/unsupported filter values or duplicate under Strict Mode | Sort object keys, reject unsupported/cyclic values before transport, and assert one `getRows` call under Strict Mode replay | Stop Phase 2 on any collision, uncaught serializer error, or duplicate replay request |
| Version token can be compared to a current option instead of prior publication | Store previous token with an unset sentinel per publisher and test same-ref A→B→unset paths | Stop Phase 1/4; no deep-equality fallback |
| Controlled resize callback cannot synchronously update the parent | Treat parent rerender as the handoff boundary and test it explicitly; do not mutate controlled local state | Stop Phase 4 on stale-session behavior |
| Pinned offset direction is ambiguous | Document edge-distance and deterministic pin-array ordering in the type/test fixture | Stop Phase 4 if offsets are not reproducible |
| Isolated pnpm install resolves a workspace peer or registry package | Build the explicit core/pivot/react/worker peer closure, inspect packed manifests, pin external metadata, and assert every resolved internal root | Reject artifact evidence and delete temp root |
| Docs historical markers hide live claims | Allow only explicit marker/archive exemptions and review every changed live file | Stop Phase 6 on any unmarked warning |
| Announcer channel extension breaks minimal custom objects | Keep `announce` required and subscription optional; test announce-only custom announcers and pre/post-mount behavior | Stop Phase 5 on any required new method or lost post-mount message |

Rollback is phase-scoped. Do not edit archive/history files to hide a failed gate, do not rewrite the blocked decision as approval, and do not start Phase 2.

## User decisions and assumptions

No new user decision is required. This plan assumes the previously accepted 2.0 package names, additive pivot state direction, constructor-baseline reset semantics, unconditional stale-while-revalidate contract, and C0 compatibility stop. There is no UI/design input because this is a headless Foundation remediation; screenshot and browser visual evidence are not applicable. The only required procedural decision is the independent reviewer sign-off after exact evidence is recorded.

## Planning telemetry

- `okf_docs_read`: 0 (`.okf/` is absent in this checkout)
- `okf_tokens_read`: 0
- `source_files_read`: 21 unique source/config/test files directly inspected in this bounded correction; prior active package telemetry is retained as historical context
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 (no repository OKF map is available)

## Artifact index

- [`spec.md`](./spec.md) — reused accepted 2.0 scope and global acceptance criteria.
- [`phase-1-foundation.md`](./phase-1-foundation.md) — reused F0.1–F0.6 contract phase.
- [`phase-1-foundation-remediation-round-5.md`](./phase-1-foundation-remediation-round-5.md) — active round-7 bounded correction and ordered implementation plan.
- [`phase-1-foundation-remediation-round-4.md`](./phase-1-foundation-remediation-round-4.md) — superseded historical correction delta; not an implementation dependency.
- [`phase-1-foundation-remediation-round-3.md`](./phase-1-foundation-remediation-round-3.md) — superseded historical context.
- [`phase-1-foundation/review-decision.md`](./phase-1-foundation/review-decision.md) — authoritative blocked decision; unchanged until independent re-gate.
- `phase-1-foundation/review-evidence-round-7.md` — implementer closeout artifact to create only after all corrected Foundation slices pass; not yet present.

**Implementation routing:** after Plan Reviewer B accepts this revision, dispatch one implementer for Phase 0, then each phase in order with a stop/continue result. Route any further change request back to Plan Reviewer B first; route only the completed Phase 7 evidence to the independent reviewer sequence. Do not dispatch Phase 2 product work.
