# Phase 3 — Three-region fixed-height walking skeleton

**Track:** D2
**Depends on:** Phases 1–2
**Unlocks:** DataGrid and PivotGrid product UI
**Release target:** `2.1.0` preview

## Goal

Validate the riskiest rendering architecture before building a broad component set: one vertical scroll authority, pinned left/center/right regions, center-column virtualization, grouped sticky headers, focus identity, and deterministic fixed row measurements.

## Ordered tasks

### D2.1 — UI preview shell and region model

**Files/discovery:** create `packages/ui/package.json`, `tsconfig`, `vite/vitest` config, and `src/DataGrid/` (or the repository-approved equivalent); update `pnpm-workspace.yaml` and root build/typecheck wiring. Reuse core/react public imports only.

- Define an internal `DataGrid` region model consuming `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns`, header rows, row model, and virtualizer outputs.
- Adopt the pre-implementation protocol in `docs/table-kit-2.0-parity-plan/design-three-region-scroll-protocol.md`: the center body viewport is the sole vertical scroll owner; its `scrollTop` is the shared logical offset; pinned regions have no independent vertical overflow and render the same virtual row positions; only the center viewport owns horizontal overflow; `scrollToRow` writes only to that owner. Batch scroll notifications with `requestAnimationFrame` and never synchronize regions with competing DOM scroll listeners.
- Establish fixed contracts before rendering: `rowHeight` is a consumer option with a deterministic `40px` default, `headerHeight` is a deterministic `40px` default, both numeric values are published as CSS variables and fed to every region's virtualizer, and no DOM measurement is used for row geometry. The protocol also requires one atomically resolved visible/pinned leaf-column snapshot per render, so visibility changes cannot produce different row projections; pinned tracks clip horizontal overflow instead of scrolling or expanding independently.
- Keep one vertical scroll authority. Render pinned regions as synchronized projections of the same logical row IDs; render center columns through the existing center virtualizer.
- Establish CSS variables/data attributes and no DOM reads during module initialization.

**Acceptance:** a minimal grid renders from workspace package APIs with no private source imports; each logical row/cell has one identity even when projected into regions; the root exposes the documented role/count attributes; a protocol test proves the center owner, shared `scrollTop`, fixed row/header heights, atomic visibility snapshot, and pinned horizontal clipping.

### D2.2 — Scroll, virtualization, and resize/reorder wiring

**Files/discovery:** `packages/ui/src/DataGrid/`, `packages/react/src/useScrollAdapter.ts`, `useSizeObserver.ts`, `packages/core/src/virtualization/*`, and focused UI tests.

- Implement the protocol's scroll model: listen only on the center vertical owner, publish a shared `scrollTop` snapshot on RAF, derive pinned and center virtual rows from the same offset, and route programmatic row scrolling through that owner. The left/right tracks do not receive independent `scrollTop` writes; the center horizontal viewport alone updates `scrollLeft`, while pinned tracks remain clipped.
- Use `top` absolute positioning for rows; do not use transforms on ancestors that must support sticky positioning. Feed the same fixed `rowHeight` and virtual row offsets to all three regions.
- Resolve visible, ordered, and pinned leaf columns once per committed table snapshot and distribute that result to all regions before rendering; visibility/order/pinning changes invalidate the center spacer and all region projections together.
- Wire column resize, column order/pinning commands, and deterministic center spacer width. Add loading/empty state surfaces without introducing editing.

**Acceptance:** representative tall/wide fixtures do not show vertical region drift; pinned columns remain visible while center columns window; resize/reorder keeps headers and body aligned; browser and unit tests prove there is one vertical scroll owner, no competing pinned scroll containers, shared fixed row offsets, atomic visibility reconciliation, and horizontal-scroll isolation.

### D2.3 — Focus, keyboard, LTR/RTL, and SSR smoke

**Files/discovery:** `packages/ui/src/DataGrid/`, `packages/react/src/useKeyboardNav.ts`, `useTabBehavior.ts`, `packages/core/src/keyboardNav.ts`; add view integration tests and a browser fixture/config.

- Preserve focused row/column identity across virtualization and region projections; use keep-mounted behavior or a documented focus handoff.
- Exercise arrows, Home/End, page movement, sort/basic filter control activation, and existing announcer/validator contracts.
- Add LTR and RTL smoke fixtures with an explicit supported behavior/limitation. Add a server-render/hydration fixture proving deterministic initial widths and no row/column reorder.

**Acceptance:** focus does not duplicate or disappear while scrolling; keyboard behavior passes the existing contract; RTL is either supported by assertions or explicitly documented; SSR hydration is warning-free.

### D2.4 — Build-versus-adopt evidence

Benchmark the owned center virtualizer against a minimal TanStack Virtual prototype using the same grouped/pinned fixture. Record scroll DOM count, focus behavior, alignment, bundle impact, and implementation complexity in an ADR under `docs/`.

The public Table Kit API remains unchanged. A replacement is allowed only for virtualization internals and only if the ADR records why it satisfies the D2 reconsideration triggers.

### D2.5 — Browser/visual fixture wiring

If browser tooling is not already present, add a pinned `@playwright/test` dev dependency and a repository script/config. Add focused suites for scroll alignment, resize/reorder, focus, loading/empty, and RTL. Add screenshot baselines only for stable geometry, not text that changes with locale.

**Focused commands:** `pnpm exec vitest run packages/ui/src`; `pnpm exec playwright test --config packages/ui/playwright.config.ts --project=chromium`; `pnpm typecheck`; `pnpm build`.

## Review gate: D2 / rendering architecture

**Evidence required:** browser tests and screenshots at a tall/wide pinned fixture; focus/identity assertions; SSR hydration output; RTL result; benchmark/ADR; package bundle measurement; `pnpm verify`.

**Approve only if:** pinned and center regions remain aligned, grouped headers align under horizontal virtualization, keyboard focus survives virtualization, one scroll authority is demonstrably used by the protocol, fixed-height behavior is stable, and the protocol evidence covers scroll synchronization, height distribution, visibility reconciliation, and horizontal isolation. Variable row height is not part of approval.

**Stop/rollback:** if any drift, focus loss, or hydration reorder remains, stop all D3/D4 UI work and repair the shell. If variable-height prototype fails shared-measurement, anchoring, relayout, or focus criteria, record it as deferred and keep the fixed-height contract. If the package boundary requires private imports, repair the public surface before proceeding.
