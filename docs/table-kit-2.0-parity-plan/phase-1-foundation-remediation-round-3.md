# Phase 1 Foundation — remediation round 3

**Run:** `843d34c8-5fb7-4ba8-b09b-3d571f09499b`
**Review outcome:** `REQUEST-CHANGES`
**Status:** blocked; do not start Phase 2
**Source specification:** [`../table-kit-2.0-parity-assessment-and-spec-v2.md`](../table-kit-2.0-parity-assessment-and-spec-v2.md)
**Evidence source:** reviewer session `2026-07-11T21-28-08-206Z_019f5314-9f0e-71c8-8cd8-ca0f8c34a2a2.jsonl`
**Supersession:** this round-3 plan is the active remediation plan; the earlier remediation artifact is historical context only and is not an implementation dependency.

## Outcome

The latest reviewer session ended and emitted its handoff successfully, but the run did **not** complete successfully: the Phase 1 re-gate returned `REQUEST-CHANGES`. `pnpm verify` is green, but it does not exercise all Foundation acceptance criteria. The existing `review-decision.md` is stale and must not be treated as approval.

This document is a narrow repair delta for the remaining blockers. It does not authorize Phase 2 or add new product scope.

## Tactical execution order and dispatch gate

The sequence below is mandatory. **Phase 0 is R7.1 and must be completed before an implementer is dispatched for any R1–R6 code change.** The stale decision must first be rewritten to `REQUEST-CHANGES`; its former `APPROVED`/`PASS` claims are not evidence and must not be carried forward.

| Order | Tactical phase | Scope | Entry/exit gate |
|---:|---|---|---|
| 0 | R7.1 status correction | Rewrite `phase-1-foundation/review-decision.md` to `REQUEST-CHANGES`; remove false approval, PASS, and “fixed” claims. | **Hard dispatch gate:** the decision file shows the open R1–R6 findings and no Phase 2 authorization. No R1–R6 implementation task may start before this is committed. |
| 1 | R1 state contract | Reconcile state slices, capture constructor baseline, implement atomic reset, and prune removed-column IDs. | R1 focused state/column/React tests demonstrate retention, reset, notification count, and pruning. |
| 2 | R2 wire and identity contract | Connect offset/cursor pagination through query, client, and hook boundaries; add data-version identity. | Offset/cursor golden tests and same-reference version tests pass; exported types are usable. |
| 3 | R3 nullable lifecycle and races | Make the nullable source lifecycle unconditional, query-keyed, abortable, and sparse-write-free. | Source toggles, replacement, out-of-order, abort, throw, stale-while-revalidate, and one-request-per-key tests pass. |
| 4 | R4 pivot contract | Complete dedicated callbacks, controlled/uncontrolled resize, and state-derived leaf metadata/offsets. | Pivot declarations and controlled integration tests pass without mutating engine results. |
| 5 | R5 announcer ownership | Route hook-created tables/pivots through stable instance channels and prove live-region isolation. | Two-instance and Strict Mode live-region tests pass in both sibling unmount orders. |
| 6 | R6 release evidence | Make packed export, clean fixture, version, and live-doc drift checks executable and part of verification. | Built/packed imports, clean fixture compilation, and live docs checks pass. |
| 7 | R7.2–R7.5 Foundation re-gate | Collect exact evidence, run the full command set from a clean build, and obtain independent approval. | Only an independent reviewer may change the decision to `APPROVED` and authorize Phase 2. |

### Phase 0 procedure (R7.1)

1. Edit `docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md` first. Set `Status: REQUEST-CHANGES`, list R1–R6 as open, and state that `pnpm verify` alone is insufficient evidence.
2. Do not edit that decision back to approved, do not update the stale implementation note as if it were evidence, and do not dispatch R1–R6 work until the status correction is present.
3. Confirm the hard gate with:

```bash
grep -n "Status.*REQUEST-CHANGES\|APPROVED\|Phase 2" docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md
```

The command may show historical text only when it is explicitly labeled as superseded or prohibited; it must not show an approval conclusion.

## Required repairs

### R1 — Core state reconciliation, reset, and pruning

**Files:** `packages/core/src/createDataTable.ts`, `packages/core/src/state.ts`, `packages/core/src/types.ts`, core/React state tests.

- Reconcile every state slice from the previous effective state, then overlay only keys present in `next.state`; partial controlled state must not reset omitted slices.
- Capture the constructor-effective baseline (`DEFAULT_STATE + initialState + constructor state`). Make `resetSlice` and `resetState` restore that baseline; make `resetState` one atomic notification.
- When columns change, prune invalid IDs from sorting, filters, order, visibility, pinning, sizing, and focused-cell state while preserving valid values.
- Add regression tests for partial state, controlled transitions, constructor reset, notification count, and every ID-bearing slice.

**Gate:** built-artifact probes and focused tests must reproduce no state loss, no baseline reset to defaults, and no stale removed-column IDs.

### R2 — Pagination wire types and data identity

**Files:** `packages/core/src/dataSource/{types,query,client,index}.ts`, `packages/core/src/types.ts`, core type/query tests, pivot data identity paths.

- Integrate the discriminated offset/cursor wire type into `RowsQuery`, `buildRowsQuery`, `useDataSource`, and `createClientDataSource`; do not leave `buildPaginationWire` unused.
- Preserve cursor direction/current cursor and returned next/previous cursors in the data-source result/state contract.
- Add `dataVersion`/`getDataVersion` at direct table and data-source boundaries, include the token in publication/query identity, and remove recursive full-row comparisons.
- Add offset/cursor golden tests and same-reference unchanged/changed-version tests.

**Gate:** cursor sources receive cursor wire queries, offset sources receive offset/limit, and a changed version publishes same-reference mutable data.

### R3 — Nullable data-source lifecycle and races

**Files:** `packages/react/src/useDataTable.ts`, `packages/react/src/useDataSource.ts`, React integration tests.

- Keep every hook and effect call unconditional; the null source branch must still run the same hooks, abort/clear prior work, return a stable idle state, and subscribe to nothing.
- Include real source identity, capabilities, pagination/cursor state, data version, and refetch nonce in a stable query key. Do not use constant `sourceId: 'source'`.
- Remove early-return/fetching locks. Abort and supersede each older request with a token/signal check; loading publication must not recursively start a duplicate request.
- Add source add/remove/replacement, out-of-order response, abort, synchronous throw, one-request-per-key, and stale-while-revalidate tests.
- Keep the no-sparse-write assertion: data-source code must never patch `data`, `columns`, or `rowCount` through `setOptions`.

**Gate:** toggling or replacing a source cannot cause a hook-order error, stale result publication, dropped state change, or duplicate request.

### R4 — Pivot callbacks, resize sessions, and leaf metadata

**Files:** `packages/pivot/src/types.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/pivot/src/index.ts`, pivot/React tests.

- Add and export dedicated `OnChangeFn` callbacks for pinning, sizing, sizing-info, and focused-cell state. Export `OnChangeFn` from the pivot root.
- Make `startResize`, `adjustResize`, `commitResize`, and `cancelResize` work for controlled and uncontrolled instances. Controlled paths must dispatch the raw updater through the dedicated callback and must not mutate local controlled state.
- Resolve `getLeafColumns()` from current state: sizing widths, ordinary-leaf pinning, total-column default pinning, and deterministic cumulative pinned offsets. Keep engine results immutable.
- Add declaration tests for React setters and ordinary callbacks plus controlled/uncontrolled resize, pinning, focus, offset, and data-version tests.

**Gate:** all advertised shared slices have a dedicated public contract and controlled integration coverage; `OnChangeFn` imports from the documented pivot root.

### R5 — Instance-owned announcers

**Files:** `packages/core/src/{announcer,createDataTable}.ts`, `packages/react/src/{ReactAnnouncer,useDataTable,usePivotTable}.tsx`, announcer tests.

- Add a stable channel per hook-created table/pivot and inject the same channel into the factory/options and matching `ReactAnnouncer`.
- Prefer the instance/options announcer in core. Keep the global announcer only as an explicit direct-core fallback; it must not route hook-created instances.
- Remove singleton/last-mounted routing and global no-op cleanup behavior.
- Test two DataTables and two PivotTables with actual live-region text, both sibling unmount orders, and Strict Mode remounting. Do not count DOM nodes alone as evidence.

**Gate:** messages stay in the matching live region after either sibling unmounts, with no duplicate subscriptions or cross-talk.

### R6 — Trustworthy v2 release evidence

**Files:** `package.json`, package manifests/build configs, `scripts/check-public-surface.mjs`, `scripts/check-docs-version.mjs`, `fixtures/consumers/v2/`, `scripts/package-artifact-fixture.ts`, docs.

- Make the public-surface script import every documented root/subpath export from built/packed artifacts; its export matrix must be executable, not dead data.
- Convert consumer fixtures to clean packed-artifact consumers. They must not use `workspace:*`, repository source aliases, or declaration paths into `dist`.
- Make docs/version drift fail for live stale claims; explicitly exempt historical archives. Wire both scripts and clean fixture compilation into `pnpm verify`/package-artifact checks.
- Inject runtime versions from the root/package metadata rather than maintaining independent literals.
- Mark `docs/m6-hardening/api-freeze.md` historical/superseded without rewriting its archived claims. Correct live migration/docs claims.

**Gate:** all live exports resolve from packed artifacts, clean fixtures compile, drift checks fail on live violations, and v1 freeze status is explicitly superseded.

## R7 — Re-gate and evidence closeout (R7.2–R7.5)

R7.1 is the Phase 0 hard gate above and must already be complete. The final closeout must not undo it or treat the stale decision as evidence.

1. Add regression evidence for each R1–R6 requirement before changing the decision from `REQUEST-CHANGES`.
2. Run, from a clean working tree/build output:

```bash
pnpm exec vitest run packages/core/src/state.test.ts packages/core/src/createDataTable.test.ts packages/core/src/columns.test.ts packages/react/src/useDataTable.test.tsx
pnpm exec vitest run packages/core/src/dataSource/__tests__/query.test.ts packages/core/src/dataSource/__tests__/query.golden.test.ts packages/react/src/__integration__/abort-stale.test.tsx packages/react/src/__integration__/async.test.tsx packages/react/src/__integration__/server-pagination.test.tsx packages/react/src/__integration__/useDataSource-minimal.test.tsx
pnpm exec vitest run packages/pivot/src/__tests__/types.test.ts packages/pivot/src/__tests__/pivotTable.test.ts packages/react/src/__integration__/pivot-controlled.test.tsx packages/react/src/__integration__/multi-instance-announcer.test.tsx
pnpm build
pnpm check:package-artifacts
pnpm exec tsc -p tsconfig.package-artifact-fixture.json
node scripts/check-public-surface.mjs
node scripts/check-docs-version.mjs
pnpm verify
```

3. Record exact test counts, fixture/package boundary evidence, export results, and docs drift output in the review decision.
4. Only an independent reviewer may change the decision and authorize `phase-2-column-hierarchy-and-sizing.md`.

## Checkpoints

- **Checkpoint A (R1–R3):** state matrix, nullable source lifecycle, race tests, and both pagination wire shapes are green.
- **Checkpoint B (R4–R5):** pivot public contracts and actual sibling live-region isolation are green.
- **Checkpoint C (R6–R7):** packed export/fixture/docs checks are wired into verification and the reviewer signs the Foundation gate.

## Stop conditions

- Do not start Phase 2 while any required finding is open.
- Do not hide query loops with a fetch lock.
- Do not claim packed-consumer or public-export coverage from workspace aliases.
- Do not restore last-mounted global announcer routing.
- Do not remove pivot state slices; additive completion is the approved v2 direction.
