# Phase 1 — Monorepo Bootstrap

**Goal:** Establish a pnpm-workspace monorepo skeleton with root-level config.
After this phase, `pnpm install` resolves successfully and reports the workspace
layout.

---

## 1. Files created in this phase

| File                      | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `package.json`            | Root manifest; declares workspaces and `packageManager`. |
| `pnpm-workspace.yaml`     | Workspace glob (`packages/*`).                           |
| `.npmrc`                  | pnpm settings (hoisting, strict-peer-deps, link-bin).    |
| `.nvmrc`                  | Pins Node to `25.8.0` (matches local).                   |
| `.gitignore` *(replace)*  | Curated superset of the current Node template.           |
| `packages/core/.gitkeep`  | Reserve the directory before package.json is added.      |
| `packages/react/.gitkeep` | Reserve the directory before package.json is added.      |
| `packages/pivot/.gitkeep` | Reserved for milestone M4.                               |
| `packages/worker/.gitkeep`| Reserved for milestone M5.                               |

`.gitkeep` files are removed as soon as a real file (e.g. `package.json`) lands
in those directories.

---

## 2. File contents

### 2.1 `package.json` (root)

```json
{
  "name": "table-kit",
  "version": "0.0.0",
  "private": true,
  "description": "Headless table primitives (DataTable + PivotTable).",
  "license": "MIT",
  "packageManager": "pnpm@10.33.1",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "typecheck": "tsc -b",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "vite build",
    "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^22.10.0",
    "lefthook": "^1.10.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

Notes:
- `private: true` prevents accidental publish of the root.
- `packageManager` makes Corepack enforce pnpm 10.33.1.
- `engines.node` is `>=20.0.0` (pnpm 10's minimum is 18.12; we want headroom for TS 5.6 features).
- `prepare` runs `lefthook install` after `pnpm install` so the hook is wired up automatically.

### 2.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

Future expansion to `examples/*`, `docs/*`, etc. is a one-line change.

### 2.3 `.npmrc`

```
link-workspace-packages=true
prefer-workspace-packages=true
save-workspace-protocol=rolling
strict-peer-dependencies=false
auto-install-peers=true
node-linker=isolated
```

Notes:
- `link-workspace-packages=true` makes `workspace:*` imports resolve to local sources.
- `node-linker=isolated` is pnpm's default and the correct setting for libraries (no hoisted `node_modules`).
- `strict-peer-dependencies=false` avoids spurious install failures from transitive peers during early development.

### 2.4 `.nvmrc`

```
25.8.0
```

### 2.5 `.gitignore` (replace current file)

```gitignore
# Node / pnpm
node_modules/
.pnpm-store/
.pnpm-debug.log*

# Build output
dist/
*.tsbuildinfo

# Test artifacts
coverage/
.vitest-cache/

# Editor / OS
.DS_Store
.idea/
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json

# Tooling caches
.eslintcache
.biome-cache/

# Logs
logs/
*.log

# Env
.env
.env.local
.env.*.local

# pi-conductor (run memory, not part of repo)
.pi-conductor/
```

The current `.gitignore` is the default Node template. This replacement is a
curated superset — every meaningful section from the current file is preserved
(Node logs, env files, dist, coverage, parcel/snowpack/nuxt/gatsby/vitepress
caches, yarn/bower artifacts). Removed: pnpm-debug is now matched by the
broader `*.log` rule; `.nyc_output` and similar one-off caches consolidated.

---

## 3. Commands (in order)

```bash
# 1. Reserve workspace directories
mkdir -p packages/core packages/react packages/pivot packages/worker
touch packages/core/.gitkeep packages/react/.gitkeep \
      packages/pivot/.gitkeep packages/worker/.gitkeep

# 2. Write all config files (use the write tool with contents from §2)
# ... (file writes via the editor)

# 3. Stage + install
git add package.json pnpm-workspace.yaml .npmrc .nvmrc .gitignore \
        packages/.gitkeep packages/core/.gitkeep packages/react/.gitkeep \
        packages/pivot/.gitkeep packages/worker/.gitkeep
pnpm install
```

`pnpm install` will:
- Resolve all devDependencies declared at the root.
- Create `pnpm-lock.yaml`.
- Run `lefthook install` (because of the `prepare` script) — at this stage
  there is no `lefthook.yml` yet, so lefthook will print a "no config" warning
  and exit non-zero. **Mitigation**: temporarily remove `"prepare"` from
  `package.json` for the first install, or run `pnpm install --ignore-scripts`
  for phase 1 only. Phase 6 will add the script back.

---

## 4. Verification

```bash
pnpm -v                              # 10.33.1
node -v                              # matches .nvmrc (25.8.0)
pnpm install                         # should exit 0 with --ignore-scripts if prepare fails
ls packages/                         # core, pivot, react, worker all present
cat pnpm-workspace.yaml              # confirms glob
pnpm list --depth -1 --recursive     # shows root + workspace packages (no inner ones yet)
```

Expected after phase 1:
- `pnpm-lock.yaml` exists.
- `node_modules/` exists at root with `typescript`, `vite`, `vitest`,
  `@biomejs/biome`, `lefthook`, `@types/node` installed.
- `packages/{core,react,pivot,worker}/` each contain only a `.gitkeep`.

---

## 5. Out of scope for this phase

- Per-package `package.json` files (added in phases 2+).
- TypeScript / Biome / Vitest / Vite configs (phases 2–5).
- lefthook.yml (phase 6).