# Phase 3 — Per-Package Build Wiring

**Slug:** `prepare-for-npm`
**Phase:** 3 of 6
**Status:** Complete

## What was done

### Package-level `vite.config.ts` files

Two new per-package config files were created:

**`packages/core/vite.config.ts`**
- Entry: `packages/core/src/index.ts`
- Output: `packages/core/dist/tablekit-core.es.js`
- Target: ES2022, sourcemaps enabled, CSS code-splitting disabled

**`packages/react/vite.config.ts`**
- Entry: `packages/react/src/index.ts`
- Output: `packages/react/dist/tablekit-react.es.js`
- Target: ES2022, sourcemaps enabled, CSS code-splitting disabled

Both configs mark workspace dependencies as `external` so the bundled output does not re-bundle peer/runtime deps (e.g. React in the react package).

### Root `vite.config.ts`

Replaced the old single-entry core-only config with a minimal placeholder:

```ts
// Root vite config is unused — per-package builds handle production builds.
export default {};
```

This keeps IDE integrations happy (Vite plugin resolution works from the repo root) without contributing broken multi-package config.

### Root `package.json` build script

Updated from:
```json
"build": "vite build"
```
To:
```json
"build": "pnpm -F @tablekit/core build && pnpm -F @tablekit/react build"
```

This delegates to per-package `build` scripts, which each run `vite build` using their own package-local config.

### Per-package `build` scripts

Both `packages/core/package.json` and `packages/react/package.json` gained a `build` script:
```json
"build": "vite build"
```
`vite build` resolves the nearest `vite.config.ts` (the package-local one) automatically.

## Build outputs

```
packages/core/dist/tablekit-core.es.js     (~0.09 kB, stub)
packages/react/dist/tablekit-react.es.js  (~55.86 kB, includes React)
```

Both output directories are explicitly un-ignored in `.gitignore` (Phase 1) so they can be committed or regenerated.

## Verification

```bash
pnpm build
# Expected: two "✓ built in Nms" lines, one per package
```

## Files changed

- `packages/core/vite.config.ts` — created
- `packages/react/vite.config.ts` — created
- `vite.config.ts` — replaced with placeholder
- `package.json` — updated `build` script
- `packages/core/package.json` — added `scripts.build`
- `packages/react/package.json` — added `scripts.build`
