# Phase 8 — Advanced DataGrid interaction and row models

**Track:** D5 and backlog items 23–24  
**Depends on:** Phase 5 DataGrid release; use Phase 7 patterns where pivot behavior is shared  
**Release target:** `2.4+`

## Goal

Add editing and selection workflows only after read-mostly DataGrid behavior is stable. Keep each high-risk capability independently gated so a failed prototype does not destabilize the shipped first release.

## Ordered tasks

### D5.1 — Cell and rectangular range selection

**Files/discovery:** core state/navigation/serialization modules, UI selection renderers, clipboard/export utilities, and focused view/browser tests.

- Add distinct active-cell, focused-cell, row-selection, and rectangular-range state. Support keyboard extension, clear selection semantics, and copy of selected ranges.
- Define behavior under column/row virtualization and pinned projections; selected identity must be logical, not DOM-instance-based.
- Extend accessibility attributes/announcements and persistence only where explicitly enabled.

**Acceptance:** keyboard selection and copy are deterministic across virtualized/pinned regions, focus and selection never conflate, and browser tests cover scrolling while a range is active.

### D5.2 — Editing and paste transactions

**Files/discovery:** core column/type/state modules, new editing transaction module, UI editors/validation status, clipboard parser, and tests.

Implement `editable`, `valueParser`, `valueSetter`, and sync/async `validate` contracts; start/commit/cancel, optimistic/pessimistic save, consumer-owned mutation callbacks, clipboard parsing, paste-to-transaction mapping, editor focus under virtualization, and error/retry status.

**Acceptance:** invalid values never commit, async stale saves cannot overwrite current edits, cancel restores the last committed row, paste uses validated transactions, and editors remain keyboard/screen-reader usable.

### D5.3 — Advanced row models

Add row grouping/tree data, pinned top/bottom rows, infinite/block-cache sources, master/detail, spans, row dragging, change highlighting, and variable height only as individually scoped features. Each task gets its own public contract, fixtures, performance measurement, and review gate.

**Variable-height stop condition:** require shared measurements across left/center/right regions, no vertical drift, scroll anchoring, bounded relayout, and focus stability. If any fails, retain fixed-height as the supported contract.

### D5.4 — Verification

Focused commands are feature-specific (`pnpm exec vitest run packages/core/src/... packages/ui/src/...`) plus `pnpm exec playwright test --config apps/docs/playwright.config.ts --project=chromium --grep <feature>`, then `pnpm verify` and the relevant benchmark command. Add/update the manual SR matrix for keyboard/editing changes.

## Review gate: each advanced subphase

**Evidence required:** headless/type tests, view/browser tests, performance fixture, accessibility evidence, public API diff, and rollback note. Approve D5.2 only after D5.1 is stable; approve row models independently.

**Stop/rollback:** do not ship editing or variable height behind an experimental flag merely to satisfy the backlog. Revert the failing subphase, retain the earlier release contract, and record the feature as deferred with evidence.
