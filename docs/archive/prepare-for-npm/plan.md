# Prepare for npm Publishing — Plan

**Slug:** `prepare-for-npm`
**Status:** Draft v1 for review
**Audience:** implementer (after panel approval)
**Scope:** Publishable metadata and release workflow for `@tablekit/core` and `@tablekit/react` at v0.1.0.
**Out of scope:** publishing `@tablekit/pivot` and `@tablekit/worker` (M4/M5, not implemented yet); CI publish automation; changesets/release-please adoption.

---

## What I found (investigation summary)

Sources reviewed: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`, `.gitignore`, `LICENSE`, `README.md`, `tsconfig.base.json`, `tsconfig.json`, `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/src/index.test.ts`, `packages/react/package.json`, `packages/react/src/index.ts`, `packages/react/src/index.test.ts`, `packages/core/tsconfig.json`, `packages/react/tsconfig.json`, `vite.config.ts`, `vitest.workspace.ts`, `docs/initial-spec.md`, `.okf/components/dev-tooling-stack.md`, `.okf/workflows/dev-tooling-bootstrap.md`, `docs/archive/dev-tooling-bootstrap/overview.md`.

Verified facts:

- **Monorepo.** pnpm workspaces (`pnpm@10.33.1`, `packages/*`); root `package.json` declares `private: true` and `version: "0.0.0"`.
- **Packages directory state.** `packages/core` has `package.json`, `tsconfig.json`, `src/`, and a pre-built `dist/` (vite root config builds `core` only). `packages/react` has `package.json`, `tsconfig.json`, `src/` — no `dist/` and not yet in root vite config. `packages/pivot` and `packages/worker` are empty placeholder dirs (M4/M5 milestones).
- **Existing naming.** `@tablekit/core` and `@tablekit/react` are in the package.json files already — preserved per handoff constraint.
- **Version.** `"0.0.0"` everywhere (root + both packages + the source-exported `VERSION` constant). Handoff raises to `0.1.0`.
- **License.** `LICENSE` at root is MIT with `Copyright (c) 2026 Ezell` — matches "Ezell" constraint.
- **Root README.** Two lines (`# table-kit\nAnother table library`). Severely inadequate for an npm listing.
- **Root `.gitignore`.** Already includes `dist/`, `node_modules/`, `*.tsbuildinfo`, `.pi-conductor/`. **Missing**: `.okf/`. Also useful additions: `.npmrc.local`, `pnpm-lock.yaml` is tracked (correct), nothing else obviously missing.
- **Per-package package.json minimum (currently):**
  - `core`: name, version, `private: true`, `type: module`, main/types→src/index.ts, no description, no license, no author, no repository, no keywords, no `files`, no `exports`, no `engines`.
  - `react`: same shape, plus a `peerDependencies: { react: ">=18.0.0" }` and devDeps for `@types/react` and `react`. `biome-ignore` comment in `index.ts` for the unused React import keeps the peer dep "consumed" — fine but should be removed when a real React hook ships.
- **Vite root config.** Builds only `packages/core` to `packages/core/dist` with a single ESM format (`tablekit-core.es.js`). No `packages/react` build. No `dist/` for react yet.
- **Tests.** Smoke tests in both packages (`VERSION` string regex) — they assert version `^\d+\.\d+\.\d+` so any 0.1.0 bump keeps them green.
- **Lefthook pre-push.** `typecheck`, `lint`, `test` already in `.okf/`. Build is not gated; publishing is not gated.

Assumptions (applied during planning — see open questions):

1. The `0.1.0` publish ships **build output** (`dist/`) rather than source. Rationale: the root vite config already builds `core` to `dist/`; `react` gets a parallel build entry. Source-only publishing (TanStack pattern) is simpler but bypasses the production surface and complicates the type-tests story. Build-then-publish is the conservative default for v0.1.0.
2. `LICENSE` copy stays at root with current "Ezell" copyright; per-package `LICENSE` is **not** duplicated (pnpm publish will discover the root via `license: "MIT"` in each package.json).
3. No Changesets/release-please adoption in this plan. Single 0.1.0 cut, manual bump for now. Revise after the first minor release.
4. No CI publish workflow. Publishing from a local machine is acceptable for v0.1.0.
5. `engines` field bumps the floor to `node >= 20.0.0` to match root and avoid surprising consumers with a different runtime than the dev toolchain.

Telemetry (this visit):
- `okf_docs_read`: 2 (`.okf/components/dev-tooling-stack.md`, `.okf/workflows/dev-tooling-bootstrap.md`)
- `files_scanned_before_okf`: 0
- `files_scanned_after_okf`: 18 (configs + package metadata + src stubs + spec excerpts)
- `stale_okf_hits`: 0
- `missing_okf_hits`: 0

---

## Objective

Make `@tablekit/core` and `@tablekit/react` publishable to npm at v0.1.0 with:

1. Accurate, complete metadata (description, repository, license, authors, keywords, engines, files whitelist, exports map, sideEffects).
2. Each package produces a vaild npm tarball via `pnpm pack --dry-run` that contains `dist/`, `README.md` excerpt, and a `LICENSE` reference.
3. A reproducible publish path: `pnpm verify` → `pnpm -F @tablekit/core build` (and `…react`) → `pnpm publish -F @tablekit/core --dry-run` → manual `npm login` → `pnpm publish -F @tablekit/core` → repeat for react.
4. A README that makes the package listable on npm without ambiguity (what it is, how to install, who's it for, status, license).

## Scope boundaries

**In scope:**
- `packages/core/package.json` and `packages/react/package.json` metadata edits.
- `packages/core/src/index.ts` and `packages/react/src/index.ts` `VERSION` constant bump.
- Root `.gitignore` addition (`.okf/`, `.npmrc.local`) and per-package build additions.
- Root `vite.config.ts` extension to also build `packages/react`.
- Root `README.md` rewrite — full publishable-quality content.
- Root `package.json` script additions (`build:core`, `build:react`, `pack:dry`, `release:core`, `release:react`).
- A `docs/prepare-for-npm/RELEASING.md` documenting the manual publish runbook (including `npm login`).

**Out of scope (will be a follow-up plan if needed):**
- Publishing `packages/pivot` / `packages/worker` (not implemented yet; spec M4/M5).
- Changesets or release-please automation.
- CI publish workflow (`.github/workflows/release.yml`).
- npm provenance / `npm publish --provenance` (only available with GitHub Actions + signed commits).
- Branch protection, CODEOWNERS, contribution docs.
- A website/docs site (`apps/docs`).

## Resolved constraints (from handoff)

| # | Constraint | Resolution |
|---|------------|------------|
| C1 | License "Ezell" | Root `LICENSE` already carries `Copyright (c) 2026 Ezell`. No edit. Reference it via `"license": "MIT"` in each package and do **not** bundle a per-package copy. |
| C2 | Publish only `core` + `react` | `pivot/` and `worker/` stay as empty placeholder dirs with `.gitkeep` (no package.json, no publish). |
| C3 | Keep existing names | `@tablekit/core`, `@tablekit/react` — preserved. |
| C4 | Start at 0.1.0 | Bump source `VERSION`, package.json `version`, and add a CHANGELOG note per package. No `0.0.x` patch in between. |
| C5 | `npm login` is manual | Documented in `docs/prepare-for-npm/RELEASING.md` and surfaced in the release script's console output. No automated `npm login --…` is performed. |

## Phases

Implementation is sliced top-down. Each phase ends with the repo green (`pnpm verify`) and one logical commit.

| # | Phase | File | What it produces |
|---|-------|------|------------------|
| 1 | Repository hygiene | `phase-1-repository-hygiene.md` | `.okf/`, `.npmrc.local` ignored; `.npmrc` keeps `link-workspace-packages=true`. |
| 2 | Per-package publish metadata | `phase-2-package-metadata.md` | Both `packages/*/package.json` are publish-ready, `VERSION` constants bumped to `0.1.0`. |
| 3 | Per-package build wiring | `phase-3-build-wiring.md` | Both `packages/core` and `packages/react` produce `dist/` via Vite. Root vite config cleaned up. |
| 4 | README & per-package docs | `phase-4-readme-and-docs.md` | Root README is publishable-quality; new `docs/prepare-for-npm/RELEASING.md` manual runbook; per-package `README.md` excerpts. |
| 5 | Publish scripts & dry-run verification | `phase-5-publish-scripts-and-dry-run.md` | Root `package.json` has build/pack/release scripts; `pnpm -F @tablekit/core pack --dry-run` green. |
| 6 | Initial cut — manual publish gate | `phase-6-initial-publish-gate.md` | Runbook executed by a human; tagged v0.1.0 in git; packages visible on npm. |

Sequencing rationale:
- Hygiene first so subsequent phases never accidentally commit `.okf/` or local npmrc scratch files.
- Metadata before build because the build phase needs to reference new fields (`files`, `exports`).
- Build before publish-scripts because the dry-run verification step needs a real `dist/`.
- README and docs in one phase — they're related but small enough to land together.
- Manual publish gate is the only phase the implementer does not fully automate; everything else is CI-runnable in principle.

## Critical risks

1. **Source vs dist publish mismatch.** If a consumer's bundler resolves `"main": "./src/index.ts"` (current config) they will see TS source. Per C-resolution this plan flips both packages to point at `dist/` after the build phase. Anyone using the package pre-publish via workspace alias will need to rebuild.
2. **React peer dep range.** Current `>= 18.0.0` is permissive; npm will render a peer-warning if a consumer is on 19.x. Acceptable for now — flip to `>= 19.0.0` only when we confirm contributors drop 18 support.
3. **`.npmrc` publishing config.** Workspace `.npmrc` has `link-workspace-packages=true` which is fine for dev but consumers reading the repo may be confused. Mitigation: add an explicit comment block in `.npmrc` separating dev-only flags from publish flags. Keep `//registry.npmjs.org/:_authToken` out of the file.
4. **Lockfile drift.** Changing per-package `version`/`name` semantics can re-resolve the lockfile. Run `pnpm install --lockfile-only` after metadata edits and commit the lockfile delta in the same change.
5. **`node_modules/` inside react package.** `packages/react/node_modules/` exists (leftover from a prior `pnpm install`). Currently not gitignored at per-package level — relies on root `.gitignore`. Verify with `git check-ignore packages/react/node_modules`.
6. **Lefthook pre-push does not run `build`.** A commit that updates package.json fields but breaks the build (e.g., bad `exports` key) won't be caught by the hook. Mitigation: phase 5 adds `build` to the lefthook pre-push pipeline.

## Acceptance criteria

The plan is complete when:

- `pnpm verify` (typecheck + lint + test + build) exits 0 from a fresh clone.
- `pnpm -F @tablekit/core pack --dry-run` produces a tarball whose manifest lists: `package.json`, `dist/`, `README.md`, `LICENSE` (resolved from root), `package.json` valid, no `src/`, no `node_modules/`, no `.okf/`.
- Same for `-F @tablekit/react`.
- Reading the published metadata as a stranger on npm, you can answer: *what is it?*, *how do I install it?*, *who maintains it?*, *what license?*, *is it production-ready?* without leaving the npm page.
- A `git tag v0.1.0` exists and points at a commit where both `packages/{core,react}/package.json` report `"version": "0.1.0"`.
- `docs/prepare-for-npm/RELEASING.md` documents the exact commands and the `npm login` step is called out as a manual prerequisite.

## Open concerns for the orchestrator

- **Source vs dist publish.** The plan defaults to dist publish. If the user prefers source-only (faster to push, no build step in tarball), phases 3 and 5 collapse. Decision is reversible until 0.1.0 actually ships.
- **`engines.pnpm` floor.** Root pins `pnpm@10.33.1`. Plans that propagate `packageManager` to per-package need `engines.pnpm` floors. The plan currently omits this; revisit if consumers start using pnpm < 10.
- **Public registry vs private.** Plan assumes the public registry (`registry.npmjs.org`). No `--registry` flag wired. If the consumer is on an internal registry, the release runbook must be updated before publish.
- **License name in metadata.** `"license": "MIT"` is the SPDX short string, which is what npm expects. If the user wants the SPDX long form or a custom file, the field is `"licenses": [...]` (deprecated) or `"license"` + `"licenseFile"`. Sticking with SPDX short.

## Knowledge candidates

None surfaced in this visit beyond the dev-tooling-stack OKF doc, which is already current and accurate. The dev-tooling-stack doc will need one update after Phase 3 — the build pipeline description gains a second entry for `@tablekit/react`. That update belongs to `okf-curator`, not this plan.

## Verification

Run from a fresh checkout:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm -F @tablekit/core pack --dry-run
pnpm -F @tablekit/react pack --dry-run
```

Expected outputs: verify green, two tarballs listed containing only `dist/`, `README.md`, `LICENSE`, `package.json`.
