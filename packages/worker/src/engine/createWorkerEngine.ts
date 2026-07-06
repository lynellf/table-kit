/**
 * @lynellf/tablekit-worker/engine — worker engine factory.
 *
 * Creates an AggregationEngine that runs in a Web Worker, providing
 * off-main-thread pivot computation.
 */

import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { validatePivotQuery } from '@lynellf/tablekit-pivot/serialize';
import { serializeQuery } from '../serialization/serializeQuery';
import { createRpc } from './rpc';

export interface WorkerEngineOptions {
  /**
   * Callback that creates a fresh Worker instance.
   * Use your bundler's worker mechanism:
   * - Vite: `() => new Worker(new URL('./worker.ts', import.meta.url))`
   * - webpack: `() => new Worker(new URL('./worker.ts', import.meta.url))`
   * - Native: `() => new Worker('/path/to/worker.js')`
   */
  createWorker: () => Worker;
}

export interface WorkerEngine<TRow = unknown> extends AggregationEngine<TRow> {
  /** Send rows to the worker (must be called before compute). */
  setRows(rows: TRow[]): Promise<void>;
}

/**
 * Create a worker-based aggregation engine.
 *
 * @example
 * ```ts
 * import { createWorkerEngine } from '@lynellf/tablekit-worker';
 * import Worker from './pivotWorker?worker';
 *
 * const engine = createWorkerEngine({ createWorker: () => new Worker() });
 * await engine.setRows(myRows);
 * const result = await engine.compute(query, { signal });
 * ```
 */
export const createWorkerEngine = <TRow = unknown>(
  opts: WorkerEngineOptions,
): WorkerEngine<TRow> => {
  const worker = opts.createWorker();
  const rpc = createRpc({ worker });

  let _rowsSet = false;

  const engine: WorkerEngine<TRow> = {
    async compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>> {
      validatePivotQuery(q as PivotQuery);
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

    async setRows(rows: TRow[]): Promise<void> {
      await rpc.send<void>(
        { type: 'setRows', rows: rows as unknown[] },
        new AbortController().signal,
      );
      _rowsSet = true;
    },

    dispose() {
      rpc.dispose();
      worker.terminate();
    },
  };

  return engine;
};
