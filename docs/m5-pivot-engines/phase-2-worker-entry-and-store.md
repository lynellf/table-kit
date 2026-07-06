# Phase 2 — Worker entry factory + in-worker data store + aggregator/filter registries

**Goal:** Ship `createWorkerEntry()` (the in-worker bootstrap), an in-worker rows store that replaces the dataset atomically on `setRows`, bulk `registerAggregators({...})` / `registerFilterFns({...})` helpers, and the message dispatcher that maps `WorkerRequest` → compute handler → `WorkerResponse`. Per-request `AbortController` lifecycle.

**Exit criteria:** `packages/worker/src/__tests__/entry.test.ts` boots the entry inside a real `Worker` (via Node's `worker_threads` test helper or a polyfilled `self`), registers a custom aggregator, sends `setRows` then `compute`, and asserts the response carries the expected `PivotResult`. Out-of-order responses are dropped. Aborted requests reject with `AbortError`.

---

## 1. Files to create

### 1.1 `packages/worker/src/entry/rowsStore.ts`

A simple module-scoped store. Replaced atomically on each `setRows`:

```ts
export interface RowsStore<TRow = unknown> {
  set(rows: TRow[]): void;
  get(): TRow[] | null;
  clear(): void;
}

export const createRowsStore = <TRow = unknown>(): RowsStore<TRow> => {
  let rows: TRow[] | null = null;
  return {
    set(next) { rows = next; },
    get() { return rows; },
    clear() { rows = null; },
  };
};
```

Tests assert atomic replace: `store.set(a); store.set(b); store.get() === b`.

### 1.2 `packages/worker/src/aggregators/bulkRegister.ts`

Bulk registration helper for main-thread consumers who want to pre-validate that a set of aggregator names resolves (useful when the consumer wants to fail-fast on missing custom aggregators before the worker boots):

```ts
import type { Aggregator } from '@lynellf/tablekit-pivot';
import { getAggregator } from '@lynellf/tablekit-pivot/aggregators';

export interface AggregatorRegistration {
  name: string;
  fn: Aggregator;
}

export const validateAggregatorRegistrations = (regs: AggregatorRegistration[]): void => {
  for (const { name } of regs) {
    if (!getAggregator(name) && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[tablekit-worker] aggregator "${name}" is not registered; the worker will fail at compute time.`);
    }
  }
};
```

The actual worker-side registration happens inside `createWorkerEntry()` (see 1.5).

### 1.3 `packages/worker/src/filters/bulkRegister.ts`

Symmetric helper for filter functions:

```ts
export type WorkerFilterFn = (value: unknown, args: unknown) => boolean;
export interface FilterRegistration {
  name: string;
  fn: WorkerFilterFn;
}

export const validateFilterRegistrations = (regs: FilterRegistration[]): void => {
  // Mirror of validateAggregatorRegistrations.
};
```

### 1.4 `packages/worker/src/entry/dispatcher.ts`

The core message handler:

```ts
import type {
  AggregationEngine,
  Aggregator,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { createMainThreadEngine } from '@lynellf/tablekit-pivot/engine';
import type { RequestId, WorkerRequest, WorkerResponse, WirePivotQuery } from '../protocol';
import { createRowsStore } from './rowsStore';

export interface DispatcherOptions {
  /** Reply function — sends a WorkerResponse back to the main thread. */
  reply: (response: WorkerResponse) => void;
}

export const createDispatcher = (opts: DispatcherOptions) => {
  const store = createRowsStore();
  const aggregators = new Map<string, Aggregator>();
  const filterFns = new Map<string, (value: unknown, args: unknown) => boolean>();
  const pending = new Map<RequestId, AbortController>();

  /**
   * Worker-side engine: reuses the main-thread engine implementation. The
   * worker engine is "main-thread engine running in a worker" — same
   * semantics, just a different execution environment. The reducers are
   * reducer-shaped (§9.2), so chunked aggregation + merge works identically.
   */
  const engine: AggregationEngine = createMainThreadEngine({ cache: true });

  const reply = opts.reply;

  const onSetRows = (req: Extract<WorkerRequest, { type: 'setRows' }>) => {
    store.set(req.rows);
    reply({ type: 'setRows:ok', requestId: req.requestId });
  };

  const onCompute = (req: Extract<WorkerRequest, { type: 'compute' }>) => {
    const controller = new AbortController();
    pending.set(req.requestId, controller);
    const query: PivotQuery = deserializeQuery(req.query, store.get()!);
    engine.compute(query, { signal: controller.signal })
      .then((result: PivotResult) => {
        if (controller.signal.aborted) return;
        reply({ type: 'compute:ok', requestId: req.requestId, result });
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        reply({ type: 'error', requestId: req.requestId, error: serializeError(err) });
      })
      .finally(() => pending.delete(req.requestId));
  };

  const onComputeChildren = (req: Extract<WorkerRequest, { type: 'computeChildren' }>) => {
    const controller = new AbortController();
    pending.set(req.requestId, controller);
    const query: PivotQuery = deserializeQuery(req.query, store.get()!);
    engine.computeChildren!(req.path, query, { signal: controller.signal })
      .then((children: PivotRowNode[]) => {
        if (controller.signal.aborted) return;
        reply({ type: 'computeChildren:ok', requestId: req.requestId, children });
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        reply({ type: 'error', requestId: req.requestId, error: serializeError(err) });
      })
      .finally(() => pending.delete(req.requestId));
  };

  const onDispose = (req: Extract<WorkerRequest, { type: 'dispose' }>) => {
    pending.forEach((c) => c.abort());
    pending.clear();
    store.clear();
    reply({ type: 'dispose:ok', requestId: req.requestId });
  };

  const dispatch = (req: WorkerRequest) => {
    switch (req.type) {
      case 'setRows': return onSetRows(req);
      case 'compute': return onCompute(req);
      case 'computeChildren': return onComputeChildren(req);
      case 'dispose': return onDispose(req);
    }
  };

  return {
    dispatch,
    registerAggregators(map: Record<string, Aggregator>) {
      for (const [name, fn] of Object.entries(map)) aggregators.set(name, fn);
    },
    registerFilterFns(map: Record<string, (v: unknown, a: unknown) => boolean>) {
      for (const [name, fn] of Object.entries(map)) filterFns.set(name, fn);
    },
    /** For tests: inspect pending requests. */
    __pendingCount(): number { return pending.size; },
  };
};
```

`deserializeQuery(wireQuery, rows)` re-hydrates the inline forms from the worker-side registry. For inline `accessor`s that aren't in the registry, the function throws a dev-time error (`Cannot resolve inline accessor for field "${field}" on the worker side — register it via registerAggregators(...)`). For `inlineAccessors` that came through the boundary (a bug), the function strips them and warns.

### 1.5 `packages/worker/src/entry/createWorkerEntry.ts`

The factory:

```ts
import { BUILT_IN_AGGREGATORS } from '@lynellf/tablekit-pivot/aggregators';
import type { WorkerResponse } from '../protocol';
import { createDispatcher } from './dispatcher';

export interface WorkerEntryHandle {
  /** Register custom aggregators on the worker side (called from consumer entry). */
  registerAggregators(map: Record<string, import('@lynellf/tablekit-pivot').Aggregator>): void;
  /** Register custom filter functions on the worker side. */
  registerFilterFns(map: Record<string, (value: unknown, args: unknown) => boolean>): void;
  /** Tear down the dispatcher (called on worker dispose). */
  dispose(): void;
}

export const createWorkerEntry = (): WorkerEntryHandle => {
  const reply = (response: WorkerResponse) => {
    // Worker global: `self` in browser, `self` in dedicated worker, `parentPort` in Node worker_threads.
    // The library targets browser Web Workers; node worker_threads is for tests.
    (self as unknown as Worker).postMessage(response);
  };

  const dispatcher = createDispatcher({ reply });

  // Pre-register built-in aggregators so the default registry is available.
  dispatcher.registerAggregators(BUILT_IN_AGGREGATORS as unknown as Record<string, import('@lynellf/tablekit-pivot').Aggregator>);

  const listener = (event: MessageEvent) => dispatcher.dispatch(event.data);
  self.addEventListener('message', listener);

  return {
    registerAggregators: dispatcher.registerAggregators,
    registerFilterFns: dispatcher.registerFilterFns,
    dispose() {
      self.removeEventListener('message', listener);
    },
  };
};
```

### 1.6 `packages/worker/src/entry/index.ts`

```ts
export { createWorkerEntry } from './createWorkerEntry';
export type { WorkerEntryHandle } from './createWorkerEntry';
export { createRowsStore } from './rowsStore';
export type { RowsStore } from './rowsStore';
```

### 1.7 `packages/worker/src/__tests__/entry.test.ts`

Boot the entry in a polyfilled worker context (using Node's `worker_threads` with a stub `self`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '../entry/dispatcher';
import type { WorkerRequest, WorkerResponse } from '../protocol';

describe('worker dispatcher', () => {
  let responses: WorkerResponse[];
  let dispatcher: ReturnType<typeof createDispatcher>;

  beforeEach(() => {
    responses = [];
    dispatcher = createDispatcher({ reply: (r) => responses.push(r) });
  });

  it('handles setRows then compute', async () => {
    const rows = [
      { region: 'West', category: 'A', product: 'p1', revenue: 100 },
      { region: 'West', category: 'A', product: 'p2', revenue: 200 },
      { region: 'East', category: 'B', product: 'p3', revenue: 50 },
    ];
    dispatcher.dispatch({ type: 'setRows', requestId: 1, rows });
    expect(responses[0]).toEqual({ type: 'setRows:ok', requestId: 1 });

    const query = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'rev', field: 'revenue', aggregator: 'sum' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true, subtotals: 'none' as const },
      expandedPaths: [],
      pivotSorting: [],
    };
    dispatcher.dispatch({ type: 'compute', requestId: 2, query });
    await flushPromises();
    const result = responses.find((r) => r.type === 'compute:ok');
    expect(result).toBeDefined();
    expect((result as any).result.rowRoot.children).toHaveLength(2); // West, East
  });

  it('drops responses when aborted', async () => {
    // Send a compute, then abort it, then send another compute. Assert the first
    // response is not emitted.
  });

  it('handles computeChildren for server-style expansion', () => {
    // After setRows + compute with empty expandedPaths, call computeChildren
    // for path ['West']. Assert the children materialization is correct.
  });

  it('handles dispose', () => {
    dispatcher.dispatch({ type: 'setRows', requestId: 1, rows: [] });
    dispatcher.dispatch({ type: 'dispose', requestId: 2 });
    expect(responses).toContainEqual({ type: 'dispose:ok', requestId: 2 });
  });

  it('out-of-order responses: compute arrives after computeChildren', async () => {
    // Send computeChildren with requestId 1, compute with requestId 2.
    // Assert responses arrive in order.
  });
});
```

`flushPromises` is a test util that awaits microtasks + setImmediate (from M3 test util):

```ts
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));
```

### 1.8 `packages/worker/src/__tests__/bulkRegister.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validateAggregatorRegistrations, validateFilterRegistrations } from '..';
// or from their respective modules

describe('bulk registration validation', () => {
  it('warns on missing aggregator name', () => {
    const warn = vi.spyOn(console, 'warn');
    validateAggregatorRegistrations([{ name: 'nonexistent', fn: {} as any }]);
    expect(warn).toHaveBeenCalled();
  });

  it('does not warn on built-in aggregator name', () => {
    const warn = vi.spyOn(console, 'warn');
    validateAggregatorRegistrations([{ name: 'sum', fn: {} as any }]);
    expect(warn).not.toHaveBeenCalled();
  });
});
```

### 1.9 `packages/worker/src/entry/__tests__/realWorker.test.ts` (integration)

Boot a real Web Worker in jsdom + Node:

```ts
import { describe, it, expect } from 'vitest';
import { createWorkerEntry } from '../createWorkerEntry';

// Polyfill `self` for the test environment.
const sentMessages: any[] = [];
const entry = createWorkerEntry();
entry.registerAggregators({
  weightedAvg: { init: () => ({ sum: 0, weight: 0 }), accumulate: (acc, v: number, row: any) => ({ sum: acc.sum + v, weight: acc.weight + (row.weight ?? 1) }), merge: (a, b) => ({ sum: a.sum + b.sum, weight: a.weight + b.weight }), finalize: (acc) => acc.sum / acc.weight },
});

const listener = (event: any) => sentMessages.push(event.data);
self.addEventListener('message', (e) => listener(e));

// Dispatch setRows + compute via the entry's dispatcher (use the internal one).
```

(This test is non-trivial in Node because `Worker` is a browser global. The phase 3 protocol round-trip test exercises the real `Worker` via Vite's bundler; phase 2 covers the dispatcher logic in isolation.)

---

## 2. Files to change

- `packages/worker/src/index.ts`: add `registerAggregators` and `registerFilterFns` exports (re-export from the entry module).
- `packages/worker/src/protocol/index.ts`: no change (types only).

---

## 3. Commands

```bash
pnpm -F @lynellf/tablekit-worker typecheck                         # EXIT 0
pnpm -F @lynellf/tablekit-worker test -- --run entry              # ~6-10 tests, all green
pnpm -F @lynellf/tablekit-worker test -- --run bulkRegister       # ~2-4 tests, all green
pnpm verify                                                       # EXIT 0
```

---

## 4. Verification

```bash
# Dispatcher unit tests
pnpm -F @lynellf/tablekit-worker test -- --run entry

# Bulk registration validation
pnpm -F @lynellf/tablekit-worker test -- --run bulkRegister

# Type-check the entry module's surface
pnpm -F @lynellf/tablekit-worker typecheck
```

The `entry.test.ts` covers the dispatcher logic in isolation (using a stub `reply` function). The real-Worker integration is phase 3's `protocol.test.ts`.

---

## 5. Out-of-scope (deferred to later phases)

- Main-thread RPC adapter (`createWorkerEngine`) → phase 3.
- Real Web Worker integration test → phase 3.
- Server engine factory → phase 4.
- Reference app → phase 5.
- 1M-row bench → phase 5.

---

## 6. Risks

- **Worker global (`self`) not defined in Node tests**: phase 2's dispatcher tests stub `reply` and don't touch `self`. The `createWorkerEntry` factory itself is tested in phase 3 with a polyfilled `self`.
- **`createMainThreadEngine` reuse inside the worker**: the spec implies the worker engine is "the main-thread engine running in a worker". The reducer semantics are identical. If a future optimization requires a worker-specific algorithm (e.g., SIMD-accelerated aggregation), it lands in v2+. M5 reuses verbatim.
- **`inlineAccessors` strip warning**: dev-only. The dispatcher fires a one-shot warning per field name; subsequent occurrences are suppressed.