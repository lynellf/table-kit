/**
 * @lynellf/tablekit-worker/entry — message dispatcher for the worker.
 *
 * Handles incoming WorkerRequest messages and dispatches to the appropriate handler.
 * Manages per-request AbortControllers for cancellation.
 */

import type {
  AggregationEngine,
  Aggregator,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { createMainThreadEngine } from '@lynellf/tablekit-pivot/engine';
import type { RequestId, WirePivotQuery, WorkerRequest, WorkerResponse } from '../protocol';
import { createRowsStore } from './rowsStore';

export interface DispatcherOptions {
  /** Reply function — sends a WorkerResponse back to the main thread. */
  reply: (response: WorkerResponse) => void;
}

/** Serialize an error for structured clone. */
const serializeError = (err: unknown): { name: string; message: string; stack?: string } => {
  if (err instanceof Error) {
    const result: { name: string; message: string; stack?: string } = {
      name: err.name,
      message: err.message,
    };
    if (err.stack !== undefined) {
      result.stack = err.stack;
    }
    return result;
  }
  return { name: 'Error', message: String(err) };
};

/**
 * Deserialize a WirePivotQuery back to a PivotQuery by adding rows from the store.
 * Inline accessors are stripped (worker doesn't support them).
 */
const deserializeQuery = (wireQuery: WirePivotQuery, rows: unknown[]): PivotQuery => {
  // Strip inlineAccessors from wireQuery - they are not supported in worker
  const { ...wire } = wireQuery as WirePivotQuery & { inlineAccessors?: unknown };
  return {
    ...wire,
    rows: rows as TRow[],
    // inlineAccessors are intentionally omitted - worker doesn't support them
  } as PivotQuery;
};

// Type alias for readability
type TRow = unknown;

export interface DispatcherHandle {
  dispatch: (req: WorkerRequest) => void;
  registerAggregators: (map: Record<string, Aggregator>) => void;
  registerFilterFns: (map: Record<string, (value: unknown, args: unknown) => boolean>) => void;
  /** For tests: count of pending requests. */
  __pendingCount: () => number;
}

export const createDispatcher = (opts: DispatcherOptions): DispatcherHandle => {
  const store = createRowsStore<TRow>();
  const aggregators = new Map<string, Aggregator>();
  const filterFns = new Map<string, (value: unknown, args: unknown) => boolean>();
  const pending = new Map<RequestId, AbortController>();

  /**
   * Worker-side engine: reuses the main-thread engine implementation.
   * The worker engine is "main-thread engine running in a worker" — same
   * semantics, just a different execution environment.
   */
  const engine: AggregationEngine<TRow> = createMainThreadEngine<TRow>({ cache: true });

  const reply = opts.reply;

  const onSetRows = (req: Extract<WorkerRequest, { type: 'setRows' }>) => {
    store.set(req.rows as TRow[]);
    reply({ type: 'setRows:ok', requestId: req.requestId });
  };

  const onCompute = (req: Extract<WorkerRequest, { type: 'compute' }>) => {
    const controller = new AbortController();
    pending.set(req.requestId, controller);
    const rows = store.get();
    if (!rows) {
      reply({
        type: 'error',
        requestId: req.requestId,
        error: { name: 'Error', message: 'No rows loaded. Call setRows first.' },
      });
      pending.delete(req.requestId);
      return;
    }
    const query = deserializeQuery(req.query, rows);
    Promise.resolve(engine.compute(query, { signal: controller.signal }))
      .then((result: PivotResult<TRow>) => {
        if (controller.signal.aborted) return;
        reply({ type: 'compute:ok', requestId: req.requestId, result: result as PivotResult });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        reply({ type: 'error', requestId: req.requestId, error: serializeError(err) });
      })
      .finally(() => pending.delete(req.requestId));
  };

  const onComputeChildren = (req: Extract<WorkerRequest, { type: 'computeChildren' }>) => {
    const controller = new AbortController();
    pending.set(req.requestId, controller);
    const rows = store.get();
    if (!rows) {
      reply({
        type: 'error',
        requestId: req.requestId,
        error: { name: 'Error', message: 'No rows loaded. Call setRows first.' },
      });
      pending.delete(req.requestId);
      return;
    }
    const query = deserializeQuery(req.query, rows);
    if (!engine.computeChildren) {
      reply({
        type: 'error',
        requestId: req.requestId,
        error: { name: 'Error', message: 'Engine does not support computeChildren.' },
      });
      pending.delete(req.requestId);
      return;
    }
    Promise.resolve(engine.computeChildren!(req.path, query, { signal: controller.signal }))
      .then((children: PivotRowNode<TRow>[]) => {
        if (controller.signal.aborted) return;
        reply({
          type: 'computeChildren:ok',
          requestId: req.requestId,
          children: children as PivotRowNode[],
        });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        reply({ type: 'error', requestId: req.requestId, error: serializeError(err) });
      })
      .finally(() => pending.delete(req.requestId));
  };

  const onDispose = (req: Extract<WorkerRequest, { type: 'dispose' }>) => {
    for (const controller of pending.values()) {
      controller.abort();
    }
    pending.clear();
    store.clear();
    reply({ type: 'dispose:ok', requestId: req.requestId });
  };

  const dispatch = (req: WorkerRequest) => {
    switch (req.type) {
      case 'setRows':
        return onSetRows(req);
      case 'compute':
        return onCompute(req);
      case 'computeChildren':
        return onComputeChildren(req);
      case 'dispose':
        return onDispose(req);
    }
  };

  return {
    dispatch,
    registerAggregators(map: Record<string, Aggregator>) {
      for (const [name, fn] of Object.entries(map)) {
        aggregators.set(name, fn);
      }
    },
    registerFilterFns(map: Record<string, (value: unknown, args: unknown) => boolean>) {
      for (const [name, fn] of Object.entries(map)) {
        filterFns.set(name, fn);
      }
    },
    __pendingCount() {
      return pending.size;
    },
  };
};
