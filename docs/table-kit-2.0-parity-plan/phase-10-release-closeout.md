# Phase 10 — Release evidence, documentation, and closeout

**Track:** cross-cutting release operations  
**Depends on:** each product phase at its own release gate  
**Purpose:** make every release reproducible and keep the parity matrix honest

## Ordered tasks

### R10.1 — Contract and feature-matrix closeout

Update the new 2.x contract docs, package READMEs, migration guides, demo feature pages, and changelog. Every capability is labeled `implemented`, `primitive only`, `UI required`, `unsupported`, or `deferred`, with links to the public API and tests. Superseded v1 documents remain historical and are not edited to pretend they described 2.x.

### R10.2 — Verification and performance evidence

For the applicable release run, from repository root:

```bash
pnpm typecheck
pnpm lint
pnpm test -- --bail 1 --reporter=basic
pnpm build
pnpm check:package-artifacts
pnpm verify
```

Run focused package tests for touched tracks and browser tests from the docs host:

```bash
pnpm exec vitest run packages/core/src packages/react/src packages/pivot/src packages/worker/src packages/ui/src
pnpm exec playwright test --config apps/docs/playwright.config.ts --project=chromium
```

Run the relevant advisory benchmarks and compare against committed baselines. Record DataGrid fixed-height scroll/DOM counts, Pivot main-thread/worker/server fixtures, bundle sizes, and any justified baseline changes. A benchmark warning is investigated and documented; it is not silently deleted.

### R10.3 — Accessibility and consumer evidence

Run axe/validator and browser keyboard suites. For a11y-affecting changes, add the required 2.x row/notes to `docs/m6-hardening/sr-matrix.md` and record any linked issue for manual AT failures. Run each clean packed consumer fixture, including the RSC-oriented fixture, and inspect the tarball file list.

### R10.4 — Tag/rollback record

At a release gate, record the exact commit, package versions, verification output, benchmark report, API diff, migration notes, and rollback target. Rollback means stop publishing the affected package/release and revert the phase branch; do not remove persisted schema migrations or rewrite historical contract docs. A failed `2.1+` product release must not invalidate the already released foundation; defer the product phase instead.

## Review gate: release closeout

**Evidence required:** reproducible command output, package artifact/consumer evidence, docs matrix, accessibility record, benchmark/bundle report, changelog/migration note, and explicit release owner approval.

**Approve only if:** source claims, exports, declarations, built artifacts, docs/demo behavior, and release metadata agree. Any unsupported feature is visibly deferred or warned; no compatibility or advanced feature is implied by a passing core build.

**Stop/rollback:** any typecheck/lint/test/build/package-artifact failure, broken browser gate, public-doc mismatch, or missing migration evidence blocks the release. Return to the phase that owns the defect and repeat its review gate.
