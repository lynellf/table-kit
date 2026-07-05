# Phase 1 — Repository Hygiene

**Slug:** `prepare-for-npm`
**Phase:** 1 of 6
**Status:** Complete

## What was done

### `.gitignore` additions

| Entry | Reason |
|---|---|
| `.okf/` | Agent memory and plan docs; must never be committed |
| `.npmrc.local` | Local npm config overrides (never commit tokens) |
| `packages/core/dist/` | Explicitly un-ignores the per-package build output so it can be tracked after `pnpm build` |
| `packages/react/dist/` | Same as above |

Note: `dist/` at the root was already gitignored (and remains so). The per-package entries override that at the more-specific path.

### `.npmrc` comment block

A header comment was prepended to `.npmrc` that:
- Documents which flags are dev-only (and not read during `npm publish`)
- Explicitly prohibits adding `//registry.npmjs.org/:_authToken` to this file
- Points consumers to `~/.npmrc` or a CI secret manager for tokens

Existing dev flags (`link-workspace-packages`, `prefer-workspace-packages`, etc.) are preserved as-is.

## Verification

```bash
git status .gitignore .npmrc
# Expected: modified
grep "\.okf" .gitignore   # → .okf/
grep "npmrc.local" .gitignore  # → .npmrc.local
grep "registry" .npmrc     # → no authToken line
```

## Files changed

- `.gitignore` — added `.okf/`, `.npmrc.local`, `packages/core/dist/`, `packages/react/dist/`
- `.npmrc` — added documentation comment block
