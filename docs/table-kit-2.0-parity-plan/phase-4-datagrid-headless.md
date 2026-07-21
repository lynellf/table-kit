# Phase 4 — First-release DataGrid headless primitives

**Track:** D3  
**Depends on:** Phase 1; may run in parallel with Phases 2–3, but must pass before D4 release  
**Unlocks:** first shippable read-mostly DataGrid

## Goal

Add the framework-free state and serialization primitives needed by common migration workflows without coupling them to a visual component.

## Ordered tasks

### D3.1 — Selection model

**Files/discovery:** `packages/core/src/types.ts`, `state.ts`, `createDataTable.ts`, `rows.ts`, `propGetters.ts`; add selection unit/type and React integration tests.

- Add stable-ID `rowSelection` state with single/multiple modes, selectability predicates, checkbox helpers, page/filtered/all-known select-all scope, and shift-range math.
- Keep focus distinct from selection. Emit `aria-selected`, `aria-multiselectable`, and selection callbacks only through the documented model.
- Define behavior for server pages and rows no longer present; serialize only when the caller opts into a scope.

**Acceptance:** controlled/uncontrolled selection and transitions work with stable IDs, select-all scope is explicit, hidden rows do not become selected accidentally, and focus remains independent.

### D3.2 — Global and type-aware filters

**Files/discovery:** `packages/core/src/pipeline/filter.ts`, registries, `types.ts`, `dataSource/query.ts`; add filter model/golden tests and server facet fixtures.

- Add a serializable global quick-filter state and text/number/date/boolean/set filter model with compound AND/OR semantics.
- Support external predicates only in client mode; registry names and versioned shapes cross server boundaries.
- Define page reset behavior and server facet-loading contracts without introducing a fetch/cache framework.

**Acceptance:** client pipeline and serialized server shape agree; unsupported function shapes warn/reject at the boundary; filter changes reset page index only under the documented policy; facets remain client-side or explicitly requested from a server source.

### D3.3 — Versioned persistence

**Files/discovery:** add `packages/core/src/serialization/` (or approved location), export from core, and extend `types.test-d.ts`, state tests, and query fixtures.

Implement `serializeTableState(state, options)` and `hydrateTableState(value, schema)` with schema version, included-slice options, unknown-field tolerance, column-ID reconciliation, migration hooks, and a hard prohibition on functions/cyclic values.

**Acceptance:** round trips preserve opted-in state, invalid/unknown IDs are handled by the same reconciliation policy as option updates, migrations are deterministic, and malformed input fails safely without mutating live state.

### D3.4 — CSV/copy and non-editing transactions

**Files/discovery:** add core export/transaction modules, wire stable row IDs into `createDataTable`, and add escaping/transaction tests plus type tests.

- Generate visible-row and selected-row tabular data with value formatter/include-column hooks, correct CSV escaping, and streaming row generation.
- Add `RowTransaction<TRow> { add?: TRow[]; update?: TRow[]; remove?: string[] }`; core never mutates consumer rows in place. Define duplicate/missing-ID policy and refresh/invalidation semantics.
- Clipboard paste and editing are explicitly deferred to Phase 8.

**Acceptance:** CSV output handles commas, quotes, newlines, nulls, and custom formatting; transactions preserve stable IDs and pipeline state; invalid updates are reported rather than silently corrupting rows.

### D3.5 — Headless verification

Focused commands: `cd packages/core && pnpm exec vitest run src/state.test.ts src/pipeline/filter.test.ts src/dataSource/__tests__/query.test.ts src/serialization src/*selection* src/*export*`; `pnpm exec vitest run packages/react/src/__integration__/simple.test.tsx`; `pnpm typecheck`; `pnpm build`.

## Review gate: D3 / headless DataGrid contract

**Evidence required:** controlled/uncontrolled tests for each new slice, type declarations, serialization golden files, CSV fixtures, transaction tests, server query compatibility, and `pnpm verify`.

**Approve only if:** all new behavior is renderer-independent, serializable boundaries reject functions, stable row identity is required/documented for server work, and no Phase 8 editing/range APIs leak into the first-release contract.

**Stop/rollback:** if a feature requires DOM or React state, move it to `tablekit-ui`; if server selection or transaction semantics cannot be defined without a consumer-specific cache model, narrow the contract and document the limitation before D4.
