# Phase 1 — Worker package scaffold + protocol types + wire-in to monorepo

**Goal:** Stand up `packages/worker/` as a workspace package mirroring the M4 `pivot` package conventions; ship the `WorkerProtocol` types (`WorkerRequest`/`WorkerResponse`/`WirePivotQuery`/`RequestId`); wire the new package into the root build/test/lint pipeline; smoke-test the package skeleton.

**Exit criteria:** `pnpm verify` exits 0 with the new package included; `node -e "import('@lynellf/tablekit-worker').then(m => console.log(Object.keys(m)))"` prints the public surface; `node -e "import('@lynellf/tablekit-worker/protocol').then(m => console.log(Object.keys(m)))"` prints the protocol surface.

---

## 1. Files to create

### 1.1 `packages/worker/package.json`

Mirrors `packages/pivot/package.json`:

```json
{
  "name": "@lynellf/tablekit-worker",
  "version": "0.1.0",
  "private": false,
  "description": "Worker pivot engine + message protocol + tiny in-worker data store, plus a server engine reference factory.",
  "type": "module",
  "main": "./dist/tablekit-worker.es.js",
  "module": "./dist/tablekit-worker.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/tablekit-worker.es.js"
    },
    "./protocol": {
      "types": "./dist/protocol/index.d.ts",
      "import": "./dist/protocol/index.es.js"
    },
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.es.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lynellf/tablekit"
  },
  "bugs": {
    "url": "https://github.com/lynellf/tablekit/issues"
  },
  "homepage": "https://github.com/lynellf/tablekit",
  "keywords": ["table", "headless", "pivot", "data-grid", "worker", "web-worker", "aggregation"],
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "vite build",
    "build:subpaths": "node vite.subpaths.config.mjs",
    "typecheck": "tsc -b",
    "bench": "vitest bench --run bench/worker.bench.ts"
  },
  "peerDependencies": {
    "@lynellf/tablekit-pivot": "workspace:*"
  }
}
```

### 1.2 `packages/worker/tsconfig.json`

Mirrors `packages/pivot/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "../pivot/src/**/*.ts", "../core/src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts", "bench/**/*"]
}
```

### 1.3 `packages/worker/vite.config.ts`

Mirrors `packages/pivot/vite.config.ts`. External = peer deps.

### 1.4 `packages/worker/vite.subpaths.config.mjs`

Three subpaths:

```js
const subpaths = [
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-worker.es.js' },
  { entry: resolve(src, 'protocol/index.ts'), outFile: 'protocol/index.es.js' },
  { entry: resolve(src, 'server/index.ts'), outFile: 'server/index.es.js' },
];
```

### 1.5 `packages/worker/vitest.config.ts`

Mirrors `packages/pivot/vitest.config.ts`. The alias for `@lynellf/tablekit-pivot` is critical — it allows the worker tests to import types from the pivot package source directly.

### 1.6 `packages/worker/src/index.ts`

```ts
/**
 * @lynellf/tablekit-worker — framework-free worker pivot engine + server engine.
 *
 * M5 phase 1 surface: types + protocol only.
 *  - createWorkerEngine ({createWorker}) → AggregationEngine<TRow> (main-thread RPC adapter)
 *  - registerAggregators ({name: fn}) bulk registration helper (main-thread API; worker-side
 *    registration is via createWorkerEntry)
 *
 * Subpaths:
 *  - /protocol — WorkerRequest / WorkerResponse / WirePivotQuery / RequestId
 *  - /server   — createServerEngine
 */

export { createWorkerEngine } from './engine/createWorkerEngine';
export type { WorkerEngineOptions } from './engine/createWorkerEngine';

export const VERSION = '0.1.0' as const;
```

(Phase 1 only exports `VERSION`; `createWorkerEngine` is added in phase 3 with a placeholder export that throws. Phase 1's verification step is `Object.keys(m).sort()` returning `['VERSION']`.)

### 1.7 `packages/worker/src/protocol/types.ts`

The core wire types:

```ts
import type {
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  RowPathKey,
} from '@lynellf/tablekit-pivot';

/**
 * The shape that crosses the worker boundary. `rows` are sent once via
 * `setRows`; `inlineAccessors` are stripped by `buildPivotQuery({ serialize: true })`.
 */
export type WirePivotQuery = Omit<PivotQuery<unknown>, 'rows' | 'inlineAccessors'>;

/** Monotonic request id; out-of-order responses are dropped. */
export type RequestId = number;

/** Discriminated union of all messages sent from main thread to worker. */
export type WorkerRequest =
  | { type: 'setRows'; requestId: RequestId; rows: unknown[] }
  | { type: 'compute'; requestId: RequestId; query: WirePivotQuery }
  | { type: 'computeChildren'; requestId: RequestId; path: Array<FieldValue>; query: WirePivotQuery }
  | { type: 'dispose'; requestId: RequestId };

/** Discriminated union of all messages sent from worker to main thread. */
export type WorkerResponse =
  | { type: 'setRows:ok'; requestId: RequestId }
  | { type: 'compute:ok'; requestId: RequestId; result: PivotResult }
  | { type: 'computeChildren:ok'; requestId: RequestId; children: Array<PivotRowNode> }
  | { type: 'dispose:ok'; requestId: RequestId }
  | { type: 'error'; requestId: RequestId; error: SerializedError };

/** Structured-clone-safe error shape. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}
```

### 1.8 `packages/worker/src/protocol/index.ts`

```ts
export type {
  WirePivotQuery,
  RequestId,
  WorkerRequest,
  WorkerResponse,
  SerializedError,
} from './types';
```

### 1.9 `packages/worker/src/server/index.ts`

```ts
export const VERSION_SERVER = '0.1.0' as const;
```

(Phase 1 placeholder; `createServerEngine` is added in phase 4.)

### 1.10 `packages/worker/src/__tests__/package.test.ts`

Smoke test that imports the package surface and asserts:

```ts
import { describe, it, expect } from 'vitest';
import * as workerPkg from '@lynellf/tablekit-worker';
import * as protocolPkg from '@lynellf/tablekit-worker/protocol';
import * as serverPkg from '@lynellf/tablekit-worker/server';

describe('@lynellf/tablekit-worker package', () => {
  it('exports VERSION', () => {
    expect(workerPkg.VERSION).toBe('0.1.0');
  });
  it('protocol subpath is accessible', () => {
    expect(typeof protocolPkg).toBe('object');
  });
  it('server subpath is accessible', () => {
    expect(typeof serverPkg).toBe('object');
  });
});
```

### 1.11 Root `package.json` updates

Add `build:worker` and `build:worker:subpaths` scripts. Include `worker` in `build:main` and `build:subpaths`:

```json
"build:main": "pnpm build:core && pnpm build:react && pnpm build:pivot && pnpm build:worker",
"build:subpaths": "pnpm build:core:subpaths && pnpm build:react:subpaths && pnpm build:pivot:subpaths && pnpm build:worker:subpaths",
"build:worker": "pnpm -F @lynellf/tablekit-worker build",
"build:worker:subpaths": "node packages/worker/vite.subpaths.config.mjs",
```

### 1.12 Root `tsconfig.json` updates

Add a reference to the new package:

```json
"references": [
  { "path": "./packages/core" },
  { "path": "./packages/pivot" },
  { "path": "./packages/react" },
  { "path": "./packages/worker" }
]
```

### 1.13 `pnpm-workspace.yaml` updates

Add `examples/m5-pivot-engines` placeholder (the example directory is created in phase 5):

```yaml
packages:
  - "packages/*"
  - "examples/m3-server-modes"
  - "examples/m4-pivot-main-thread"
  - "examples/m5-pivot-engines"
```

### 1.14 `examples/m5-pivot-engines/.gitkeep`

Reserves the directory until phase 5.

---

## 2. Files to change (additive; no M0–M4 export renamed)

- `package.json` (root): add build scripts.
- `tsconfig.json` (root): add reference.
- `pnpm-workspace.yaml`: add examples entry.

No file in `packages/{core,react,pivot}/` is modified in this phase.

---

## 3. Commands

```bash
# Bootstrap
mkdir -p packages/worker/src/{protocol,server,__tests__}
mkdir -p examples/m5-pivot-engines
touch examples/m5-pivot-engines/.gitkeep

# Create the files above
# (write each file per the snippets)

# Verify
pnpm install
pnpm -F @lynellf/tablekit-worker build
pnpm -F @lynellf/tablekit-worker typecheck
pnpm -F @lynellf/tablekit-worker test -- --run package
pnpm verify                                                       # EXIT 0
```

---

## 4. Verification

```bash
# Type-check passes
pnpm -F @lynellf/tablekit-worker typecheck                         # EXIT 0

# Smoke tests pass
pnpm -F @lynellf/tablekit-worker test -- --run package             # 3 tests, all green

# Public surface is importable
node -e "import('@lynellf/tablekit-worker').then(m => console.log(Object.keys(m).sort()))"
# Expected: ['VERSION']

node -e "import('@lynellf/tablekit-worker/protocol').then(m => console.log(Object.keys(m).sort()))"
# Expected: []

node -e "import('@lynellf/tablekit-worker/server').then(m => console.log(Object.keys(m).sort()))"
# Expected: ['VERSION_SERVER']

# Aggregate gate
pnpm verify                                                       # EXIT 0
```

The protocol subpath exports only types — `Object.keys(m)` on a type-only module is `[]` because TypeScript types don't appear at runtime. The smoke test imports the types via `import * as protocolPkg` and asserts `typeof protocolPkg === 'object'`. This is acceptable; the types are validated by the typecheck step.

---

## 5. Out-of-scope (deferred to later phases)

- `createWorkerEngine` implementation → phase 3.
- `createWorkerEntry` factory + in-worker store → phase 2.
- `createServerEngine` factory → phase 4.
- `registerAggregators` bulk helper → phase 2.
- Reference app → phase 5.
- 1M-row perf bench → phase 5.
- M4 cleanup items (2 polish items per the orchestrator's status report) → can run in parallel; track as `open_concern`.

---

## 6. Risks

- **Type-only exports showing as `[]` in `Object.keys`**: documented in §4. Acceptable; the runtime surface is `VERSION` + `createWorkerEngine` (phase 3).
- **Root `tsconfig.json` references order**: TS project references are order-sensitive for `tsc -b`. The new reference must come AFTER the pivot reference (which is what TS computes types for the worker). Mitigation: insert `{ "path": "./packages/worker" }` last in the `references` array.
- **Lefthook pre-push hook adds the worker package**: `lefthook.yml` uses glob filtering, so the new package is automatically picked up. Verify by running `pnpm exec lefthook run pre-push` after the files land.
- **Build script order**: `build:main` must build `worker` AFTER `pivot` (peer dep). The order in §1.11 is correct (`core → react → pivot → worker`).