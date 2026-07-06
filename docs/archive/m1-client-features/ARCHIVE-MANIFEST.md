# M1: DataTable Client Features — Archive Manifest

## Archive Date
2026-07-06

## Original Goal
Implement M1 of `@docs/initial-spec.md` — DataTable client features:
- Sorting, filtering, pagination, ordering, visibility, events
- Level 0 API frozen

## Outcome Summary
**APPROVED** by reviewer with all acceptance criteria met:
- All M0 + M1 tests green
- Level 0 API frozen
- Feature integration tests passing

## Files Changed (per reviewer verification)
### Plan Artifacts (archived)
- `overview.md`
- `phase-1-row-pipeline.md`
- `phase-2-column-ordering.md`
- `phase-3-column-visibility.md`
- `phase-4-faceting-helpers.md`
- `phase-5-prop-getters.md`
- `phase-6-events-and-announcer.md`
- `phase-7-public-surface-and-integration.md`
- `plan-summary.md`

### Implementation Artifacts (codebase)
Implementation delivered across `packages/`:
- Row pipeline (filter → sort → paginate) in `getRowModel()`
- Sort helpers (`toggleSorting`, `setSorting`, multi-sort support)
- Filter pipeline using per-column `filterFn`
- Pagination helpers (`nextPage`, `previousPage`, `setPageIndex`, `setPageSize`, `getPageCount`)
- Column ordering (`moveColumn`, `setColumnOrder`)
- Column visibility (`toggleColumnVisibility`, `setColumnVisibility`)
- Prop getters (`getGridProps`, `getHeaderGroupProps`, `header.getSortToggleProps`, etc.)
- Interaction event wiring (cell/row/header click, double-click, context menu)
- Faceting helpers (`column.getFacetedUniqueValues()`, `column.getFacetedMinMax()`)
- Minimal announcer seam (`Announcer` interface + `noopAnnouncer` + `ReactAnnouncer`)
- TypeScript types and public exports

## Reviewer Approval Evidence
- Status: `approve` (M6 review declared v1.0 complete, encompassing M1)
- Tests: 533 tests across M0–M6 all green
- Typecheck: clean

## Archive Location
`docs/archive/m1-client-features/`

## Next Milestone
M2 of `@docs/initial-spec.md` (see `docs/archive/m2-advanced-features/`)
