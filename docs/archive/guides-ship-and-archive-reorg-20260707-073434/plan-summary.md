# Plan Summary: Ship `docs/guides/` with `@lynellf/tablekit-react` and fix post-move broken paths

**Slug:** `guides-ship-and-archive-reorg`
**Status:** Plan ready for implementer (post-panel approval)
**Spec:** [`spec.md`](./spec.md)
**Phases:** [Phase 1](./phase-1-repair-broken-links.md) · [Phase 2](./phase-2-ship-docs-guides-in-tarball.md) · [Phase 3](./phase-3-m6-hardening-disposition.md)

---

## 1. One-paragraph summary

Three coupled doc/packaging changes: (1) include `docs/guides/` in the published `@lynellf/tablekit-react` tarball so consumers can read the four Webix/AG-Grid concept maps locally after install, (2) repair the cross-references that the recent move from `docs/guides-agent-skills/guides/` → `docs/guides/` broke across the root README, the core package's guide smoke test, and the archive's README + phase files, and (3) document in writing that m6-hardening's plan is already archived while the live v1.0 canonical deliverables (`api-freeze.md`, `sr-matrix.md`) must remain at `docs/m6-hardening/` because they are referenced by 23 files. No source code, no public API change, no version bump.

## 2. Phase index

| # | Phase | Files changed | Verification |
| - | ----- | ------------- | ------------ |
| 1 | Repair broken cross-references | `README.md`, `packages/core/src/__tests__/guides.test.ts`, 8 files under `docs/archive/guides-agent-skills/` | `grep -rn 'guides-agent-skills'` clean outside archive; `node scripts/check-broken-links.mjs docs/` exits 0; `pnpm --filter @lynellf/tablekit-core test guides.test.ts` passes |
| 2 | Ship `docs/guides/` in the npm tarball | `packages/react/package.json` (1 line) | `pnpm --filter @lynellf/tablekit-react pack --dry-run` lists all 8 markdown paths; throwaway install in `/tmp/tk-consumer` shows the files at `node_modules/@lynellf/tablekit-react/docs/guides/` |
| 3 | Document m6-hardening disposition | `docs/plans/guides-ship-and-archive-reorg/plan-summary.md` (this file) | Read §4; `git status` shows `docs/m6-hardening/` unchanged |

## 3. Order of execution

The phases can be executed in any order — each is independently verifiable. Recommended order (matches the user's brief: "1. docs/guides available when installed 2. broken links 3. m6-hardening archive"):

1. Phase 1 (fix broken links) — ~9 files, pure sed/replace.
2. Phase 2 (ship in tarball) — 1 file, single edit.
3. Phase 3 (m6-hardening note) — already in this summary; nothing to do at implementation time.

## 4. m6-hardening disposition (per Phase 3)

> The m6-hardening *plan* is fully archived at `docs/archive/m6-hardening/`. The archive contains the plan's `overview.md`, `phase-1..5` files, `plan-summary.md`, and `ARCHIVE-MANIFEST.md` (status: `approve`, v1.0 declared complete 2026-07-06, 533 tests passing across M0–M6).
>
> The *live* `docs/m6-hardening/` directory contains exactly two files: `api-freeze.md` and `sr-matrix.md`. These are **v1.0 canonical deliverables**, not plan artifacts:
>
> - `api-freeze.md` is the canonical v1.0 API contract. It is referenced by 23 files across the repo.
> - `sr-matrix.md` is the a11y release-gate document. It is referenced by `docs/release-process.md` §4 and `.okf/workflows/release-process.md`.
>
> **Per `.okf/concepts/documentation-conventions.md`:** "the final v1.0 canonical contract at `docs/m6-hardening/api-freeze.md`" — the convention requires it stays at that path.
>
> **Recommendation:** No path changes. The plan artifacts remain archived; the v1.0 deliverables remain at `docs/m6-hardening/{api-freeze,sr-matrix}.md`.

## 5. Aggregate verification

After all three phases, the single command sequence that proves the plan landed cleanly:

```bash
# AC4: no live references to the old directory name
grep -rn 'guides-agent-skills' --include='*.md' --include='*.ts' --include='*.json' . \
  | grep -v 'docs/archive/guides-agent-skills/' \
  | grep -v node_modules
# Expected: empty

# AC5: broken-link lint on live docs
node scripts/check-broken-links.mjs docs/
# Expected: PASS

# AC3: guide smoke test still passes
pnpm --filter @lynellf/tablekit-core test guides.test.ts
# Expected: 22/22 passing

# AC1: 8 markdown files appear in the tarball listing
pnpm --filter @lynellf/tablekit-react pack --dry-run 2>&1 | grep -E 'docs/guides/'
# Expected: 8 matches

# AC6: full repo verification
pnpm verify
# Expected: exit 0

# AC7: no inadvertent changes under docs/m6-hardening/
git status docs/m6-hardening/
# Expected: nothing to commit, working tree clean
```

## 6. Risk summary

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| `npm pack` rejects `..` in `files` | Low (npm 10+ accepts) | Phase 2 fails | Fallback to `vite-plugin-static-copy` (Phase 2 §6.1) |
| Tarball grows by ~85KB | Certain | Acceptable (was 280KB → 365KB) | None — explicit deliverable |
| Future `docs/guides/` additions drift from tarball | None | N/A | Glob is recursive, auto-includes |
| Archive reference rewrites miss a path | Low (sed is mechanical; grep verifies) | Phase 1 fails verification | §4 grep audit catches misses; fix forward with a single additional sed |

## 7. Knowledge candidates (for `okf-curator`, advisory)

- `docs/guides/` directory convention — per-target subdirectory with `SKILL.md` (agent-skill frontmatter) + `guide.md` (recipe-style body); both cite `docs/m6-hardening/api-freeze.md` in a "Verified against" footer. **Confidence: high.**
- m6-hardening dual disposition — plan artifacts archived; live canonical v1.0 deliverables remain at the milestone path per `.okf/concepts/documentation-conventions.md`. **Confidence: high.**
- npm `files` field `..` traversal — relative paths in `files` resolve outside the package directory; works in npm 10+. **Confidence: medium** (standard npm behavior; verify with `pack --dry-run` after the change).

## 8. Out of scope (explicit)

- Renaming `docs/m6-hardening/api-freeze.md` or `sr-matrix.md` — would touch 23 cross-references.
- Adding a `docs/guides/README.md` live index — root README already links each target directly.
- Publishing a separate `@lynellf/tablekit-react-docs` package — user confirmed in-tarball approach.
- Cross-linking `docs/recipes/README.md` → `docs/guides/` — advisory only, deferred.
- Updating `.okf/concepts/documentation-conventions.md` to mention `docs/guides/` — surfaced as a knowledge candidate for `okf-curator`.

## 9. Files touched (full list, across all phases)

```
README.md                                                         | 5 +-
packages/core/src/__tests__/guides.test.ts                        | 8 +-
packages/react/package.json                                       | 2 +-
docs/archive/guides-agent-skills/README.md                        | 12 +-
docs/archive/guides-agent-skills/overview.md                      | ~40 substitutions
docs/archive/guides-agent-skills/phase-1-shared-structure.md      | ~20 substitutions
docs/archive/guides-agent-skills/phase-2-webix-datagrid.md        | ~10 substitutions
docs/archive/guides-agent-skills/phase-3-webix-pivot.md           | ~10 substitutions
docs/archive/guides-agent-skills/phase-4-ag-grid-datagrid.md      | ~10 substitutions
docs/archive/guides-agent-skills/phase-5-ag-grid-pivot.md         | ~10 substitutions
docs/archive/guides-agent-skills/phase-6-index-and-verify.md      | ~5 substitutions
docs/plans/guides-ship-and-archive-reorg/plan-summary.md          | 1 file (post-implementation)
```

Total: 12 files (11 edited, 1 created post-implementation).

## 10. Acceptance criteria checklist (carry into implementation review)

- [ ] **AC1** — 8 markdown files ship in the `@lynellf/tablekit-react` tarball.
- [ ] **AC2** — Root `README.md` "Guides & agent skills" section links resolve to `docs/guides/`.
- [ ] **AC3** — `packages/core/src/__tests__/guides.test.ts` `DOCS_ROOT` resolves to `docs/guides`; smoke test passes.
- [ ] **AC4** — Archive cross-references point at live paths.
- [ ] **AC5** — `node scripts/check-broken-links.mjs docs/` exits 0.
- [ ] **AC6** — `pnpm verify` exits 0.
- [ ] **AC7** — No changes under `docs/m6-hardening/`.
- [ ] **AC8** — Plan artifact (§4 of this summary) documents the m6-hardening disposition recommendation.