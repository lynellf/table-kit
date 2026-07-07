# README API-Surface Overhaul — Plan Summary

**Slug:** `readme-api-surface-overhaul`
**Status:** Draft
**Estimated cost:** planner ~$1.20, implementer ~$1.50, reviewer ~$0.75 → ~$3.45 of the $15.00 budget.

## What this plan does

Brings every per-package `README.md` (core, react, pivot, worker) up to a documented API-surface standard so a first-time reader can answer "does this package support X?" without opening source. Specifically:

- Each README gains an `## API` section enumerating the public exports.
- Each README gains feature-specific subsections (`## Events`, `## PivotTable support`, `## Server modes`, `## Virtualization`, `## Aggregators`, `## Worker engine`, etc.) where applicable.
- Each README's Quick start is extended to a runnable minimal example.
- Each README states its required peer dependencies explicitly.
- Each README's status block and canonical-contract link are consistent with the previous README pass (use the GitHub blob URL; avoid in-repo paths).

## What this plan does NOT do

- Modify any code, exports, or `package.json` files.
- Re-architect the README template (`.okf/concepts/documentation-conventions.md` owns that).
- Generate TypeDoc API references.
- Add new recipes or examples.

## Why now

The user filed a documentation-quality complaint at v1.0.0 stating the READMEs are "needles in haystacks" and unsuitable for a 1.0.0 release. They specifically could not determine:

- Whether the react package supports pivot tables.
- Whether event handling is supported.

Both are explicitly addressed by Phase 1's per-package content requirements.

## Phases

1. **Phase 1 — Rewrite Per-Package READMEs** (`phase-1-rewrite-package-readmes.md`). Touches the four README files only.
2. **Phase 2 — Verification** (`phase-2-verification.md`). Eleven grep + bash blocks + `pnpm verify` + a `pnpm verify` workspace check. No file writes.

## Acceptance criteria

See `overview.md` §"Acceptance criteria" — twelve items, all grep-verifiable.

## Risk

- **Stale snippets** if exports drift between this plan and implementation. Mitigation: each Quick start snippet is cross-referenced against `packages/*/src/index.ts` in the verification phase.
- **Drift from the canonical contract** if the README `## API` section diverges from `docs/m6-hardening/api-freeze.md`. Mitigation: each `## API` section is structured as a categorized summary with a pointer to the freeze doc, not an authoritative list.

## History

This plan builds on `docs/archive/v1-release-readiness/phase-3-per-package-readmes.md`, which established the per-package README template and the version/peer-dep/link verification rules. We are **not** replacing that template; we are **filling in** the API-surface sections that pass left empty.

## Telemetry

- `okf_docs_read`: 4 (all four `.okf/` docs consulted before broad repo scan).
- `files_scanned_after_okf`: ~15.
- `stale_okf_hits`: 0.
- `missing_okf_hits`: 0.