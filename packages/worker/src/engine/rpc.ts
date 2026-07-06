/**
 * @lynellf/tablekit-worker/engine — RPC plumbing for the worker engine.
 *
 * Manages the promise-based RPC layer on the main-thread side,
 * request ID correlation, and AbortSignal propagation.
 */

import type { FieldValue } from '@lynellf/tablekit-pivot';
import type { RequestId, WirePivotQuery, WorkerResponse } from '../protocol';

export interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  controller: AbortController;
}

export interface RpcOptions {
  worker: Worker;
}

export const createRpc = (opts: RpcOptions) => {
  let nextRequestId = 0;
  let lastSeenRequestId = -1;
  const pending = new Map<RequestId, PendingEntry>();

  const onMessage = (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;
    // Drop out-of-order responses (e.g., slow compute arrives after a fast one)
    if (res.requestId < lastSeenRequestId) return;
    const entry = pending.get(res.requestId);
    if (!entry) return;
    pending.delete(res.requestId);
    if (res.type === 'error') {
      const err = new Error(res.error.message);
      err.name = res.error.name;
      entry.reject(err);
    } else if (res.type === 'compute:ok') {
      entry.resolve(res.result);
    } else if (res.type === 'computeChildren:ok') {
      entry.resolve(res.children);
    } else if (res.type === 'setRows:ok' || res.type === 'dispose:ok') {
      entry.resolve(undefined);
    }
  };

  opts.worker.addEventListener('message', onMessage);

  const send = <T>(
    message:
      | { type: 'setRows'; rows: unknown[] }
      | { type: 'compute'; query: WirePivotQuery }
      | { type: 'computeChildren'; path: FieldValue[]; query: WirePivotQuery }
      | { type: 'dispose' },
    signal: AbortSignal,
  ): Promise<T> => {
    const requestId = ++nextRequestId;
    lastSeenRequestId = requestId;
    const controller = new AbortController();
    const promise = new Promise<T>((resolve, reject) => {
      const entry: PendingEntry = {
        resolve: resolve as (value: unknown) => void,
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
      for (const entry of pending.values()) {
        entry.controller.abort();
        entry.reject(new DOMException('Worker disposed', 'AbortError'));
      }
      pending.clear();
      opts.worker.removeEventListener('message', onMessage);
    },
  };
};
