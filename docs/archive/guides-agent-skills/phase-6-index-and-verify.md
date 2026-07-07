# Phase 6 — Index, Cross-references, Verification

**Phase:** 6 of 6
**Goal:** Finalize the index page, add cross-references in the root `README.md` and `docs/recipes/README.md`, and confirm `pnpm verify` exits 0 from a fresh state.
**Status:** Draft v1 for review
**Depends on:** Phases 1–5 (all four doc pairs land, the smoke test passes for all four describe blocks).

---

## 1. What this phase produces

1. `docs/guides/README.md` — finalized index page (Phase 1 created a stub; this phase finalizes the row links and adds the cross-link paragraph).
2. Root `README.md` — add a "Guides & agent skills" row to the docs table.
3. `docs/recipes/README.md` — add a "Guides & agent skills" paragraph pointing at `docs/guides/`.
4. A clean `pnpm verify` exit 0 from a fresh checkout.

## 2. Files to touch

| Path | Action | What it contains |
|------|--------|------------------|
| `docs/guides/README.md` | finalize | Phase 1 created the index; this phase ensures the row links are stable and adds the cross-link section. |
| `README.md` | edit | Add a "Guides & agent skills" row to the existing docs table. |
| `docs/recipes/README.md` | edit | Add a "Guides & agent skills" cross-link paragraph. |

## 3. `docs/guides/README.md` finalization

Phase 1 created the README with the index table. After Phase 6, the README should:

- Have the same index table (Phase 1 contents) with no edits to the rows — every link should resolve by this point because Phases 2–5 created the four target directories.
- Add a "Verified against v1.0.0" footer at the bottom.
- Add a "Maintenance" paragraph noting that the smoke test in `packages/core/src/__tests__/guides.test.ts` enforces the structural convention; the docs are updated alongside the API freeze bump.

The Phase 1 README is already complete on these axes. Verify by re-reading and confirming:

- All 5 `target` directory links resolve (`./<target>/SKILL.md` + `./<target>/guide.md`).
- The "Shared structure" section's table is accurate.
- The "How to add a new target" section is accurate.

If Phase 1's stub needs adjustment (e.g., links to `./webix-datagrid/SKILL.md` resolved to a non-existent path on Phase 1 exit), fix it now.

## 4. Root `README.md` edit

Read `README.md` at the repo root (verified during planning: it has a "Recipes" section under "## Recipes" with a table of recipe paths). Add a similar "Guides & agent skills" section immediately after the "Recipes" section:

```markdown
## Guides & agent skills

Concept-map documents that map table-kit's `@lynellf/tablekit-react` and `@lynellf/tablekit-pivot` feature surfaces onto popular external library targets (Webix DataTable, Webix Pivot, AG-Grid DataGrid, AG-Grid Pivot). Each target gets one `SKILL.md` (agent-skill frontmatter) plus a companion `guide.md` (recipe-style concept map). Useful when migrating an existing Webix or AG-Grid integration to table-kit, or when reviewing target-library-shaped requirements against the v1.0 API.

See [`docs/guides/`](./docs/guides/) for the full index.

All guides are verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).
```

Insert this section between the existing "## Recipes" section and the "## Bugs & Issues" section (so it sits naturally with the other docs references). Verify the table-of-contents-style flow by reading the surrounding sections.

## 5. `docs/recipes/README.md` edit

Read `docs/recipes/README.md` (verified during planning: it has a "## How to use these recipes" section and a "## Adding new recipes" section). Add a brief cross-link paragraph at the end of "## How to use these recipes":

```markdown
## Companion docs

For concept maps from table-kit's API surface to popular external libraries (Webix DataTable, Webix Pivot, AG-Grid DataGrid, AG-Grid Pivot), see [`docs/guides/`](./../guides-agent-skills/). Each guide maps the relevant recipes back to the target library's feature vocabulary.
```

This cross-link is the "would be nice" link flagged in the overview's open concerns.

## 6. Verification

The verification block from `overview.md` §9:

```bash
# 1. Toolchain green
pnpm verify

# 2. All eight files exist, non-empty, and have the required frontmatter / sections
test -s docs/guides/README.md
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  test -s docs/guides/$t/SKILL.md
  test -s docs/guides/$t/guide.md
done

# 3. Every SKILL.md has the required frontmatter keys
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  grep -q '^name:'             docs/guides/$t/SKILL.md
  grep -q '^description:'      docs/guides/$t/SKILL.md
  grep -q '^verified_against:' docs/guides/$t/SKILL.md
done

# 4. Every guide.md has the required sections and the Verified against footer
for t in webix-datagrid webix-pivot ag-grid-datagrid ag-grid-pivot; do
  grep -q '## Mapping at a glance'             docs/guides/$t/guide.md
  grep -q '## Concept → feature table'        docs/guides/$t/guide.md
  grep -q '## Where the target has no v1.0 analog' docs/guides/$t/guide.md
  grep -q '## Where table-kit v1.0 is richer' docs/guides/$t/guide.md
  grep -q '## Verified against'               docs/guides/$t/guide.md
done

# 5. Root README has a "Guides & agent skills" entry pointing at docs/guides/
grep -q 'docs/guides' README.md

# 6. docs/recipes/README.md has a cross-link to docs/guides/
grep -q 'guides-agent-skills' docs/recipes/README.md

# 7. The Phase 1 smoke test passes for all four targets
pnpm test packages/core/src/__tests__/guides.test.ts 2>&1 | tail -10
# Expected: all four describe blocks pass; no failures.
```

Expected: all checks green; `pnpm verify` exits 0.

## 7. Acceptance criteria (plan-level)

The plan is complete when all of the following are true:

- [ ] All 8 files exist (4 SKILL.md + 4 guide.md), each non-empty.
- [ ] `docs/guides/README.md` exists and indexes all 4 targets with resolving links.
- [ ] Every SKILL.md has frontmatter keys `name`, `description`, `verified_against`, `target`, `companion_guide`.
- [ ] Every guide.md has the required section headers (Mapping at a glance; Concept → feature table; Where the target has no v1.0 analog; Where table-kit v1.0 is richer; See also; Verified against).
- [ ] Every guide.md cites `docs/m6-hardening/api-freeze.md` (v1.0) in its Verified against footer.
- [ ] Every guide.md's concept-table groups have at least one row each.
- [ ] Every guide.md names at least three "where the target has no v1.0 analog" entries.
- [ ] Every guide.md names at least three "where table-kit v1.0 is richer" entries.
- [ ] Root `README.md` links to `docs/guides/` in the docs table.
- [ ] `docs/recipes/README.md` cross-links to `docs/guides/`.
- [ ] `pnpm verify` exits 0 from a fresh checkout.
- [ ] The Vitest doc-presence test (`packages/core/src/__tests__/guides.test.ts`) passes for all four targets.

## 8. Risks

- **`pnpm verify` regressions.** This phase introduces no new source code beyond the Phase 1 test file; the `typecheck` + `lint` + `test` + `build` chain is the same gate that was green at HEAD. The risk is a markdown-format regression (e.g., a stray unclosed fenced code block) breaking Biome's markdown lint if Biome is configured to lint markdown files. Mitigation: read `biome.json` (verified during planning: Biome does not lint `**/*.md` by default; markdown is excluded from `formatter.include` and `linter.include`). If a future contributor enables markdown lint, the new docs may need reformatting.
- **Cross-link drift.** The root `README.md` and `docs/recipes/README.md` cross-links are maintained manually. If either file is reorganized in a future commit, the link may need updating. The Phase 1 smoke test does not cover these cross-links (it only checks in-directory file structure). Mitigation: the verification block in this phase includes a `grep` check; future maintainers can re-run it.
- **Index table drift.** If a fifth target is added (e.g., MUI X), the index table in `docs/guides/README.md` needs a new row. The Phase 1 README documents the "How to add a new target" procedure; the smoke test does not yet cover the index row. Mitigation: future maintainers can extend the smoke test to also assert a row exists in the index for each target directory.

## 9. Out of scope for this phase

- Adding MUI X, Handsontable, or TanStack Table mappings (separate plans).
- Adopting changesets/release-please or any release tooling.
- Any source code change in `packages/*/src/` (the Phase 1 test file is the only new file in `packages/`).
- Knowledge-candidate curation (`.okf/` writes) — surfaced for `okf-curator` in `overview.md` §8.

## 10. Plan-level completion signal

After Phase 6, the plan is complete and ready for `plan-reviewer-a` review. The reviewer checks the artifacts in this order:

1. `docs/guides/overview.md` — spec + plan (this file is the entry point).
2. `docs/guides/phase-1-shared-structure.md` through `phase-6-index-and-verify.md` — per-phase deliverables.
3. `docs/guides/README.md` — index page.
4. `docs/guides/<target>/{SKILL.md,guide.md}` for each of the four targets — eight doc files.
5. `packages/core/src/__tests__/guides.test.ts` — the doc-presence smoke test.
6. `README.md` and `docs/recipes/README.md` — cross-link additions.

The verification block in §6 is the final gate. Once green, the orchestrator can dispatch the implementer.