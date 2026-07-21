# Phase 9 — Compatibility and migration gate

**Track:** C0, then conditional C1–C4  
**Depends on:** `2.2.0` DataGrid and `2.3.0` PivotGrid releases, plus migration docs  
**Release target:** only when a real consumer justifies it

## Goal

Make compatibility a measurable migration decision rather than an assumed deliverable. A no-go result is a successful outcome: native APIs/codemods remain the supported path and no vendor-shaped runtime enters the package graph.

## C0 entry gate (must happen before adapter code)

Create a migration decision record containing:

1. A named real consumer application and owner, with permission to use a sanitized configuration fixture.
2. Checked-in golden DataGrid/Pivot configurations and representative workflows (sorting/filtering/pagination/selection/pinning/export/field layout as applicable).
3. Acceptance tests describing before/after behavior and documented semantic differences.
4. An assessment of native Table Kit APIs, codemods, and focused imperative shims; adapter work must be shown cheaper or safer for repeated migrations.
5. A maintenance owner, supported vendor/version scope, deprecation policy, warning policy, and release budget.

If any item is absent, stop at C0, document `NO-GO`, and do not create a compatibility package.

## Conditional C1 — Bounded adapter

Only after C0 approval, create `@lynellf/tablekit-compat` as a separate package. Keep adapters over native `tablekit-ui`/headless contracts; never add vendor terminology to core or pivot.

- Add a configuration validator/report CLI with stable warning codes.
- Classify every option/method as `Mapped`, `Adapted`, or `Unsupported`; unsupported inputs warn and never silently fall back.
- Start with the selected consumer's real fixtures, then add synthetic fixtures only to fill documented gaps.
- Prefer codemods/config translators and focused imperative shims over a general widget lifecycle. Add Webix or AG Grid support, not both, unless separate demand evidence passes again.

**Acceptance:** real golden fixtures pass, adapted semantics are documented, unsupported features produce actionable warnings, and native/codemod versus adapter migration docs compare the tradeoff.

## C2 verification and maintenance gate

Focused commands after the package exists: `pnpm --filter @lynellf/tablekit-compat exec vitest run src`; `pnpm exec playwright test --config apps/docs/playwright.config.ts --project=chromium --grep compat`; `pnpm build`; `pnpm check:package-artifacts`; `pnpm verify`.

Record supported vendor/version subset, bundle impact, fixture provenance, and owner in the release note. Add compatibility changes to the 2.x docs feature matrix and changelog.

## Review gate: C0/C1

**C0 evidence required:** named consumer, permission/sanitization record, fixtures, workflow tests, native/codemod insufficiency assessment, owner, and explicit go/no-go decision.

**C1 evidence required (only on go):** bounded API/type surface, warning assertions, real fixture behavior, migration report, docs, package artifact fixture, and `pnpm verify`.

**Stop/rollback:** a synthetic-only corpus, silent fallback, broad vendor API promise, or absent owner is an automatic no-go. For a failed adapter experiment, remove the separate package and preserve native APIs/docs; do not contaminate the core contract.
