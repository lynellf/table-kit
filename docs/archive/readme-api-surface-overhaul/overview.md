# README API-Surface Overhaul — Overview

**Slug:** `readme-api-surface-overhaul`
**Type:** Spec + Implementation Plan
**Status:** Draft

## Goal

Bring every `README.md` in this repo up to a documented **API-surface standard** so that a first-time reader can answer, without opening source, the questions:

1. What does this package do?
2. What is its complete public surface (functions, types, hooks, factories)?
3. Does it support the feature I'm looking for (pivot tables, event handling, server modes, virtualization, worker engines, i18n, validation)?
4. How do I install it and write a working snippet in under 60 seconds?
5. Where do I go for the full contract, recipes, and bug reports?

This addresses the user's complaint that `packages/pivot/README.md` and `packages/react/README.md` (and by extension the others) are "needles in haystacks" and unsuitable for a 1.0.0 release.

## What I found (investigation)

- **Four packages need docs**: `core`, `react`, `pivot`, `worker` — all already exist with stub READMEs ranging 39–51 lines.
- **Current READMEs are uniformly thin**: each contains title + 1-line tagline + install + 5-line usage + status badge + sibling-package table + bugs + license. None documents its API surface, event handling, prop getters, state model, or types.
- **OKF docs are present and useful**:
  - `.okf/concepts/documentation-conventions.md` defines the per-package README template already in use (title → one-line → install → usage → status → packages table → bugs → license). The fix is **not** to change the template; it's to **fill in the API-surface sections within that template**.
  - `.okf/workflows/release-process.md` confirms all four packages are part of v1.0 and share `docs/m6-hardening/api-freeze.md` as the canonical contract.
- **The actual API surface is well-defined in source** and already documented in `docs/m6-hardening/api-freeze.md`. The READMEs only need to **point to and summarize** this surface, with concrete runnable snippets per package.
- **User's specific concerns are addressable**:
  - "Can I tell if react supports pivot tables?" → React README must call out `usePivotTable` + re-exports of pivot surface.
  - "Can I tell if event handling is supported?" → Core README must document `InteractionOptions` (the `onCellClick`, `onRowClick`, etc. family from `events.ts`). React README must document the same callbacks as `useDataTable` options.
  - "API surface needs to be defined in ALL the readme files" → Every README gains an **API** section enumerating exported symbols.
- **History**: `docs/archive/v1-release-readiness/phase-3-per-package-readmes.md` previously wrote these READMEs at v1.0.0 status; that pass focused on **status text + cross-links + correct hook name** but did not enumerate the surface. We are explicitly **not** re-litigating template structure; we are **filling in** the API surface sections.
- **Constraint**: $15.00 total budget, ~$4.20–$5.00 for the plan → implement → review path. The work is documentation-only, no code change, low blast radius.

## Scope

**In scope:**

1. Rewrite each of the four package READMEs to a common structure (extending the existing per-package template from `.okf/concepts/documentation-conventions.md`).
2. Add an **API** section per README that enumerates the public exports with one-line descriptions and pointers to the canonical contract.
3. Add **Events** / **Pivot support** / **Server modes** / **Virtualization** / **Worker engines** as explicitly-named subsections wherever they apply.
4. Provide a runnable minimal example per package.
5. Verify against acceptance criteria.

**Out of scope:**

- Re-architecting the README template (the convention doc owns that).
- Modifying `docs/m6-hardening/api-freeze.md` (the canonical contract is correct; READMEs link to it).
- Adding TypeDoc or generating API reference docs.
- Modifying code, exports, or behaviors.
- New recipes or examples — the existing `docs/recipes/` and `examples/` are linked, not duplicated.

## Target per-package structure

Every per-package README follows this order (the existing template from `.okf/concepts/documentation-conventions.md` plus the new API-surface sections):

1. **Title** (`# @lynellf/<name>`) — unchanged.
2. **One-line pitch** — unchanged. Mirrors `description` in `package.json`.
3. **Install** — unchanged. Include exact peer-dependency install (e.g. `npm install @lynellf/tablekit-core @lynellf/tablekit-react`).
4. **Quick start** — extended from a 5-line snippet to a runnable **minimal example** that demonstrates the most-used path.
5. **Status** badge — unchanged.
6. **API** *(new)* — bulleted enumeration of the public surface (factories, hooks, types, helpers, registries, prop getters) with one-line descriptions.
7. **Feature sections** *(new, per-package)* — explicitly named subsections for the differentiating features:
   - core → **State model**, **Events**, **Row pipeline**, **Column model**, **Prop getters**
   - react → **Hooks**, **Events**, **Server modes**, **Virtualization**, **i18n**
   - pivot → **PivotTable**, **Aggregators**, **Treegrid keyboard**, **Serialization**
   - worker → **Worker engine**, **Server engine**, **Protocol**, **Bulk registration**
8. **Packages** (sibling table) — unchanged.
9. **TypeScript types** *(new)* — link to the canonical `.d.ts` and `docs/m6-hardening/api-freeze.md`.
10. **Bugs & Issues** — unchanged.
11. **License** — unchanged.

## Phases (this plan)

The plan is one **single phase** for implementation, plus verification. Documentation work is contiguous and small enough that splitting it per package adds overhead without value:

- **Phase 1** — Rewrite `packages/core/README.md`, `packages/react/README.md`, `packages/pivot/README.md`, `packages/worker/README.md` per the target structure above.
- **Phase 2** — Verify: README existence, version match, hook-name correctness, **API-surface section presence**, **events section presence in core + react**, **pivot support callout in react**, peer-dependency correctness, no broken in-repo spec links.

## Acceptance criteria

A reviewer must be able to confirm each item with `grep` or `read`:

- [ ] `packages/core/README.md` contains an `## API` section listing `createDataTable`, `createColumns`, `resolveAccessor`, the pipeline helpers (`filterRows`, `sortRows`, `paginateRows`), the registry exports, the column-order/visibility/pinning/resize/keyboard helpers, and the type exports.
- [ ] `packages/core/README.md` contains a `## Events` section documenting `onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`, `onRowDoubleClick`, `onHeaderClick`, the `CellEventContext` shape, and the `InteractionSource` union.
- [ ] `packages/react/README.md` contains an `## API` section listing `useDataTable`, `usePivotTable`, `useDataSource`, `useRowVirtualizer`, `useCenterVirtualizer`, `useResizeHandle`, `useKeyboardNav`, `useTabBehavior`, `ReactAnnouncer`, `getReactAnnouncer`, `validate`, `defaultMessages`, and the core/pivot re-exports.
- [ ] `packages/react/README.md` contains an **explicit callout that pivot tables are supported** (e.g. a `## PivotTable support` subsection or a paragraph that names `usePivotTable` and links to `@lynellf/tablekit-pivot`).
- [ ] `packages/react/README.md` contains a `## Events` section showing the same interaction callbacks as passthrough to core.
- [ ] `packages/pivot/README.md` contains an `## API` section listing `createPivotTable`, the built-in aggregators (`sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`), the registry helpers (`registerAggregator`, `getAggregator`, `builtInAggregators`, `nameOfAggregator`), and the prop getters (`getGridProps`, `getBodyProps`, `getHeaderProps`, `getRowProps`, `getToggleExpandedProps`, etc.).
- [ ] `packages/worker/README.md` contains an `## API` section listing `createWorkerEngine`, `createWorkerEntry`, `serializeQuery`, the bulk-registration helpers, and the subpath exports (`/protocol`, `/server`).
- [ ] Every README has a runnable Quick start that compiles against the published package names (use the actual exported symbols).
- [ ] Every README states its required peer dependencies explicitly (no guessing for the reader).
- [ ] Every README links to the canonical contract at `docs/m6-hardening/api-freeze.md` (GitHub blob URL, per the phase-3 verification rule that in-repo paths break in the published tarball).
- [ ] No README references the in-repo `docs/initial-spec.md` (broken in published tarball).
- [ ] Every README's reported version matches its `package.json` (all `1.0.0`).
- [ ] `pnpm verify` (typecheck + lint + test + build) still exits 0 after the rewrite (READMEs are not compiled, but the workspace check is cheap insurance).

## Files to change

- `packages/core/README.md` — rewrite (extend, do not throw away the existing template).
- `packages/react/README.md` — rewrite (extend, do not throw away the existing template).
- `packages/pivot/README.md` — rewrite (extend, do not throw away the existing template).
- `packages/worker/README.md` — rewrite (extend, do not throw away the existing template).

No code files, no other docs, no exports, no `package.json`.

## Telemetry

- `okf_docs_read`: 4 (all four `.okf/` docs).
- `okf_tokens_read`: ~2500 (estimated).
- `files_scanned_before_okf`: 0 (OKF was consulted first).
- `files_scanned_after_okf`: ~15 (all four README files, the four `index.ts`, `events.ts`, `types.ts`, `package.json` files, the api-freeze doc, the recipes index, the v1-release-readiness archive).
- `stale_okf_hits`: 0 (the documentation conventions doc remains accurate).
- `missing_okf_hits`: 0 (existing OKF coverage was sufficient).

## Risks

- **Stale snippets**: if a quick-start example references an export that no longer exists, `pnpm verify` won't catch it (README isn't compiled). Mitigation: spot-check each snippet against the current `packages/*/src/index.ts` re-export list.
- **Drift from the canonical contract**: the README API section must mirror `docs/m6-hardening/api-freeze.md`. Mitigation: the API section is structured to point at the freeze doc for the authoritative list, with one-line summaries.
- **Phase-3 verification rule reuse**: the previous README pass added `grep`-based verification. We extend that script with the new acceptance criteria (API section, Events section, pivot support callout).