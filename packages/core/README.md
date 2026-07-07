# @lynellf/tablekit-core

Framework-agnostic headless table state engine, row pipeline, column model, and event system.

## Install

```bash
npm install @lynellf/tablekit-core
```

Requires Node ≥ 20.

## Usage

```ts
import { createDataTable } from '@lynellf/tablekit-core';

const table = createDataTable({ data, columns });
```

## Status

v1.0.0 — stable. The public API is frozen. See the [v1.0 API contract](https://github.com/lynellf/tablekit/tree/main/docs/m6-hardening/api-freeze.md).

## Packages

| Package | Description |
|---|---|
| [`@lynellf/tablekit-react`](/packages/react) | React hooks, prop getters, announcer, and a11y validator built on top of `@lynellf/tablekit-core`. |
| [`@lynellf/tablekit-pivot`](/packages/pivot) | PivotTable primitives and aggregation engine. |
| [`@lynellf/tablekit-worker`](/packages/worker) | Worker-based pivot engine for off-thread aggregation. |

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
