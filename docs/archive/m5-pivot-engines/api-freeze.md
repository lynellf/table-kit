# M5 API Freeze — Pivot Engines

**Status:** Frozen for M5
**Packages affected:** `@lynellf/tablekit-worker` (new), `@lynellf/tablekit-pivot` (additive)

This document lists the complete API surface introduced in M5, plus reaffirms M0–M4 exports.

---

## M5 Additions (additive; no M0–M4 changes)

### New Package: `@lynellf/tablekit-worker`

Framework-free worker pivot engine + message protocol + tiny in-worker data store, plus a server engine reference factory.

#### Root Export (`@lynellf/tablekit-worker`)

```ts
// Engine factory
export declare function createWorkerEngine<TRow>(opts: WorkerEngineOptions<TRow>): WorkerEngine<TRow>;
export declare interface WorkerEngineOptions<TRow> {
  /** Callback that creates a fresh Worker instance. */
  createWorker: () => Worker;
}
export declare interface WorkerEngine<TRow = unknown> extends AggregationEngine<TRow> {
  /** Send rows to the worker (must be called before compute). */
  setRows(rows: TRow[]): Promise<void>;
}

// Entry factory (worker-side)
export declare function createWorkerEntry(): WorkerEntryHandle;
export declare interface WorkerEntryHandle {
  registerAggregators(regs: AggregatorRegistration[]): void;
  registerFilters(regs: FilterRegistration[]): void;
}

// Serialization
export declare function serializeQuery<TRow>(q: PivotQuery<TRow>): WirePivotQuery;

// Bulk registration helpers
export declare function validateAggregatorRegistrations(regs: AggregatorRegistration[]): void;
export declare function validateFilterRegistrations(regs: FilterRegistration[]): void;
export declare type AggregatorRegistration = {
  name: string;
  label?: string;
  accumulate: (acc: unknown, value: number, row?: unknown) => unknown;
  render: (acc: unknown) => string;
};
export declare type FilterRegistration = {
  name: string;
  evaluate: (value: unknown, filterValue: unknown) => boolean;
};
export declare type WorkerFilterFn = (row: unknown, filterValue: unknown) => boolean;

// Version
export declare const VERSION: '0.1.0';
```

#### Subpath: `@lynellf/tablekit-worker/protocol`

Message types for the worker RPC protocol.

```ts
// Request types (main thread → worker)
export declare type WorkerRequest =
  | { type: 'setRows'; requestId: RequestId; rows: unknown[] }
  | { type: 'compute'; requestId: RequestId; query: WirePivotQuery }
  | { type: 'computeChildren'; requestId: RequestId; path: FieldValue[]; query: WirePivotQuery };

// Response types (worker → main thread)
export declare type WorkerResponse =
  | { type: 'setRows:ok'; requestId: RequestId }
  | { type: 'compute:ok'; requestId: RequestId; result: PivotResult<unknown> }
  | { type: 'computeChildren:ok'; requestId: RequestId; children: PivotRowNode<unknown>[] }
  | { type: 'error'; requestId: RequestId; error: SerializedError };

// Wire types
export declare type WirePivotQuery = Omit<PivotQuery<unknown>, 'rows' | 'inlineAccessors'>;
export declare type RequestId = number;
export declare type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};
```

#### Subpath: `@lynellf/tablekit-worker/server`

Server expansion engine factory for lazy server-side data loading.

```ts
export declare function createServerEngine<TRow>(opts: ServerEngineOptions<TRow>): AggregationEngine<TRow>;
export declare interface ServerEngineOptions<TRow> {
  compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>>;
  computeChildren(path: FieldValue[], q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotRowNode<TRow>[]>;
  debounceMs?: number;
}

export declare function createRefetchOrchestrator<TRow>(
  opts: RefetchOrchestratorOptions<TRow>
): RefetchOrchestrator<TRow>;
export declare interface RefetchOrchestratorOptions<TRow> {
  compute: ServerEngineComputeFn<TRow>;
  computeChildren: ServerEngineComputeChildrenFn<TRow>;
}
export declare interface RefetchOrchestrator<TRow> {
  compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>>;
  computeChildren(path: FieldValue[], q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotRowNode<TRow>[]>;
  retry(path: FieldValue[], q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotRowNode<TRow>[]>;
}

export declare function retryChildren<TRow>(
  engine: AggregationEngine<TRow>,
  path: FieldValue[],
  q: PivotQuery<TRow>,
  ctx: { signal: AbortSignal }
): Promise<PivotRowNode<TRow>[]>;

export declare const VERSION_SERVER: '0.1.0';
```

---

### `@lynellf/tablekit-pivot` (additive changes only)

#### New Exports

```ts
// Validation (used by worker engine)
export declare function validatePivotQuery(q: PivotQuery): void;
```

---

## M0–M4 Surface Reaffirmed

### `@lynellf/tablekit-core`

- `Column`, `Row`, `Cell`, `TableState`, `TableOptions`
- `createTable`, `getVisibleColumns`, `getVisibleRows`
- `getCellProps`, `getRowProps`, `getTableProps`
- `useTable`

**No changes in M5.**

### `@lynellf/tablekit-react`

- `useTable`, `usePivotTable`
- Pivot integration hooks and prop getters

**No changes in M5.**

### `@lynellf/tablekit-pivot`

- Types: `PivotQuery`, `PivotResult`, `PivotRowNode`, `FieldValue`, `AggregationEngine`, etc.
- Aggregators: `sumAggregator`, `countAggregator`, `avgAggregator`, etc.
- Registry: `registerAggregator`, `getAggregator`, `builtInAggregators`
- Factory: `createPivotTable`
- Prop getters: `getToggleExpandedProps`, `getHeaderProps`, etc.

**No changes in M5.** (M5 adds `validatePivotQuery` only)

---

## Behavior Changes (additive only)

### Worker Engine

1. **Row transfer via structured clone**: `setRows` sends rows to the worker using the structured-clone algorithm. Large datasets (1M rows) may take 2-4s to transfer on a mid-tier laptop.

2. **Compute in worker thread**: Pivot computation runs in the Web Worker, keeping the main thread responsive.

3. **Worker termination on dispose**: Calling `engine.dispose()` terminates the worker. The engine is unusable after disposal.

4. **AbortSignal propagation**: Both `compute` and `computeChildren` accept an `AbortSignal`. If the signal is aborted, the pending RPC is cancelled.

### Server Engine

1. **Server is source of truth**: The `data` prop on `usePivotTable` is ignored for server engines. The server provides all data via `compute` and `computeChildren`.

2. **Lazy expansion**: Only expanded rows trigger `computeChildren`. Collapsed rows show summary data from `compute`.

3. **Retry orchestration**: `createRefetchOrchestrator` provides a `retry()` method for error recovery (e.g., re-fetching failed children).

4. **Debounce**: `debounceMs` option debounces rapid expansion/collapse events.

---

## Tests

- **M0–M4 baseline**: ~530 tests
- **M5 additions**: ~110 tests
  - Worker engine contract: 4 tests
  - Protocol serialization: 11 tests
  - Server engine contract: 5 tests
  - Entry factory: 3 tests
  - Integration: 87 tests
- **Total**: ~640 tests

---

## Exit Criteria Verification (spec §14)

| Criterion | Verification |
| --- | --- |
| **1M-row worker budget** | `pnpm --filter @lynellf/tablekit-worker bench worker.bench.ts` logs advisory numbers |
| **Server-expansion reference app** | `pnpm --filter m5-pivot-engines-example dev` boots at http://localhost:5175 |
| **Worker engine contract (§9.3)** | `packages/worker/src/__tests__/engine.test.ts` — 4 tests pass |
| **Server engine contract (§9.5)** | `packages/worker/src/server/__tests__/server.test.ts` — 5 tests pass |
| **Protocol wire format** | `packages/worker/src/__tests__/protocol.golden.test.ts` — 11 tests pass |
| **Worker entry DX (§16 #8)** | `examples/m5-pivot-engines/src/worker/pivotWorker.ts` demonstrates Vite `?worker` recipe |
| **Registry-name enforcement (§13 P3)** | `validatePivotQuery` wired into `createWorkerEngine` and `createServerEngine` |

---

## Future Considerations

These are **NOT** part of the M5 API freeze and may be added in future milestones:

- **Subtotals (`perLevel`)**: v1.5
- **Announcer messages map + i18n**: M6
- **Columnar/Arrow transfer for `setRows`**: v2+
- **Protocol versioning field**: future version bump
- **Tachometer/mitata CI bench integration**: M6
- **Bundler-recipes documentation**: M6 docs

---

*Last updated: M5 implementation complete*
