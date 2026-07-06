# table-kit

Headless table primitives for the modern web — framework-free state engine, row pipeline, column model, and a first-class React adapter.

**Status:** v1.0.0 — stable. The public API is frozen. See [`docs/m6-hardening/api-freeze.md`](./docs/m6-hardening/api-freeze.md) for the v1.0 contract.

## Packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-core`](/packages/core) | Framework-agnostic state engine, row pipeline, column model, and event system. |
| [`@lynellf/tablekit-react`](/packages/react) | React hooks, prop getters, announcer, and a11y validator for `@lynellf/tablekit-core`. |

## Install

```bash
# Core only
npm install @lynellf/tablekit-core

# With React adapter
npm install @lynellf/tablekit-core @lynellf/tablekit-react
```

Requires Node ≥ 20.

## Quick start

```ts
import { createDataTable } from '@lynellf/tablekit-core';

const table = createDataTable({ data, columns });
table.getState();       // current state snapshot
table.subscribe(() => { /* re-render */ });
```

See the spec at [`docs/initial-spec.md`](./docs/initial-spec.md) for the full surface.

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

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
