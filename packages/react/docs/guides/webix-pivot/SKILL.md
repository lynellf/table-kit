---
name: webix-pivot
description: >
  Maps Webix Pivot features to table-kit's pivot hooks and engine surface. Use when
  migrating from Webix Pivot, evaluating table-kit's pivot engine, or building a
  Webix Pivot-style UI on top of table-kit-pivot.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: webix-pivot
tablekit_packages:
  - @lynellf/tablekit-pivot
  - @lynellf/tablekit-core
  - @lynellf/tablekit-react
companion_guide: ./guide.md
---

# Webix Pivot — table-kit concept map

This skill maps Webix Pivot's published feature set onto `@lynellf/tablekit-pivot` and `@lynellf/tablekit-core` (v1.0). It covers structure (rows/columns/measures/filters), aggregation, totals, expansion, and sort. Subtotals-per-level, lazy engine, and mergeable aggregators are where table-kit is richer.

## When to use this skill

- You are migrating a Webix Pivot integration to table-kit.
- You are evaluating table-kit's pivot engine against Webix Pivot.
- You are building a Webix Pivot-style drag-and-configure UI on top of table-kit-pivot.

## How to use it

1. Read the companion guide at `./guide.md` for the full concept map.
2. To build the integration, wire the v1.0 pivot surface per `docs/m6-hardening/api-freeze.md` §4 (pivot exports).
3. Use `examples/m4-pivot-main-thread/src/App.tsx` as a reference for `PivotConfig` shape.
4. For server-mode pivot, combine with `useDataSource` + `createWorkerEngine`.

## Out of scope

- Wiring code — this is a concept map, not an integration tutorial.
- Pivot UI construction (field drag-and-drop, config dialog) — consumer builds the UI; table-kit handles the engine.
- Live fetching of webix.com docs — claims cite by published feature name.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract, pivot exports)
- `docs/initial-spec.md` §9 (PivotTable specifics)
- `examples/m4-pivot-main-thread/src/App.tsx` (live `PivotConfig` usage reference)
