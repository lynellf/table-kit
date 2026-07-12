# Table Kit 2.0 parity implementation plan

**Status:** Revised implementation package for review
**Source specification:** `docs/table-kit-2.0-parity-assessment-and-spec-v2.md` (revision 2)
**Audience:** implementers, phase reviewers, release owner

## Goal and current request

Implement the migration-grade parity roadmap in the source specification without destabilizing the existing headless engine. Deliver a contract-correction `2.0.0`, a validated three-region DataGrid architecture, a read-mostly `@lynellf/tablekit-ui` DataGrid, a PivotGrid built on the same rendering shell, and only then a demand-gated compatibility path. Every implementation phase stops at an explicit review gate before the next phase starts.

This is a multi-release plan, not a promise that all 24 backlog items land in one release. The release train is:

| Release | Scope | Gate |
|---|---|---|
| `2.0.0` | Lifecycle, callback, state, export, version, documentation, and announcer contract reset | Foundation gate |
| `2.1.0` | Grouped columns plus internal fixed-height three-region walking skeleton | Rendering architecture gate |
| `2.2.0` | First shippable read-mostly DataGrid and demo/docs host | DataGrid release gate |
| `2.3.0` | First shippable PivotGrid and field-builder workflow | PivotGrid release gate |
| `2.4+` | Editing, paste, range selection, advanced row models, and compatibility only when demand gates pass | Advanced/compatibility gates |

## Verified current state

- Four publishable packages exist: `core`, `react`, `pivot`, and `worker`; there is no `ui` package or docs/demo application.
- Package manifests are `1.0.1`, while runtime constants are inconsistent (`core`/`react` `0.2.0`, `pivot` `1.0.0`, worker reads a separate version file).
- `createDataTable.setOptions`, `useDataTable`, and `useDataSource` are the load-bearing DataTable lifecycle seams. The current data-source hook conditionally runs, writes sparse options, gates requests with `fetchingRef`, and mutates row count through options.
- `PivotTableOptions` declares change callbacks as `Updater<T>` values even though the factory invokes them as callbacks. Pivot state exposes sizing, pinning, resize-session, and focus slices without a complete public mutation/rendering contract.
- `packages/core/src/headers.ts` builds one flat header row. Core virtualization already emits `top`-positioned fixed-height rows and a center-column window; these are useful foundations but not a complete renderer.
- Accessibility helpers and React integration tests exist, but there is no production grid component, browser-test host, visual fixture, or UI styling/theming contract.
- The existing verification contract is `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm check:package-artifacts`; `pnpm verify` runs all five. CI also runs advisory pivot/worker benchmarks.
- `docs/m6-hardening/api-freeze.md`, migration guides, and release docs describe v1 claims that must be superseded or corrected rather than silently treated as the 2.0 contract.

### Baseline verification snapshot

The current checkout passes `pnpm verify`: 69 Vitest files, 573 tests passed and 1 skipped; typecheck, Biome lint, package builds, and packed-artifact checks all pass. The current built gzip sizes are approximately core 13.55 kB, pivot 8.56 kB, React 4.75 kB, and worker 2.09 kB. These are baseline measurements only; the UI budgets in the source specification are measured after `tablekit-ui` exists.

## Findings and behavior to implement

### Foundation behavior

1. `initialState` is constructor-only and is never re-applied by `setOptions`. For every slice, `setOptions` preserves the current effective value when the slice is absent from the next `state`, overlays a supplied controlled slice, and reconciles removed column IDs by a documented policy. A controlled-to-uncontrolled slice retains its last effective value indefinitely across subsequent renders until `resetState()`/`resetSlice()` is called; an uncontrolled-to-controlled slice adopts the supplied value. Explicit reset APIs, not option updates, reset uncontrolled state.
2. `useDataSource` is called unconditionally with `source | null`. It derives capabilities without replacing table `data` or `columns`, creates a stable serializable query key, aborts and supersedes stale requests, ignores stale results, stores total counts in data-source state, and distinguishes offset from cursor pagination. The correction removes both current sparse `table.setOptions` writes (the capability patch containing `{ data: [], columns: [] }` and the result patch containing `{ data: [], columns: [], rowCount }`) and deletes the `fetchingRef` early return so a sort/filter/page change during a request always supersedes it.
3. Pivot callbacks use `OnChangeFn<T> = (updater: Updater<T>) => void`; declaration tests accept both React state setters and ordinary updater callbacks. Pivot sizing, pinning, resize-session, and focus slices are either completed additively or removed only through a separately approved breaking decision; this plan chooses additive completion for 2.0.
4. Package metadata, runtime versions, documented exports, declaration exports, migration examples, and clean consumer fixtures agree. Every public import in the 2.0 contract is exercised from a packed package.
5. Announcer ownership is instance-safe. A grid mounting or unmounting cannot replace another grid's live-region channel. In particular, `usePivotTable` cleanup must not call `setGlobalAnnouncer` with a no-op; each hook/engine gets a stable channel passed through its instance, while any global announcer remains only an explicit legacy fallback.
6. Data identity is reference-based by default. Mutable integrations use `dataVersion`/`getDataVersion`; no unconditional deep equality is performed on large row sets.

### DataGrid behavior

- Recursive column groups produce deterministic flattened leaves, header depth/placeholders/spans, grouped visibility/reorder/pinning rules, footer slots, and constrained flex/autosize sizing. SSR initial layout uses fixed deterministic widths; measurement starts after hydration.
- The walking skeleton has one vertical scroll authority, left/center/right regions, center horizontal virtualization, synchronized fixed row heights, sticky grouped headers, resize/reorder, sort/basic-filter controls, focus, loading/empty states, and LTR/RTL behavior. It does not include editing, range selection, or measured variable row height.
- The first DataGrid adds row selection, global/type-aware filtering, versioned persistence, CSV/copy helpers, non-editing row transactions, column controls, pager/quick filter, labels/i18n, theme tokens, SSR/RSC documentation, and accessible keyboard behavior.
- Editing, paste, cell/range selection, variable height, grouping/tree data, and other advanced row models stay after the first UI release.

### Pivot behavior

- Pivot fields have serializable metadata and allowed areas. The engine supports per-level subtotals, distinct count and selected common aggregations, formatter registries, null/empty policies, and stable worker/server metadata.
- `getDrillThroughQuery`, versioned layout persistence, flattened matrix/CSV export, cancellation/retry/request metadata, and server distinct-filter/child-expansion contracts are framework-free.
- `PivotGrid` provides available fields, rows/columns/measures/filters areas, reorder, settings, totals, expansion, sorting, worker/server states, virtualization, formatting, persistence, export, drill-through callback, and accessible treegrid behavior. Chart mode, formula editors, and full BI calculations remain out of scope.

### Compatibility behavior

No generic Webix or AG Grid runtime adapter is started before the C0 gate: a real consumer application, sanitized checked-in golden fixture, migration workflows and acceptance tests, proof that native APIs/codemods are insufficient, and an owner for ongoing maintenance. Before that gate, ship only native APIs, migration documentation, and focused tooling if requested.

## Constraints and package boundaries

- Preserve `@lynellf/tablekit-core`, `@lynellf/tablekit-react`, `@lynellf/tablekit-pivot`, and `@lynellf/tablekit-worker` responsibilities. Do not put vendor terminology into native packages.
- Add `@lynellf/tablekit-ui` as a React client-component package. It consumes the headless packages and owns layout, controls, themes, labels, overlays, and render behavior.
- Base UI is an internal UI dependency behind Table Kit components; do not re-export Base UI types. A DnD library is likewise an implementation detail. TanStack Virtual can be benchmarked as an internal alternative but is not a public dependency without a separate ADR.
- Core, pivot, and worker remain DOM-free and SSR-safe. UI entry points that use hooks or measurement declare the client boundary. No browser globals are read during module initialization.
- The first UI release uses fixed row heights. Variable/measured height is deferred unless the dedicated risk gate proves shared measurements, no drift, stable anchoring, bounded relayout, and focus stability.
- State/query serialization contains no functions. Registry names are required across worker/server boundaries.
- No `.okf/` documents are written by this plan. Historical v1 documents remain available as archive/reference artifacts; the 2.0 contract is new and explicit.

## Non-goals

- Pixel-perfect vendor cloning, vendor DOM/theme classes, a full Webix or AG Grid Grid API, global widget registries, Jet internals, spreadsheet formulas, integrated charts, Excel/PDF/image parity, master/detail, arbitrary serialized functions, full enterprise server-side row-model parity, and all drag-and-drop workflows.
- Replacing the owned core with TanStack Table. Virtualization internals may be reconsidered only at the D2 evidence gate.
- Building a general data-fetching/cache/retry framework. `DataSource` stays thin; consumers own caching/debounce/deduplication.
- Completing advanced editing/range/grouping work before the first usable DataGrid/PivotGrid.
- Starting compatibility work from synthetic fixtures alone.

## Dependency and parallelization map

```text
F0 contract/lifecycle/automation
 ├─ D1 grouped columns + sizing ─ D2 walking skeleton ─ D3 DataGrid headless ─ D4 DataGrid UI
 └─ P1 field metadata ─ P2 totals/formatting ─ P3 drill-through ─ P4 persistence/server ─ P5 PivotGrid UI
                                      D2 + P1..P4 ───────────────────────────────────────────┘
D4 ─ D5 editing/range/advanced interactions
D4 + P5 ─ C0 real-consumer gate ─ C1 bounded adapter (only if gate passes)
```

After F0, D1→D2→D3 and P1→P4 may be implemented in parallel by separate workstreams, but each workstream has its own review gate. D4 and P5 are serial with D2 because both reuse the validated rendering shell. If only one implementer is available, use the phase order in the artifact index.

## Acceptance criteria for the whole plan

- [ ] `2.0.0` contract release satisfies every Foundation exit criterion and `pnpm verify` passes from a clean checkout.
- [ ] D2 has browser/visual evidence for pinned-region alignment, focus identity, grouped-header alignment, fixed-height scrolling, RTL posture, SSR hydration, and the bundle baseline; no D2 criterion is waived silently.
- [ ] `@lynellf/tablekit-ui` turnkey and composable DataGrid forms share engine behavior tests and meet the first-release scope without editing/range/variable-height leakage.
- [ ] PivotGrid reuses the D2 scroll/rendering authority and meets the first-release PivotGrid matrix with worker/server fixtures.
- [ ] Every public claim in the live docs is marked implemented, primitive-only, UI-required, unsupported, or deferred, and every supported import is covered by a packed consumer fixture.
- [ ] Compatibility remains blocked unless C0 evidence is checked in; unsupported vendor options warn with stable documentation codes and never silently fall back.
- [ ] Each phase has a passing focused verification set, a full verification result, a recorded review decision, and a rollback/stop decision before the next phase begins.

## Review-gate protocol

The implementer must stop after each phase. The phase reviewer checks the listed acceptance evidence, focused tests, `pnpm verify` (or the explicitly documented reason a docs-only phase uses a narrower command), public-surface changes, scope boundaries, and rollback readiness. A failed gate returns to the phase; it does not get papered over in the next phase. A gate may approve a documented deferred item only when the phase's stop condition says it is deferred.

Recommended orchestration after this package is approved: implement one phase, route to `reviewer`, record the gate decision, then continue. For parallel P-track work, merge only after both phase reviews pass and the shared contract tests are green.

## Risks, unknowns, and decisions

| Risk/unknown | Mitigation or decision |
|---|---|
| Controlled/uncontrolled transitions can reset user state or create React render loops | F0 tests inline options, Strict Mode, every slice, dynamic data/columns, and explicit reset behavior before UI work. |
| Query-key stability and abort timing can lose or apply stale server data | F0 uses source identity/version plus serialized query inputs, request tokens, signal checks, and race-focused integration tests. |
| Grouped headers plus pinning and virtualization may drift | D1 has pure span/order tests; D2 is a fail-fast walking skeleton with visual/browser assertions and a split-pane fallback. |
| Fixed versus variable row-height architecture is unresolved | Fixed height is the 2.2 contract; variable height requires D2 evidence and remains deferred if any criterion fails. |
| Base UI and DnD dependency churn | Pin a supported range, wrap usage, do not expose third-party types, and document the replacement boundary. |
| Pivot subtotal/formatter semantics may diverge across engines | Add merge-law, golden serialization, worker, and server-contract tests before PivotGrid UI. |
| Accessibility varies across AT/browser pairs | Browser axe/DOM validation is automated; the existing manual SR matrix is updated for 2.x a11y changes and remains a release gate. |
| Compatibility demand is unknown | C0 is an explicit stop gate, not an assumption; no adapter work is scheduled without real fixtures and an owner. |
| Large scope may exceed one implementation pass | Each phase is independently shippable and reviewable; release train allows stopping after 2.0, 2.1, 2.2, or 2.3. |

## User decisions / assumptions

No immediate user question blocks planning. Reviewer clarification is resolved in the contract: controlled→uncontrolled slices retain their last effective value across any number of later renders until an explicit reset API is called. The repository already has equivalent declaration-test mechanisms (`expectTypeOf` and `*.test-d.ts`), so F0.3 extends those instead of adding a new `tsd` dependency. The plan assumes the package names and first-release exclusions in the source specification are accepted. The only future product decision is the C0 target application; it is intentionally deferred until a real migration candidate exists and must be recorded before C1.

## Plan telemetry

- `okf_docs_read`: 0 (`.okf/` is absent in the current checkout)
- `okf_tokens_read`: 0
- `source_files_read`: 31 (core, React, pivot, worker, CI/build/test surfaces and comparable archived plan artifacts were inspected)
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 (no repository OKF map available)

## Package Review gate

This package is ready for plan review when every artifact listed below exists, each phase names bounded files or discovery steps, focused and full verification commands, acceptance evidence, dependencies, and a stop/rollback condition, and the package preserves the explicit C0 compatibility stop. Plan review should reject any phase that silently expands the first UI release into editing, variable-height rows, broad vendor compatibility, or a second rendering architecture.

## Artifact index

- `docs/table-kit-2.0-parity-plan/spec.md` — this scope, behavior, constraints, dependency map, risks, and global acceptance criteria.
- `phase-1-foundation.md` — F0.1–F0.6; the 2.0 contract gate (currently blocked pending remediation).
- `phase-1-foundation-remediation-round-5.md` — the single active REQUEST-CHANGES correction package, now with the round-7 bounded correction for request triggering, serializer errors, cursor metadata, source-scoped manual capabilities, Strict Mode request ownership, and row-model identity.
- `phase-1-foundation-remediation-round-4.md` — superseded historical correction delta retained as prior context; it is not an implementation dependency.
- `phase-1-foundation-remediation-round-3.md` — superseded REQUEST-CHANGES correction delta retained as historical context; it is not an implementation dependency.
- `phase-2-column-hierarchy-and-sizing.md` — D1; grouped columns and deterministic sizing.
- `phase-3-walking-skeleton.md` — D2; high-risk three-region rendering architecture.
- `design-three-region-scroll-protocol.md` — D2 pre-implementation synchronization and fixed-height protocol.
- `phase-4-datagrid-headless.md` — D3; first-release headless selection/filter/persistence/export/transactions.
- `phase-5-datagrid-ui-and-demo.md` — D4; `tablekit-ui` DataGrid, labels, theme, SSR, docs/demo host.
- `phase-6-pivot-headless.md` — P1–P4; field metadata, engine semantics, drill-through, persistence/export/server contracts.
- `phase-7-pivot-ui.md` — P5; first-release PivotGrid and field-builder UI.
- `phase-8-advanced-interaction.md` — D5 and later advanced row models.
- `phase-9-compatibility-gate.md` — C0 evidence gate and conditional C1 adapter path.
- `phase-10-release-closeout.md` — release evidence, docs matrix, benchmarks, packaging, and rollback.
