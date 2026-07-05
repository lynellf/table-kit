# table-kit

Headless table primitives for the modern web — framework-free state engine, row pipeline, column model, and a first-class React adapter.

**Status:** v0.1.0 — early stage. The core surface is under active development; the public API is stabilizing.

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
import { createTable } from '@lynellf/tablekit-core';

const table = createTable({ columns: [...], rows: [...] });
```

See the spec at [`docs/initial-spec.md`](./docs/initial-spec.md) for the full surface.

## Bugs & Issues

https://github.com/lynellf/tablekit/issues

## License

[MIT](./LICENSE)
