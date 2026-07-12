---
name: ag-grid-pivot
description: >
  Maps AG-Grid pivot features to table-kit's pivot engine and treegrid surface.
  Use when migrating from AG-Grid Enterprise pivot mode, evaluating table-kit's
  pivot engine, or building an AG-Grid-style pivot UI on top of table-kit-pivot.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: ag-grid-pivot
tablekit_packages:
  - @lynellf/tablekit-pivot
  - @lynellf/tablekit-core
  - @lynellf/tablekit-react
companion_guide: ./guide.md
---
<!-- Historical: true -->

# AG-Grid Pivot — table-kit concept map

This skill maps AG-Grid's pivot feature set onto `@lynellf/tablekit-pivot` and `@lynellf/tablekit-core` (v1.0). It covers `pivotMode`, `pivotResultFields`, `aggFunc`, `aggFuncs`, `pivotColumnGroupTotals`, `pivotRowTotals`, `pivotComparator`, and `expandablePivotGroup`. Subtotals-per-level and `processPivotResultColDef` (manual pivot column override) have no v1.0 analog.

## When to use this skill

- You are migrating an AG-Grid Enterprise pivot integration to table-kit.
- You are evaluating table-kit's pivot engine against AG-Grid Enterprise pivot mode.
- You are building an AG-Grid-style pivot configuration UI on top of table-kit-pivot.

## How to use it

1. Read the companion guide at `./guide.md` for the full concept map.
2. To build the integration, wire the v1.0 pivot surface per `docs/m6-hardening/api-freeze.md` §4 (pivot exports).
3. Use `examples/m4-pivot-main-thread/src/App.tsx` as a reference for `PivotConfig` shape.
4. For server-mode pivot, combine with `useDataSource` + `createWorkerEngine`.

## Out of scope

- Wiring code — this is a concept map, not an integration tutorial.
- AG-Grid Community features — see `../ag-grid-datagrid/guide.md`.
- Pivot UI construction (field drag-and-drop, config dialog) — consumer builds the UI; table-kit handles the engine.
- Live fetching of ag-grid.com docs — claims cite by published feature name.

## See also

- `./guide.md` (this skill's companion)
- `../ag-grid-datagrid/guide.md` (AG-Grid DataGrid → table-kit React)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract, pivot exports)
- `docs/initial-spec.md` §1, §9 (positioning and PivotTable specifics)
- `examples/m4-pivot-main-thread/src/App.tsx` (live `PivotConfig` usage reference)
