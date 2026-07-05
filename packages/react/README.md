# @lynellf/tablekit-react

React adapter for `@lynellf/tablekit-core` — hooks, prop getters, announcer, and a11y validator.

## Install

```bash
npm install @lynellf/tablekit-core @lynellf/tablekit-react
```

Requires React ≥ 18 and Node ≥ 20.

## Usage

```tsx
import { useTable } from '@lynellf/tablekit-react';

function MyTable({ rows, columns }) {
  const table = useTable({ rows, columns });
  return <table {...table.getTableProps()}>...</table>;
}
```

## Status

v0.1.0 — early stage. The public API is stabilizing.

## Resources

- [`@lynellf/tablekit-core`](https://www.npmjs.com/package/@lynellf/tablekit-core)
- [Spec](./docs/initial-spec.md)
- [Bugs & issues](https://github.com/lynellf/tablekit/issues)

## License

[MIT](../../LICENSE)
