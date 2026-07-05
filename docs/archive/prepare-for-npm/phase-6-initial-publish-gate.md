# Phase 6 — Initial Publish Gate

**Slug:** `prepare-for-npm`
**Phase:** 6 of 6
**Status:** Awaiting human execution

## What is this phase

This is the only phase that requires a human. All automation is complete. The human step is to:

1. Log in to npm
2. Run the publish commands
3. Tag the git release
4. Verify on npmjs.com

## Complete runbook

See [`docs/prepare-for-npm/RELEASING.md`](./RELEASING.md) for the full step-by-step.

## Automation summary

Everything before the human step is now automated and verified:

| Gate | Status |
|---|---|
| `pnpm verify` (typecheck + lint + test + build) | ✅ Green |
| `pnpm pack --dry-run` for `@tablekit/core` | ✅ Green — dist/ + README.md + LICENSE |
| `pnpm pack --dry-run` for `@tablekit/react` | ✅ Green — dist/ + README.md + LICENSE |
| `.gitignore` includes `.okf/` | ✅ Confirmed |
| Repository URL in both `package.json` files | ✅ `https://github.com/lynellf/tablekit` |
| No `author`/`email` in either `package.json` | ✅ Confirmed |
| Lefthook pre-push includes `build` | ✅ Confirmed |
| Bugs/issues links in READMEs | ✅ `https://github.com/lynellf/tablekit/issues` |
| `docs/prepare-for-npm/RELEASING.md` exists | ✅ Created |

## Human steps (not automated)

```bash
# 1. Log in (manual — requires OTP)
npm login

# 2. Publish core first, then react
pnpm release:core
# → waits for core to be on npm before proceeding to react

# 3. Tag the release
git tag v0.1.0
git push origin v0.1.0

# 4. Verify on npmjs.com
open https://www.npmjs.com/package/@tablekit/core
open https://www.npmjs.com/package/@tablekit/react
```

## Post-publish artifact

After the first release is cut, the following git tag will exist:
```
v0.1.0 → both packages at 0.1.0, dist/ committed
```

## Next steps (post-0.1.0)

- Consider adopting Changesets for automated CHANGELOG and version bumping
- Set up a GitHub Actions workflow to run `pnpm verify` on PR and `pnpm publish` on tag
- Add `vite-plugin-dts` to generate `.d.ts` files during build (type declarations are out of scope for v0.1.0)
