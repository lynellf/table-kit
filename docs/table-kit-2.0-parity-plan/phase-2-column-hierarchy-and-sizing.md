# Phase 2 — Column hierarchy and deterministic sizing

**Track:** D1  
**Depends on:** Phase 1 Foundation  
**Unlocks:** walking skeleton and grouped-header UI  
**Release target:** `2.1.0` preview

## Goal

Replace the flat-header limitation with a framework-free recursive column model that can be pinned, virtualized, resized, and rendered deterministically in SSR and browser environments.

## Ordered tasks

### D1.1 — Recursive column definitions and reconciliation

**Files/discovery:** `packages/core/src/types.ts`, `columns.ts`, `headers.ts`; add/extend `columns.test.ts`, `headers.test.ts`, and type declarations. Preserve flat `ColumnDef` compatibility.

- Add a `ColumnGroupDef<TRow>` discriminated shape with `id`, opaque header, children, metadata, visibility/reorder policy, and optional footer.
- Flatten leaves with stable IDs, detect duplicate IDs/cycles in development, preserve definition order for omitted order entries, and define group visibility when all or some children are hidden.
- Reconcile `columnOrder`, pinning, visibility, sizing, and focus against the new leaf set without dropping valid unrelated state.

**Acceptance:** arbitrary finite nesting yields deterministic leaves and group paths; invalid definitions produce actionable development errors; flat definitions produce the same existing model.

### D1.2 — Header rows, placeholders, spans, and ARIA indices

**Files/discovery:** `packages/core/src/headers.ts`, `propGetters.ts`, `types.ts`; add recursive header/ARIA tests and update React integration fixtures that render headers.

- Emit one header row per depth with placeholders for shorter branches, `rowSpan`/`colSpan` metadata, logical `aria-colindex`, and footer/header group prop getters.
- Define grouped reorder/pinning behavior: leaf moves cannot create an invalid partial group silently; group moves preserve child order and explicitly update pinning boundaries.
- Preserve sorting, resizing, event, and consumer-prop merge semantics for leaf headers.

**Acceptance:** deep groups have correct spans and monotonically logical indices; hidden/grouped/pinned combinations are deterministic; existing flat header tests remain green.

### D1.3 — Flex and autosize contracts

**Files/discovery:** `packages/core/src/types.ts`, `columns.ts`, `resize.ts`, virtualization types; add a sizing module only if existing resize helpers cannot express it. Extend unit tests and add a sizing benchmark fixture.

- Add `flex`, `autoSize`, footer metadata, min/max constraints, and a pure width resolver with deterministic rounding and overflow behavior.
- Keep DOM measurement behind an adapter contract. Core accepts measured candidates; it does not read layout or browser globals.
- Define autosize inputs (header/content samples and available width), fallback widths, and the policy for pinned versus center regions.

**Acceptance:** width resolution is deterministic for the same inputs, honors min/max constraints, has no measurement during SSR, and resizing one pinned column recomputes its offsets without drift.

### D1.4 — D1 verification

Focused commands: `cd packages/core && pnpm exec vitest run src/columns.test.ts src/headers.test.ts src/resize.test.ts src/pinning.test.ts`; `pnpm typecheck`; `pnpm lint`; `pnpm build`.

## Review gate: D1 / grouped-column contract

**Evidence required:** type and unit tests for flat, nested, hidden, reordered, pinned, resized, and SSR-width cases; public API diff; a short grouped-header fixture snapshot; `pnpm verify`.

**Approve only if:** the model is framework-free, spans/indices are correct, no consumer must inspect private tree internals, and the D2 renderer can consume left/center/right leaves plus header rows without inventing another column model.

**Stop/rollback:** if grouped pinning/reorder semantics are ambiguous, stop and document a bounded supported policy rather than allowing silent partial groups. If autosize requires DOM in core, move measurement to the adapter before review.
