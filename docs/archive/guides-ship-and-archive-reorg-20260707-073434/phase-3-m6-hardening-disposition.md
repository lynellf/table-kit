# Phase 3 — Document m6-hardening archival disposition

**Goal:** Make the m6-hardening disposition explicit in the plan artifact so future maintainers do not re-litigate the "should we move m6-hardening to archive?" question. The m6-hardening *plan* is already archived; the *live* `docs/m6-hardening/` contents (api-freeze.md, sr-matrix.md) are v1.0 canonical deliverables and must stay where they are.

## 1. Why this phase is independent

This phase is documentation-only — no source code, no public API, no package.json. It can be completed independently of Phases 1 and 2. It exists so the question "if m6-hardening is complete, may we move it to the archive and update any paths as well?" is answered in writing, with evidence and cross-references.

## 2. Files changed (exact list)

This phase adds **zero** source-code files. It produces one artifact:

| File | Change class | Purpose |
| ---- | ------------ | ------- |
| `docs/plans/guides-ship-and-archive-reorg/plan-summary.md` | Created | The plan summary (post-implementation) records the m6-hardening disposition recommendation in §4 |

(No new artifact is created here beyond the existing plan-summary.md slot, which is filled in after implementation per the standard plan lifecycle.)

## 3. Disposition recommendation (verbatim, for the plan-summary §4)

> The m6-hardening *plan* is fully archived at `docs/archive/m6-hardening/`. The archive contains the plan's `overview.md`, `phase-1..5` files, `plan-summary.md`, and `ARCHIVE-MANIFEST.md` (status: `approve`, v1.0 declared complete 2026-07-06, 533 tests passing across M0–M6).
>
> The *live* `docs/m6-hardening/` directory contains exactly two files: `api-freeze.md` and `sr-matrix.md`. These are **v1.0 canonical deliverables**, not plan artifacts:
>
> - `api-freeze.md` is the canonical v1.0 API contract. It is referenced by 20+ files across the repo: every per-package README, the root `README.md`, every recipe in `docs/recipes/`, every guide in `docs/guides/`, `docs/bundler-recipes.md`, `docs/release-process.md`, `docs/initial-spec.md`, `.okf/concepts/documentation-conventions.md`, and `.okf/workflows/release-process.md`.
> - `sr-matrix.md` is the a11y release-gate document. It is referenced by `docs/release-process.md` §4 and `.okf/workflows/release-process.md`.
>
> **Per `.okf/concepts/documentation-conventions.md`:** "the final v1.0 canonical contract at `docs/m6-hardening/api-freeze.md`" — the convention requires it stays at that path.
>
> **Recommendation:** No path changes. The plan artifacts remain archived; the v1.0 deliverables remain at `docs/m6-hardening/{api-freeze,sr-matrix}.md`. If a future maintainer wants better naming, a rename to `docs/v1.0-api-freeze.md` is feasible but is out of scope for this plan (would touch 20+ cross-references and should be a separate, focused plan).

## 4. Evidence

### 4.1 The m6-hardening plan is archived (already done)

`docs/archive/m6-hardening/ARCHIVE-MANIFEST.md` records:

```
## Archive Date
2026-07-06

## Original Goal
Implement M6 of `@docs/initial-spec.md` — Final hardening milestone:
- SR manual matrix
- Docs (recipes: layout, DnD reorder, keyboard reorder, split-pane)
- Benchmarks in CI
- API review → v1.0 complete

## Outcome Summary
**APPROVED** by reviewer with v1.0 declared complete:
- `pnpm typecheck` — PASS
- `pnpm test` — PASS (533 tests across M0–M6, all green)
- TypeScript errors: 0
- v1.0 API frozen per `api-freeze.md`
- All four packages `1.0.0` released
```

### 4.2 The live `docs/m6-hardening/api-freeze.md` is the v1.0 contract (not a plan)

From `docs/m6-hardening/api-freeze.md` line 1:

```
# v1.0 API Freeze

> Canonical API contract for v1.0.0 — the npm release published from this repo.
> This document replaces the per-milestone freezes (`docs/mN-*/api-freeze.md`).
> Last verified: 2026-07-06.
```

Note the wording: "This document **replaces** the per-milestone freezes" — it is the post-milestone canonical document, not a milestone plan.

### 4.3 The `sr-matrix.md` is a release-gate process document

From `docs/m6-hardening/sr-matrix.md` §1:

```
This matrix is the **release gate** for v1.0 and any future a11y-affecting change.
```

It is a process document that stays active for the life of the v1.x line. Moving it to archive would make the release process ungovernable.

### 4.4 Per-milestone freezes already exist as archives

From `.okf/concepts/documentation-conventions.md`:

> API freeze documents live at `docs/m*-*/api-freeze.md` per milestone, with the final v1.0 canonical contract at `docs/m6-hardening/api-freeze.md`. Historical freezes are archived at `docs/archive/api-freeze-history/`. The canonical freeze supersedes per-milestone freezes.

This convention explicitly distinguishes: (a) per-milestone *plan* freezes (archived), (b) v1.0 *canonical* freeze (stays at `docs/m6-hardening/`). Moving the canonical freeze would violate the documented convention.

### 4.5 Reference-counting (live cross-references that would break if moved)

A `grep` audit (run during this spec's investigation) found references to `docs/m6-hardening/api-freeze.md` in at least:

- `README.md` (root)
- `docs/release-process.md`
- `docs/initial-spec.md`
- `docs/recipes/README.md`
- `docs/recipes/layout.md`
- `docs/recipes/dnd-column-reorder.md`
- `docs/recipes/kbd-column-reorder.md`
- `docs/recipes/split-pane.md`
- `docs/bundler-recipes.md`
- `docs/guides/webix-datagrid/SKILL.md`
- `docs/guides/webix-datagrid/guide.md`
- `docs/guides/webix-pivot/SKILL.md`
- `docs/guides/webix-pivot/guide.md`
- `docs/guides/ag-grid-datagrid/SKILL.md`
- `docs/guides/ag-grid-datagrid/guide.md`
- `docs/guides/ag-grid-pivot/SKILL.md`
- `docs/guides/ag-grid-pivot/guide.md`
- `packages/core/README.md`
- `packages/react/README.md`
- `packages/pivot/README.md`
- `packages/worker/README.md`
- `.okf/concepts/documentation-conventions.md`
- `.okf/workflows/release-process.md`

(23 files.) Moving the file would touch every one of these references. Not in scope.

## 5. Verification

There is no runtime verification for this phase. The verification is **reading the plan-summary §4 and confirming**:

- The recommendation is present.
- The recommendation matches §3 above verbatim (or with non-substantive paraphrasing).
- The evidence cross-references in §4.1–§4.5 are accurate.

## 6. Acceptance criteria

- **AC7** (no changes under `docs/m6-hardening/`): confirmed by `git status` showing the directory unchanged after this phase.
- **AC8** (plan artifact documents the m6-hardening disposition recommendation): confirmed by reading the post-implementation `plan-summary.md` §4.

## 7. Rollback

N/A — this phase produces documentation only. Rolling back means deleting the plan-summary §4 paragraph, which has no runtime effect.

## 8. Files changed summary

```
docs/plans/guides-ship-and-archive-reorg/plan-summary.md  | 1 file created (post-implementation)
```

No source-code, docs/, packages/, or .okf/ files are modified by this phase.