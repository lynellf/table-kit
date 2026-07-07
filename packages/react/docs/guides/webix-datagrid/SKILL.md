---
name: webix-datagrid
description: >
  Maps Webix DataTable features to table-kit's React + core hooks. Use when
  migrating from Webix, evaluating table-kit against Webix, or building a Webix
  compatibility layer on top of table-kit.
type: guide-companion
verified_against: docs/m6-hardening/api-freeze.md v1.0.0
target: webix-datagrid
tablekit_packages:
  - @lynellf/tablekit-react
  - @lynellf/tablekit-core
companion_guide: ./guide.md
---

# Webix DataTable — table-kit concept map

This skill maps Webix DataTable's published feature set onto `@lynellf/tablekit-react` and `@lynellf/tablekit-core` (v1.0). It covers column/sort/filter/resize/pinning/virtualization concepts. Cell-editing, math expressions, clipboard, and export have no v1.0 analog in table-kit.

## When to use this skill

- You are migrating a Webix DataTable integration to table-kit.
- You are evaluating table-kit's feature parity against Webix DataTable.
- You are drafting the ADR for a Webix drop-in compatibility layer (per `docs/initial-spec.md` §11).

## How to use it

1. Read the companion guide at `./guide.md` for the full concept map.
2. To build the integration, wire the v1.0 surface per `docs/m6-hardening/api-freeze.md`.
3. Use the recipes at `docs/recipes/` for sticky/pinning patterns (`layout.md`), column reorder (`dnd-column-reorder.md`, `kbd-column-reorder.md`), and scroll-sync (`split-pane.md`).

## Out of scope

- Wiring code — this is a concept map, not an integration tutorial.
- Target-library style/theming — table-kit ships no CSS.
- Pivot-specific features — see `../webix-pivot/guide.md`.
- Cell editing, math expressions, clipboard, export — no v1.0 analog.
- Live fetching of webix.com docs — claims cite by published feature name.

## See also

- `./guide.md` (this skill's companion)
- `docs/m6-hardening/api-freeze.md` (v1.0 contract)
- `docs/initial-spec.md` §1, §7–9 (feature surface)
- `docs/recipes/` (consumer-facing patterns)
