# Phase 5 — Publish Scripts and Dry-Run Verification

**Slug:** `prepare-for-npm`
**Phase:** 5 of 6
**Status:** Complete

## What was done

### Root `package.json` publish scripts

Added the following convenience scripts to the root `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `build:core` | `pnpm -F @tablekit/core build` | Build core only |
| `build:react` | `pnpm -F @tablekit/react build` | Build react only |
| `pack:core` | `build + pack --dry-run` for core | Smoke-test core tarball |
| `pack:react` | `build + pack --dry-run` for react | Smoke-test react tarball |
| `release:core` | `build:core + publish --access public` | Publish core (manual step) |
| `release:react` | `build:react + publish --access public` | Publish react (manual step) |

These scripts simplify the RELEASING.md runbook commands without hiding the `npm login` prerequisite.

### Lefthook pre-push pipeline

Added `build` to the lefthook `pre-push` pipeline (in `lefthook.yml`):

```
pre-push → build → typecheck → lint → test
```

This ensures that any commit that touches `package.json`, `vite.config.ts`, or `tsconfig*.json` fails pre-push if the build is broken — preventing a broken `dist/` from reaching remote.

### Dry-run verification

Both packages were verified with `pnpm pack --dry-run` and a full tarball inspection:

**`@tablekit/core@0.1.0` tarball contents:**
```
dist/tablekit-core.es.js
dist/tablekit-core.es.js.map
package.json
README.md
LICENSE   ← resolved from root by npm
```

**`@tablekit/react@0.1.0` tarball contents:**
```
dist/tablekit-react.es.js
dist/tablekit-react.es.js.map
package.json
README.md
LICENSE   ← resolved from root by npm
```

No `src/`, no `node_modules/`, no `.okf/`, no leftover build artifacts.

## Verification

```bash
pnpm -F @tablekit/core pack --dry-run
pnpm -F @tablekit/react pack --dry-run
# Both: package.json + README.md + dist/ + LICENSE confirmed

pnpm verify
# Expected: typecheck ✓, lint ✓, test ✓, build ✓
```

## Files changed

- `package.json` — added `build:core`, `build:react`, `pack:core`, `pack:react`, `release:core`, `release:react`
- `lefthook.yml` — added `build` to `pre-push` pipeline
