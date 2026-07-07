# v1.0 Release Readiness — Plan Summary

**Slug:** `v1-release-readiness`
**Status:** Draft

## Goal

Make `table-kit` release-ready for the v1.0.0 cut of all four published packages (`@lynellf/tablekit-{core,react,pivot,worker}`) by adding the missing release scripts, fixing per-package READMEs, canonicalizing the v1.0 docs location, and aligning the pivot runtime `VERSION` constant.

## What's in the plan

| # | Phase | Doc |
|---|-------|-----|
| 1 | Investigation completion | [`overview.md`](./overview.md) |
| 2 | Root release scripts (`pack:pivot`, `pack:worker`, `release:pivot`, `release:worker`) | [`phase-2-release-scripts.md`](./phase-2-release-scripts.md) |
| 3 | Per-package READMEs (rewrite core/react; create pivot/worker) | [`phase-3-per-package-readmes.md`](./phase-3-per-package-readmes.md) |
| 4 | v1.0 docs canonicalization (move api-freeze.md and sr-matrix.md out of archive) + root CHANGELOG.md | [`phase-4-docs-canonicalization-and-changelog.md`](./phase-4-docs-canonicalization-and-changelog.md) |
| 5 | Pivot runtime `VERSION` constant bump (0.1.0 → 1.0.0) | [`phase-5-pivot-version-bump.md`](./phase-5-pivot-version-bump.md) |

## Constraints resolved

- **Add BOTH `release:pivot` AND `release:worker` scripts** (not pivot only). Phase 2 covers this and adds the matching `pack:*` dry-run scripts for symmetry.
- **Documentation and release readiness are both in scope** per the user's stated goal.
- **v1.0.0 is the target** — no pre-1.0 patches introduced.
- **Public API stays frozen** — Phase 3 READMEs use the exact names from `docs/m6-hardening/api-freeze.md` §4.

## Sequencing rationale

Investigation (Phase 1) first because the plan rests on a complete file list. Scripts (Phase 2) before README edits (Phase 3) because the release runbook is the primary deliverable; README wraps the published packages. Docs canonicalization (Phase 4) is independent of READMEs and follows them. Version bump (Phase 5) is the smallest change and depends on no other phase.

## Acceptance criteria

See [`overview.md`](./overview.md) §"Acceptance criteria".

## Verification

The end-to-end verification is in [`overview.md`](./overview.md) §"Verification". The summary:

```bash
pnpm verify
pnpm release:pivot --dry-run  # confirms script resolves, no actual publish
pnpm release:worker --dry-run
node -e "import('./packages/pivot/dist/tablekit-pivot.es.js').then(m => console.log(m.VERSION))"
# Expected: 1.0.0
test -f docs/m6-hardening/api-freeze.md
test -f CHANGELOG.md
```

All checks must pass before the plan is considered complete.

## Risks

See [`overview.md`](./overview.md) §"Critical risks". Headline items:

1. Publishing order: `core → pivot → worker → react` (matches the dependency graph; matches the existing 0.1.0 publish order for core+react).
2. Subpath builds are not invoked by the per-package `release:*` scripts; this is a pre-existing limitation shared by `release:core` / `release:react`, not introduced by this plan.
3. Moving `api-freeze.md` / `sr-matrix.md` out of archive is a content-management decision; the consumer-facing doc references already point at the non-archive path, so the move is a one-way restore of plan intent.

## Out of scope

- Publishing the packages to npm (manual operator step; the runbook at `docs/release-process.md` stays manual).
- CI publish workflow, Changesets/release-please, npm provenance.
- Per-package TypeDoc reference docs.
- A consumer-facing docs site.
- Rewriting historical references inside `docs/archive/m6-hardening/*` (their stale references resolve automatically once the files are moved).