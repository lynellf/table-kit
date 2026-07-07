# table-kit

Headless table primitives for the modern web — framework-free state engine, row pipeline, column model, PivotTable support, and first-class React adapters.

**Status:** v1.0.0 — stable. The public API is frozen. See [`docs/m6-hardening/api-freeze.md`](./docs/m6-hardening/api-freeze.md) for the v1.0 contract.

## Packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine, row pipeline, column model, and event system. |
| [`@lynellf/tablekit-react`](/packages/react) | React hooks, prop getters, announcer, and a11y validator for `@lynellf/tablekit-core`. |
| [`@lynellf/tablekit-pivot`](/packages/pivot) | Framework-free PivotTable primitives, aggregation engine, and treegrid prop getters. |
| [`@lynellf/tablekit-worker`](/packages/worker) | Worker-based pivot engine + message protocol + server engine reference factory. |

## Install

```bash
# Core only
npm install @lynellf/tablekit-core

# With React adapter
npm install @lynellf/tablekit-core @lynellf/tablekit-react

# With PivotTable support
npm install @lynellf/tablekit-core @lynellf/tablekit-pivot
npm install @lynellf/tablekit-core @lynellf/tablekit-pivot @lynellf/tablekit-worker
```

Requires Node ≥ 20.

## Quick start

```ts
import { createDataTable } from '@lynellf/tablekit-core';

const table = createDataTable({ data, columns });
table.getState();       // current state snapshot
table.subscribe(() => { /* re-render */ });
```

See the [v1.0 API contract](https://github.com/lynellf/tablekit/tree/main/docs/m6-hardening/api-freeze.md) for the full export surface.

## Server modes

The library supports server-side pagination, sorting, and filtering via the `DataSource` interface and `useDataSource` hook. See [`docs/m3-server-modes/api-freeze.md`](./docs/m3-server-modes/api-freeze.md) for the API surface.

A reference app demonstrating the four server mode patterns is at [`examples/m3-server-modes/`](./examples/m3-server-modes/).

## Recipes

Consumer-facing integration patterns. Each recipe is a self-contained copy-paste guide:

| Recipe | What it solves |
| --- | --- |
| [`docs/recipes/layout.md`](./docs/recipes/layout.md) | Virtualization + sticky pinning in one scroll container |
| [`docs/recipes/dnd-column-reorder.md`](./docs/recipes/dnd-column-reorder.md) | Pointer-based column reordering via dnd-kit |
| [`docs/recipes/kbd-column-reorder.md`](./docs/recipes/kbd-column-reorder.md) | Keyboard "grab" pattern (Space → Arrows → Space) |
| [`docs/recipes/split-pane.md`](./docs/recipes/split-pane.md) | Three viewports with scroll sync (for transformed parent layouts) |

See [`docs/recipes/README.md`](./docs/recipes/) for the full index.

## Guides & agent skills

Concept maps aligning table-kit's v1.0 feature surface against four external grid/pivot libraries. Guides ship inside the `@lynellf/tablekit-react` npm package at `node_modules/@lynellf/tablekit-react/docs/guides/<target>/`:

| Target | Description |
| --- | --- |
| [`docs/guides/webix-datagrid/`](./docs/guides/webix-datagrid/) | Webix DataTable → `@lynellf/tablekit-react` |
| [`docs/guides/webix-pivot/`](./docs/guides/webix-pivot/) | Webix Pivot → `@lynellf/tablekit-pivot` |
| [`docs/guides/ag-grid-datagrid/`](./docs/guides/ag-grid-datagrid/) | AG-Grid DataGrid → `@lynellf/tablekit-react` |
| [`docs/guides/ag-grid-pivot/`](./docs/guides/ag-grid-pivot/) | AG-Grid Pivot → `@lynellf/tablekit-pivot` |

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
