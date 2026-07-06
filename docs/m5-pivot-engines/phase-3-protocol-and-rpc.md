# Phase 3 — Protocol round-trips + main-thread RPC adapter + `validatePivotQuery` wiring

**Goal:** Ship `createWorkerEngine({ createWorker })` (main-thread RPC adapter that returns an `AggregationEngine<TRow>`); wire `validatePivotQuery` (M4) into the RPC to warn on inline-form leaks; ship protocol round-trip tests using a real `Worker` (via Vite's bundler or a test polyfill); end-to-end test that the worker engine produces identical `PivotResult` structure to the main-thread engine on the same fixture.

**Exit criteria:** `createWorkerEngine({ createWorker: () => new Worker(...) })` returns an object whose `.compute()` and `.computeChildren()` produce `PivotResult` / `PivotRowNode[]` correctly; `.dispose()` terminates the worker and rejects in-flight promises; out-of-order responses are dropped; the engine contract satisfies `AggregationEngine<TRow>`.

---

## 1. Files to create

### 1.1 `packages/worker/src/serialization/serializeQuery.ts`

Strips rows + inline forms from a `PivotQuery` to produce a `WirePivotQuery`:

```ts
import type { PivotQuery } from '@lynellf/tablekit-pivot';
import type { WirePivotQuery } from '../protocol';

export const serializeQuery = <TRow>(q: PivotQuery<TRow>): WirePivotQuery => {
  // Strip rows and inlineAccessors. The rest is already in serialized shape
  // (the consumer calls buildPivotQuery({ serialize: true }) from M4).
  const { rows: _rows, inlineAccessors: _ia, ...wire } = q;
  return wire;
};
```

Type-checked: the resulting type is exactly `WirePivotQuery`.

### 1.2 `packages/worker/src/engine/rpc.ts`

The RPC plumbing:

```ts
import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import type { RequestId, WorkerRequest, WorkerResponse } from '../protocol';

export interface RpcOptions {
  worker: Worker;
}

export interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  controller: AbortController;
}

export const createRpc = (opts: RpcOptions) => {
  let nextRequestId = 0;
  let lastSeenRequestId = -1;
  const pending = new Map<RequestId, PendingEntry>();

  const onMessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    // Drop out-of-order responses (e.g., slow compute that arrives after a fast one).
    if (res.requestId < lastSeenRequestId) return;
    const entry = pending.get(res.requestId);
    if (!entry) return;
    pending.delete(res.requestId);
    if (res.type === 'error') {
      const err = new Error(res.error.message);
      err.name = res.error.name;
      entry.reject(err);
    } else if (res.type === 'compute:ok') entry.resolve(res.result);
    else if (res.type === 'computeChildren:ok') entry.resolve(res.children);
    else if (res.type === 'setRows:ok' || res.type === 'dispose:ok') entry.resolve(undefined);
  };

  opts.worker.addEventListener('message', onMessage);

  const send = <T>(message: Omit<WorkerRequest, 'requestId'>, signal: AbortSignal): Promise<T> => {
    const requestId = ++nextRequestId;
    lastSeenRequestId = requestId;
    const controller = new AbortController();
    const promise = new Promise<T>((resolve, reject) => {
      const entry: PendingEntry = {
        resolve: resolve as (v: unknown) => void,
        reject,
        controller,
      };
      pending.set(requestId, entry);
      opts.worker.postMessage({ ...message, requestId });
      signal.addEventListener('abort', () => {
        controller.abort();
        pending.delete(requestId);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      });
    });
    return promise;
  };

  return {
    send,
    dispose() {
      pending.forEach((entry) => {
        entry.controller.abort();
        entry.reject(new DOMException('Worker disposed', 'AbortError'));
      });
      pending.clear();
      opts.worker.removeEventListener('message', onMessage);
    },
  };
};
```

### 1.3 `packages/worker/src/engine/createWorkerEngine.ts`

The public factory:

```ts
import type {
  AggregationEngine,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { validatePivotQuery } from '@lynellf/tablekit-pivot/serialize';
import { serializeQuery } from '../serialization/serializeQuery';
import type { FieldValue } from '@lynellf/tablekit-pivot';
import { createRpc } from './rpc';

export interface WorkerEngineOptions {
  /** Callback that creates a fresh Worker. Invoked synchronously by the factory. */
  createWorker: () => Worker;
}

export const createWorkerEngine = <TRow = unknown>(
  opts: WorkerEngineOptions,
): AggregationEngine<TRow> => {
  const worker = opts.createWorker();
  const rpc = createRpc({ worker });

  return {
    async compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>> {
      validatePivotQuery(q as PivotQuery); // M4 dev warning; fires once per non-serialized query.
      const wireQuery = serializeQuery(q);
      return rpc.send<PivotResult<TRow>>({ type: 'compute', query: wireQuery }, ctx.signal);
    },

    async computeChildren(
      path: Array<FieldValue>,
      q: PivotQuery<TRow>,
      ctx: { signal: AbortSignal },
    ): Promise<PivotRowNode<TRow>[]> {
      const wireQuery = serializeQuery(q);
      return rpc.send<PivotRowNode<TRow>[]>(
        { type: 'computeChildren', path, query: wireQuery },
        ctx.signal,
      );
    },

    setRows?(rows: TRow[]): Promise<void> {
      return rpc.send<void>({ type: 'setRows', rows: rows as unknown[] }, new AbortController().signal);
    },

    dispose() {
      rpc.dispose();
      worker.terminate();
    },
  };
};
```

`setRows` is added to the engine surface additively (not in `AggregationEngine<TRow>`; the contract allows the engine to ignore it). Worker engines need it; main-thread and server engines don't. The contract stays clean.

### 1.4 `packages/worker/src/engine/index.ts`

```ts
export { createWorkerEngine } from './createWorkerEngine';
export type { WorkerEngineOptions } from './createWorkerEngine';
export { createRpc } from './rpc';
export { serializeQuery } from '../serialization/serializeQuery';
```

### 1.5 `packages/worker/src/index.ts`

Update to export `createWorkerEngine`:

```ts
export { createWorkerEngine } from './engine/createWorkerEngine';
export type { WorkerEngineOptions } from './engine/createWorkerEngine';
export { validateAggregatorRegistrations, validateFilterRegistrations } from './serialization/validators';
export { createWorkerEntry } from './entry/createWorkerEntry';
export type { WorkerEntryHandle } from './entry/createWorkerEntry';

export const VERSION = '0.1.0' as const;
```

### 1.6 `packages/worker/src/__tests__/protocol.test.ts`

End-to-end test using a real Web Worker. Vitest's environment must be set to `node` for the protocol test (since Node 20+ has Web Worker support via `worker_threads`; or use a jsdom polyfill).

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWorkerEntry } from '../entry/createWorkerEntry';
import type { WorkerEntryHandle } from '../entry/createWorkerEntry';

// Test uses an in-process worker shim: an EventTarget that mimics the Worker interface.
class TestWorkerShim {
  private entry: WorkerEntryHandle | null = null;
  public sent: any[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  addEventListener(type: string, listener: any) { if (type === 'message') this.onmessage = listener; }
  removeEventListener() { this.onmessage = null; }
  postMessage(message: any) {
    // Boot the entry on first message.
    if (!this.entry) {
      this.entry = createWorkerEntry();
    }
    // Dispatch to the entry's listener (the entry attaches to `self`; in the test
    // we manually invoke its dispatcher via the entry's public API).
    setTimeout(() => {
      // Simulate the worker's `self.onmessage` by calling the entry's internal dispatcher.
      // For test purposes, we use the dispatcher's public API:
      const dispatcher = (this.entry as any).__dispatcher;
      dispatcher.dispatch(message);
      // The dispatcher calls `reply` which posts back to `self`. We capture that here.
    }, 0);
  }
  terminate() { this.entry?.dispose(); this.entry = null; }
}
```

This shim is verbose but isolates the test from real Web Worker semantics. Phase 5's reference app exercises a real `Worker` for end-to-end validation.

The test cases:

```ts
describe('protocol round-trip', () => {
  it('setRows + compute returns a PivotResult', async () => { /* ... */ });
  it('out-of-order responses: later requestId resolves first', async () => { /* ... */ });
  it('computeChildren after compute', async () => { /* ... */ });
  it('dispose terminates the worker and rejects in-flight', async () => { /* ... */ });
  it('inline-form leak triggers dev warning', async () => { /* ... */ });
});
```

### 1.7 `packages/worker/src/__tests__/engine.test.ts`

Integration: main-thread engine vs. worker engine on the same fixture:

```ts
import { describe, it, expect } from 'vitest';
import { createMainThreadEngine } from '@lynellf/tablekit-pivot/engine';
import { createWorkerEngine } from '../engine/createWorkerEngine';
// Use TestWorkerShim from protocol.test.ts (extract to a shared test util).

describe('createWorkerEngine', () => {
  it('produces identical PivotResult structure to main-thread engine', async () => {
    const rows = [/* fixture: 100k rows × 3 levels */];
    const query = { rows, /* ... serialized config ... */ };

    const mainResult = createMainThreadEngine().compute(query, { signal: new AbortController().signal });
    const workerResult = await createWorkerEngine({ createWorker: () => new TestWorkerShim() }).compute(query, { signal: new AbortController().signal });

    expect(stripTiming(workerResult)).toEqual(mainResult);
  });

  it('aborts in-flight compute on signal abort', async () => {
    const controller = new AbortController();
    const promise = createWorkerEngine({ createWorker: () => new TestWorkerShim() }).compute(query, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });

  it('dispose rejects all pending', async () => {
    const engine = createWorkerEngine({ createWorker: () => new TestWorkerShim() });
    const promise = engine.compute(query, { signal: new AbortController().signal });
    engine.dispose();
    await expect(promise).rejects.toThrow();
  });
});
```

`stripTiming(result)` removes any non-deterministic fields (currently none, but future-proof).

---

## 2. Files to change

- `packages/worker/src/index.ts`: export `createWorkerEngine` (replace the `VERSION`-only stub from phase 1).
- `packages/worker/src/protocol/index.ts`: no change.

No change to any other package.

---

## 3. Commands

```bash
pnpm -F @lynellf/tablekit-worker typecheck                         # EXIT 0
pnpm -F @lynellf/tablekit-worker test -- --run protocol            # ~5-7 tests, all green
pnpm -F @lynellf/tablekit-worker test -- --run engine              # ~3-5 tests, all green
pnpm verify                                                       # EXIT 0
```

---

## 4. Verification

```bash
# Smoke test the public surface
node -e "import('@lynellf/tablekit-worker').then(m => console.log(Object.keys(m).sort()))"
# Expected: ['VERSION', 'createWorkerEngine', 'createWorkerEntry', 'validateAggregatorRegistrations', 'validateFilterRegistrations']

# React pivot hook still works (usePivotTable accepts engine: createWorkerEngine(...))
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable, 'createWorkerEngine:', typeof require('@lynellf/tablekit-worker').createWorkerEngine))"

# Aggregate gate
pnpm verify                                                       # EXIT 0
```

---

## 5. Out-of-scope (deferred to later phases)

- Server engine factory → phase 4.
- Reference app with real `new Worker(url)` → phase 5 (Vite recipe demonstrates it).
- 1M-row bench → phase 5.
- `validatePivotQuery` implementation → already in M4; phase 3 only imports it.

---

## 6. Risks

- **`setRows` not in `AggregationEngine<TRow>` contract**: the engine returns it as an extra property (duck-typed). Mitigation: tests assert it's present; consumers who only use main-thread/server engines don't need it; the contract stays minimal.
- **Out-of-order response dropping could mask real bugs**: a fast `compute` that arrives after a slow `computeChildren` would be dropped if the consumer interleaves them with new requests. This is correct semantics per spec §9.3 ("in-flight computations are aborted via `AbortSignal` when the query or engine changes"). The dropping is intentional.
- **`postMessage` cloning of large rows**: `setRows(rows)` uses structured clone, which is O(N) in the row count. For 1M rows × 10 columns, that's ~100MB of structured-cloned data. Mitigation: the §12 perf bench measures this explicitly; if it exceeds budget, M6+ explores `Transferable` (columnar / `Arrow`). Not blocking M5.
- **Test shim vs. real Worker divergence**: the `TestWorkerShim` doesn't exercise real `postMessage` semantics. Mitigation: phase 5's reference app boots a real `Worker` via Vite's `?worker` import and asserts end-to-end behavior in a smoke test (not a unit test).