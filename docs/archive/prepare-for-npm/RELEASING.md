# Releasing @lynellf/tablekit-core and @lynellf/tablekit-react

This runbook covers the manual steps to cut a new release of `@lynellf/tablekit-core` and `@lynellf/tablekit-react` to npm.

---

## Prerequisites

1. **npm login** — you must be logged in to npm before publishing:

   ```bash
   npm login
   # Enter your username, email (used for notifications only), and OTP.
   ```

   Your npm account must have maintainer access to the `@lynellf` scope (it's your username scope — free with any npm account).

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
pnpm -F @lynellf/tablekit-core pack --dry-run
pnpm -F @lynellf/tablekit-react pack --dry-run

# Both should list: package.json, README.md, LICENSE, dist/
```

If any step fails, fix before proceeding.

---

## Publishing

> **Publish core first, then react.** The react package depends on `@lynellf/tablekit-core` as a peer dependency — consumers need core to be on the registry first.

### @lynellf/tablekit-core

```bash
pnpm -F @lynellf/tablekit-core build
pnpm -F @lynellf/tablekit-core publish --access public
```

### @lynellf/tablekit-react

```bash
pnpm -F @lynellf/tablekit-react build
pnpm -F @lynellf/tablekit-react publish --access public
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

1. Open https://www.npmjs.com/package/@lynellf/tablekit-core and confirm the version, description, and README are correct.
2. Do the same for https://www.npmjs.com/package/@lynellf/tablekit-react.
3. Smoke-test the tarball contents:

   ```bash
   npm pack @lynellf/tablekit-core --dry-run
   npm pack @lynellf/tablekit-react --dry-run
   ```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `E403 You do not have permission to publish the package @lynellf/tablekit-core` | Check that you are logged into the correct npm account (`npm whoami`). You own `@lynellf` scope with a free account. |
| `E409` conflict on publish | Run `npm info @lynellf/tablekit-core` — the version may already exist on npm. Bump the version in `packages/*/package.json` and try again. |
| `dist/` not in tarball | Ensure `pnpm build:core` then `pnpm build:react` ran successfully before publishing. Check `packages/*/package.json` `"files"` field includes `"dist"`. |
| Peer dependency warning on install | Expected for v0.1.0. Consumers will see a warning if they are on React < 18. Document the peer dep requirement in the README. |

---

## Future automation

This runbook is manual for v0.1.0. For subsequent releases consider:

- **Changesets** — manage CHANGELOG and version bumps automatically.
- **GitHub Actions release workflow** — automate `build` → `pack --dry-run` → `npm publish` on tag push, with npm token stored as a repo secret.
- **npm provenance** — available once publishing from CI with a signed commit.

See the spec (`docs/initial-spec.md`) for roadmap context.
