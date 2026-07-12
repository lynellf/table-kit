<!-- Historical: true -->
# Bundler Recipes — Worker Entry

> Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).

Spec §16 #8 names worker DX as the roughest edge. The mitigation is the `createWorkerEntry()` factory (shipped in M5) plus this document. Each snippet shows how to wire the worker entry for a specific bundler.

## Vite (default)

```ts
// src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

```ts
// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import MyWorker from './worker.ts?worker';

const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

`?worker` is a Vite import suffix; Vite handles the bundling automatically. The worker file is compiled as a separate chunk and served at a generated URL.

## webpack 5

```ts
// src/worker.ts (no special suffix needed)
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

```ts
// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';

const engine = createWorkerEngine({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url)),
});
```

webpack 5 understands `new Worker(new URL(...))` natively — no additional plugins required. The bundler emits the worker as a separate chunk and passes the URL at runtime.

## Rollup (with `@rollup/plugin-typescript` + `rollup-plugin-web-worker`)

```ts
// src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

```ts
// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import webWorker from 'rollup-plugin-web-worker';

export default {
  input: 'src/main.ts',
  output: { dir: 'dist', format: 'esm' },
  plugins: [
    typescript(),
    webWorker({
      // Inlines the worker bundle as a base64 string.
      // Use 'fetch' strategy for larger workers.
      inline: true,
    }),
  ],
};
```

```ts
// src/main.ts
import MyWorker from './worker.ts';
const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

The `rollup-plugin-web-worker` inlines the worker as a base64 string. For workers > 50 kB, use the `'fetch'` strategy instead of `'inline'` to load the worker as a separate file.

## esbuild (with worker bundling)

```ts
// src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();
```

```bash
# Build the worker as a separate bundle
npx esbuild src/worker.ts --bundle --format=iife --outfile=dist/worker.js
```

```ts
// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';

const engine = createWorkerEngine({
  createWorker: () => new Worker('/dist/worker.js'),
});
```

esbuild's `--bundle` flag inlines all imports. For a zero-dependency setup, build the worker separately and serve it as a static file.

## Reference

- Spec §9.3 (worker engine contract)
- Spec §16 #8 (worker DX risk)
- M5 plan: `docs/m5-pivot-engines/plan-summary.md`
- M5 reference app: `examples/m5-pivot-engines/`
- API freeze §"@lynellf/tablekit-worker": `docs/m6-hardening/api-freeze.md`

## Verified against

- Vite 5
- webpack 5
- Rollup 4
- esbuild 0.20+

Verified: 2026-07.
