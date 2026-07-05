# Dev Tooling Bootstrap — Plan Overview

**Status:** Draft for plan-reviewer-a
**Target repo:** `table-kit` (root: `/Users/ezellfrazier/Documents/GitHub/table-kit`)
**Spec reference:** [`initial-spec.md`](../../initial-spec.md) §3 (package architecture), §13 (testing strategy), §14 (milestones)
**Scope:** M0-only — stand up the dev tooling stack before any library code lands.

---

## 1. Goal

Implement the explicit tooling requests from the user:

- pnpm (package manager + workspaces)
- Vite (library / dev server build tool)
- Vitest (unit + integration test runner)
- TypeScript (strict, modern)
- Biome (lint + format — replaces ESLint+Prettier)
- lefthook with a **pre-push** git hook running `typecheck`, `lint`, and `vitest`

No runtime library code is written in this plan. The output of this plan is a
green toolchain that subsequent milestones (M0 → M6 in §14 of the spec) plug
into without further config rework.

---

## 2. What I found (investigation notes)

### 2.1 Repository state

The repo currently contains only:

| Path               | State                                              |
| ------------------ | -------------------------------------------------- |
| `initial-spec.md`  | Spec, untracked (53 KB). Source of truth for M0+.  |
| `LICENSE`          | MIT, copyright 2026 Ezell.                         |
| `README.md`        | Placeholder ("Another table library").             |
| `.gitattributes`   | Default GitHub text auto-detection + LF.           |
| `.gitignore`       | Default Node.js template (no project customization). |
| `.pi-conductor/`   | Run memory for the orchestrator — not part of repo. |

No `package.json`, no `tsconfig.json`, no lockfile, no node_modules. Single
commit `2440227 Initial commit` on `main`. Working tree dirty with
`.gitignore` and `initial-spec.md` modified/untracked.

### 2.2 Local tooling

- `pnpm 10.33.1` ✓ installed globally
- `node v25.8.0` ✓ installed
- `lefthook` ✗ not installed (will be added as a local devDependency)

`.okf/` directory does not exist yet — no prior OKF docs to read. This is the
first run.

### 2.3 Spec implications for toolchain design

The spec describes four future packages (`@tablekit/core`, `@tablekit/pivot`,
`@tablekit/worker`, `@tablekit/react`) with explicit dependency direction
(`react → (core, pivot, worker)`; `pivot → core`; `worker → pivot`). This
**mandates a pnpm-workspace monorepo from day one** — retrofitting later
breaks import paths and TS project references. The M0 milestone only ships
`core` (state engine) and the `react` adapter shell, but the workspace
scaffolding for all four is set up now.

---

## 3. Decisions made (and rationale)

| # | Decision                                       | Rationale                                                                                 |
| - | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 | **pnpm workspaces monorepo** from day one      | Spec mandates 4-package architecture; migration later is expensive.                       |
| 2 | **Local `lefthook` install** (devDependency)   | Self-contained, versioned per repo, works in CI without global install.                   |
| 3 | **Vite library mode** at root (`vite.config.ts`) | Spec is a library; Vite gives ESM + dev server + tree-shake. Per-package Vite configs later as needed. |
| 4 | **Biome replaces ESLint + Prettier**            | User explicitly asked for Biome; faster, single binary, zero plugin sprawl.               |
| 5 | **TypeScript strict + bundler resolution**     | Standard for libraries; aligns with `moduleResolution: "bundler"` for Vite.              |
| 6 | **Vitest at root, workspace projects**         | Single test runner for the whole monorepo; per-package projects via `vitest.workspace.ts`. |
| 7 | **Initial packages stubbed: `core`, `react`**   | M0 only needs these (§14); `pivot`, `worker` directories created but empty for now.       |
| 8 | **Node engine pinned via `.nvmrc` + `package.json` `engines`** | Spec implies modern stack; `25.x` is current; pnpm 10 requires Node ≥ 18.12. |
| 9 | **`packageManager` field set to `pnpm@10.33.1`** | Corepack/pnpm enforce version; prevents drift.                                            |

---

## 4. File inventory

### 4.1 New files (created in this plan)

```
package.json                              # root manifest, workspaces
pnpm-workspace.yaml                       # workspace glob
.npmrc                                    # pnpm config (hoisting, strict-peer-deps)
.nvmrc                                    # Node version pin
.gitignore                                # REPLACED with curated ignore (kept Node defaults + pnpm + test artifacts)
lefthook.yml                              # git hooks config
biome.json                                # lint + format config
tsconfig.base.json                        # shared strict TS config
tsconfig.json                             # root tsconfig (project references)
vitest.workspace.ts                      # vitest projects config
vite.config.ts                            # root vite config (library mode)
vitest.config.ts                          # root vitest config (delegates to workspace)

packages/core/package.json                # @tablekit/core stub
packages/core/tsconfig.json               # extends base
packages/core/vitest.config.ts            # package-local vitest project
packages/core/src/index.ts                # stub export
packages/core/src/index.test.ts           # smoke test for vitest pipeline

packages/react/package.json               # @tablekit/react stub
packages/react/tsconfig.json              # extends base
packages/react/src/index.ts               # stub export
```

### 4.2 Files NOT created in this plan (out of scope)

- `packages/pivot/**`, `packages/worker/**` — empty directories reserved; packages created in their respective milestones.
- CI workflows (`.github/workflows/**`) — explicitly out of scope per acceptance criteria.
- Example app (`examples/**`) — not requested; can be added in a later plan.
- README content beyond a minimal M0 status line — spec/repo docs come later.
- Runtime library code — out of scope (this plan is tooling only).

---

## 5. Sequencing overview

The phases are ordered so each step depends only on artifacts from earlier
phases. Each phase is independently verifiable.

| # | Phase                          | Output                              | Verifies                                    |
| - | ------------------------------ | ----------------------------------- | ------------------------------------------- |
| 1 | Monorepo bootstrap             | `pnpm-workspace.yaml`, root `package.json`, `.npmrc`, `.nvmrc` | `pnpm install` resolves                     |
| 2 | TypeScript                     | `tsconfig.base.json`, root + per-pkg `tsconfig.json` | `pnpm typecheck` passes                     |
| 3 | Biome                          | `biome.json`, npm scripts           | `pnpm lint` passes on stub files            |
| 4 | Vitest                         | `vitest.workspace.ts`, smoke test    | `pnpm test` runs and passes                 |
| 5 | Vite                           | `vite.config.ts` (library mode)     | `pnpm build` emits ESM                      |
| 6 | lefthook                       | `lefthook.yml` with pre-push hook   | `pnpm exec lefthook run pre-push` runs all 3 |
| 7 | Final end-to-end verification  | `pnpm verify` aggregates all        | All 4 gates green from clean clone          |

Full file content + exact commands live in the per-phase docs.

---

## 6. Constraints / non-goals

- **No runtime library code** — this plan touches config files only.
- **No CI/CD changes** — lefthook runs locally; GitHub Actions / Vercel / etc. come later.
- **No breaking changes to existing files** — `LICENSE` and `README.md` untouched; `.gitignore` is *replaced* (not modified in-place) with a curated superset of the current Node template.
- **No new global installs required** — pnpm and Node already present; lefthook installs locally via pnpm.
- **No demo app** — Vite is configured in library mode; an `examples/` app is a separate plan.
- **Package manager choice is final** — switching away from pnpm later requires re-bootstrapping; this is locked in by `packageManager` and `pnpm-workspace.yaml`.

---

## 7. Risks and open questions

| Risk / Question                                                                                   | Disposition                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **lefthook installation: local vs global**                                                         | **Resolved as local** (devDependency). Standard practice; works in CI. Documented in phase 6.                                       |
| **Monorepo vs single package**                                                                     | **Resolved as monorepo** (pnpm workspaces). Required by spec §3. Documented in phase 1.                                              |
| **`pivot` and `worker` packages not yet created — will this break later?**                        | **Resolved**: phase 1 reserves empty `packages/pivot/` and `packages/worker/` directories with a `.gitkeep` so workspace glob picks them up harmlessly until filled. |
| **Vite version compatibility with pnpm 10 / Node 25**                                             | **Open** — phase 5 will pin to the latest stable Vite (≥ 5) at install time. If incompatible, fall back to `rolldown-vite` (Vite's Rolldown rewrite). |
| **Biome schema version drift**                                                                    | **Open** — phase 3 will pin to the latest stable Biome (≥ 1.8) and use schema `$schema` URL for editor IntelliSense.                |
| **lefthook pre-push vs pre-commit?**                                                              | **Resolved as pre-push** — user explicitly requested pre-push. Keeps slow checks (full test suite) off the commit path.              |
| **`pnpm` `peerDependencyRules` / `onlyBuiltDependencies`** for native modules                     | **Open** — flag in phase 1 if Vite/Vitest install prints native-build warnings; add overrides then.                                  |
| **Node 25 vs LTS (22)**                                                                           | **Resolved**: pin to Node 25 in `.nvmrc` because that's what's installed locally; update to LTS later if release pipeline requires.   |
| **Vitest in-process vs Node worker for Web Worker tests** (`@tablekit/worker` future)             | **Deferred** — not needed for M0; revisit when M5 lands.                                                                              |
| **`exports` field in package.json** (subpath exports for library consumers)                       | **Deferred** — M0 packages only export `./src/index.ts`; add proper `exports` map in a later phase once API surface stabilizes.       |

---

## 8. Verification plan (final acceptance)

After all phases complete, a clean clone must pass:

```bash
git clone <repo> && cd table-kit
corepack enable                       # if packageManager field is honored
pnpm install
pnpm verify                           # runs typecheck + lint + test + build
pnpm exec lefthook run pre-push       # exercises the hook manually
```

`pnpm verify` is the aggregate script defined in phase 7. All four sub-gates
must pass with exit code 0.

---

## 9. Phase index

1. [`phase-1-monorepo-bootstrap.md`](./phase-1-monorepo-bootstrap.md) — pnpm workspaces + root files
2. [`phase-2-typescript.md`](./phase-2-typescript.md) — TypeScript base + per-package configs
3. [`phase-3-biome.md`](./phase-3-biome.md) — Biome lint + format
4. [`phase-4-vitest.md`](./phase-4-vitest.md) — Vitest workspace + smoke test
5. [`phase-5-vite.md`](./phase-5-vite.md) — Vite library mode build
6. [`phase-6-lefthook.md`](./phase-6-lefthook.md) — Pre-push git hook
7. [`phase-7-verification.md`](./phase-7-verification.md) — End-to-end verification + `pnpm verify`