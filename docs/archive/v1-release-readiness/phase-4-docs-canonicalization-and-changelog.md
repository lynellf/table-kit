# Phase 4 — v1.0 Docs Canonicalization + CHANGELOG

**Slug:** `v1-release-readiness`
**Phase:** 4 of 5
**Status:** Draft

## Goal

Make the v1.0 canonical docs (`api-freeze.md`, `sr-matrix.md`) live where every consumer-facing reference says they live, and add a root `CHANGELOG.md` with the v1.0.0 entry.

## Background

The m6-hardening plan (`docs/archive/m6-hardening/plan-summary.md`) intended for the consolidated v1.0 contract to live at `docs/m6-hardening/api-freeze.md` and the SR matrix procedure at `docs/m6-hardening/sr-matrix.md`. In practice the files were archived under `docs/archive/m6-hardening/`. The consumer-facing docs — root `README.md`, `docs/release-process.md`, `docs/recipes/README.md` — all reference the non-archive path, which currently does not resolve.

Additionally, `docs/release-process.md` step 7 says "Add the v1.0.0 entry at the top of `CHANGELOG.md`" but the file does not exist.

## What to change

### 4.1 Move the two canonical v1.0 docs out of archive

```bash
mkdir -p docs/m6-hardening
git mv docs/archive/m6-hardening/api-freeze.md docs/m6-hardening/api-freeze.md
git mv docs/archive/m6-hardening/sr-matrix.md docs/m6-hardening/sr-matrix.md
```

Rationale: these are the v1.0 contract, not a historical artifact. Per-milestone historical freezes are already archived under `docs/archive/api-freeze-history/`. Keeping the v1.0 doc in `docs/m6-hardening/` matches what every consumer-facing reference already expects.

The remaining files under `docs/archive/m6-hardening/` (the `phase-1`–`phase-5` plan files, `overview.md`, `plan-summary.md`, `ARCHIVE-MANIFEST.md`) are historical artifacts and stay in the archive.

### 4.2 Add a root `CHANGELOG.md`

Format: Keep-a-Changelog 1.1.0.

Single v1.0.0 entry summarizing the milestones (M0 core engine → M6 hardening). Sources to consult:

- `docs/initial-spec.md` §14 (Delivery milestones).
- `docs/archive/m{0,1,2,3,4,5,6}*/plan-summary.md` (per-milestone plan summaries).

The entry should list the high-level capabilities shipped (DataTable, PivotTable, server modes, worker engine, server engine, announcer i18n, tabBehavior, recipes, benchmarks in CI, SR matrix procedure) under `### Added`. No `### Changed` or `### Removed` sections in v1.0.0 (additive cut per api-freeze §1).

### 4.3 Confirm path references resolve

After the moves, the following existing references should all resolve:

- `docs/release-process.md` → `docs/m6-hardening/api-freeze.md` ✓
- `docs/release-process.md` → `docs/m6-hardening/sr-matrix.md` ✓
- `README.md` → `docs/m6-hardening/api-freeze.md` ✓
- `docs/recipes/README.md` → `docs/m6-hardening/api-freeze.md` ✓
- `docs/initial-spec.md` → `docs/m6-hardening/api-freeze.md` ✓

No source edits required for these — they were already pointing at the non-archive path.

### 4.4 Add a note to `docs/release-process.md`

Add a sentence at the top of `docs/release-process.md` after the title:

> The release scripts (`pack:*`, `release:*`) cover all four published packages: `@lynellf/tablekit-core`, `@lynellf/tablekit-react`, `@lynellf/tablekit-pivot`, `@lynellf/tablekit-worker`.

The existing step 6 already enumerates all four scripts; this addition just surfaces the symmetry for a reader scanning the top of the file.

## Files to edit / create / move

- `git mv docs/archive/m6-hardening/api-freeze.md docs/m6-hardening/api-freeze.md`
- `git mv docs/archive/m6-hardening/sr-matrix.md docs/m6-hardening/sr-matrix.md`
- `CHANGELOG.md` — create at repo root.
- `docs/release-process.md` — add the symmetry note near the top.

## Verification

```bash
# 1. Canonical docs at the consumer-facing path
test -f docs/m6-hardening/api-freeze.md
test -f docs/m6-hardening/sr-matrix.md

# 2. They are no longer in archive
test ! -f docs/archive/m6-hardening/api-freeze.md
test ! -f docs/archive/m6-hardening/sr-matrix.md

# 3. CHANGELOG exists with a v1.0.0 entry
test -f CHANGELOG.md
grep -q '## \[1.0.0\]' CHANGELOG.md

# 4. References in consumer-facing docs resolve to existing files
for f in README.md docs/release-process.md docs/recipes/README.md docs/initial-spec.md; do
  grep -E 'docs/m6-hardening/(api-freeze|sr-matrix)\.md' "$f" > /dev/null || echo "MISSING REFERENCE IN: $f"
done

# 5. Existing release-process references still resolve after the move
grep -E 'docs/m6-hardening/' docs/release-process.md | while read -r line; do
  path=$(echo "$line" | grep -oE 'docs/m6-hardening/[a-z-]+\.md')
  test -f "$path" || echo "BROKEN REFERENCE: $path"
done
# Expected: no output.

# 6. Broken-link checker still green on docs/recipes/
node scripts/check-broken-links.mjs docs/recipes/
```

## Out of scope for this phase

- Rewriting references inside `docs/archive/m6-hardening/*` (historical plan files). Their own internal references to `docs/m6-hardening/...` will now resolve (because we created the directory); this is a happy side effect, not a fix target.
- Adopting Changesets/release-please. The CHANGELOG is hand-curated for v1.0.0.
- A CHANGELOG entry for v0.1.0. The 0.1.0 cut predates this changelog file; the v1.0.0 entry is the inaugural entry.