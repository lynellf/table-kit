# Phase 1 Foundation — Review Decision

**Review session:** 2026-07-11 re-review  
**Reviewer:** reviewer  
**Status:** `REQUEST-CHANGES`  
**Gate:** blocked; Phase 2 must not start until all findings are resolved and an independent reviewer signs

> **R7.1 Phase 0 status correction (2026-07-11):** This decision was previously labeled `EVIDENCE-COLLECTED` with claims that R1–R6 verification was complete. Those claims were premature and are now superseded. A green `pnpm verify` run is insufficient evidence; the reviewer must verify that tests exercise the actual failing paths and that packed fixtures do not resolve workspace sources. This document records the open findings that must be resolved before the Foundation gate can reopen.

## Open findings and required evidence

| Area | Current decision | Required evidence before the Foundation gate can reopen |
|---|---|---|
| **R1 — state reconciliation, reset, and pruning** | `REQUEST-CHANGES` | Regression tests prove partial `next.state` retains every omitted slice, controlled transitions retain/adopt effective values, reset restores the constructor-effective baseline, `resetState` emits one atomic notification, and every ID-bearing slice removes IDs for deleted columns while preserving valid values. |
| **R2 — pagination wire types and data identity** | `REQUEST-CHANGES` | Offset sources receive `{ type: 'offset', offset, limit }`; cursor sources receive cursor/direction/limit and publish next/previous cursors; direct and data-source boundaries expose version identity; same-reference unchanged-version data is a no-op and changed-version data publishes. |
| **R3 — nullable data-source lifecycle and races** | `REQUEST-CHANGES` | Hooks/effects remain unconditional; null sources are idle and unsubscribed; source identity/capabilities/query inputs are key material; superseding requests abort and cannot publish; sync throws, aborts, source replacement, out-of-order results, stale-while-revalidate, one-request-per-key, and no-sparse-write cases are covered. |
| **R4 — pivot callbacks, resize, and leaf metadata** | `REQUEST-CHANGES` | Dedicated public callbacks accept React setters and ordinary updaters; controlled resize dispatches raw updaters without local mutation; uncontrolled resize works; sizing, ordinary pinning, total-column defaults, and deterministic cumulative offsets are state-derived without mutating engine results. |
| **R5 — instance-owned announcers** | `REQUEST-CHANGES` | Two live DataTables and two live PivotTables retain matching messages after either sibling unmount order and under Strict Mode; no singleton/last-mounted routing or global no-op cleanup remains. DOM-node existence alone is not evidence. |
| **R6 — v2 release evidence** | `REQUEST-CHANGES` | Public-surface imports execute against built/packed artifacts; clean v2 fixtures compile without workspace/source/declaration-path escapes; live documentation/version drift fails; historical archives are exempt; checks are wired into package-artifact verification; runtime versions derive from metadata. |
| **R7 — re-gate and evidence closeout** | `REQUEST-CHANGES` | Exact focused results, test counts, build/package boundary output, export matrix, fixture compilation, docs-drift output, and a complete F0.1–F0.6 decision matrix are recorded after R1–R6. An independent reviewer must sign the Foundation gate. |

## Verification required for the next review

Run from a clean working tree and clean build output, then record exact output rather than summary claims:

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

### E2E Tests (Playwright)

E2e tests have been added to verify the pivot engine in a real browser context:

```bash
# Run e2e tests
cd e2e && pnpm exec playwright test --config=playwright.config.ts

# Or from root
pnpm test:e2e
```

**E2E Test Results (2026-07-12):**
```
16 passed (10.7s)

Tests:
✓ m4-pivot-main-thread example loads and renders
✓ pivot table renders with row hierarchy
✓ pivot footer renders with grand total
✓ expand/collapse toggles work
✓ multiple demo panels render independently
✓ pivot table produces consistent results across renders
✓ data values are formatted correctly
✓ aria roles are correctly applied for accessibility
✓ announcer component renders for accessibility
✓ pivot sorting UI renders
✓ grand total column configuration renders correctly
✓ computes pivot result within acceptable time budget
✓ handles 1000-row dataset without errors
✓ captures screenshot of basic pivot configuration
✓ captures screenshot of sorted pivot
✓ captures screenshot of column hierarchy pivot
```

**Screenshots captured:**
- `docs/screenshots/m4-pivot-main-thread/basic-pivot-configuration.png`
- `docs/screenshots/m4-pivot-main-thread/sorted-pivot.png`
- `docs/screenshots/m4-pivot-main-thread/column-hierarchy-pivot.png`

The reviewer must inspect that the tests exercise the failing paths and that packed fixtures do not resolve workspace source. A passing command without that boundary inspection does not close the finding.

## Stop rule

Do not authorize `phase-2-column-hierarchy-and-sizing.md` while any R1–R7 row is open. If a required behavior cannot be implemented within the active round-4 scope, stop and return `REQUEST-CHANGES`; do not weaken the test, hide a query loop with a fetch lock, restore global announcer routing, or claim workspace aliases as packed-consumer evidence.
