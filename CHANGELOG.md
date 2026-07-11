# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-07-11

### Added

- **Pivot table lifecycle API** — Added `PivotTableStatus`, `getStatus()`, `getError()`, and `dispose()` for synchronous and asynchronous aggregation engines.
- **Pivot query types** — Exported `InlinePivotFilter` and `PivotQueryFilter`, with support for inline field accessors, custom aggregators, and registered/declarative filters.
- **Package artifact validation** — Added declaration-only package builds and automated checks for published type targets and runtime boundaries.

### Changed

- **Pivot updates** — Pivot tables now normalize configuration changes, cancel stale computations, and refresh results when data, options, or engines change.
- **Package builds** — Main and subpath builds preserve generated declarations; React peer dependencies remain external in published bundles.
- **Repository metadata** — Updated package links and the core keyboard-navigation declaration target to match the current repository.
- **CI** — Pinned CI to the repository’s pnpm version and configured Vitest bail-count reporting.

### Fixed

- **Pivot aggregation** — Corrected row/column intersection values, grand totals, filtered column discovery, and handling of inline accessors and filters.
- **Pivot caching and serialization** — Prevented stale results for replaced datasets or function-valued query options and stripped main-thread-only predicates before worker serialization.

## [1.0.1] — 2026-07-07

### Changed

- **README.md** — Updated main README with `@lynellf/tablekit-pivot` and `@lynellf/tablekit-worker` package listings and install instructions.
- **Release process docs** — Streamlined release-process.md to reflect current workflow.
- **`packages/react/README.md`** — Complete documentation overhaul with full API reference, usage examples, type exports, and i18n guide.
- **`packages/core/README.md`** — Updated status to v1.0.0 stable; added cross-package links.
- **`packages/react/package.json`** — Added `docs` to published files; enhanced build script to copy guides into package.
- **`packages/pivot/src/index.ts`** — Updated `VERSION` constant to `'1.0.0'`.
- **Root `package.json`** — Added `pack:pivot`, `pack:worker`, `release:pivot`, and `release:worker` scripts.

### Added

- **`docs/guides/`** — New cross-library migration guides for Webix and AG-Grid (included in `@lynellf/tablekit-react` npm package).
- **Package READMEs** — Added `packages/pivot/README.md`, `packages/worker/README.md`, and `packages/react/docs/` directory.
- **Core tests** — Initial test suite scaffold in `packages/core/src/__tests__/`.

### Fixed

- Archived obsolete files (`api-freeze.md`, `sr-matrix.md`) from `docs/m6-hardening/`.

## [1.0.0] — 2026-07-06

### Added

- **`@lynellf/tablekit-core`** — Framework-agnostic table state engine with row pipeline, column model, and event system.
  - `createDataTable(options)` — primary table factory
  - `Column`, `createColumns` — column model
  - `filterRows`, `sortRows`, `paginateRows` — composable row pipeline stages
  - `moveColumn(id, toIndex)` — column reordering
  - `toggleColumnVisibility`, `toggleAllColumnsVisibility` — column visibility
  - `getFacetedUniqueValues`, `getFacetedMinMax` — faceting helpers
  - `mergeProps`, `chainHandlers` — prop getter utilities
  - `noopAnnouncer` — default no-op announcer
  - `TabBehavior` type (`'exit'` / `'cells'`) — M6 phase 2 addition
  - `DataSource` interface + server-side pagination, sorting, and filtering modes (M2)
  - Subpath exports: `tablekit-core/virtualization`, `tablekit-core/pagination`, `tablekit-core/server` (M3)

- **`@lynellf/tablekit-react`** — React adapter for `@lynellf/tablekit-core`.
  - `useDataTable(options)` — primary hook returning `UseDataTableResult` with all prop getters
  - `usePivotTable(options)` — pivot table hook (M4)
  - `useDataSource(table, source)` — server mode hook (M2)
  - `useRowVirtualizer`, `useCenterVirtualizer` — virtualization hooks
  - `useResizeHandle` — resize interaction hook
  - `useKeyboardNav`, `useTabBehavior` — keyboard navigation hooks
  - `ReactAnnouncer`, `getReactAnnouncer` — live-region announcer
  - `validate(source, options)` — ARIA validator
  - `defaultMessages`, `MessagesMap` — i18n announcer string map (M6 phase 1)
  - `tabBehavior?: 'exit' | 'cells'` option on `useDataTable` and `usePivotTable` (M6 phase 2)
  - Subpath exports: `tablekit-react/virtualization`, `tablekit-react/pagination`, `tablekit-react/server` (M3)

- **`@lynellf/tablekit-pivot`** — Framework-free PivotTable primitives and aggregation engine.
  - `createPivotTable(options)` — pivot table factory
  - Built-in aggregators: `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
  - `registerAggregator`, `getAggregator` — aggregator registry
  - Treegrid prop getters: `getGridProps`, `getRowProps`, `getToggleExpandedProps`, `getHeaderProps`, etc.
  - `announceExpansion`, `announceSorting`, `announceTotals` — announcer helpers
  - `getVisibleRows`, `getHeaderRows` — row accessors
  - Subpath exports: `tablekit-pivot/aggregators`, `tablekit-pivot/engine`, `tablekit-pivot/pivotTable`, `tablekit-pivot/serialize` (M4)

- **`@lynellf/tablekit-worker`** — Worker-based pivot engine and server engine reference factory.
  - `createWorkerEngine(options)` — web-worker aggregation engine
  - `createWorkerEntry()` — worker-side entry factory
  - `serializeQuery` — pivot query serialization
  - `validateAggregatorRegistrations`, `validateFilterRegistrations` — bulk registration helpers
  - Subpath exports: `tablekit-worker/protocol`, `tablekit-worker/server` (M5)

- **Bundler recipes** — Copy-paste worker-entry patterns for Vite, webpack, Rollup, and esbuild.

- **Recipe docs** — Four consumer-facing integration guides: virtualization + sticky pinning layout, dnd-kit column reorder, keyboard "grab" column reorder, and three-viewport split-pane with scroll sync.

### Changed

- **`tabBehavior` default: `'exit'`**. The grid exits focus on Tab (APG-conformant). Opt-in `'cells'` mode available for products that want Tab-through-cells navigation.
- **v1.x stability policy**: minor versions are additive (new exports, new type fields); patches are bug fixes only; breaking changes land in v2.0.

### Fixed

- Announcer strings now route through a centralized `messages` map, making per-key localization possible without forking announcer calls.

### Security

- Published packages use `sideEffects: false` for optimal tree-shaking.
- Peer dependencies declared for all cross-package dependencies (`@lynellf/tablekit-core` for react and pivot; `@lynellf/tablekit-pivot` for worker).
