# Phase 3 — Per-Package READMEs

**Slug:** `v1-release-readiness`
**Phase:** 3 of 5
**Status:** Draft

## Goal

Make every per-package `README.md` accurate at v1.0.0 — correct status text, correct public-API names, no broken relative in-repo paths, cross-links to sibling packages — and create the two missing READMEs for `pivot` and `worker`.

## Background

Each published package ships its own `README.md` (npm renders it on the package page). The current state:

- `packages/core/README.md` — exists but is stale (says `v0.1.0 — early stage`) and references `./docs/initial-spec.md` (a relative path that does not resolve inside the published tarball).
- `packages/react/README.md` — exists, stale on version, broken spec link, and uses `useTable` in the example (the actual hook is `useDataTable`).
- `packages/pivot/README.md` — does not exist.
- `packages/worker/README.md` — does not exist.

The tarball per `pack --dry-run` (per Phase 2 verification) contains `package.json`, `README.md`, `LICENSE` (resolved from root via `pnpm publish`), and `dist/`. Any path inside the README that points at another in-repo file is broken once published.

## What to change

### `packages/core/README.md`

Rewrite to:

- Status: `v1.0.0 — stable. The public API is frozen. See the consolidated v1.0 contract: https://github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md` (use the GitHub blob URL — external links are valid because they do not need to resolve inside the tarball).
- Quick-start example uses `createDataTable` (correct name from api-freeze §4).
- Add a "Related packages" section linking to `@lynellf/tablekit-react`, `@lynellf/tablekit-pivot`, `@lynellf/tablekit-worker` via their npmjs.com pages.
- Drop the `./docs/initial-spec.md` reference.

### `packages/react/README.md`

Rewrite to:

- Status: `v1.0.0 — stable. The public API is frozen.` with a link to the api-freeze doc.
- Quick-start example uses `useDataTable` (correct name from api-freeze §4). Include the proper peer-dependency note (`react >= 18`, `@lynellf/tablekit-core` is required).
- Add a "Related packages" section listing core (required peer dep), pivot (optional peer dep), worker (used via `createWorkerEngine` re-exported from react per api-freeze §4).
- Drop the `./docs/initial-spec.md` reference.

### `packages/pivot/README.md` (new)

Structure:

- One-line description (mirroring `packages/pivot/package.json` description).
- Install: `npm install @lynellf/tablekit-core @lynellf/tablekit-pivot`.
- Quick-start example using `createPivotTable` + `sumAggregator` (built-in), pointing at the api-freeze for the full surface.
- Required peer dep: `@lynellf/tablekit-core`.
- Status: `v1.0.0 — stable`.
- "Related packages" cross-link to core, react (re-exports some pivot hooks), worker (worker engine consumes pivot config).
- Bugs link + MIT license.

### `packages/worker/README.md` (new)

Structure:

- One-line description (mirroring `packages/worker/package.json` description).
- Install: `npm install @lynellf/tablekit-pivot @lynellf/tablekit-worker`.
- Quick-start example using `createWorkerEngine({ createWorker })` plus a brief worker-entry snippet using `createWorkerEntry()`. Mention `createServerEngine` from `/server` subpath.
- Required peer dep: `@lynellf/tablekit-pivot`.
- Status: `v1.0.0 — stable`.
- "Related packages" cross-link to core, pivot, react.
- Bugs link + MIT license.

## Files to edit / create

- `packages/core/README.md` — edit (rewrite).
- `packages/react/README.md` — edit (rewrite).
- `packages/pivot/README.md` — create.
- `packages/worker/README.md` — create.

## Verification

```bash
# 1. Every README exists and is non-empty
for pkg in core react pivot worker; do
  test -s "packages/$pkg/README.md" || echo "MISSING: packages/$pkg/README.md"
done

# 2. No README references the in-repo spec (broken in published tarball)
for pkg in core react pivot worker; do
  if grep -q '\./docs/\|\.\./\.\./docs\|/docs/initial-spec' "packages/$pkg/README.md"; then
    echo "BROKEN PATH IN: packages/$pkg/README.md"
  fi
done
# Expected: no output.

# 3. READMEs report the same version as the package.json
for pkg in core react pivot worker; do
  v=$(node -p "require('./packages/$pkg/package.json').version")
  if ! grep -q "$v" "packages/$pkg/README.md"; then
    echo "VERSION MISMATCH: $pkg ($v)"
  fi
done
# Expected: no output.

# 4. React README uses useDataTable (not useTable)
grep -q 'useDataTable' packages/react/README.md || echo "REACT README MISSING useDataTable"

# 5. Pivot README mentions createPivotTable
grep -q 'createPivotTable' packages/pivot/README.md || echo "PIVOT README MISSING createPivotTable"

# 6. Worker README mentions createWorkerEngine
grep -q 'createWorkerEngine' packages/worker/README.md || echo "WORKER README MISSING createWorkerEngine"
```

## Out of scope for this phase

- Per-package API reference (TypeDoc output) — not a README concern.
- Example apps per package — the four reference apps already live at `examples/m{3,5}-*/` per the milestone plans.