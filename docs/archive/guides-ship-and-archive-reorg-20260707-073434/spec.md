# Spec: Ship `docs/guides/` with `@lynellf/tablekit-react` and fix post-move broken paths

**Slug:** `guides-ship-and-archive-reorg`
**Status:** Draft v1 for review
**Audience:** implementer (after panel approval)
**Scope:** Three tightly coupled doc/packaging changes — (1) include `docs/guides/` in the published `@lynellf/tablekit-react` tarball, (2) fix all broken cross-references from the recent `docs/guides/` move (out of `docs/guides-agent-skills/`), and (3) confirm/recommend an archival disposition for `docs/m6-hardening/`. No source code, no public API change.
**Out of scope:** Renaming `docs/m6-hardening/{api-freeze,sr-matrix}.md` (would churn 20+ cross-references), publishing a separate `@lynellf/tablekit-react-docs` package, modifying the v1.0 API surface.

---

## 1. Goal

Three concrete outcomes:

1. **Ship guides.** `@lynellf/tablekit-react@1.0.x` consumers get `node_modules/@lynellf/tablekit-react/docs/guides/<target>/{SKILL.md,guide.md}` after `npm install`. Verified by `npm pack --dry-run` showing those paths in the tarball contents.
2. **Fix broken links.** Every broken cross-reference created by the `docs/guides-agent-skills/` → `docs/guides/` move is repaired. Verified by `node scripts/check-broken-links.mjs docs/` exiting 0 (excluding the `archive/` skip-dir).
3. **Confirm m6-hardening disposition.** The m6-hardening *plan* is already archived at `docs/archive/m6-hardening/`; the *live* `docs/m6-hardening/api-freeze.md` and `docs/m6-hardening/sr-matrix.md` stay in place because they are the v1.0 canonical deliverables, not plan artifacts. Recommendation documented; no path changes.

## 2. Non-goals

Explicitly excluded:

- **No source code changes.** `packages/react/src/**` is not touched.
- **No public API change.** No new exports, no new fields, no signature changes.
- **No rename of `docs/m6-hardening/api-freeze.md`.** It is referenced by 20+ files (every package README, all four recipes, all four guides, the root README, `docs/release-process.md`, two OKF docs). A rename would touch every one of them and is not requested.
- **No separate `@lynellf/tablekit-react-docs` package.** User confirmed the in-tarball approach.
- **No `exports` subpath field for docs.** Markdown files do not benefit from `import` resolution; consumers will read them via filesystem (`fs.readFileSync` from their own tooling, IDE peek, etc.).
- **No CHANGELOG entry.** This is a packaging/docs fix for v1.0.0; no version bump.
- **No release-process change.**
- **No `.okf/` writes.** Knowledge candidates surfaced for `okf-curator`.

## 3. Target surface

No change to public API surface. Packaging change is a single line in `packages/react/package.json`:

```jsonc
"files": ["dist", "../../docs/guides"]
```

`files` paths are relative to the package directory (`packages/react/`), so `../../docs/guides` resolves to `docs/guides/` at the repo root. npm/globby glob semantics apply, so this is equivalent to `../../docs/guides/**/*`.

## 4. Resolved questions

| # | Question | Resolution | Source |
| - | -------- | ---------- | ------ |
| 1 | What does "available when installed" mean? | Ship in the npm tarball via the `files` field. | User selection |
| 2 | Is m6-hardening complete? | Yes — v1.0 declared complete 2026-07-06, ARCHIVE-MANIFEST.md status `approve`, all four packages at `1.0.0`, 533 tests green. | `docs/archive/m6-hardening/ARCHIVE-MANIFEST.md`, `docs/initial-spec.md` §14 |
| 3 | Should the *plan* be moved to archive? | Already archived at `docs/archive/m6-hardening/` — no action needed. | Directory listing |
| 4 | Should the *live* `docs/m6-hardening/{api-freeze,sr-matrix}.md` move to archive? | No — they are the v1.0 canonical deliverables per `.okf/concepts/documentation-conventions.md` and are referenced by 20+ files. They are not "the m6-hardening plan"; they are the v1.0 contract that m6 produced. | `.okf/concepts/documentation-conventions.md` |
| 5 | How should archive cross-references be treated? | Update archive cross-references to point to the *current live path* (e.g., `docs/guides/<target>/`), so anyone following the link from the archive lands on the live doc. This mirrors the m6-hardening archive convention (its overview references `docs/m6-hardening/api-freeze.md` which is the live path). | `docs/archive/m6-hardening/overview.md` precedent |

## 5. Telemetry (this visit)

- `okf_docs_read`: 4
- `okf_tokens_read`: ~4,200
- `files_scanned_before_okf`: 0
- `files_scanned_after_okf`: 18
- `repo_scan_tokens_before_okf`: unknown
- `repo_scan_tokens_after_okf`: ~28,000
- `planner_cost_before_okf`: unknown
- `planner_cost_after_okf`: unknown
- `stale_okf_hits`: 0
- `missing_okf_hits`: 1 (no OKF doc for `docs/guides/` directory convention — surface as knowledge candidate)

---

## 6. Implementation plan (overview)

Three phases, each independently verifiable:

### Phase 1 — Repair broken cross-references from the move

Update the following files to replace `docs/guides-agent-skills/` → `docs/guides/` and `./guides/<target>/` → `../../../docs/guides/<target>/` (relative to file location):

| File | Specific changes |
| ---- | ---------------- |
| `README.md` | Lines 69–72 (4 table rows) and line 74 (See-also link) |
| `packages/core/src/__tests__/guides.test.ts` | Line 8: `DOCS_ROOT` resolves to `docs/guides-agent-skills` → `docs/guides`; line 27: `resolve(DOCS_ROOT, 'guides', target)` → `resolve(DOCS_ROOT, target)`; line 70: test label `'docs/guides-agent-skills/README.md exists'` → `'docs/guides/README.md exists'` (also adjust inner path). |
| `docs/archive/guides-agent-skills/README.md` | Lines 13–16: `./guides/<target>/` → `../../../docs/guides/<target>/` (3 dirs up). Add an editor's-note paragraph at the top noting the move. |
| `docs/archive/guides-agent-skills/overview.md` | ~40+ references to `docs/guides-agent-skills/` → `docs/guides/` (single sed replace, safe — no other `guides-agent-skills` token in scope). |
| `docs/archive/guides-agent-skills/phase-1-shared-structure.md` | Reference updates. |
| `docs/archive/guides-agent-skills/phase-2-webix-datagrid.md` | Reference updates. |
| `docs/archive/guides-agent-skills/phase-3-webix-pivot.md` | Reference updates. |
| `docs/archive/guides-agent-skills/phase-4-ag-grid-datagrid.md` | Reference updates. |
| `docs/archive/guides-agent-skills/phase-5-ag-grid-pivot.md` | Reference updates. |
| `docs/archive/guides-agent-skills/phase-6-index-and-verify.md` | Reference updates. |

The sed pattern is `s|docs/guides-agent-skills|docs/guides|g` for files where the only `guides-agent-skills` token in scope refers to the directory (true for all of the above based on the grep results in this spec's investigation).

**Verification:**
- `node scripts/check-broken-links.mjs docs/archives/guides-agent-skills/` exits 0 (note: `archive/` is in SKIP_DIRS by default, so a more useful check is `node scripts/check-broken-links.mjs docs/archive/guides-agent-skills/README.md docs/archive/guides-agent-skills/overview.md` — but `scripts/check-broken-links.mjs` skips `archive/` directories entirely. Either remove that skip *just for this one-shot check*, or rely on grep audit).
- `node scripts/check-broken-links.mjs docs/` exits 0 (only live docs scanned; broken paths in archive are not flagged).
- `grep -rn 'guides-agent-skills' --include='*.md' --include='*.ts' .` returns no matches outside `docs/archive/guides-agent-skills/` (archive may keep references to itself, but live docs must be clean).

### Phase 2 — Ship `docs/guides/` with the npm tarball

In `packages/react/package.json`:

```jsonc
"files": ["dist", "../../docs/guides"]
```

Rationale for `../../`:
- `files` is resolved relative to the package directory (`packages/react/`)
- `../../docs/guides` → `docs/guides/` at the repo root
- npm `files` patterns use minimatch; `../../docs/guides` is treated as a glob and matches everything underneath (including the four `<target>/` subdirectories and their `SKILL.md` + `guide.md` files)

**Verification:**
- `pnpm --filter @lynellf/tablekit-react pack --dry-run 2>&1 | grep -E '^npm notice.*guides'` — should list 8 files (`docs/guides/<target>/SKILL.md` + `docs/guides/<target>/guide.md` × 4 targets).
- `tar -tzf` (after a real `pack`) contains all 8 paths.

### Phase 3 — Confirm m6-hardening archival disposition

This phase is documentation-only. Add a one-paragraph recommendation to the plan artifact's "outcome" section:

> The m6-hardening *plan* is fully archived at `docs/archive/m6-hardening/` (ARCHIVE-MANIFEST.md status `approve`, v1.0 declared complete 2026-07-06). The *live* `docs/m6-hardening/api-freeze.md` and `docs/m6-hardening/sr-matrix.md` are the v1.0 canonical deliverables and must remain at that path — they are referenced by 20+ files (every package README, all recipes, all guides, the root README, `docs/release-process.md`, the release-process OKF doc, and the documentation-conventions OKF doc). No path changes are recommended.

No file changes in this phase.

**Verification:**
- The plan artifact contains the recommendation paragraph.
- `git status` after Phase 1 + 2 shows no changes under `docs/m6-hardening/` (other than possibly adding a `.gitkeep` if the user later empties the directory — not recommended in this plan).

---

## 7. Acceptance criteria

| # | Criterion | How verified |
| - | --------- | ------------ |
| AC1 | `docs/guides/<target>/{SKILL.md,guide.md}` (8 files total) ship in the published `@lynellf/tablekit-react` tarball | `pnpm --filter @lynellf/tablekit-react pack --dry-run` lists all 8 paths; tarball `tar -tzf` contains them |
| AC2 | Root `README.md` "Guides & agent skills" section links resolve to `docs/guides/` (live path) | `grep -n './docs/guides/' README.md` returns the updated rows |
| AC3 | `packages/core/src/__tests__/guides.test.ts` `DOCS_ROOT` resolves to `docs/guides` and the smoke test still passes | `pnpm --filter @lynellf/tablekit-core test guides.test.ts` passes (22/22 was the previous count; expect the same) |
| AC4 | All archive cross-references in `docs/archive/guides-agent-skills/` point to live paths (`docs/guides/<target>/`) | `grep -rn 'docs/guides-agent-skills' --include='*.md' --include='*.ts' .` outside `docs/archive/guides-agent-skills/` returns no matches |
| AC5 | `node scripts/check-broken-links.mjs docs/` exits 0 | Direct invocation |
| AC6 | `pnpm verify` exits 0 (typecheck && lint && test && build) | Direct invocation |
| AC7 | `docs/m6-hardening/` still contains `api-freeze.md` and `sr-matrix.md` (no inadvertent deletion) | `git status` shows no changes to that directory |
| AC8 | Plan artifact documents the m6-hardening disposition recommendation | Plan contains §6 Phase 3 paragraph |

## 8. Risks & mitigations

| Risk | Mitigation |
| ---- | ---------- |
| `npm pack` chokes on `../../docs/guides` (some npm versions reject `..` in `files`) | If so, fall back to `vite-plugin-static-copy` (already a familiar pattern in this repo's build setup) to copy `docs/guides/` into `packages/react/dist/guides/` at build time. Documented as a backup path in the plan. |
| Tarball size grows by ~70KB (8 markdown files) | Acceptable — well under the npm 250KB warning threshold; docs are an explicit deliverable. |
| The `docs/archive/guides-agent-skills/README.md` index file duplicates the work of the new (not-yet-created) `docs/guides/README.md` | Add a one-line "moved" header to the archive README pointing to the live index; do not create a new live README (matches the recipes pattern where `docs/recipes/README.md` exists but recipes are not nested under another README). |
| Future plans might add new targets to `docs/guides/` — they will not be auto-shipped unless the `files` glob stays broad | The `../../docs/guides` glob is recursive, so any future `<target>/{SKILL.md,guide.md}` ships automatically. No further action. |

## 9. Out of scope (explicit)

- **Renaming `docs/m6-hardening/api-freeze.md`.** Would require updating 20+ files. Not requested. Stays at `docs/m6-hardening/api-freeze.md`.
- **Renaming `docs/m6-hardening/sr-matrix.md`.** Same rationale. Stays.
- **Adding a `docs/guides/README.md` live index.** Not strictly required (root `README.md` already links each target directly). Could be a separate follow-up plan if desired.
- **Updating `docs/recipes/README.md` to link to `docs/guides/`.** Originally flagged as advisory in the guides-agent-skills plan; still advisory, not part of this plan.
- **Updating `.okf/concepts/documentation-conventions.md`** to document the `docs/guides/` convention. Surfaced as a knowledge candidate for `okf-curator` to do in a separate visit.

## 10. Knowledge candidates (for `okf-curator`)

- `docs/guides/` directory convention: per-target subdirectory contains exactly two files (`SKILL.md` + `guide.md`); the SKILL.md uses agent-skill frontmatter and the guide.md uses recipe-style body sections; both cite `docs/m6-hardening/api-freeze.md` in a "Verified against" footer. **Confidence: high** — derived from existing files.
- m6-hardening dual disposition: plan artifacts are archived; live canonical v1.0 deliverables remain at the milestone path. **Confidence: high** — derived from `.okf/concepts/documentation-conventions.md` and the existing `docs/m6-hardening/api-freeze.md` referencing pattern.
- `npm pack` `files` field with `..` traversal: relative paths in `files` may resolve outside the package directory; works in npm 10+. **Confidence: medium** — standard npm behavior, but should be verified with a `pack --dry-run` after the change lands.

## 11. Verification commands (single command sequence)

```bash
# Phase 1
grep -rn 'guides-agent-skills' --include='*.md' --include='*.ts' --include='*.json' . | grep -v 'docs/archive/guides-agent-skills/'
# Expected: no output (live docs are clean)

# Phase 2
pnpm --filter @lynellf/tablekit-react pack --dry-run 2>&1 | grep -E 'docs/guides/'
# Expected: 8 file paths

# Phase 3 (smoke)
pnpm verify
# Expected: exit 0
```

## 12. Plan artifact path

This spec: `docs/plans/guides-ship-and-archive-reorg/spec.md`

Plan phases (after spec approval): `docs/plans/guides-ship-and-archive-reorg/phase-1-*.md`, `phase-2-*.md`, `phase-3-*.md`.