# Worker README Expansion — Plan Summary

**Slug:** `worker-readme-expansion`
**Type:** Documentation-only plan (single deliverable)
**Status:** Revised (v2) — ready for plan-reviewer-b

## Plan

A single phase covering the rewrite of `packages/worker/README.md`.

| # | Phase | File | Outcome |
|---|---|---|---|
| 1 | Rewrite the worker README | `phase-1-rewrite-worker-readme.md` | A parity-level README documenting API surface, React integration, and the worker-vs-server comparison. |

## Plan rationale

The work is bounded to one file with no dependency on code changes. Two prior archive plans (`v1-release-readiness/phase-3-per-package-readmes` and `readme-api-surface-overhaul/phase-1-rewrite-package-readmes`) had worker README rewrites in scope; neither was executed against `packages/worker/README.md`. This plan finishes that work and adds the two user-requested sections (React integration + worker-vs-server comparison).

## Deliverables

- `packages/worker/README.md` — rewritten to ~250-350 lines, structured per `.okf/concepts/documentation-conventions.md` plus the user-requested additions.
- `docs/worker-readme-expansion/overview.md` — this plan's overview.
- `docs/worker-readme-expansion/plan-summary.md` — this file.
- `docs/worker-readme-expansion/phase-1-rewrite-worker-readme.md` — implementation phase.

## Acceptance criteria recap

(Full list in `overview.md`. Headlines only.)

1. Structure parity with pivot/README.md and react/README.md.
2. `## Worker + React integration` section with a runnable `usePivotTable({ engine })` snippet.
3. `## Worker-based vs server-side aggregation` section with side-by-side code, decision table, and "alternatives, not mutually exclusive" framing.
4. API reference tables enumerating every export from `packages/worker/src/index.ts` plus subpath exports.
5. No broken relative paths; status badge links to GitHub blob URL of `docs/m6-hardening/api-freeze.md`.
6. All verification grep checks pass.

## Verification recap

A nine-step grep-based verification script is in `overview.md`. Expected outcome: zero failures. The script checks length, presence of canonical exports, presence of the two user-requested sections, subpath correctness, cross-link correctness, and absence of broken relative paths.

## Risks recap

Three risks identified in `overview.md`. All mitigated by phase steps that cross-check against `packages/{worker,react}/src/index.ts`.

## Effort estimate

Single phase, single file, no code change, no test addition. Approx 200-300 lines of new README content. Implementation phase contains the new README content in full so the implementer is executing against a known-good draft, not redrafting from scratch.

## Knowledge candidates

Optional durable-knowledge candidates surfaced during investigation (emit via `knowledge_candidates` in structured status):

- **Worker vs server engine distinction** — durable concept worth a `.okf/concepts/pivot-engines.md` entry. *Not* emitted by this plan; the `okf-curator` role owns `.okf/`. Mention here so the curator role can pick it up if it becomes a recurring planning concern.

## Reference

- Plan overview: `docs/worker-readme-expansion/overview.md`
- Phase 1 file: `docs/worker-readme-expansion/phase-1-rewrite-worker-readme.md`
- Sibling README standard: `packages/pivot/README.md`, `packages/react/README.md`
- Canonical API contract: `docs/m6-hardening/api-freeze.md`
- Documentation conventions: `.okf/concepts/documentation-conventions.md`
- Reference app: `examples/m5-pivot-engines/`
- Bundler recipes: `docs/bundler-recipes.md`
- Historical context: `docs/archive/v1-release-readiness/phase-3-per-package-readmes.md`, `docs/archive/readme-api-surface-overhaul/phase-1-rewrite-package-readmes.md`

## Revision history

- **v1 (initial):** Submitted by `mid-level-planner` visit 1. Plan-reviewer returned `REQUEST-CHANGES`:
  - **Blocker:** `Announcer` is not a value export of `@lynellf/tablekit-react`. The actual named component export is `ReactAnnouncer`. The v1 React integration snippet imported `Announcer` (which would fail at compile time), then destructured `Announcer: PivotAnnouncer` from `usePivotTable`, then rendered `<PivotAnnouncer />`. The destructuring step is actually valid (`usePivotTable` returns `{ pivot, state, Announcer, gridRef }` per `packages/react/src/usePivotTable.ts`), but the import is wrong and the snippet is confusing — better to import the named component directly.
  - **Clarification:** server barrel scope was incomplete; the API table omitted `retryChildren`, `createRefetchOrchestrator`, `RefetchState` (and `RefetchOrchestrator`).
- **v2 (this revision):** Both concerns addressed. Import line corrected to `import { usePivotTable, ReactAnnouncer }`; destructuring alias removed in both snippet locations; `<ReactAnnouncer />` rendered directly. Server subpath table now lists all three value exports; type table now includes `RefetchOrchestrator` and `RefetchState`. Cross-check step (#5) and source-of-truth note (#9 in phase file) updated to reflect the correct exports. No other plan changes.