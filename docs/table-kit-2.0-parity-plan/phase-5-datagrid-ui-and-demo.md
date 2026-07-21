# Phase 5 — First shippable DataGrid UI and demo host

**Track:** D4  
**Depends on:** Phases 1–4, especially D2  
**Unlocks:** `2.2.0` DataGrid release and PivotGrid reuse

## Goal

Turn the validated walking skeleton into a production-quality, read-mostly `@lynellf/tablekit-ui` DataGrid while keeping the engine and composable forms behavior-identical.

## Ordered tasks

### D4.1 — Package and component contract

**Files/discovery:** extend `packages/ui/package.json`, build config, `src/DataGrid/`, package exports, and artifact fixture. Add Base UI as a pinned internal dependency only if the component contract requires it; do not re-export its types.

- Expose turnkey `<DataGrid ... />` and composable `DataGrid.Root/Controls/Header/Body/Footer/Pager` forms over one engine/context.
- Define native column/row/state/dataSource props, `getRowId`, controlled state callbacks, and stable class/data-attribute hooks. Keep all DOM-measurement code behind client boundaries.
- Add loading, error, empty, no-results, and retry surfaces without imposing application toasts or data caching.

**Acceptance:** both forms render the same rows/headers and trigger the same state/query behavior; packed package imports cleanly in a React consumer; no private source import or Base UI type appears in the public declaration surface.

### D4.2 — Product controls and first-release features

**Files/discovery:** `packages/ui/src/DataGrid/controls/`, `menus/`, `filters/`, `pager/`, and selection/header/body renderers; add view integration tests using realistic providers and mocked source boundaries.

Implement sorting, column/global filters, client/server pagination, visibility/order/pinning/resizing/autosize/flex, grouped headers, row checkboxes/single-multiple selection, persistence hydrate/serialize, quick filter, column menu/chooser, pager, selection summary, and CSV export.

Explicitly omit cell editing, paste, range selection, undo/redo, fill handle, variable row height, row grouping/tree data, and pinned rows from this release.

**Acceptance:** each supported control has keyboard and screen-reader labels; server state changes use the F0 query lifecycle; first-release exclusions are absent from docs and exports rather than half-implemented.

### D4.3 — Labels, themes, density, and RTL

**Files/discovery:** `packages/ui/src/labels.ts`, CSS/theme files, `DataGrid` prop types, package README, and accessibility fixtures.

- Add per-key `DataGridLabels` overrides and locale packs separate from value formatters.
- Ship CSS variables/data attributes for colors, focus rings, borders, typography, row/header height, and compact/standard/comfortable density; include light/dark and high-contrast-safe defaults without runtime CSS generation.
- Verify stable class names, RTL behavior from D2, and no hidden dependency on host global styles.

**Acceptance:** all built-in labels can be overridden by key, themes/densities do not change logical geometry unexpectedly, focus indicators meet contrast expectations, and RTL tests cover pinning/order.

### D4.4 — SSR/RSC and docs/demo application

**Files/discovery:** create `apps/docs` (or repository-approved docs host), add it to `pnpm-workspace.yaml`, `apps/docs/src/` examples, SSR/RSC fixture, Playwright config, visual fixtures, and docs links.

- Render DataGrid/Pivot-ready fixtures using only published/workspace package APIs. Include migration examples, feature matrix, a11y notes, SSR/RSC `"use client"` placement, performance fixtures, and bundle-size reporting.
- Add browser suites for keyboard operation, filters/menus/pager, pin/resize/reorder, loading/error/empty, CSV action, and hydration. Keep visual snapshots focused on stable layout states.
- Add a docs check that rejects private source imports and stale feature labels.

**Acceptance:** the docs host is the canonical Playwright/visual host; a clean RSC-oriented consumer can hydrate without reordering; examples exercise only documented package APIs.

### D4.5 — DataGrid release verification

Focused commands: `pnpm --filter @lynellf/tablekit-ui exec vitest run src`; `pnpm exec playwright test --config apps/docs/playwright.config.ts --project=chromium`; `pnpm build`; `pnpm check:package-artifacts`; `pnpm verify`.

Record bundle sizes against the release-gate budgets (core 20 kB gzip, react incremental 12 kB, UI minimal DataGrid 60 kB). Record the fixed-height performance fixture and DOM-count result; do not claim variable-height support.

## Review gate: D4 / `2.2.0` DataGrid

**Evidence required:** view integration and browser/a11y tests for both component forms; screenshots at supported breakpoints/densities/themes; SSR/RSC fixture output; docs feature matrix; package tarball fixture; bundle/performance report; `pnpm verify`.

**Approve only if:** native demos require no application-written grid scaffolding, the supported matrix matches code, first-release exclusions are clear, labels and client boundaries are documented/tested, and the fixed-height three-region architecture remains intact.

**Stop/rollback:** if controls bypass the headless instance or composable and turnkey forms diverge, stop and consolidate the shared engine. If Base UI or another dependency leaks into public types, wrap/remove the leak before release. If bundle or accessibility budgets are exceeded for architectural reasons, record an ADR and defer the offending control rather than weakening the contract.
