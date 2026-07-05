# Releasing @tablekit/core and @tablekit/react

This runbook covers the manual steps to cut a new release of `@tablekit/core` and `@tablekit/react` to npm.

---

## Prerequisites

1. **npm login** — you must be logged in to npm before publishing:

   ```bash
   npm login
   # Enter your username, email (used for notifications only), and OTP.
   ```

   Your npm account must have maintainer access to the `@tablekit` scope (request via npm support if needed).

2. **Node ≥ 20** and **pnpm ≥ 10** installed locally.

3. **No uncommitted changes** — the publish step commits a git tag; start from a clean working tree.

---

## Pre-publish checklist

Run from the repo root:

```bash
# 1. Pull latest and ensure dependencies are fresh
git pull
pnpm install

# 2. Verify everything is green
pnpm verify

# 3. Dry-run the pack for both packages (no tarball created)
pnpm -F @tablekit/core pack --dry-run
pnpm -F @tablekit/react pack --dry-run

# Both should list: package.json, README.md, LICENSE, dist/
```

If any step fails, fix before proceeding.

---

## Publishing

> **Publish core first, then react.** The react package depends on `@tablekit/core` as a peer dependency — consumers need core to be on the registry first.

### @tablekit/core

```bash
pnpm -F @tablekit/core build
pnpm -F @tablekit/core publish --access public
```

### @tablekit/react

```bash
pnpm -F @tablekit/react build
pnpm -F @tablekit/react publish --access public
```

---

## Tagging

After both packages are live, tag the release in git:

```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## Post-publish verification

1. Open https://www.npmjs.com/package/@tablekit/core and confirm the version, description, and README are correct.
2. Do the same for https://www.npmjs.com/package/@tablekit/react.
3. Smoke-test the tarball contents:

   ```bash
   npm pack @tablekit/core --dry-run
   npm pack @tablekit/react --dry-run
   ```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `E403 You do not have permission to publish the package @tablekit/core` | Request maintainer access via npm support or transfer the package to your account. |
| `E409` conflict on publish | Run `npm info @tablekit/core` — the version may already exist on npm. Bump the version in `packages/*/package.json` and try again. |
| `dist/` not in tarball | Ensure `pnpm build` ran successfully before publishing. Check `packages/*/package.json` `"files"` field includes `"dist"`. |
| Peer dependency warning on install | Expected for v0.1.0. Consumers will see a warning if they are on React < 18. Document the peer dep requirement in the README. |

---

## Future automation

This runbook is manual for v0.1.0. For subsequent releases consider:

- **Changesets** — manage CHANGELOG and version bumps automatically.
- **GitHub Actions release workflow** — automate `build` → `pack --dry-run` → `npm publish` on tag push, with npm token stored as a repo secret.
- **npm provenance** — available once publishing from CI with a signed commit.

See the spec (`docs/initial-spec.md`) for roadmap context.
