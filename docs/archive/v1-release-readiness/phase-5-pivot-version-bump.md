# Phase 5 — Pivot Runtime `VERSION` Constant Bump

**Slug:** `v1-release-readiness`
**Phase:** 5 of 5
**Status:** Draft

## Goal

Make `import { VERSION } from '@lynellf/tablekit-pivot'` report `1.0.0` to match `packages/pivot/package.json` `version: "1.0.0"` and the other three packages' runtime `VERSION` constants.

## Background

Each published package re-exports a `VERSION` string constant from its `src/index.ts`:

- `@lynellf/tablekit-core` — exports `VERSION` matching `1.0.0` (per `packages/core/package.json`).
- `@lynellf/tablekit-react` — exports `VERSION` matching `1.0.0` (per `packages/react/package.json`).
- `@lynellf/tablekit-pivot` — **exports `VERSION = '0.1.0' as const`** (out of sync).
- `@lynellf/tablekit-worker` — exports `VERSION` from `./version` (matches `1.0.0` per `packages/worker/src/version.ts`).

The pivot src file's leading doc comment reads:

> `@lynellf/tablekit-pivot — framework-free PivotTable primitives. M4 phase 1 surface (types only — implementations land in phases 2-6)`

This doc comment is itself a historical artifact from the M4 phase 1 plan; the package is now at the M6 closeout. The phase 5 plan keeps the doc comment update minimal (one line) and focuses the substantive edit on the `VERSION` constant.

## What to change

Edit `packages/pivot/src/index.ts`:

1. Change `export const VERSION = '0.1.0' as const;` → `export const VERSION = '1.0.0' as const;`.
2. Update the leading doc comment to remove the stale "M4 phase 1 surface (types only)" text. Replace with a single line: `/** @lynellf/tablekit-pivot — framework-free PivotTable primitives. v1.0.0 stable surface; see the consolidated api-freeze for the contract. */`.

No other file in the repo needs the bump.

## Files to edit

- `packages/pivot/src/index.ts`

## Verification

```bash
# 1. The version constant changed
grep -q "export const VERSION = '1.0.0'" packages/pivot/src/index.ts

# 2. The build still succeeds and the runtime constant matches the package.json
pnpm build:pivot
node -e "import('./packages/pivot/dist/tablekit-pivot.es.js').then(m => console.log(m.VERSION))"
# Expected: 1.0.0

# 3. The package.json version is still 1.0.0 (regression guard)
node -p "require('./packages/pivot/package.json').version"
# Expected: 1.0.0

# 4. Subpath build also includes the corrected constant
pnpm build:pivot:subpaths
grep -r "VERSION" packages/pivot/dist/ | head -3
# Expected: literal "1.0.0" appears in the built subpath bundles.

# 5. Type check passes
pnpm typecheck

# 6. The pivot test suite still passes (no VERSION test today, but the suite must remain green)
pnpm --filter @lynellf/tablekit-pivot test
```

## Out of scope for this phase

- Adding a `VERSION` smoke test to `packages/pivot/src/__tests__/`. The other two packages have it (e.g., `packages/core/src/index.test.ts` checks `VERSION` against a `^\d+\.\d+\.\d+` regex). Adding one for pivot is a small improvement but not strictly required for release readiness. Flagged as a follow-up.
- Bumping the pivot package's `version` field — it is already `1.0.0`. The only mismatch is the runtime constant.
- Rewriting the pivot `src/index.ts` doc comment beyond the minimum needed to remove the stale phase reference.