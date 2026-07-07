# Phase 1 — Rewrite Per-Package READMEs to Document the API Surface

**Slug:** `readme-api-surface-overhaul`
**Phase:** 1 of 2
**Status:** Draft

## Goal

Replace each of the four per-package `README.md` files with a version that retains the existing per-package template (per `.okf/concepts/documentation-conventions.md`) and **adds an `## API` section plus feature-specific subsections** (Events, PivotTable support, etc.) so a first-time reader can answer "does this package support X?" without opening source.

## Background

- The current READMEs (39–51 lines each) document install + a 5-line snippet + status + sibling table + bugs + license. They do not enumerate the API surface or feature set.
- The previous README pass (`docs/archive/v1-release-readiness/phase-3-per-package-readmes.md`) focused on **status accuracy + cross-links + correct hook name**. This phase builds on that and extends the structure.
- The user has explicitly flagged: (a) can't tell if react supports pivot tables, (b) can't tell if event handling is supported, (c) wants the API surface defined in ALL readme files. This phase addresses all three directly.
- Source-of-truth for the API is `docs/m6-hardening/api-freeze.md`. Each README must enumerate the exports it owns and link out to the freeze doc for the authoritative list.

## Files to change

- `packages/core/README.md` — rewrite.
- `packages/react/README.md` — rewrite.
- `packages/pivot/README.md` — rewrite.
- `packages/worker/README.md` — rewrite.

No code files. No `package.json`. No `docs/m6-hardening/api-freeze.md`.

## Per-package content requirements

### `packages/core/README.md`

**New / expanded sections** (above the existing `## Packages` section):

- **Quick start** — extended to a 7–10-line snippet showing `createDataTable` with `data` + `columns`, an `onCellClick` event handler, and a state subscription.
- **`## API`** — bullets enumerating:
  - Factory: `createDataTable`, `defaultGetRowId`
  - Column model: `Column`, `createColumns`, `resolveAccessor`
  - Registries: `BUILT_IN_SORTING_FNS`, `BUILT_IN_FILTER_FNS`, `builtInSortingFns`, `builtInFilterFns`, `getSortingFn`, `getFilterFn`, `registerSortingFn`, `registerFilterFn`
  - State engine helpers: `resolveUpdater`, `applySliceChange`, `isSliceControlled`, `mergeInitialState`, `controlledSliceKeys`, `stateChangedOnSlices`, plus the `*Generic` variants
  - Utils: `identity`, `shallowEqual`, `assertNever`
  - Row pipeline: `filterRows`, `sortRows`, `toggleSortItem`, `paginateRows`, `computePageCount`, `buildRowModel`, `columnsForRowModel`
  - Column ordering / visibility: `moveColumn`, `toggleColumnVisibility`, `toggleAllColumnsVisibility`
  - Pinning: `togglePinColumn`, `pinColumns`, `unpinColumns`
  - Resize: `resizeColumn`, `cancelResize`, `clampColumnSize`, `DEFAULT_RESIZE_STEP_PX`
  - Keyboard nav: `KEY_BINDINGS`, `navigateCell`, `navigateToEdge`, `navigateByPage`, `resolveKeyBinding`
  - Faceting: `getFacetedUniqueValues`, `getFacetedMinMax`
  - Prop getter utilities: `mergeProps`, `chainHandlers`, `shouldRunLibraryHandler`
  - Announcer: `noopAnnouncer`, `setGlobalAnnouncer`, `getGlobalAnnouncer`
  - DataSource runtime: `createClientDataSource`
- **`## Events`** — list the interaction callback option keys (`onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`, `onRowDoubleClick`, `onHeaderClick`) with the `CellEventContext` shape (`{ table, row, column, cell, value, rowIndex, colIndex, source }`) and the `InteractionSource` union (`'mouse' | 'keyboard' | 'touch'`). Include a 5-line snippet wiring `onCellClick` on `createDataTable`.
- **`## State model`** — list the slices: `sorting`, `columnFilters`, `pagination`, `columnOrder`, `columnVisibility`, `columnPinning`, `columnSizing`, `columnSizingInfo`, `focusedCell`. Point at `DataTableState` type for the full shape.
- **`## TypeScript types`** — link to the canonical `DataTableState`, `DataTableOptions`, `DataTableInstance` interfaces in the `.d.ts` and to `docs/m6-hardening/api-freeze.md`.

**Keep** (unchanged): title, one-line tagline, install block, status badge, sibling `## Packages` table, bugs link, MIT license.

### `packages/react/README.md`

**New / expanded sections**:

- **Quick start** — extended to a runnable React component (`function MyTable`) using `useDataTable` with `data` + `columns`, with `<table.Announcer />` rendered, with the returned `gridRef` assigned to the grid div, and with an `onCellClick` passed through. (Note: the existing snippet already uses `useDataTable` correctly per the previous pass.)
- **`## API`** — bullets enumerating:
  - DataTable hook: `useDataTable`
  - Pivot hook: `usePivotTable`
  - DataSource hook: `useDataSource`
  - Virtualization hooks: `useRowVirtualizer`, `useCenterVirtualizer`, `useScrollAdapter`, `useSizeObserver`
  - Resize hook: `useResizeHandle`
  - Keyboard nav hooks: `useKeyboardNav`, `useTabBehavior`
  - Announcer: `ReactAnnouncer`, `getReactAnnouncer`
  - i18n: `defaultMessages`, `AnnouncerKey`, `MessagesMap`
  - Pivot treegrid keyboard: `resolveTreegridKeyAction`, `applyTreegridAction`
  - Core re-exports (so consumers can import from one place)
  - Pivot re-exports

  > **Note on the original `Validation: validate` bullet**: removed. `validateGridStructure` exists in `packages/react/src/validate.ts` as a dev-only ARIA-structure helper but is **not exported** from `packages/react/src/index.ts`, and there is no `validate` export at all. Per the plan's own cross-package consistency rule ("each Quick start snippet must compile against the package's actual public exports — cross-checked against `packages/<name>/src/index.ts`"), the README must not advertise an export that doesn't exist. The `## i18n` + pivot/cell-event callouts already give readers a path to accessibility feedback (`useDataTable` + `InteractionOptions` + `ReactAnnouncer`); surfacing an internal validator as a public API would be a documentation lie. (This resolves `plan-reviewer-b`'s visit-1 concern #1.)
- **`## PivotTable support`** *(explicit callout, addresses the user's pain point directly)* — yes, pivot tables are supported via `usePivotTable(options)`. Two install paths: (1) install `@lynellf/tablekit-pivot` as an optional peer dependency and use `usePivotTable`, or (2) install `@lynellf/tablekit-pivot` + `@lynellf/tablekit-worker` and use `createWorkerEngine` for off-thread aggregation. Link to `packages/pivot/README.md` and `packages/worker/README.md`.
- **`## Events`** — describe that `useDataTable` accepts the same interaction callbacks (`onCellClick`, `onRowClick`, `onHeaderClick`, etc.) as core, with a 5-line snippet. Note that events are wired via `DataTableOptions` so behavior is identical to the core factory.
- **`## Server modes`** — describe that `useDataSource(table, source)` integrates a `DataSource` for server-side pagination, sorting, and filtering. Reference `docs/m3-server-modes/api-freeze.md`.
- **`## Virtualization`** — describe `useRowVirtualizer` and `useCenterVirtualizer`. Reference the `layout.md` recipe.
- **`## i18n`** — describe `defaultMessages` and the `messages?` option on `useDataTable` / `usePivotTable`.
- **`## TypeScript types`** — link to the canonical `UseDataTableOptions`, `UseDataTableResult`, `UsePivotTableOptions`, `UsePivotTableResult` types and to `docs/m6-hardening/api-freeze.md`.

**Keep**: title, tagline, install (note peer deps), status, sibling table, recipes links, bugs, license.

### `packages/pivot/README.md`

**New / expanded sections**:

- **Quick start** — extended to an 8-line snippet using `createPivotTable` with `data`, `rows` field refs, `values` measure defs, `sumAggregator`, and `getLeafColumns()` / `getVisibleRows()`.
- **`## API`** — bullets enumerating:
  - Factory: `createPivotTable`, `defaultGetRowId`
  - Built-in aggregators: `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
  - Aggregator registry: `registerAggregator`, `getAggregator`, `builtInAggregators`, `nameOfAggregator`
  - Visibility helpers: `getVisibleRows`, `getHeaderRows`
  - Prop getters: `getGridProps`, `getBodyProps`, `getHeaderProps`, `getRowProps`, `getRowHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`
  - Treegrid keyboard: `resolveTreegridKeyAction`, `applyTreegridAction` (also re-exported from `@lynellf/tablekit-react`)
  - Announcer helpers: `announceExpansion`, `announceSorting`, `announceTotals`
- **`## PivotTable`** — describe what a pivot config is: `rows` field refs, `values` measure defs (with `field`, `aggregator`, optional `formatter`), `cols` field refs for column grouping, `filters` for cross-filtering, `totals` config for grand-totals. Link to `PivotConfig` type.
- **`## Aggregators`** — describe the `Aggregator` interface (input → accumulator → output) and how to register a custom aggregator.
- **`## TypeScript types`** — link to `PivotTableOptions`, `PivotTableInstance`, `PivotConfig`, `MeasureDef`, `FieldRef`, `Aggregator`, `PivotRowNode`, `PivotColumnNode`, `PivotLeafColumn`, `PivotResult` and to `docs/m6-hardening/api-freeze.md`.

**Keep**: title, tagline, install (note peer dep `@lynellf/tablekit-core`), status, sibling table, bugs, license.

### `packages/worker/README.md`

**New / expanded sections**:

- **Quick start** — extended to a full worker wiring: a `pivot.worker.ts` file using `createWorkerEntry()`, and a main-thread snippet using `createWorkerEngine({ createWorker })`, calling `engine.setRows(data)`, then `engine.run(query)`.
- **`## API`** — bullets enumerating:
  - Main-thread: `createWorkerEngine`
  - Worker entry: `createWorkerEntry`
  - Serialization: `serializeQuery`
  - Bulk registration: `validateAggregatorRegistrations`, `validateFilterRegistrations`
  - Subpath exports: `@lynellf/tablekit-worker/protocol` (WorkerRequest, WorkerResponse, WirePivotQuery, RequestId), `@lynellf/tablekit-worker/server` (`createServerEngine`)
- **`## Worker engine`** — describe `createWorkerEngine({ createWorker })` returns an `AggregationEngine<TRow>` with `setRows`, `run(query)`, `subscribe`. Show a Vite-style snippet using `?worker` import suffix and a webpack-style snippet using `new Worker(new URL(...))`. Reference `docs/bundler-recipes.md`.
- **`## Server engine`** — describe `createServerEngine` from the `/server` subpath as a reference factory for non-browser server contexts (Node + http request handlers). Reference `docs/bundler-recipes.md`.
- **`## TypeScript types`** — link to `WorkerEngineOptions`, `WorkerEngine`, `WorkerEntryHandle`, `AggregatorRegistration`, `FilterRegistration` and to `docs/m6-hardening/api-freeze.md`.

**Keep**: title, tagline, install (note peer dep `@lynellf/tablekit-pivot`), status, sibling table, bugs, license.

## Cross-package consistency rules

- Every README's `## Status` block must say `v1.0.0 — stable. The public API is frozen.` and link to the canonical contract via the GitHub blob URL: `https://github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md` (NOT a relative in-repo path, which would break in the published tarball — see the previous README pass's verification rule).
- Every README's `## Install` block must show the full peer-dependency install command (e.g. `npm install @lynellf/tablekit-core @lynellf/tablekit-react`), not just the package's own name.
- No README may reference `docs/initial-spec.md` (in-repo path; broken on npm).
- Each README's Quick start snippet must compile against the package's actual public exports — cross-checked against `packages/<name>/src/index.ts` before commit.

## Step-by-step

1. Read the four source `packages/*/src/index.ts` files to confirm the exact export names being enumerated.
2. Draft `packages/core/README.md` first (it is the canonical surface; react/pivot/worker build on it).
3. Draft `packages/react/README.md` referencing core's exports.
4. Draft `packages/pivot/README.md` with pivot-specific surface.
5. Draft `packages/worker/README.md` with worker-specific surface.
6. Cross-check: every export listed in `## API` actually appears in the package's `index.ts`; every Quick start snippet uses only exported symbols.

## Verification (preparation, executed in Phase 2)

The verification script in Phase 2 extends the existing `phase-3-per-package-readmes.md` checks with:

- API section presence (grep `^## API`).
- Events section presence in core + react READMEs (grep `^## Events`).
- "Pivot" + `usePivotTable` mention in react README.
- Core README mentions `onCellClick` and `CellEventContext`.
- All four READMEs use the GitHub blob URL for the api-freeze link (not a relative path).
- All four READMEs mention their required peer dependencies.
- All four READMEs mention `v1.0.0` in the Status block.

## Out of scope for this phase

- Generating TypeDoc API references.
- New code examples beyond what fits in the per-package README.
- Recipes, examples, or any other docs file changes.
- Reordering the existing template sections (the documentation-conventions doc owns that).