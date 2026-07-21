<!-- Historical: true -->
# Phase 1 — Foundation and 2.0 contract reset

**Track:** F0
**Depends on:** none
**Unlocks:** every new React/UI/Pivot phase
**Release gate:** `2.0.0` contract release
**Current gate status:** `REQUEST-CHANGES`; the active correction delta and mandatory R7.1 dispatch gate are tracked in [`phase-1-foundation-remediation-round-4.md`](./phase-1-foundation-remediation-round-4.md). Round 3 is superseded historical context and is not an implementation dependency. Do not begin Phase 2 until the round-4 remediation gate passes.

## Goal

Correct the released lifecycle and public contracts before adding a renderer. Leave the four existing packages buildable and usable, with no sparse option writes, no stale data-source result wins, consistent callbacks, complete advertised pivot state, instance-safe announcements, and an executable v2 contract.

## Ordered tasks

### F0.1 — DataTable state semantics and resets

**Files/discovery:** `packages/core/src/state.ts`, `types.ts`, `createDataTable.ts`, `columns.ts`, `packages/react/src/useDataTable.ts`; extend the closest state/factory/React integration tests.

1. Define and implement constructor-only `initialState`; `setOptions` must ignore any later `initialState` value. Resolve each state slice independently: (a) a key present in `next.state` is controlled and uses that supplied value; (b) an absent key retains the current effective `this.state[slice]`, including the uncontrolled→uncontrolled and controlled→uncontrolled branches; (c) only construction/reset may use `initialState` or `DEFAULT_STATE`. A controlled→uncontrolled slice retains its last effective value indefinitely across later option updates until `resetState()`/`resetSlice(slice)` is called, while uncontrolled→controlled adopts the supplied value. Reconcile removed column IDs by pruning invalid order/visibility/pinning/sizing/focus IDs without resetting unrelated slices.
2. Add explicit `resetState()` and `resetSlice(slice)` APIs. Reset APIs, not `setOptions`, are the only way to reset an uncontrolled slice to its initial/default value; document whether reset restores the constructor's initial value or the default for each API.
3. Keep `onStateChange` and slice callbacks consistent with the effective state contract. Preserve stable snapshots when no effective slice changed.
4. Add core and React regressions for inline options with a user sort followed by a re-render where no `state` key exists anywhere, every other slice, data replacement, column replacement, Strict Mode, controlled→uncontrolled persistence across multiple renders, uncontrolled→controlled adoption, reset, and removed-column pruning. Include a compile-time callback-signature test.

**Acceptance:** an inline-options render with no `state` key anywhere preserves a user sort after re-render; sorting, filtering, pagination, order, visibility, pinning, sizing, resize session, and focus survive inline option re-renders and data changes; controlled→uncontrolled retains the last effective value across repeated renders until reset; uncontrolled→controlled adopts the supplied value; only invalid column references are pruned; reset methods are explicit and tested.

**Focused verification:** `cd packages/core && pnpm exec vitest run src/state.test.ts src/createDataTable.test.ts src/columns.test.ts`; `cd ../react && pnpm exec vitest run src/useDataTable.test.tsx src/__integration__/simple.test.tsx`.

### F0.2 — Query-driven `useDataSource`

**Files/discovery:** `packages/core/src/dataSource/types.ts`, `query.ts`, `client.ts`, `packages/react/src/useDataSource.ts`, `useDataTable.ts`; add focused integration fixtures under `packages/react/src/__integration__/` and query golden fixtures under `packages/core/src/dataSource/__tests__/fixtures/`.

1. Make `useDataSource(table, sourceOrNull, translator)` unconditional from `useDataTable` (`options.dataSource ?? null`) and make the null branch return an idle result without subscribing or fetching. Derive manual capabilities before the table receives options, or use a private capability seam. Delete the current `table.setOptions` call that writes the sparse capability object `{ data: [], columns: [], manualSorting, manualFiltering, manualPagination }` (current `useDataSource.ts` lines 95–102), and delete the result path that writes `{ data: [], columns: [], manualPagination: true, rowCount }` (current lines 145–152). No data-source code may call `table.setOptions` with `data`, `columns`, or `rowCount`; total counts live only in data-source state.
2. Define a stable JSON-safe query identity containing source identity/version, sorting, filters, pagination strategy, and capabilities. Add request sequence/token checks in addition to `AbortController`; a newer query always supersedes an older one. Remove `fetchingRef` as a request gate and delete the current `if (fetchingRef.current) return` subscription early-return; every relevant table change recomputes the query identity, aborts the prior request, increments the token, and starts the current request.
3. Preserve prior successful rows during stale-while-revalidate when configured, publish loading/error/success and `totalRowCount` through data-source state, and never mutate table options to carry total counts. A result is accepted only when both its request token and signal match the current request.
4. Model offset/page and cursor pagination as distinct serializable strategies. Do not silently translate a cursor into `pageIndex`; document the consumer contract and cover both in type/query tests.
5. Reconcile source add/remove/identity changes and controlled/uncontrolled state in integration tests, including adding/removing the nullable source without changing hook order, source identity changes, sort/filter/page changes during an in-flight request, and stale responses resolving out of order. Add a regression assertion or instrumentation check that fails if any sparse `data`/`columns`/`rowCount` patch remains.

**Acceptance:** changing source or query starts exactly one current request, aborts/rejects stale work, stale data cannot overwrite current data, changing sort/filter/page during an in-flight request aborts and replaces it (never drops the change), real columns remain available for filter serialization, no sparse `data`/`columns`/`rowCount` options patch is emitted, and hook order is invariant when `dataSource` is added or removed.

**Focused verification:** `cd packages/react && pnpm exec vitest run src/__integration__/abort-stale.test.tsx src/__integration__/async.test.tsx src/__integration__/server-pagination.test.tsx src/__integration__/useDataSource-minimal.test.tsx`; `cd ../core && pnpm exec vitest run src/dataSource/__tests__/query.test.ts src/dataSource/__tests__/query.golden.test.ts`.

### F0.3 — Pivot callback and state contract

**Files/discovery:** `packages/pivot/src/types.ts`, `pivotTable/factory.ts`, `pivotTable/propGetters.ts`, `packages/react/src/usePivotTable.ts`; extend `packages/pivot/src/__tests__/types.test.ts`, `pivotTable.test.ts`, and React controlled integration tests.

1. Introduce `OnChangeFn<T> = (updater: Updater<T>) => void` and use it for pivot, expansion, sorting, and aggregate state callbacks. The factory already invokes these values as callbacks, so align declarations without changing the intended runtime call shape. Add declaration tests (the repository's existing Vitest `expectTypeOf`/`*.test-d.ts` checks are the equivalent of tsd; do not add a new tsd dependency) proving both a React `useState` setter and an ordinary `(updater) => {}` callback type-check for every public callback prop.
2. Complete additive pivot setters and controlled callbacks for `columnPinning`, `columnSizing`, `columnSizingInfo`, and `focusedCell`; expose resize-session commands and resolved leaf sizing/pinned offsets where the existing state promises them.
3. Ensure `setOptions` preserves uncontrolled pivot slices and effective values across inline options, data changes, engine replacement, and controlled transitions. Replace recursive deep dataset equality with reference identity plus documented `dataVersion` support.
4. Ensure compute cancellation and state mutation cannot publish a result for an obsolete query or disposed instance.

**Acceptance:** no callback is typed as a callable value when it is invoked as one; every advertised pivot slice has a meaningful setter/callback or is explicitly removed by a separately approved breaking decision; stale compute results are ignored; type and controlled integration tests pass.

**Focused verification:** `cd packages/pivot && pnpm exec vitest run src/__tests__/types.test.ts src/__tests__/pivotTable.test.ts src/__tests__/serialize.test.ts`; `cd ../react && pnpm exec vitest run src/__integration__/pivot-controlled.test.tsx src/__integration__/usePivotTable-updates.test.tsx`.

### F0.4 — Export/version/docs automation

**Files/discovery:** all four `packages/*/package.json`, `packages/{core,react,pivot,worker}/src/index.ts` and worker version source, `scripts/check-package-artifacts.mjs`, `tsconfig.package-artifact-fixture.json`, `docs/m6-hardening/api-freeze.md`, `docs/release-process.md`, migration guides, and a new `fixtures/consumers/v2-*` or equivalent clean-fixture directory.

1. Establish one metadata source for package versions and inject/derive runtime `VERSION` during build. Align all four package manifests and the root release metadata to `2.0.0` at the release cut.
2. Add an export-contract test that imports every documented root/subpath export from the built declarations and runtime. Correct the freeze document, package roots, subpaths, and package ownership of keyboard/validator/worker helpers.
3. Add clean packed-package consumer fixtures for core, React, pivot, worker, and an SSR/RSC-shaped React import. The fixture must compile against declarations from package artifacts rather than private `src` paths.
4. Rewrite guides/examples against executable current types; mark each feature as implemented, primitive-only, UI-required, unsupported, or deferred. Supersede the v1 freeze explicitly and write the v1→v2 migration guide.
5. Add a docs/version drift check to the existing verification path without making archive history fail on intentional historical versions.

**Acceptance:** every documented import compiles and resolves from a packed artifact; runtime and manifest versions agree; no live guide demonstrates a failing API; the v1 freeze is historical/superseded and migration notes enumerate intentional behavior/type changes.

**Focused verification:** `pnpm build && pnpm check:package-artifacts`; `pnpm exec vitest run packages/core/src/index.test.ts packages/react/src/index.test.ts`; run the new fixture compiler with `pnpm exec tsc -p tsconfig.package-artifact-fixture.json`.

### F0.5 — Identity and instance-owned announcers

**Files/discovery:** `packages/core/src/createDataTable.ts`, `announcer.ts`, `packages/pivot/src/pivotTable/factory.ts`, `packages/react/src/ReactAnnouncer.tsx`, `useDataTable.ts`, `usePivotTable.ts`; extend announcer and multi-instance tests.

1. Remove unconditional `JSON.stringify`/recursive full-data comparisons from update paths. Default to array/reference identity and add `dataVersion`/`getDataVersion` at the owned boundary; document immutable row expectations.
2. Replace the global live-region registration path for hook-created engines with a stable per-instance announcer channel passed through the hook/factory and into the rendered `ReactAnnouncer`. `ReactAnnouncer` must subscribe/render only its engine channel; direct core consumers may retain an explicit global fallback, but it cannot override another engine's channel.
3. Specifically remove the `usePivotTable` effect's unmount cleanup call `setGlobalAnnouncer({ announce: () => {} })`; unmounting one pivot must never reset the channel used by another table or pivot. Remove the corresponding mount-time global registration if the instance channel is available, and make cleanup release only that instance's subscription.
4. Exercise two DataTables and two PivotTables mounting, updating, Strict Mode remounting, and unmounting in one React tree. Verify messages do not cross instances or disappear after one instance unmounts.

**Acceptance:** option-update cost does not scale with row count via deep equality; mutable integrations have an explicit version escape hatch; the exact global-no-op cleanup is gone; multi-instance announcement tests prove the remaining grid/pivot still announces after its sibling unmounts.

**Focused verification:** `cd packages/core && pnpm exec vitest run src/announcer.test.ts src/createDataTable.test.ts`; `cd ../react && pnpm exec vitest run src/ReactAnnouncer.test.tsx src/__integration__/loading-announcer.test.tsx src/__integration__/pivot-announcer.test.tsx`.

### F0.6 — Foundation release review

Run `pnpm verify`, inspect the package tarballs, and record a review decision covering each F0.1–F0.5 acceptance bullet. The decision must explicitly confirm: the inline-options/no-`state` regression preserves sort and other slices; no data-source `setOptions` call writes `data`, `columns`, or `rowCount`; the `fetchingRef` early-return is deleted and in-flight query changes restart work; both pivot callback shapes compile; and `usePivotTable` no longer resets a global announcer on unmount. The phase is not complete if a test is green only because a stale fixture or private source import bypasses the public package boundary.

## Review gate: Foundation / `2.0.0`

**Evidence required:** focused tests above; `pnpm verify`; packed consumer fixture output; export/version/doc drift report; migration guide; public API diff; a short decision note attached to the phase review.

**Approve only if:** lifecycle regressions are covered, sparse options are gone (including the former capability and row-count patches), the request guard cannot drop an in-flight state change, callback types are corrected with declaration coverage for React setters and ordinary callbacks, pivot slices are complete, the exact global-announcer cleanup is removed and ownership is instance-safe, all versions/exports/docs agree, and the existing packages remain independently usable.

**Stop/rollback:** if lifecycle semantics cannot be made stable without an incompatible public change beyond the documented reset, stop and escalate before D1. If the package fixture cannot import a documented symbol, do not start UI work; repair exports or remove the claim. Revert only F0 changes with the phase branch; do not alter archive history to hide a failure.
