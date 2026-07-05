# Phase 4 — README and Documentation

**Slug:** `prepare-for-npm`
**Phase:** 4 of 6
**Status:** Complete

## What was done

### Root `README.md` rewrite

The root README was a two-line stub. It is now a proper monorepo landing page that:

- Names the project and gives a one-line description
- Documents both packages with links to their subdirectories
- Provides install commands for both packages
- References the spec at `docs/initial-spec.md`
- Points bugs/issues links to `https://github.com/lynellf/tablekit/issues`
- Lists the MIT license

### Per-package `README.md` files

Both `packages/core/README.md` and `packages/react/README.md` were created as standalone npm-quality excerpts:

**`packages/core/README.md`**
- Package name and one-line description
- Install command
- Quick-start code snippet
- Status (v0.1.0, early stage)
- Bugs/issues link pointing to `https://github.com/lynellf/tablekit/issues`

**`packages/react/README.md`**
- Same structure as core, plus React-specific usage example
- Peer dependency note (React ≥ 18)
- Cross-links to `@tablekit/core` on npm and the spec

Both files reference `../../LICENSE` as the MIT license path. npm resolves this to the root `LICENSE` file when publishing.

### `docs/prepare-for-npm/RELEASING.md`

A complete manual publish runbook was created covering:

1. **Prerequisites** — `npm login`, Node ≥ 20, pnpm ≥ 10, clean working tree
2. **Pre-publish checklist** — `pnpm verify`, `pnpm pack --dry-run` for both packages
3. **Publishing** — core first, then react (with `--access public`)
4. **Git tagging** — `git tag v0.1.0 && git push origin v0.1.0`
5. **Post-publish verification** — confirm on npmjs.com, tarball smoke test
6. **Troubleshooting table** — E403, E409, dist/ missing, peer dep warnings
7. **Future automation** — Changesets, GitHub Actions workflow, npm provenance

The `npm login` step is explicitly documented as manual (no automation).

## Constraints verified

- All bugs/issues links point to `https://github.com/lynellf/tablekit`
- No email or personal contact info in any README

## Files changed

- `README.md` — rewritten
- `packages/core/README.md` — created
- `packages/react/README.md` — created
- `docs/prepare-for-npm/RELEASING.md` — created
