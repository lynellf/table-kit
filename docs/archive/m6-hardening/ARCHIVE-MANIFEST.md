# M6: Hardening — Archive Manifest

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

## Files Changed (per reviewer verification)
### Plan Artifacts (archived)
- `api-freeze.md`
- `overview.md`
- `phase-1-announcer-messages-and-i18n.md`
- `phase-2-tab-behavior.md`
- `phase-3-recipes-docs.md`
- `phase-4-ci-benchmarks-and-bundler-recipes.md`
- `phase-5-sr-matrix-v1-api-freeze-and-verify.md`
- `plan-summary.md`
- `sr-matrix.md`

### Implementation Artifacts (codebase)
Implementation delivered across `packages/` and `docs/`:
- Announcer messages map (`packages/react/src/messages.ts`)
- i18n helper (`i18n/t.ts`)
- `tabBehavior` option (`useTabBehavior.ts`)
- Layout recipe (`docs/recipes/layout.md`)
- DnD column reorder recipe
- Keyboard column reorder recipe
- Split-pane recipe (`docs/recipes/split-pane.md`)
- Bundler recipes (`docs/bundler-recipes.md`)
- CI benchmarks job
- SR matrix verification
- Consolidated v1.0 API freeze

## Reviewer Approval Evidence
- Status: `approve`
- Test results: 533 tests passing
- Typecheck: clean
- Exit-criteria tests verified

## Archive Location
`docs/archive/m6-hardening/`

## v1.0 Declaration
This milestone marks the completion of v1.0 per `@docs/initial-spec.md` §14.
All milestones M0–M6 are now archived.
