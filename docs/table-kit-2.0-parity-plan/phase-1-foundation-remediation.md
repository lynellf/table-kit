<!-- Historical: true -->
# Phase 1 Foundation remediation — F0.1–F0.6

**Request class:** remediation (superseded)
**Status:** historical context only; the active round-4 plan is [`phase-1-foundation-remediation-round-4.md`](./phase-1-foundation-remediation-round-4.md); implementation must follow round 4 and must not start Phase 2
**Parent phase:** [`phase-1-foundation.md`](./phase-1-foundation.md)
**Source specification:** [`../table-kit-2.0-parity-assessment-and-spec-v2.md`](../table-kit-2.0-parity-assessment-and-spec-v2.md)
**Consolidated reviewer findings:** re-review returned `REQUEST-CHANGES` with seven required findings: `F0.1-per-slice-retention-and-pruning`, `F0.2-nullable-hook-and-request-races`, `F0.2-pagination-contract`, `F0.3-pivot-completion-and-tests`, `F0.4-contract-and-documentation-gate`, `F0.5-announcer-ownership-and-regression-test`, and `F0.5-data-identity-escape-hatch`.

## Goal and current delta

Repair only the incomplete Foundation contract. The prior implementation removed two sparse data-source writes, corrected the four original pivot callback declarations, added partial pivot setters, aligned the current `1.0.1` runtime constants, and changed one core comparison to reference equality. Those changes are insufficient for the approved `2.0.0` gate:

- `createDataTable.setOptions` still fills omitted slices from `DEFAULT_STATE`, so a partial `next.state` resets unrelated effective state. No removed-column pruning exists.
- `useDataTable` conditionally invokes `useDataSource`; `useDataSource` is non-nullable, retains `fetchingRef` gates, has no request token/query identity, and has no cursor contract.
- Pivot shared slices have no dedicated controlled callbacks or resolved state-derived leaf sizing/pinned offsets. `OnChangeFn` is not protected by declaration coverage.
- F0.4 was explicitly deferred even though it is part of this phase. Live v1 freeze/release claims remain canonical and there is no v2 packed-consumer/export/migration gate.
- Announcements still route through one module/global “current” announcer. The current test unmounts the non-current instance and never checks a live region.
- Pivot still recursively compares the full data array; the core comment mentions a version escape hatch that is not present in the public contract.

The accepted phase scope and all non-goals remain unchanged. This document is the executable correction delta, not a second roadmap.

## Required behavior and assumptions

1. **State baseline:** capture the constructor-effective baseline (`DEFAULT_STATE` overlaid by `initialState`, then constructor `state`) for reset semantics. `initialState` is constructor-only. `resetSlice` and `resetState` restore that baseline for uncontrolled slices and send the baseline value through the relevant callback for controlled slices. `resetState` is one atomic transition/notification.
2. **Per-slice reconciliation:** on every later `setOptions`, a key owned by `next.state` adopts that value; every omitted key retains the current effective value regardless of its previous controlled/uncontrolled status. A controlled-to-uncontrolled slice therefore retains its last value until explicit reset; an uncontrolled-to-controlled slice adopts the supplied value.
3. **Column pruning:** when the column model changes, prune only invalid IDs from every ID-bearing slice (sorting/filter IDs, order, visibility, pinning, sizing, and focused-cell column ID); preserve valid values and unrelated slices. Pruning must be deterministic and must not reset state to defaults.
4. **Data-source pagination:** retain the existing page-index table state for client pagination, but introduce explicit wire types: `{ type: 'offset', offset, limit }` and `{ type: 'cursor', cursor, limit, direction }`. Server sources declare their strategy. Cursor state/result exposes the current cursor and returned next/previous cursors; it is never silently converted to `pageIndex`.
5. **Data identity:** immutable array/reference identity is the default. Add a documented `DataVersion` escape hatch to both direct options and data-source results/state so a same-reference mutable update can be published intentionally. No full-row deep equality is allowed in option updates.
6. **Announcers:** hook-created DataTable/PivotTable instances receive their own stable channel and their matching `ReactAnnouncer` renders that channel. The global announcer remains an explicit direct-core fallback only; a sibling mount/unmount cannot replace or disable another instance.
7. **Release target:** the corrected Foundation contract is `2.0.0`. Root/package metadata, runtime constants, exports, fixtures, live docs, and the migration guide must agree. Historical v1 documents may retain their old numbers only under an explicit historical/archived label.

## Ordered remediation tasks

### R1 — Make core state reconciliation complete

**Depends on:** none

**Files / discovery:**
- `packages/core/src/state.ts`
- `packages/core/src/createDataTable.ts`
- `packages/core/src/types.ts`
- `packages/core/src/columns.ts` (reuse or extend ID-resolution helpers)
- `packages/core/src/state.test.ts`, `packages/core/src/createDataTable.test.ts`, `packages/core/src/columns.test.ts`
- `packages/react/src/useDataTable.test.tsx` and the closest existing integration fixture for option re-renders

**Implementation:**
1. Replace the dead `this.options === undefined` first-set branch with an explicit constructor baseline/initialization field. Resolve all slices independently in `setOptions`, rather than passing a partial object through `mergeInitialState` and letting `DEFAULT_STATE` fill omissions.
2. Store the constructor-effective baseline and use it consistently for `resetSlice`/`resetState`. Preserve controlled-to-uncontrolled values over repeated option updates. Keep callback dispatch behavior aligned with the effective-state contract.
3. Add a pure, tested pruning step keyed by the next column IDs. It must filter invalid IDs/keys and clear an invalid focused cell without changing valid values or non-column slices. Apply it after per-slice reconciliation and before change detection.
4. Ensure the latest `data`, `columns`, callbacks, and flags are still installed even when the state snapshot is unchanged; keep snapshot identity stable for a semantic no-op.

**Acceptance evidence:**
- Every slice in `DataTableState` survives partial `next.state`, inline options, data replacement, and Strict Mode-style repeated option updates.
- Controlled-to-uncontrolled retains the last effective value across at least two updates; uncontrolled-to-controlled adopts the supplied value.
- Reset restores the constructor baseline and is tested for both controlled and uncontrolled slices.
- Removed IDs are pruned only where invalid; valid order, visibility, pinning, sizing, sorting/filtering, and focus survive.

**Focused verification:**
```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/react/src/useDataTable.test.tsx packages/react/src/__integration__/simple.test.tsx
```

**Stop condition:** if reset or controlled-transition semantics require a new public breaking decision beyond the documented `2.0.0` contract, stop and escalate before changing the remaining tasks.

### R2 — Define the serializable pagination and identity contracts

**Depends on:** R1 state semantics for the table-side page state

**Files / discovery:**
- `packages/core/src/dataSource/types.ts`
- `packages/core/src/dataSource/query.ts`
- `packages/core/src/dataSource/query.test.ts` and `packages/core/src/dataSource/__tests__/query.golden.test.ts`
- `packages/core/src/types.ts`
- `packages/core/src/index.ts`
- `packages/core/src/dataSource/index.ts`

**Implementation:**
1. Add exported `DataVersion`, `OffsetPagination`, `CursorPagination`, and their discriminated union. Keep `PaginationState` as the local page-index state; only the query translator maps it to offset pagination.
2. Add an explicit pagination strategy to `DataSourceCapabilities` and define the cursor contract: a cursor source receives the current cursor/direction/limit and may return `nextCursor`/`previousCursor`; an offset source receives offset/limit and may return `totalRowCount`. Add the cursor fields to `DataSourceState`/result types as needed, without pretending a cursor has a page count.
3. Add `dataVersion` to direct table/data-source boundaries and `getDataVersion` where a consumer needs to derive a token from mutable input. Document immutable-data expectations and make the token part of update/query identity.
4. Update root and data-source barrels so the new public types are importable from the documented package paths.

**Acceptance evidence:**
- Offset and cursor query fixtures are distinct, JSON-safe, and round-trip without `pageIndex` substitution.
- Type tests reject a cursor query where offset fields are expected and vice versa.
- Same-reference data with an unchanged version is a no-op; same-reference data with a changed version is observable through the documented boundary.

**Focused verification:**
```bash
pnpm exec vitest run packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/core/src/types.test-d.ts packages/core/src/index.test.ts
```

**Stop condition:** do not add a cursor UI or a general cache. If a consumer-facing cursor transition API cannot be expressed without changing the table state model, keep the cursor state/result at the data-source boundary and document that navigation is consumer-owned.

### R3 — Replace the data-source hook with a nullable, query-driven lifecycle

**Depends on:** R2 pagination/identity types

**Files / discovery:**
- `packages/react/src/useDataTable.ts`
- `packages/react/src/useDataSource.ts`
- `packages/react/src/__integration__/abort-stale.test.tsx`
- `packages/react/src/__integration__/async.test.tsx`
- `packages/react/src/__integration__/server-pagination.test.tsx`
- new bounded fixtures under `packages/react/src/__integration__/` for nullable source, source replacement, cursor, and sparse-write instrumentation

**Implementation:**
1. Invoke `useDataSource(table, options.dataSource ?? null, t)` unconditionally. The null branch must still call all hooks in the same order, return a stable idle result, subscribe to nothing, abort any prior request, and clear data-source status without changing table `data` or `columns`.
2. Remove `fetchingRef` and both early-return gates. Build a stable JSON-safe query key from source object identity/optional source version, relevant table state, capabilities, pagination strategy/cursor, data version, and a refetch nonce. A source identity may use an internal `WeakMap` ID; functions must not enter the serialized key.
3. On every new key: abort the prior controller, increment a monotonically increasing token, publish loading while retaining prior successful rows, start exactly one request, and accept success/error only when both token and signal match. A query change during an active request must always supersede it. `refetch` increments the nonce and therefore starts a replacement request rather than only toggling loading.
4. Keep manual capability flags on the private seam only. Add an assertion/test spy around `setOptions` that fails if any data-source path writes `data`, `columns`, or `rowCount`. Keep `totalRowCount` and cursor metadata in data-source state/result.
5. Ensure source add/remove/replacement, controlled and uncontrolled slices, out-of-order promises, aborts, synchronous throws, and stale-while-revalidate behavior are covered.

**Acceptance evidence:**
- Adding/removing `dataSource` never changes hook order and produces idle/no-subscription when absent.
- Source identity and capability changes issue one current request; old responses cannot publish.
- Sort/filter/page/cursor changes during a pending request abort and replace it; no change is dropped by an in-flight guard.
- Real columns are used to serialize filters. No sparse option patch containing `data`, `columns`, or `rowCount` is emitted.

**Focused verification:**
```bash
pnpm exec vitest run packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx packages/react/src/__integration__/useDataSource-minimal.test.tsx packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts
```

**Stop condition:** if an effect/subscription can re-trigger solely from its own loading/success notification, fix the query-key guard before adding more cases; do not mask the loop with a fetch lock.

### R4 — Complete the pivot public state contract and its declaration coverage

**Depends on:** R1 state semantics and R2 `DataVersion`

**Files / discovery:**
- `packages/pivot/src/types.ts`
- `packages/pivot/src/pivotTable/factory.ts`
- `packages/pivot/src/engine/treeBuilder.ts` and the existing core resize helpers (reuse rather than duplicate where compatible)
- `packages/pivot/src/index.ts`, `packages/pivot/src/pivotTable/index.ts`
- `packages/pivot/src/__tests__/types.test.ts`, `packages/pivot/src/__tests__/pivotTable.test.ts`
- `packages/react/src/__integration__/pivot-controlled.test.tsx`, `packages/react/src/__integration__/usePivotTable-updates.test.tsx`

**Implementation:**
1. Export `OnChangeFn<T>` from the documented pivot root and use it for all existing and new per-slice callbacks: `onColumnPinningChange`, `onColumnSizingChange`, `onColumnSizingInfoChange`, and `onFocusedCellChange`.
2. Add resize-session commands (`startResize`, `adjustResize`, `commitResize`, `cancelResize`) and make every advertised shared slice meaningful for both uncontrolled and controlled instances. Controlled commands invoke the dedicated callback with the raw updater; they do not mutate local state. Preserve aggregate `onStateChange` ordering.
3. Make `setOptions` retain omitted pivot/shared slices, preserve controlled-to-uncontrolled values, honor constructor-only initial state, and use `data` reference plus `dataVersion`/`getDataVersion` rather than recursive row equality. Remove config comparison `JSON.stringify` from update paths where a shallow/reference comparison is sufficient.
4. Resolve `getLeafColumns()` from current state: apply `columnSizing` widths, derive effective pinning (including the existing total-column default), and expose deterministic pinned offsets. Keep engine result computation framework-free and do not add UI behavior here.
5. Add declaration tests assigning React `Dispatch<SetStateAction<T>>` and ordinary `(updater) => void` callbacks for every callback prop, plus controlled integration tests for pinning, sizing, resize session, and focus.

**Acceptance evidence:**
- Every advertised pivot slice has a dedicated setter/callback and a test proving controlled and uncontrolled behavior.
- Leaf size and pinned-offset output changes from state without mutating the engine result object.
- Same-reference/same-version data is stable; a changed version schedules a compute; obsolete compute results remain ignored.
- `OnChangeFn` is importable from the root package and all callback assignments compile.

**Focused verification:**
```bash
pnpm exec vitest run packages/pivot/src/__tests__/types.test.ts packages/pivot/src/__tests__/pivotTable.test.ts packages/pivot/src/__tests__/serialize.test.ts packages/react/src/__integration__/pivot-controlled.test.tsx packages/react/src/__integration__/usePivotTable-updates.test.tsx
```

**Stop condition:** do not remove the four pivot state slices. The approved decision is additive completion; removal requires a separate breaking-change approval.

### R5 — Make announcers instance-owned and prove sibling isolation

**Depends on:** R4 callback/factory surface; may proceed in parallel with R2–R3 after R1

**Files / discovery:**
- `packages/core/src/announcer.ts`, `packages/core/src/createDataTable.ts`
- `packages/pivot/src/pivotTable/factory.ts`
- `packages/react/src/ReactAnnouncer.tsx`, `packages/react/src/useDataTable.ts`, `packages/react/src/usePivotTable.ts`
- `packages/core/src/announcer.test.ts`
- `packages/react/src/ReactAnnouncer.test.tsx`, `packages/react/src/__integration__/loading-announcer.test.tsx`, `packages/react/src/__integration__/pivot-announcer.test.tsx`
- a new multi-instance integration fixture under `packages/react/src/__integration__/`

**Implementation:**
1. Add a stable per-instance channel abstraction in the React adapter (or a small core channel primitive) with `announce`, `subscribe`, and current-message behavior. Hook-created engines receive that channel through their initial options and retain it on later option updates unless an explicit consumer announcer is supplied.
2. Make `ReactAnnouncer` accept its matching channel and render only that channel. Retain a no-channel/global fallback only for explicitly direct use; remove the module-level “current announcer” as the routing mechanism for hook instances.
3. Change core announcement resolution to prefer the instance/options announcer and use the global announcer only when no instance announcer was supplied. `usePivotTable` must not register or reset a global no-op on mount/unmount.
4. Render two DataTables and two PivotTables in one tree, trigger messages in each, unmount the newest and oldest siblings in both orders, and repeat under Strict Mode. Assert actual live-region text and that messages stay with the matching instance.

**Acceptance evidence:**
- The exact global no-op cleanup is absent.
- Unmounting either sibling leaves the other instance announcing into its own live region.
- Strict Mode mount/unmount does not leak subscriptions or duplicate announcements.
- `getReactAnnouncer()` remains documented as a legacy/direct fallback and is not used to route hook-created instances.

**Focused verification:**
```bash
pnpm exec vitest run packages/core/src/announcer.test.ts packages/core/src/createDataTable.test.ts packages/react/src/ReactAnnouncer.test.tsx packages/react/src/__integration__/loading-announcer.test.tsx packages/react/src/__integration__/pivot-announcer.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx
```

**Stop condition:** if a global fallback is needed for an existing direct-core test, keep it behind an explicit no-channel path; never restore last-mounted global routing.

### R6 — Complete the v2 package, export, documentation, and fixture gate

**Depends on:** R1–R5 public contracts

**Files / discovery:**
- `package.json` and all four `packages/*/package.json`
- `packages/{core,react,pivot,worker}/vite.config.ts` and runtime version sources
- `packages/{core,react,pivot,worker}/src/index.ts` and all subpath barrels
- `scripts/check-package-artifacts.mjs`, `scripts/package-artifact-fixture.ts`, `tsconfig.package-artifact-fixture.json`
- new `scripts/check-public-surface.mjs`, `scripts/check-docs-version.mjs`, and `fixtures/consumers/v2/` clean consumer fixtures
- `docs/m6-hardening/api-freeze.md`, `docs/release-process.md`, `README.md`, `packages/*/README.md`, `docs/guides/*/guide.md`
- new `docs/migration-v1-to-v2.md`

**Implementation:**
1. Make root metadata the version source, derive/inject runtime `VERSION` during each package build, synchronize package manifests at the `2.0.0` release cut, and fail verification on package/runtime drift. Do not hand-maintain four independent runtime literals.
2. Define the v2 export matrix from actual root/subpath barrels. Add a built-runtime/declaration check that imports every documented symbol, including `OnChangeFn`, data-source pagination/version types, worker/server helpers, and React SSR/RSC-shaped imports.
3. Add clean packed-consumer fixtures for core, React client and SSR/RSC-shaped imports, pivot, worker, and every documented subpath. Fixtures must install/use packed artifacts and must not resolve repository `src` paths through workspace aliases. Wire them into `check:package-artifacts`/`verify`.
4. Mark `docs/m6-hardening/api-freeze.md` as historical/superseded, write `docs/migration-v1-to-v2.md` covering state retention/reset, callback type, pagination, data identity, and announcer changes, and correct live README/guides/release instructions to the v2 contract. Preserve archive history without making the drift check fail on intentional historical versions.
5. Add a docs/version drift check that catches live stale v1 claims and broken documented imports. Update the phase changes note only after implementation verification, with exact test counts and no “F0.4 deferred” language.

**Acceptance evidence:**
- Root/package manifests, runtime constants, declarations, and packed artifacts agree on `2.0.0`.
- Every live documented root/subpath import compiles and resolves from a clean packed fixture; no fixture imports private source files.
- v1 is explicitly historical, v2 migration notes enumerate intentional changes, and feature claims are labeled implemented/primitive-only/UI-required/unsupported/deferred.
- The docs/version/export checks run as part of `pnpm verify`.

**Focused verification:**
```bash
pnpm build
pnpm check:package-artifacts
pnpm exec tsc -p tsconfig.package-artifact-fixture.json
node scripts/check-public-surface.mjs
node scripts/check-docs-version.mjs
```

**Stop condition:** if a documented export cannot be made real without widening the Foundation scope, remove/correct the live claim and fixture rather than importing a private source path or adding an unrelated package feature.

### R7 — Foundation gate and evidence closeout (F0.6)

**Depends on:** R1–R6

**Files / artifacts:**
- all focused test artifacts above
- `docs/table-kit-2.0-parity-plan/phase-1-foundation/docs/changes.md` (rewrite stale claims only after passing)
- new `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md`
- generated packed tarballs/fixture output (not committed unless repository convention requires it)

**Implementation and gate procedure:**
1. Run every focused command from R1–R6, then run `pnpm verify` from a clean checkout. Record exact results, test count, package versions, export matrix, fixture output, and docs drift output.
2. Attach a decision matrix for every F0.1–F0.5 acceptance bullet, explicitly including partial-state retention, removed-column pruning, nullable hook order, in-flight replacement, offset/cursor queries, all pivot shared slices, actual sibling live-region messages, data-version publication, packed imports, and v1→v2 migration notes.
3. Reviewer must independently inspect the built package boundary and reject any green result that depends on stale fixtures, private source imports, or a test that does not exercise the failing path.

**Focused verification:**
```bash
pnpm verify
node scripts/check-public-surface.mjs
node scripts/check-docs-version.mjs
```

**Approve only if:** all required findings are closed with regression evidence and the complete `2.0.0` contract is usable from packed artifacts. Otherwise stop at Foundation; do not start `phase-2-column-hierarchy-and-sizing.md`.

**Rollback:** revert only the remediation changes on the Phase 1 branch. Do not rewrite historical v1 documents; correct their status/links while preserving their archived content.

## Remediation checkpoints

### Checkpoint A — after R1–R3

- Core partial-state/pruning matrix is green.
- Nullable data-source hook, source toggles, query key, token/signal race tests, and both pagination shapes are green.
- No sparse data/column/row-count option patch exists.
- Run the R1–R3 focused commands before beginning pivot/announcer work.

### Checkpoint B — after R4–R5

- Pivot declaration/controlled/shared-slice tests and actual per-instance announcer live-region tests are green.
- Reference identity plus explicit data-version behavior is covered for core and pivot.
- Run the R4–R5 focused commands before editing release docs/fixtures.

### Checkpoint C — Foundation exit

- R6 artifacts exist and are wired into verification.
- R7 decision matrix is complete and reviewer-approved.
- Only then may orchestration route to Phase 2.

## Scope boundaries and risks

| Risk | Mitigation / stop rule |
|---|---|
| State transitions can cause React render loops | Compare effective slice values, preserve snapshot identity on semantic no-op, and test repeated inline options/Strict Mode before UI work. |
| Loading notifications can re-enter data-source fetching | Query-key guard plus token; never use a fetching lock to suppress state changes. |
| Cursor contract can grow into a pager/cache project | Keep cursor state/result at the data-source boundary and navigation consumer-owned; no cache/debounce framework. |
| Pivot leaf metadata can diverge from engine results | Map immutable presentation metadata in `getLeafColumns`; do not mutate engine output; add deterministic offset tests. |
| Announcer cleanup can leak channels | Channel subscription cleanup is instance-scoped and tested in both sibling-unmount orders and Strict Mode. |
| Version/export docs are broad | Use the existing package-artifact checker as the base, add only bounded v2 fixtures/scripts, and exempt archives explicitly. |
| Implemented source changes already exist in the working tree | Tests must first demonstrate each failed path; do not accept the prior implementation note as evidence. |

## User decisions

No user question blocks this remediation. Assumptions above resolve the only contract ambiguities needed to implement the approved phase: constructor-baseline resets, discriminated offset/cursor wire types, consumer-owned cursor navigation, instance channels with explicit global fallback, and a `2.0.0` release target. A future C0 compatibility target remains deferred by the parent plan and is not part of this repair.

## Telemetry

- `okf_docs_read`: 0 (`.okf/` is absent)
- `okf_tokens_read`: 0
- `source_files_read`: 38 (parent spec/plan, core state/data-source/columns, React hooks/announcer/tests, pivot types/factory/engine/tests, package/build/release surfaces)
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 (no repository OKF map)

## Artifact index

- `docs/table-kit-2.0-parity-plan/spec.md` — accepted parent scope and global gates; reused, not re-litigated.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation.md` — accepted original F0.1–F0.6 phase; remediation delta is linked from its header.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation.md` — this document; ordered repair tasks, findings mapping, tests, release artifacts, and stop conditions.
- `docs/table-kit-2.0-parity-plan/phase-1-foundation/docs/changes.md` — stale implementation note to be rewritten only after R7 evidence.
- `docs/table-kit-2.0-parity-assessment-and-spec-v2.md` — source requirements and Foundation exit criteria.
- `docs/m6-hardening/api-freeze.md`, `docs/release-process.md`, package READMEs, and guides — live documentation artifacts to correct under R6; historical archive content is not rewritten.
