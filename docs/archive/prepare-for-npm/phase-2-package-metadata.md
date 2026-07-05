# Phase 2 — Per-Package Publish Metadata

**Slug:** `prepare-for-npm`
**Phase:** 2 of 6
**Status:** Complete

## What was done

### `packages/core/package.json`

| Field | Before | After | Rationale |
|---|---|---|---|
| `version` | `"0.0.0"` | `"0.1.0"` | First publishable release |
| `private` | `true` | `false` | Required for npm publish |
| `description` | absent | `"Headless table state engine..."` | Required for npm listing |
| `main` | `"./src/index.ts"` | `"./dist/tablekit-core.es.js"` | Points to built output |
| `module` | absent | `"./dist/tablekit-core.es.js"` | ESM consumer hint |
| `types` | `"./src/index.ts"` | `"./dist/index.d.ts"` | Points to built output (types added post-build) |
| `exports` | absent | `{ ".": { "types", "import" } }` | Explicit public export map |
| `files` | absent | `["dist"]` | Whitelists dist/ in the npm tarball |
| `sideEffects` | absent | `false` | Enables tree-shaking |
| `license` | absent | `"MIT"` | Required; resolves root LICENSE automatically |
| `repository` | absent | `"https://github.com/lynellf/tablekit"` | Links to source; no email |
| `keywords` | absent | `["table", "headless", ...]` | Discoverability |
| `engines` | absent | `{"node": ">=20.0.0"}` | Runtime floor |
| `scripts.build` | absent | `"vite build"` | Runs package-local vite.config.ts |

No `author` or `email` field added — per user constraint.

### `packages/react/package.json`

Same fields as core, plus:
- `peerDependencies: { react: ">=18.0.0" }` — preserved (was already present)
- `devDependencies` preserved with `@types/react` and `react`

### `VERSION` constant bump

Both `packages/core/src/index.ts` and `packages/react/src/index.ts` had their `VERSION` constant bumped from `'0.0.0'` to `'0.1.0'` to match the package versions.

## Verification

```bash
node -e "console.log(require('./packages/core/package.json').version)"   # → 0.1.0
node -e "console.log(require('./packages/react/package.json').version)"  # → 0.1.0
node -e "const fs=require('fs'); console.log(fs.readFileSync('./packages/core/src/index.ts','utf8').match(/VERSION = '([^']+)'/)[1])"  # → 0.1.0
```

## Files changed

- `packages/core/package.json` — full publish metadata rewrite
- `packages/react/package.json` — full publish metadata rewrite
- `packages/core/src/index.ts` — VERSION bump
- `packages/react/src/index.ts` — VERSION bump
