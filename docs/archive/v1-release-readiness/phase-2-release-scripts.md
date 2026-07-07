# Phase 2 — Root Release Scripts

**Slug:** `v1-release-readiness`
**Phase:** 2 of 5
**Status:** Draft

## Goal

Add the four missing release-related scripts to the root `package.json` so that the `docs/release-process.md` runbook executes end-to-end for all four published packages.

## Background

The current root `package.json` already has symmetric `build:<pkg>`, `pack:<pkg>`, and `release:<pkg>` scripts for `core` and `react`:

```json
"build:core": "pnpm -F @lynellf/tablekit-core build",
"build:react": "pnpm -F @lynellf/tablekit-react build",
"pack:core": "pnpm -F @lynellf/tablekit-core build && pnpm -F @lynellf/tablekit-core pack --dry-run",
"pack:react": "pnpm -F @lynellf/tablekit-react build && pnpm -F @lynellf/tablekit-react pack --dry-run",
"release:core": "pnpm build:core && pnpm -F @lynellf/tablekit-core publish --access public",
"release:react": "pnpm build:react && pnpm -F @lynellf/tablekit-react publish --access public"
```

The corresponding `build:pivot` and `build:worker` already exist (added during the M4/M5 work). The missing scripts are `pack:pivot`, `pack:worker`, `release:pivot`, `release:worker`.

## What to change

Edit `package.json` to add four new entries, placed adjacent to their `core`/`react` siblings for symmetry:

```json
"pack:pivot": "pnpm -F @lynellf/tablekit-pivot build && pnpm -F @lynellf/tablekit-pivot pack --dry-run",
"pack:worker": "pnpm -F @lynellf/tablekit-worker build && pnpm -F @lynellf/tablekit-worker pack --dry-run",
"release:pivot": "pnpm build:pivot && pnpm -F @lynellf/tablekit-pivot publish --access public",
"release:worker": "pnpm build:worker && pnpm -F @lynellf/tablekit-worker publish --access public"
```

The exact placement in the scripts block is not material — keeping the existing alphabetical-ish grouping (`pack:*` together, `release:*` together) is enough.

## Files to edit

- `package.json` — add four scripts.

## Verification

```bash
# 1. The four scripts exist
node -e "const p = require('./package.json'); ['pack:pivot','pack:worker','release:pivot','release:worker'].forEach(k => console.log(k, p.scripts[k]))"

# 2. Existing scripts are unchanged (regression guard)
node -e "const p = require('./package.json'); ['pack:core','pack:react','release:core','release:react'].forEach(k => console.log(k, p.scripts[k]))"

# 3. Build still succeeds for the four packages
pnpm verify

# 4. Pack dry-run succeeds for pivot and worker
pnpm pack:pivot
pnpm pack:worker
```

Expected: all four new scripts resolve; the existing `pack:core` / `pack:react` strings are byte-identical to before; `pnpm verify` exits 0; `pnpm pack:pivot` / `pnpm pack:worker` exit 0 and list `package.json`, `dist/`, `README.md` (no `src/`, no `node_modules/`).

## Out of scope for this phase

- `release:*` scripts are not actually executed against the npm registry (no `npm publish` happens during the plan).
- The pivot and worker packages may have additional subpath `dist/` files that should also land in the tarball — the existing `release:core` / `release:react` shape does not invoke `build:<pkg>:subpaths`, and this plan keeps symmetry. A separate follow-up can address subpath builds for all four packages.