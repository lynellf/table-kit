# Phase 2 — Ship `docs/guides/` with the `@lynellf/tablekit-react` tarball

**Goal:** After `npm install @lynellf/tablekit-react`, consumers find `node_modules/@lynellf/tablekit-react/docs/guides/<target>/{SKILL.md,guide.md}` for the four targets (8 markdown files total).

## 1. Why this phase is independent

Phase 2 is a single one-line edit in `packages/react/package.json` plus a verification pack. It does not depend on Phase 1's outcome (broken-link fixes are orthogonal to what the tarball contains). If Phase 1 has not landed yet, Phase 2 can still ship — the `files` field is independent of any in-repo cross-references.

## 2. Files changed (exact list)

| File | Change class | Lines |
| ---- | ------------ | ----- |
| `packages/react/package.json` | One-line edit to `files` array | 1 |

## 3. Detailed change

### 3.1 `packages/react/package.json`

Current:

```jsonc
  "files": ["dist"],
```

After:

```jsonc
  "files": ["dist", "../../docs/guides"],
```

### 3.2 Why `../../docs/guides` works

- The `files` field in `package.json` accepts paths and glob patterns relative to the package directory.
- `packages/react/` is the package directory; `packages/react/package.json` is the manifest.
- `files` paths are relative to `packages/react/`.
- `..` from `packages/react/` → `packages/`.
- `../..` from `packages/react/` → repo root.
- `../../docs/guides` from `packages/react/` → `<repo>/docs/guides/`. ✓

Verified by the npm documentation: "If you specify a folder, all of the files inside that folder will be included." The `files` pattern is interpreted as a glob; `../../docs/guides` is equivalent to `../../docs/guides/**/*` (which recursively includes all files under the directory).

### 3.3 Why not include `docs/` (the whole directory)?

- `docs/` includes `docs/m6-hardening/api-freeze.md`, `docs/m6-hardening/sr-matrix.md`, `docs/initial-spec.md` (a 54KB spec doc), `docs/recipes/`, `docs/bundler-recipes.md`, `docs/core-engine/`, `docs/archive/` (large), and the four guide subdirectories.
- The user's request is scoped to "docs/guides" specifically.
- `docs/m6-hardening/api-freeze.md` is referenced by every package's published README via GitHub URL — it does not need to ship in the tarball (consumers can read it from GitHub).
- `docs/recipes/` ships as repo-internal guidance for contributors; consumer-facing copy-paste is best served by an external docs site (out of scope for this plan).

## 4. Verification

### 4.1 Confirm the pattern resolves

```bash
cd packages/react
pnpm pack --dry-run 2>&1 | grep -E 'docs/guides/'
```

Expected output (one line per file):

```
npm notice total files: 10
npm notice === Tarball contents ===
npm notice dist/tablekit-react.es.js
npm notice dist/tablekit-react.es.js.map
npm notice dist/validate.es.js
npm notice dist/validate.es.js.map
npm notice docs/guides/webix-datagrid/SKILL.md
npm notice docs/guides/webix-datagrid/guide.md
npm notice docs/guides/webix-pivot/SKILL.md
npm notice docs/guides/webix-pivot/guide.md
npm notice docs/guides/ag-grid-datagrid/SKILL.md
npm notice docs/guides/ag-grid-datagrid/guide.md
npm notice docs/guides/ag-grid-pivot/SKILL.md
npm notice docs/guides/ag-grid-pivot/guide.md
```

Total files: `dist/` (4) + `docs/guides/` (8) = 12 files in the published tarball (plus the manifest itself; pnpm reports the count via the `npm notice total files` line).

### 4.2 Confirm the actual tarball

For a tighter check:

```bash
cd packages/react
pnpm pack
tar -tzf lynellf-tablekit-react-1.0.0.tgz | grep -E 'docs/guides/'
# Clean up the local tarball after inspection
rm lynellf-tablekit-react-1.0.0.tgz
```

Expected: 8 paths matching `docs/guides/<target>/{SKILL.md,guide.md}`.

### 4.3 Confirm consumers can read them after install

This is the end-to-end check. Install the package into a throwaway directory and verify the files are there:

```bash
mkdir /tmp/tk-consumer && cd /tmp/tk-consumer
npm init -y > /dev/null
npm install /Users/ezellfrazier/Documents/GitHub/table-kit/packages/react  # workspace link
ls node_modules/@lynellf/tablekit-react/docs/guides/
# Expect: ag-grid-datagrid  ag-grid-pivot  webix-datagrid  webix-pivot
head -5 node_modules/@lynellf/tablekit-react/docs/guides/webix-datagrid/SKILL.md
# Expect: the SKILL.md frontmatter block
```

### 4.4 The release-process impact

`docs/release-process.md` step 7 already runs `pnpm build:main` before `pnpm release:react`. No change to the release process is needed — `vite build` does not need to know about `docs/guides/` because the `files` field is consumed by `npm pack`, not by Vite.

`pnpm verify` does not run `npm pack`; it runs `typecheck && lint && test && build`. The `files` field is a publish-time concern, not a verify-time concern. The Phase 2 change is therefore orthogonal to `pnpm verify` and adds no risk to the green-build gate.

## 5. Acceptance criteria

- **AC1** (8 markdown files ship in the tarball)
- **AC8** (root README "Guides & agent skills" section notes where to find them — handled in Phase 1 §3.1; cross-cite here)

## 6. Risks & mitigations

### 6.1 npm version rejects `..` in `files`

Some npm versions normalize `files` paths and reject `..` traversal as a security measure. If `pnpm pack --dry-run` fails with an error like `cannot include file outside package directory`:

- **Fallback A:** Use `vite-plugin-static-copy` to copy `docs/guides/` into `packages/react/dist/guides/` at build time, then ship `dist/` (which already includes `dist/guides/`).
- **Fallback B:** Move the four guide subdirectories into `packages/react/docs/guides/` (a copy or a symlink), then `"files": ["dist", "docs"]`.

Fallback A is preferred — it preserves the single source of truth (`docs/guides/` at repo root) and uses a build-time step already familiar to the repo's Vite setup.

### 6.2 Tarball size growth

The four guide directories total ~85KB across 8 files (per `du -sh docs/guides/*`). The current tarball is ~280KB (4 dist files + manifest). New total: ~365KB. Well under npm's 250KB warning threshold per file (no individual file exceeds ~22KB) and well under the practical tarball size limit (~10MB).

### 6.3 Drift between repo and tarball

Future plans that add a target to `docs/guides/` will automatically be included because the `files` glob is recursive (`../../docs/guides` matches everything under that directory). No further `files` edits required.

## 7. Rollback

Revert the one-line edit in `packages/react/package.json`. The next `pnpm release:react` will ship a tarball without the guides.

## 8. Files changed summary

```
packages/react/package.json  | 2 +-
1 file changed, 1 insertion(+), 1 deletion(-)
```