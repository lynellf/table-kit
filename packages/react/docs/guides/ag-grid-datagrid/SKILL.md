---
name: ag-grid-datagrid
description: >
  Maps AG-Grid DataGrid features to table-kit's React hooks and state surface.
  Use when migrating from AG-Grid, evaluating table-kit against AG-Grid Community,
  or building an AG-Grid-compatible adapter on top of table-kit-react.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: ag-grid-datagrid
tablekit_packages:
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---
<!-- Historical: true -->

# AG-Grid DataGrid — table-kit concept map

This skill maps AG-Grid DataGrid's published feature set onto `@lynellf/tablekit-react` and `@lynellf/tablekit-core` (v1.0). It covers column definitions, row data, sorting, filtering, pagination, column pinning/resizing/reordering, row selection, server-side row model, and client-side row model. Row selection, cell editing, and global quick filter have no v1.0 analog.

Pivot features are **not** in scope here — see `../ag-grid-pivot/guide.md`.

## When to use this skill

- You are migrating an AG-Grid integration to table-kit.
- You are evaluating table-kit's feature parity against AG-Grid Community edition.
- You are drafting an ADR for an AG-Grid-compatible adapter (per `docs/initial-spec.md` §1).

## How to use it

1. Read the companion guide at `./guide.md` for the full concept map.
2. To build the integration, wire the v1.0 surface per `docs/m6-hardening/api-freeze.md`.
3. Use the recipes at `docs/recipes/` for sticky/pinning (`layout.md`), column reorder (`dnd-column-reorder.md`, `kbd-column-reorder.md`), and scroll-sync (`split-pane.md`).
4. For pivot features, see `../ag-grid-pivot/guide.md`.

## Out of scope

- Wiring code — this is a concept map, not an integration tutorial.
- Target-library style/theming — table-kit ships no CSS.
- Pivot-specific features — see `../ag-grid-pivot/guide.md`.
- Row selection (v1.5), cell editing (v2), global quick filter (v2), state persistence (v1.5).
- Live fetching of ag-grid.com docs — claims cite by published feature name.

## See also

- `./guide.md` (this skill's companion)
- `../ag-grid-pivot/guide.md` (AG-Grid Pivot → table-kit pivot)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/initial-spec.md` §1, §7–9 (feature surface)
- `docs/recipes/` (consumer-facing patterns)
