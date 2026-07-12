# Phase 7 — First shippable PivotGrid UI

**Track:** P5  
**Depends on:** Phases 1, 3, 5, and 6  
**Release target:** `2.3.0`

## Goal

Reuse the approved D2 scrolling/focus architecture and deliver an accessible, configurable PivotGrid without creating a second virtualization or treegrid implementation.

## Ordered tasks

### P5.1 — Shared PivotGrid shell

**Files/discovery:** `packages/ui/src/PivotGrid/`, shared region/context primitives from `DataGrid/`, pivot React hook adapters if required, package exports, and view integration tests.

- Consume PivotTable result/header/visible-row models through public APIs. Use the same one-scroll-authority and fixed-height region strategy as DataGrid.
- Render treegrid roles, row headers, totals row/column attributes, expansion states, loading/error/retry states, and center-column virtualization.
- Keep PivotGrid and DataGrid label/theme/token machinery shared where semantics match.

**Acceptance:** expanded/collapsed rows remain aligned across pinned/center regions, totals stay visible by documented policy, and no second scrolling system or private pivot engine import is introduced.

### P5.2 — Field builder and measure settings

**Files/discovery:** `packages/ui/src/PivotGrid/fields/`, controls, drag/reorder implementation, labels, and view integration/browser tests.

- Render available fields and rows/columns/measures/filters areas from P1 metadata.
- Support accessible reorder/add/remove operations, keyboard alternatives to drag, measure aggregator/formatter settings, and field-level filter controls.
- Use development warnings for unsupported combinations and preserve controlled/uncontrolled pivot config semantics.

**Acceptance:** every active field can be moved or removed without losing unrelated state; keyboard and pointer paths yield the same serialized config; field-builder controls have labels and focus behavior.

### P5.3 — Pivot product workflows

Wire totals/subtotals, label/measure sorting, expansion/collapse, worker and server engines, loading/error/retry, value formatting, layout persistence, flattened CSV export, and drill-through callback/query into the shared shell.

**Acceptance:** main-thread, worker, and server fixtures show equivalent supported results; stale compute/child requests cannot overwrite current view; exports and persisted layouts match headless golden fixtures.

### P5.4 — Pivot accessibility and release verification

Focused commands: `pnpm --filter @lynellf/tablekit-ui exec vitest run src/PivotGrid`; `pnpm exec playwright test --config apps/docs/playwright.config.ts --project=chromium --grep Pivot`; `pnpm verify`.

Add axe/validator assertions, treegrid keyboard suites, field-builder pointer/keyboard suites, and visual fixtures for totals, nested column headers, loading/error, and dense layouts. Update `docs/m6-hardening/sr-matrix.md`/the 2.x release record for a11y-affecting changes.

## Review gate: P5 / `2.3.0` PivotGrid

**Evidence required:** browser and view integration tests, worker/server fixtures, field-builder keyboard/pointer evidence, treegrid validation/axe results, persistence/export/drill-through assertions, visual snapshots, docs/demo examples, bundle report, and `pnpm verify`.

**Approve only if:** PivotGrid reuses D2 geometry/focus primitives, field configuration is accessible and serializable, all first-release matrix items work, and excluded chart/formula/full-BI features are not implied.

**Stop/rollback:** if treegrid behavior needs a second navigation model, consolidate it with the shared contract. If field drag works but keyboard reorder does not, block release and fix the keyboard path; do not label drag-only support accessible.
