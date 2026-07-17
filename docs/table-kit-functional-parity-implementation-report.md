# Table Kit MVP Functional Parity — Implementation Report

## Working tree

- Baseline commit: `f0e3e653f00a2c35e281e647c45493c2c2533017`
- Implementation branch: `mvp-functional-parity`
- Requested spec target: `fix/resolve-open-issues` (the checkout was already on
  `mvp-functional-parity`, so implementation preserved the active branch)
- Implementation commits:
  - `74bc025` — route the one-shot specification and create this report
  - `df523d1` — reset pagination after sorting
  - `110311e` — add the functional `DataGrid`
  - `cb9b958` — add the functional `PivotGrid`
  - `5bf7b2a` — add browser integration proof and public documentation
  - `971ef51` — close visible-loading and sparse focus-retention review gaps
  - `e5e5693` — finalize functional-parity evidence
  - `e31d870` — make frozen columns required parity scope
  - `30fac1e` — freeze pinned DataGrid columns
  - `7db6d60` — freeze generated PivotGrid column groups
  - `f82b84a` — add real-browser frozen-column proof and documentation
- Final report state: this report is the only tracked change after `f82b84a`;
  the user-provided `docs/table-kit-mvp-functional-parity-one-shot-spec.md`
  remains untracked and unchanged.

## Baseline verification

- `pnpm verify`: **FAIL** before implementation in the pre-existing packed-
  artifact checker after typecheck, lint, 77 Vitest files (779 passed, 1
  skipped), builds, isolated fixture installs/compiles/imports, and public
  export checks passed. The final no-source-escape phase used GNU `stat -c`,
  which macOS rejected with `stat: illegal option -- c`.
- `pnpm test:e2e`: **FAIL** before test discovery because the stale local
  install did not contain the Playwright command.

Both baseline failures were corrected in scope: the artifact checker now uses
portable Node filesystem APIs, and the lockfile was reconciled with the package
manifests so a frozen install restores the declared test tooling.

## Files and public APIs changed

### Public React surface

- Added `DataGrid`, `DataGridProps`, `DataGridHandle`, `DataGridRowEvent`,
  `DataGridCellEvent`, `RowSelectionState`, and `RowSelectionMode` exports.
- Added `PivotGrid`, `PivotGridProps`, and `PivotGridValueContext` exports.
- Added `PivotGridProps.onColumnPinningChange`, matching the existing pivot
  state callback contract already available to `DataGrid`.
- Added the `@lynellf/tablekit-react/styles.css` package subpath and marked CSS
  as a side effect.
- Added one shared fixed-geometry helper in
  `packages/react/src/virtualWindow.ts`.
- Added internal generated-group resolution in
  `packages/react/src/pivotColumnLayout.ts`.

### Required headless corrections

- Added row-selection state, callbacks, commands, and loaded-row accessors to
  the core table instance.
- Made sorting reset offset pagination to page zero, matching filtering.
- Added `retry()` and `retryRow(path)` to the pivot instance and corrected
  expansion prop getters to reflect the committed expanded state.
- Corrected delayed `DataSource` ownership under React Strict Mode so effect
  replay reattaches to one request without aborting it, while real unmount still
  releases pending work.

### Rendering, proof, and documentation

- Added `packages/react/src/DataGrid.tsx`, `DataGrid.types.ts`, and focused tests.
- Added `packages/react/src/PivotGrid.tsx`, `PivotGrid.types.ts`, and focused tests.
- Rendered left/right DataGrid pin regions around a center-only virtual window;
  the optional selection column remains fixed ahead of left-pinned columns.
- Rendered PivotGrid pin regions atomically by top-level generated column group;
  the row header remains fixed-left and the grand-total group remains
  right-pinned by default.
- Added four deterministic scenarios at
  `examples/m4-pivot-main-thread/src/FunctionalParityApp.tsx`.
- Added `e2e/functional-parity.spec.ts` for real-browser focus, virtualization,
  frozen-column geometry, event ordering, stale server work, and client/server
  pivot expansion.
- Extended the packed React consumer fixture and artifact checker for both
  component exports and the stylesheet subpath.
- Updated the root and example READMEs with imports, a feature matrix, browser
  location, and explicit non-goals.

## DataGrid acceptance

| ID | Status | Evidence |
| --- | --- | --- |
| DG-A1 | PASS | `DataGrid.test.tsx` exercises client filter, sort, and pagination with expected rows; the core row pipeline remains covered independently. |
| DG-A2 | PASS | The client component test and `createDataTable.test.ts` prove filter/sort reset `pageIndex` to zero. |
| DG-A3 | PASS | The server component test asserts exact offset queries for initial load, next page, and sort-reset load. |
| DG-A4 | PASS | The server component test proves prior signals abort and stale rows cannot publish; the browser test races a slow page against sorting. |
| DG-A5 | PASS | The server component test retains the last successful row/count through replacement loading and the latest request error. |
| DG-A6 | PASS | Unit and Playwright tests bound mounted row DOM by viewport/overscan. |
| DG-A7 | PASS | Unit and Playwright tests bound mounted center-column DOM by viewport/overscan. |
| DG-A8 | PASS | Core tests cover single/multiple semantics; the component test proves selected IDs persist through filter/sort/page changes and the handle returns loaded selected rows. |
| DG-A9 | PASS | Component and Playwright tests prove row/cell context plus native click-before-double-click ordering. |
| DG-A10 | PASS | Unit and Playwright tests keep the logical focused cell mounted and focused while both axes scroll. |
| DG-A11 | PASS | Component tests cover persistent grid/footer layout for empty, placeholder loading, and stale-row error states with retry. |
| DG-A12 | PASS | The isolated packed React fixture compiles and runtime-imports `DataGrid`; public-surface and stylesheet-subpath checks pass. |

## PivotGrid acceptance

| ID | Status | Evidence |
| --- | --- | --- |
| PV-A1 | PASS | Existing aggregator tests cover `sum`, `count`, `min`, `max`, and `avg`; the final full suite passes all 23 aggregator tests. |
| PV-A2 | PASS | Engine/header tests plus `PivotGrid.test.tsx` prove multiple measures, stable leaves, and generated hierarchy spans. |
| PV-A3 | PASS | The client component fixture filters out 2023 before aggregation and asserts the resulting totals. |
| PV-A4 | PASS | Component, engine, and totals tests assert the grand-total row and column values. |
| PV-A5 | PASS | Component and Playwright tests expand/collapse client paths and render/remove the expected descendants. |
| PV-A6 | PASS | The server component test asserts `computeChildren` is called only with `['West']` and the committed query. |
| PV-A7 | PASS | Pivot instance tests prove stale root and child results cannot publish; browser expansion uses delayed server work. |
| PV-A8 | PASS | The server component test leaves the East row usable when the West child path fails. |
| PV-A9 | PASS | The child retry test replaces the West error with loaded Q1 children and makes one retry call for that path. |
| PV-A10 | PASS | The component test bounds pivot row and leaf-column DOM before and after two-axis scrolling. |
| PV-A11 | PASS | Component and Playwright tests assert `treegrid` hierarchy roles and committed `aria-expanded` state in client and server modes. |
| PV-A12 | PASS | The isolated packed React fixture compiles and runtime-imports `PivotGrid`; public-surface checks pass. |

## Commands and outcomes

- `pnpm exec vitest run packages/react/src/DataGrid.test.tsx packages/react/src/PivotGrid.test.tsx packages/react/src/__integration__/strict-mode-data-source.test.tsx --maxWorkers=1 --no-file-parallelism`:
  **PASS** before the frozen-column extension, 3 files and 16 tests.
- `pnpm exec vitest run packages/react/src/DataGrid.test.tsx packages/react/src/PivotGrid.test.tsx --maxWorkers=1 --no-file-parallelism`:
  **PASS**, 2 files and 13 tests including left/right geometry, center-only
  virtualization, atomic Pivot groups, focus order, and duplicate-cell guards.
- `pnpm exec vitest run packages/react/src --maxWorkers=1 --no-file-parallelism`:
  **PASS**, 30 React-package files; 169 passed and 1 skipped.
- `pnpm lint && pnpm typecheck && pnpm --filter m4-pivot-main-thread-example build`:
  **PASS**.
- `pnpm exec playwright test functional-parity.spec.ts --config=playwright.config.ts`
  from `e2e/`: **PASS**, 5 Chromium tests including frozen screen-coordinate
  checks for DataGrid and PivotGrid.
- `pnpm verify`: **PASS** on the final network-enabled run.
  - TypeScript project build: passed.
  - Biome: 269 files checked, no fixes required.
  - Vitest: 79 files passed; 797 tests passed and 1 skipped (798 total).
  - Core, pivot, React, worker, and all subpath builds: passed.
  - Packed artifacts: all four tarballs installed, compiled, and executed in
    isolated fixtures; 18 public entry points passed; no workspace/source/dist
    escapes; React remained external; docs/public-surface checks passed.
- `pnpm test:e2e`: **PASS**, 21 Chromium tests including all four functional-
  parity scenarios, frozen-column geometry, and the existing pivot/browser
  checks.

One earlier sandboxed final `pnpm verify` attempt reached the artifact fixture
install and failed only because the sandbox could not resolve
`registry.npmjs.org`. The checker passed immediately with network access, and
the complete `pnpm verify` command was then rerun successfully with the same
access.

## Known deviations and failed criteria

- No required acceptance criterion is failed.
- The implementation branch differs from the target branch name written in the
  supplied spec because the actual checkout was already
  `mvp-functional-parity`; no branch switch or history rewrite was performed.
- Consumers must import `@lynellf/tablekit-react/styles.css` once. This is the
  documented default-stylesheet contract, and the browser host exercises the
  packed stylesheet subpath.
- Versions remain `2.0.0`; no package was published.
- Pin menus, drag-to-freeze interactions, and frozen rows remain intentionally
  out of scope. Freezing is programmatic through `columnPinning`.

## Browser examples

- Host: `examples/m4-pivot-main-thread/`
- Route: `http://localhost:5174/?functional-parity` when running the example
  directly, or `http://localhost:5173/?functional-parity` under the E2E host.
- Scenarios: client DataGrid with left/right pins, delayed offset-server
  DataGrid, client PivotGrid with an atomic left group and default-right total
  group, and delayed server PivotGrid with root/child requests.
- Browser tests: `e2e/functional-parity.spec.ts`.

## Frozen-column acceptance

| ID | Status | Evidence |
| --- | --- | --- |
| FZ-A1 | PASS | DataGrid component and Playwright tests verify left/right header and cell positions remain fixed through horizontal scroll. |
| FZ-A2 | PASS | PivotGrid component and Playwright tests verify fixed generated groups, row headers, and the default-right total group. |
| FZ-A3 | PASS | Both renderers feed only center columns to `getVirtualWindow`; pinned columns remain mounted before and after scroll. |
| FZ-A4 | PASS | Tests verify the selection column and Pivot row headers remain at the left viewport edge ahead of user pins. |
| FZ-A5 | PASS | Existing sorting, filtering, resize, event, focus, keyboard, and ARIA suites remain green; new tests verify pinned logical navigation. |
| FZ-A6 | PASS | Pinning one generated Pivot leaf promotes its complete top-level group; opposite sides in one group throw a descriptive configuration error. |
| FZ-A7 | PASS | Component and browser tests assert one header/cell instance per logical identity while pinned and center regions coexist. |

## Planning hierarchy confirmation

No new phase, remediation, or reviewer-decision hierarchy was created. This
report and the canonical one-shot specification are the only new
implementation-routing documents.
