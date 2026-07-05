# @lynellf/tablekit-core

Framework-agnostic headless table state engine, row pipeline, column model, and event system.

## Install

```bash
npm install @lynellf/tablekit-core
```

Requires Node ≥ 20.

## Usage

```ts
import { createTable } from '@lynellf/tablekit-core';

const table = createTable({ columns: [...], rows: [...] });
```

## Status

v0.1.0 — early stage. The public API is stabilizing.

## Resources

- [Spec](./docs/initial-spec.md)
- [Bugs & issues](https://github.com/lynellf/tablekit/issues)

## License

[MIT](../../LICENSE)
