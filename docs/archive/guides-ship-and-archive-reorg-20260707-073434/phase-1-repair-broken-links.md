# Phase 1 — Repair broken cross-references from the `docs/guides/` move

**Goal:** Every cross-reference created by the move from `docs/guides-agent-skills/guides/<target>/` → `docs/guides/<target>/` is repaired. Live docs point at the new location; archive docs point at the live location (not the historical one).

## 1. Why this phase is independent

The phase-1 work is purely a search-and-replace across nine known files. It does not require npm publish, build output, or test runtime. It can be fully verified with `grep` + the broken-link lint script. Phase 2 (`files` field) and Phase 3 (disposition note) do not depend on this phase's outcome.

## 2. Files changed (exact list)

| File | Change class | Approx. occurrences |
| ---- | ------------ | ------------------- |
| `README.md` | Path rewrite in one table | 5 (4 rows + 1 see-also) |
| `packages/core/src/__tests__/guides.test.ts` | `DOCS_ROOT` + nested `guides/` segment removed | 3 (1 const, 1 resolve, 1 test label) |
| `docs/archive/guides-agent-skills/README.md` | Relative path rewrite (`./guides/` → `../../../docs/guides/`) + editor's note paragraph | 8 (4 rows × 2 cols + 2 standalone) |
| `docs/archive/guides-agent-skills/overview.md` | Path rewrite | ~40 |
| `docs/archive/guides-agent-skills/phase-1-shared-structure.md` | Path rewrite | ~20 |
| `docs/archive/guides-agent-skills/phase-2-webix-datagrid.md` | Path rewrite | ~10 |
| `docs/archive/guides-agent-skills/phase-3-webix-pivot.md` | Path rewrite | ~10 |
| `docs/archive/guides-agent-skills/phase-4-ag-grid-datagrid.md` | Path rewrite | ~10 |
| `docs/archive/guides-agent-skills/phase-5-ag-grid-pivot.md` | Path rewrite | ~10 |
| `docs/archive/guides-agent-skills/phase-6-index-and-verify.md` | Path rewrite | ~5 |

## 3. Detailed changes

### 3.1 `README.md` (root)

Replace the entire "Guides & agent skills" table block. Lines 68–74:

```diff
- ## Guides & agent skills
-
- Concept maps aligning table-kit's v1.0 feature surface against four external grid/pivot libraries:
-
- | Target | Description |
- | --- | --- |
- | [`docs/guides-agent-skills/guides/webix-datagrid/`](./docs/guides-agent-skills/guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` |
- | [`docs/guides-agent-skills/guides/webix-pivot/`](./docs/guides-agent-skills/guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` |
- | [`docs/guides-agent-skills/guides/ag-grid-datagrid/`](./docs/guides-agent-skills/guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` |
- | [`docs/guides-agent-skills/guides/ag-grid-pivot/`](./docs/guides-agent-skills/guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` |
-
- See [`docs/guides-agent-skills/README.md`](./docs/guides-agent-skills/) for the full index.
+ ## Guides & agent skills
+
+ Concept maps aligning table-kit's v1.0 feature surface against four external grid/pivot libraries. Guides ship inside the `@lynellf/tablekit-react` npm package at `node_modules/@lynellf/tablekit-react/docs/guides/<target>/`:
+
+ | Target | Description |
+ | --- | --- |
+ | [`docs/guides/webix-datagrid/`](./docs/guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` |
+ | [`docs/guides/webix-pivot/`](./docs/guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` |
+ | [`docs/guides/ag-grid-datagrid/`](./docs/guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` |
+ | [`docs/guides/ag-grid-pivot/`](./docs/guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` |
```

(The "See also" line referring to `docs/guides-agent-skills/README.md` is intentionally removed — the live index in `docs/guides-agent-skills/README.md` no longer exists. The four direct links above are sufficient.)

### 3.2 `packages/core/src/__tests__/guides.test.ts`

```diff
- const DOCS_ROOT = resolve(import.meta.dirname, '../../../../docs/guides-agent-skills');
+ const DOCS_ROOT = resolve(import.meta.dirname, '../../../../docs/guides');

  // …

  describe(target, () => {
-   const targetDir = resolve(DOCS_ROOT, 'guides', target);
+   const targetDir = resolve(DOCS_ROOT, target);

    // …
  });

  // …

- it('docs/guides-agent-skills/README.md exists', () => {
+ it('docs/guides-agent-skills archive README exists', () => {
    const readmePath = resolve(DOCS_ROOT, 'README.md');
    const content = readFileSync(readmePath, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
  });
```

(Note on the test label: the `DOCS_ROOT` now points at `docs/guides/` which does not have a `README.md` today. The test should still pass against the `docs/guides/<target>/` files but the `it('docs/guides/...')` block needs to be re-scoped. **Resolution:** keep the test but change it to assert the four target directories exist, dropping the `README.md` assertion. See code block below.)

```diff
- it('docs/guides-agent-skills/README.md exists', () => {
-   const readmePath = resolve(DOCS_ROOT, 'README.md');
-   const content = readFileSync(readmePath, 'utf8');
-   expect(content.trim().length).toBeGreaterThan(0);
- });
-
- it('README.md indexes all four targets', () => {
-   const readmePath = resolve(DOCS_ROOT, 'README.md');
-   const content = readFileSync(readmePath, 'utf8');
-   for (const target of TARGETS) {
-     expect(content).toContain(target);
-   }
- });
+ // The archive README remains at docs/archive/guides-agent-skills/README.md and indexes
+ // all four targets via live-path links (updated in this phase). Verify it.
+ it('docs/archive/guides-agent-skills/README.md exists and indexes all four targets', () => {
+   const readmePath = resolve(import.meta.dirname, '../../../../docs/archive/guides-agent-skills/README.md');
+   const content = readFileSync(readmePath, 'utf8');
+   expect(content.trim().length).toBeGreaterThan(0);
+   for (const target of TARGETS) {
+     expect(content).toContain(target);
+   }
+ });
```

### 3.3 `docs/archive/guides-agent-skills/README.md`

Add an editor's-note paragraph immediately after the `# Guides & Agent Skills` heading:

```diff
  # Guides & Agent Skills

+ > **Editor's note (2026-07-07):** The directory `docs/guides-agent-skills/` was renamed to `docs/guides/` as part of the `guides-ship-and-archive-reorg` plan. The plan artifacts (overview, phase-1..6, trivial.md) remain in this archive; the live doc outputs moved to `docs/guides/<target>/`. Cross-references in this README and the phase files have been updated to point at the live path.
+
  Concept maps that align table-kit's v1.0 feature surface against four external grid/pivot libraries. …
```

Then rewrite the four table rows:

```diff
- | [webix-datagrid](./guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` | [guide.md](./guides/webix-datagrid/guide.md) |
- | [webix-pivot](./guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` | [guide.md](./guides/webix-pivot/guide.md) |
- | [ag-grid-datagrid](./guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` | [guide.md](./guides/ag-grid-datagrid/guide.md) |
- | [ag-grid-pivot](./guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` | [guide.md](./guides/ag-grid-pivot/guide.md) |
+ | [webix-datagrid](../../../docs/guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` | [guide.md](../../../docs/guides/webix-datagrid/guide.md) |
+ | [webix-pivot](../../../docs/guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` | [guide.md](../../../docs/guides/webix-pivot/guide.md) |
+ | [ag-grid-datagrid](../../../docs/guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` | [guide.md](../../../docs/guides/ag-grid-datagrid/guide.md) |
+ | [ag-grid-pivot](../../../docs/guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` | [guide.md](../../../docs/guides/ag-grid-pivot/guide.md) |
```

Update the "See also" block at the bottom similarly:

```diff
- See also
-
- - [`docs/m6-hardening/api-freeze.md`](./docs/m6-hardening/api-freeze.md) — v1.0 API contract
- - [`docs/initial-spec.md`](./docs/initial-spec.md) — full spec, §1 (positioning), §7–9 (feature surface)
- - [`docs/recipes/`](./docs/recipes/) — consumer-facing wiring patterns
+ ## See also
+
+ - [`docs/m6-hardening/api-freeze.md`](../../../docs/m6-hardening/api-freeze.md) — v1.0 API contract
+ - [`docs/initial-spec.md`](../../../docs/initial-spec.md) — full spec, §1 (positioning), §7–9 (feature surface)
+ - [`docs/recipes/`](../../../docs/recipes/) — consumer-facing wiring patterns
```

### 3.4 `docs/archive/guides-agent-skills/overview.md` and phase files

For each of the seven files (`overview.md` + `phase-1..6`), apply the same sed pattern:

```bash
# Run from repo root
for f in docs/archive/guides-agent-skills/overview.md \
         docs/archive/guides-agent-skills/phase-1-shared-structure.md \
         docs/archive/guides-agent-skills/phase-2-webix-datagrid.md \
         docs/archive/guides-agent-skills/phase-3-webix-pivot.md \
         docs/archive/guides-agent-skills/phase-4-ag-grid-datagrid.md \
         docs/archive/guides-agent-skills/phase-5-ag-grid-pivot.md \
         docs/archive/guides-agent-skills/phase-6-index-and-verify.md; do
  sed -i '' 's|docs/guides-agent-skills|docs/guides|g' "$f"
done
```

Why this sed is safe for these files:
- The only token `guides-agent-skills` in scope refers to the directory path.
- The replacement `docs/guides` is a strict prefix-equivalent (the new live directory is `docs/guides/`, so the new path reads correctly).
- No false positives: a grep of these files in the investigation phase found zero occurrences of `guides-agent-skills` outside path contexts.

The README.md at `docs/archive/guides-agent-skills/README.md` is excluded from the sed loop because it has its own targeted diffs above.

## 4. Verification

### 4.1 Grep audit (must be zero matches outside archive)

```bash
grep -rn 'guides-agent-skills' --include='*.md' --include='*.ts' --include='*.json' . \
  | grep -v 'docs/archive/guides-agent-skills/' \
  | grep -v node_modules
```

Expected output: empty.

### 4.2 Broken-link lint (live docs only — `archive/` is in SKIP_DIRS by default)

```bash
node scripts/check-broken-links.mjs docs/
```

Expected output: `check-broken-links.mjs: PASS (N files scanned)`.

### 4.3 Smoke test for the moved guide docs

```bash
pnpm --filter @lynellf/tablekit-core test guides.test.ts
```

Expected output: `Test Files … passed`, all 22 tests still green (count unchanged — same targets, same assertions, same required frontmatter/sections).

### 4.4 Visual spot-check

Open one of the moved guides and one of the rewritten archive phase files in an editor; confirm the relative paths resolve when followed by the editor's link-handler.

## 5. Acceptance criteria

- **AC2** (root README links resolve to `docs/guides/`)
- **AC3** (`guides.test.ts` smoke test passes against `docs/guides/`)
- **AC4** (archive cross-references point at live paths)
- **AC5** (`check-broken-links.mjs` exits 0)
- **AC7** (no changes under `docs/m6-hardening/`)

## 6. Rollback

`git restore README.md packages/core/src/__tests__/guides.test.ts docs/archive/guides-agent-skills/` reverts this phase cleanly. No build artifacts are touched.