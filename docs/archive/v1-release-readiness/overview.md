# v1.0 Release Readiness — Spec

**Slug:** `v1-release-readiness`
**Status:** Draft v1 for review
**Audience:** implementer (after panel approval)
**Scope:** Documentation, release scripts, and path/version consistency for the v1.0.0 cut of all four published packages (`@lynellf/tablekit-{core,react,pivot,worker}`).
**Out of scope:** Publishing the packages to npm (manual operator step); CI publish workflow automation; Changesets/release-please adoption; per-package API documentation site; pivot/worker API additions.

---

## What I found (investigation summary)

Sources reviewed: `package.json`, `README.md`, `packages/{core,react,pivot,worker}/package.json`, `packages/{core,react}/README.md`, `packages/pivot/src/index.ts`, `packages/worker/src/index.ts`, `docs/initial-spec.md` (§3 package architecture, §14 milestones), `docs/release-process.md`, `docs/recipes/README.md`, `docs/archive/prepare-for-npm/plan.md`, `docs/archive/prepare-for-npm/phase-5-publish-scripts-and-dry-run.md`, `docs/archive/prepare-for-npm/RELEASING.md`, `docs/archive/m6-hardening/api-freeze.md`, `docs/archive/m6-hardening/sr-matrix.md`, `docs/archive/m6-hardening/plan-summary.md`, `.okf/components/dev-tooling-stack.md`, `.okf/workflows/dev-tooling-bootstrap.md`, `.github/workflows/test.yml`, `bench/baseline.json`, `scripts/bench-compare.mjs`, `scripts/check-broken-links.mjs`.

Verified facts:

- **All four packages are at v1.0.0** in their respective `package.json` files (`@lynellf/tablekit-core@1.0.0`, `-react@1.0.0`, `-pivot@1.0.0`, `-worker@1.0.0`). Root `package.json` is also `1.0.0`.
- **Release scripts are partial.** Root `package.json` has `release:core` and `release:react` but is missing `release:pivot` and `release:worker`. `pack:core` and `pack:react` exist; `pack:pivot` and `pack:worker` are missing. Build scripts for all four exist (`build:core`, `build:react`, `build:pivot`, `build:worker`) and have already been verified working (per `docs/archive/m6-hardening/phase-4-ci-benchmarks-and-bundler-recipes.md` and `docs/archive/prepare-for-npm/phase-3-build-wiring.md`).
- **`docs/release-process.md` references `pnpm release:pivot && pnpm release:worker` but those scripts do not exist.** A consumer following the documented release runbook will hit a `command not found` error.
- **Per-package READMEs are partially missing and partially stale.**
  - `packages/core/README.md` exists. Says "v0.1.0 — early stage" (stale: package.json is 1.0.0). References `./docs/initial-spec.md` — a broken relative path that won't resolve when the package is installed from npm (the published tarball contains only `dist/`, `README.md`, `LICENSE`, `package.json` per `files: ["dist"]`). Does not mention the pivot or worker packages.
  - `packages/react/README.md` exists. Same v0.1.0 staleness. Same broken `./docs/initial-spec.md` link. Uses `useTable` in the example code — but the actual public API (per `docs/archive/m6-hardening/api-freeze.md` §3.2 and §4) is `useDataTable`. Does not mention the pivot or worker packages.
  - `packages/pivot/README.md` — **does not exist.** The package is publishable but consumers have no README to read on npm.
  - `packages/worker/README.md` — **does not exist.**
- **`packages/pivot/src/index.ts` exports `VERSION = '0.1.0'`.** This is the runtime version string consumers will see at runtime. Stale relative to package.json `1.0.0`.
- **The v1.0 canonical docs (`docs/archive/m6-hardening/{api-freeze,sr-matrix}.md`) are referenced from consumer-facing docs via paths that resolve to the archive directory, not to a current location.**
  - `docs/release-process.md` references `docs/m6-hardening/api-freeze.md` and `docs/m6-hardening/sr-matrix.md`.
  - Root `README.md` references `docs/m6-hardening/api-freeze.md`.
  - `docs/recipes/README.md` references `docs/m6-hardening/api-freeze.md`.
  - `docs/initial-spec.md` line 953 references `docs/m6-hardening/api-freeze.md`.
  - The m6-hardening plan (`docs/archive/m6-hardening/plan-summary.md` row D6, phase 5 line 136) explicitly states these files should live at `docs/m6-hardening/{api-freeze,sr-matrix}.md`, but they were never moved out of `docs/archive/m6-hardening/`.
  - `scripts/check-broken-links.mjs` scans everything except `archive/`, so it does not flag these — but the paths are genuinely broken for any consumer navigating from `docs/release-process.md`.
- **No `CHANGELOG.md` exists.** `docs/release-process.md` step 7 says "Add the v1.0.0 entry at the top of `CHANGELOG.md`" but the file is absent.

Assumptions (applied during planning — see open questions):

1. The v1.0 canonical docs (`api-freeze.md`, `sr-matrix.md`) belong at `docs/m6-hardening/`, not in `docs/archive/m6-hardening/`. Rationale: the m6-hardening plan summary says they should live there; every consumer-facing doc references that path; and they are the v1.0 contract, not a historical artifact (per-milestone freezes are already archived under `docs/archive/api-freeze-history/`).
2. The four `VERSION` constants in `packages/*/src/index.ts` should match the corresponding `package.json` `version` field. Only `pivot` is currently out of sync (`0.1.0` vs `1.0.0`); the others already match `1.0.0` (verified by smoke tests in `core/src/index.test.ts` and `react/src/index.test.ts` that match `^\d+\.\d+\.\d+`).
3. The release scripts follow the existing pattern (`build:<pkg> && publish --access public`). No changesets/release-please adoption in this plan (manual versioning remains the convention per `docs/release-process.md` step 4).
4. `CHANGELOG.md` follows Keep-a-Changelog 1.1.0 format. Single v1.0.0 entry summarizing M0–M6 milestones.
5. Per-package READMEs include only stable consumer-facing API, not internal milestone history.

Telemetry (this visit):
- `okf_docs_read`: 2 (`.okf/components/dev-tooling-stack.md`, `.okf/workflows/dev-tooling-bootstrap.md`)
- `files_scanned_before_okf`: 0
- `files_scanned_after_okf`: 24 (configs + package metadata + per-package READMEs + pivot/worker src indexes + release-process + archive plans + api-freeze + sr-matrix + bench baseline + scripts)
- `stale_okf_hits`: 0 (the two OKF docs are accurate)
- `missing_okf_hits`: 1 — there is no OKF doc for the release/publish workflow. After this plan lands, that would be a useful add (the release process is durable and reusable across releases), but emitting it is `okf-curator` work.

---

## Objective

Make `table-kit` release-ready for the v1.0.0 cut of all four published packages by:

1. Adding the missing `pack:pivot`, `pack:worker`, `release:pivot`, `release:worker` scripts so the documented `docs/release-process.md` runbook actually works.
2. Making every per-package README accurate (correct version, correct hook name, no broken relative paths, links to the right sibling packages) and creating the missing `pivot` and `worker` READMEs.
3. Making the v1.0 canonical docs (`api-freeze.md`, `sr-matrix.md`) live where consumer-facing docs reference them (`docs/m6-hardening/`, not `docs/archive/m6-hardening/`).
4. Fixing the pivot runtime `VERSION` constant so `import { VERSION } from '@lynellf/tablekit-pivot'` reports `1.0.0`.
5. Adding a root `CHANGELOG.md` with the v1.0.0 entry the release process already expects to write into.

## Scope boundaries

**In scope:**
- Root `package.json` script additions (`pack:pivot`, `pack:worker`, `release:pivot`, `release:worker`).
- New `packages/pivot/README.md` and `packages/worker/README.md`.
- Edits to `packages/core/README.md` and `packages/react/README.md` (status text, hook name in example, remove broken relative spec link, mention pivot/worker).
- Edit `packages/pivot/src/index.ts` to bump `VERSION` from `'0.1.0'` to `'1.0.0'`.
- Move `docs/archive/m6-hardening/api-freeze.md` → `docs/m6-hardening/api-freeze.md`.
- Move `docs/archive/m6-hardening/sr-matrix.md` → `docs/m6-hardening/sr-matrix.md`.
- New root `CHANGELOG.md` with a v1.0.0 entry (Keep-a-Changelog format).
- Update `docs/release-process.md` to point at the moved docs and add a note that `release:pivot` / `release:worker` are now part of the script set.

**Out of scope (will be a follow-up plan if needed):**
- Publishing the packages to npm (manual operator step; the runbook at `docs/release-process.md` stays manual).
- CI publish workflow (`.github/workflows/release.yml`).
- Changesets or release-please adoption.
- npm provenance.
- Per-package API reference docs (e.g., TypeDoc output).
- A consumer-facing docs site.
- Updating milestone-internal doc references inside `docs/archive/m6-hardening/*` (those are historical artifacts; future readers can find the canonical location via the index).

## Resolved constraints (from handoff)

| # | Constraint | Resolution |
|---|------------|------------|
| C1 | Add BOTH `release:pivot` AND `release:worker` scripts (not pivot only) | `release:pivot` and `release:worker` added in Phase 2. `pack:pivot` and `pack:worker` are added in the same phase to keep the release-process runbook symmetric (every `release:*` has a matching `pack:*` dry-run). |
| C2 | Goal is documentation AND release readiness | Both: Phase 2 covers scripts, Phase 3 covers per-package READMEs, Phase 4 covers the canonical docs move + CHANGELOG. |
| C3 | v1.0.0 is the target; do not introduce a pre-1.0 patch | No version downgrades. Pivot's stale `VERSION` constant is bumped from `0.1.0` to `1.0.0`. |
| C4 | Public API freeze must remain stable | Phase 3 READMEs use the exact names from `docs/archive/m6-hardening/api-freeze.md` §4 (`createDataTable`, `useDataTable`, `createPivotTable`, `createWorkerEngine`). |

## Critical risks

1. **Publishing order matters.** The dependency chain is `react → (core, pivot, worker)`; `pivot → core`; `worker → pivot`. If a consumer installs only `@lynellf/tablekit-react` without `core`, the peer-dep warning will appear. The existing `peerDependenciesMeta` makes `pivot` optional for `react`. The release runbook should publish in the order: `core` → `pivot` → `worker` → `react`. (Same order used in the archived 0.1.0 plan for core+react.) This plan does not change the existing publish order documented in `docs/release-process.md` step 6 — the operator just sees four `release:*` calls instead of two.
2. **`pnpm release:*` assumes `pnpm login` was run.** The release process doc already calls this out as a manual prerequisite. No change to that contract.
3. **The `VERSION` constant bump for pivot will pass the existing smoke-test pattern `^\d+\.\d+\.\d+`** (per `packages/core/src/index.test.ts` and `packages/react/src/index.test.ts` which use the same regex). No test changes needed. Pivot does not appear to have a matching smoke test today; if it does not get one as part of this plan, the runtime constant is checked manually during verification.
4. **Moving `api-freeze.md` and `sr-matrix.md` out of archive is a non-breaking change** for the in-repo docs (everything that referenced the path still resolves), but it is **a non-trivial semantic move**: those files were originally archived as part of the m6-hardening plan. The intent is that the v1.0 contract becomes the canonical, current doc and historical context is the per-milestone freezes under `docs/archive/api-freeze-history/`. No code change requires the move; only the consumer-facing docs that reference the path benefit.
5. **CHANGELOG.md format choice** (Keep-a-Changelog 1.1.0) is opinionated. If the maintainer prefers Conventional Commits + auto-generated CHANGELOG (via release-please), this becomes moot — but Changesets/release-please adoption is out of scope per C2.

## Phases

| # | Phase | Files | What it produces |
|---|-------|-------|------------------|
| 1 | Investigation completion | `overview.md` (this doc) + phase files | The investigation gaps from the previous pass are closed; the plan rests on a complete file list. |
| 2 | Root release scripts | `package.json` | `pack:pivot`, `pack:worker`, `release:pivot`, `release:worker` scripts present; existing core/react scripts unchanged. |
| 3 | Per-package READMEs | `packages/core/README.md`, `packages/react/README.md`, `packages/pivot/README.md` (new), `packages/worker/README.md` (new) | All four READMEs accurate at v1.0.0, no broken relative paths, correct hook/factory names, sibling-package cross-links. |
| 4 | v1.0 docs canonicalization | `docs/archive/m6-hardening/{api-freeze,sr-matrix}.md` → `docs/m6-hardening/`; `docs/release-process.md` (path references); `CHANGELOG.md` (new) | The canonical v1.0 contract lives where `release-process.md` and root README reference it. A root CHANGELOG with the v1.0.0 entry exists. |
| 5 | Pivot runtime version bump | `packages/pivot/src/index.ts` | `VERSION` constant reports `1.0.0` at runtime, matching `packages/pivot/package.json`. |

Sequencing rationale:
- Investigation (1) first because the plan depends on a complete read of `docs/initial-spec.md` (now confirmed read in full), per-package package.json files (all four read), and per-package READMEs (all four read; two missing).
- Scripts (2) before READMEs (3) because the release runbook is the primary deliverable; the README edits are the docs layer that wraps the published packages.
- README edits (3) before the docs canonicalization (4) because moving files does not change what the READMEs should say — the docs move is a documentation of the existing canonical contract.
- Version bump (5) last because it is the smallest change and depends on no other phase.

## Acceptance criteria

The plan is complete when:

1. `pnpm pack:pivot` and `pnpm pack:worker` exit 0 (or dry-run with a non-zero tarball exit is acceptable per the existing `pack:core`/`pack:react` precedent; see note in Phase 2).
2. `pnpm release:pivot` and `pnpm release:worker` scripts exist in root `package.json` and resolve to a `pnpm build:<pkg> && pnpm -F @lynellf/tablekit-<pkg> publish --access public` command — equivalent to the existing `release:core` / `release:react` shape.
3. `docs/release-process.md` step 6 (`pnpm release:core && pnpm release:react && pnpm release:pivot && pnpm release:worker`) executes without a "script not found" error on a fresh clone.
4. Every per-package `README.md` (core, react, pivot, worker):
   - Does not reference `./docs/initial-spec.md` or any other in-repo path that won't resolve inside the published tarball.
   - Reports the same version as the package's `package.json` (`1.0.0`).
   - Uses the public-API names from `docs/m6-hardening/api-freeze.md` §4 (e.g., `useDataTable`, `createDataTable`).
   - Cross-links the sibling packages a consumer would need (e.g., react README points at core; pivot README points at core).
5. `docs/m6-hardening/api-freeze.md` and `docs/m6-hardening/sr-matrix.md` exist at the non-archive path; the paths in `docs/release-process.md`, root `README.md`, and `docs/recipes/README.md` all resolve.
6. `import { VERSION } from '@lynellf/tablekit-pivot'` reports `1.0.0` after `pnpm build:pivot` and `pnpm build:pivot:subpaths`.
7. `CHANGELOG.md` exists at the repo root with a v1.0.0 entry.
8. `pnpm verify` exits 0 from a fresh clone at the end of the plan.

## Open concerns for the orchestrator

- **Should `release:core` / `release:react` be updated to also run `pnpm build:subpaths`?** The current `release:core` script does only `pnpm build:core && publish`. The subpath bundles (e.g., `@lynellf/tablekit-core/virtualization`) are built by `build:core:subpaths`, which the root `build` script invokes but the per-package `release:*` does not. If a consumer uses a subpath import, they would need the subpath dist files. This plan does **not** fix that for core/react (out of scope; would change the existing 0.1.0 contract). The new `release:pivot` and `release:worker` should follow the same shape as `release:core` for symmetry — i.e., they build the main entry but not the subpaths. Flagged here as a known limitation of the existing release scripts; a separate plan could address it for all four packages if the maintainer wants subpath imports to work out-of-the-box.
- **`CHANGELOG.md` content for v1.0.0.** The Keep-a-Changelog entry should summarize M0–M6 milestones. The current `docs/m6-hardening/plan-summary.md` is a good source. No additional research is needed — the phase 4 plan file will compile it. If the maintainer prefers a different changelog style (auto-generated from commits), they should reject the plan and request a Changesets/release-please plan instead.
- **Naming/brand question (spec §16 #1).** The placeholder `@tablekit/*` was renamed to `@lynellf/tablekit-*` in commit `a33135d` ("refactor: rename package from @tablekit to @lynellf/tablekit"). No further naming work is in scope here.
- **Pivot README's "Status" field.** The archived `prepare-for-npm` plan put `v0.1.0 — early stage` in the core/react READMEs. v1.0.0 READMEs should say `v1.0.0 — stable` to match root README and api-freeze. This is settled by C3.
- **Move vs symlink.** Moving the two m6 docs out of archive is a content-management decision. Symlinks would preserve the archive copies but git on Windows can mishandle them and pnpm-workspace tools sometimes follow them in unexpected ways. A real `git mv` is cleaner.

## Knowledge candidates

- **Durable fact: the four-table-kit v1.0 release scripts follow the `pnpm build:<pkg> && pnpm -F @lynellf/tablekit-<pkg> publish --access public` shape.** Worth emitting as a role-behavior / workflow concept if `okf-curator` opens a doc for "release workflow". (Not emitted here — `okf-curator` decides what to do with it.)
- **Durable fact: the m6-hardening canonical v1.0 docs live at `docs/m6-hardening/` (not in archive).** Worth emitting as a workflow note for future maintainers. Same caveat.
- **Pitfall: per-package READMEs must not reference in-repo paths that won't resolve inside the published tarball** (the tarball contains `dist/`, `README.md`, `LICENSE`, `package.json` only). Worth emitting as a pitfall. Future planners writing per-package READMEs will benefit.

These three are surfaced as candidates; not emitted directly by this plan (`okf-curator` writes `.okf/`).

## Verification

Run from a fresh checkout at the end of the plan:

```bash
# 1. Toolchain green
pnpm verify

# 2. Release scripts present and resolve
pnpm run | grep -E '^  release:(pivot|worker)|^  pack:(pivot|worker)'

# 3. Pivot runtime version is 1.0.0
node -e "import('./packages/pivot/dist/tablekit-pivot.es.js').then(m => console.log(m.VERSION))"
# Expected: 1.0.0

# 4. Per-package READMEs exist, are non-empty, contain no broken in-repo relative links
test -s packages/core/README.md
test -s packages/react/README.md
test -s packages/pivot/README.md
test -s packages/worker/README.md
grep -L '\.\./\.\./docs' packages/{core,react,pivot,worker}/README.md || echo "OK"
grep -L '\./docs/' packages/{core,react,pivot,worker}/README.md || echo "OK"

# 5. Canonical v1.0 docs at the non-archive path
test -f docs/m6-hardening/api-freeze.md
test -f docs/m6-hardening/sr-matrix.md

# 6. References in consumer-facing docs resolve
grep -q 'docs/m6-hardening/api-freeze.md' docs/release-process.md
grep -q 'docs/m6-hardening/api-freeze.md' README.md
grep -q 'docs/m6-hardening/api-freeze.md' docs/recipes/README.md

# 7. CHANGELOG.md exists with v1.0.0 entry
test -f CHANGELOG.md
grep -q '## \[1.0.0\]' CHANGELOG.md

# 8. Release runbook executes without script-not-found errors
pnpm release:pivot --dry-run 2>&1 | head -5 || true
pnpm release:worker --dry-run 2>&1 | head -5 || true
# Expected: scripts resolve to a command pipeline; no "Missing script" error.
```

Expected: all checks green. `pnpm release:* --dry-run` is a check for script resolution only — it does not actually publish.