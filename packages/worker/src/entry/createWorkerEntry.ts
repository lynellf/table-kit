/**
 * @lynellf/tablekit-worker/entry — worker entry factory.
 *
 * Creates the worker-side entry point that bootstraps the in-worker engine,
 * registers built-in aggregators, and dispatches incoming messages.
 *
 * Usage in a consumer's worker file:
 * ```ts
 * import { createWorkerEntry } from '@lynellf/tablekit-worker';
 * const entry = createWorkerEntry();
 * entry.registerAggregators({
 *   weightedAvg: { init: () => (...), accumulate: ..., merge: ..., finalize: ... },
 * });
 * // Worker is now ready to receive messages
 * ```
 *
 * Wire the entry to your bundler's worker mechanism:
 * - Vite: `import Worker from './worker.ts?worker'`
 * - webpack: `new Worker(new URL('./worker.ts', import.meta.url))`
 */

import { BUILT_IN_AGGREGATORS } from '@lynellf/tablekit-pivot/aggregators';
import type { Aggregator } from '@lynellf/tablekit-pivot';
import type { WorkerResponse } from '../protocol';
import { createDispatcher } from './dispatcher';

export interface WorkerEntryHandle {
  /** Register custom aggregators on the worker side. */
  registerAggregators(map: Record<string, Aggregator>): void;
  /** Register custom filter functions on the worker side. */
  registerFilterFns(map: Record<string, (value: unknown, args: unknown) => boolean>): void;
  /** Tear down the dispatcher and release resources. */
  dispose(): void;
}

export const createWorkerEntry = (): WorkerEntryHandle => {
  // In a browser Web Worker, `self` is the global Worker scope.
  // In Node.js worker_threads, `self` is `undefined` and we use `self` from the global.
  const workerScope = typeof self !== 'undefined' ? self : globalThis;

  const reply = (response: WorkerResponse) => {
    // postMessage is available on the Worker global scope
    if (typeof workerScope !== 'undefined' && 'postMessage' in workerScope) {
      (workerScope as unknown as Worker).postMessage(response);
    }
  };

  const dispatcher = createDispatcher({ reply });

  // Pre-register built-in aggregators so the default registry is available
  dispatcher.registerAggregators(
    BUILT_IN_AGGREGATORS as unknown as Record<string, Aggregator>,
  );

  const listener = (event: MessageEvent) => {
    dispatcher.dispatch(event.data);
  };

  if (typeof self !== 'undefined') {
    self.addEventListener('message', listener);
  }

  return {
    registerAggregators: dispatcher.registerAggregators,
    registerFilterFns: dispatcher.registerFilterFns,
    dispose() {
      if (typeof self !== 'undefined') {
        self.removeEventListener('message', listener);
      }
      dispatcher.registerAggregators({});
      dispatcher.registerFilterFns({});
    },
  };
};
