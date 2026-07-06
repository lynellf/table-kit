# M3 Archive Manifest

This manifest records the artifacts created for M3 (Server Modes).

## Phase artifacts

| Phase | Plan file | Status |
|-------|-----------|--------|
| Phase 1 | `phase-1-rows-query-and-validation.md` | Implemented |
| Phase 2 | `phase-2-data-source-interface.md` | Implemented |
| Phase 3 | `phase-3-react-data-source-hook.md` | Implemented |
| Phase 4 | `phase-4-loading-and-aria-busy.md` | Implemented |
| Phase 5 | `phase-5-reference-app-and-integration.md` | Implemented |
| Phase 6 | `phase-6-abort-stale-render-loop-fix.md` | Implemented |
| Phase 7 | `phase-7-completing-m3.md` | Implemented |

## Reference app

- `examples/m3-server-modes/` — Vite + React 19 reference app demonstrating four M3 patterns

## Golden fixtures

- `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/01-empty.json`
- `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/02-sort-asc.json`
- `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/03-multi-sort.json`
- `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/04-filter-range.json`
- `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/05-paginated.json`

## Tests

- `packages/core/src/dataSource/__tests__/query.golden.test.ts` — golden fixture tests
- `packages/react/src/__integration__/abort-stale.test.tsx` — render-loop regression test

## API documentation

- `docs/m3-server-modes/api-freeze.md` — M3 surface freeze
