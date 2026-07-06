/**
 * @lynellf/tablekit-worker/server — server engine reference factory.
 *
 * Wraps an async consumer API (fetch/GraphQL/tRPC) to satisfy AggregationEngine<TRow>.
 * Handles AbortSignal plumbing, request correlation, and refetch-on-query-change
 * semantics for lazy expansion.
 */

import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { validatePivotQuery } from '@lynellf/tablekit-pivot/serialize';
import { createRefetchOrchestrator } from './refetchOrchestrator';

export interface ServerEngineComputeFn<TRow = unknown> {
  (q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>>;
}

export interface ServerEngineComputeChildrenFn<TRow = unknown> {
  (path: Array<FieldValue>, q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotRowNode<TRow>[]>;
}

export interface ServerEngineOptions<TRow = unknown> {
  /** Returns the collapsed top level (plus grand totals). */
  compute: ServerEngineComputeFn<TRow>;
  /** Resolves children of a path for lazy expansion. */
  computeChildren: ServerEngineComputeChildrenFn<TRow>;
  /** Debounce per-path fetches (ms). Default 0 = no debounce. */
  debounceMs?: number;
}

export interface RefetchOrchestrator {
  schedule: (q: PivotQuery, ctx: { signal: AbortSignal }) => void;
  getChildrenAsync: (path: string) => Promise<PivotRowNode[]>;
  isPathLoading: (path: string) => boolean;
  __state: {
    cache: Map<string, Promise<PivotRowNode[]>>;
    prevExpandedPaths: string[];
    prevQueryKey: string;
  };
}

/**
 * Create a server-based aggregation engine.
 *
 * @example
 * ```ts
 * import { createServerEngine } from '@lynellf/tablekit-worker/server';
 *
 * const engine = createServerEngine({
 *   compute: async (q, ctx) => {
 *     const response = await fetch('/api/pivot', {
 *       method: 'POST',
 *       body: JSON.stringify(q),
 *       signal: ctx.signal,
 *     });
 *     return response.json();
 *   },
 *   computeChildren: async (path, q, ctx) => {
 *     const response = await fetch('/api/pivot/children', {
 *       method: 'POST',
 *       body: JSON.stringify({ path, query: q }),
 *       signal: ctx.signal,
 *     });
 *     return response.json();
 *   },
 *   debounceMs: 50,
 * });
 * ```
 */
export const createServerEngine = <TRow = unknown>(
  opts: ServerEngineOptions<TRow>,
): AggregationEngine<TRow> => {
  const orchestrator = createRefetchOrchestrator<TRow>({
    computeChildren: opts.computeChildren,
    debounceMs: opts.debounceMs ?? 0,
  });

  return {
    async compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>> {
      validatePivotQuery(q as PivotQuery);
      const topLevel = await opts.compute(q, ctx);
      orchestrator.schedule(q as PivotQuery, ctx);

      // Merge loaded children into the tree
      const merged = await mergeChildren<TRow>(topLevel, orchestrator);
      return merged;
    },

    async computeChildren(
      path: Array<FieldValue>,
      q: PivotQuery<TRow>,
      ctx: { signal: AbortSignal },
    ): Promise<PivotRowNode<TRow>[]> {
      return opts.computeChildren(path, q, ctx);
    },

    dispose() {
      orchestrator.__state.cache.clear();
    },
  };
};

/**
 * Walk the tree and merge loaded children from the orchestrator's cache.
 */
const mergeChildren = async <TRow>(
  result: PivotResult<TRow>,
  orchestrator: RefetchOrchestrator,
): Promise<PivotResult<TRow>> => {
  const walk = async (node: PivotRowNode<TRow>): Promise<PivotRowNode<TRow>> => {
    const pathKey = JSON.stringify(node.path);
    const promise = orchestrator.__state.cache.get(pathKey);
    if (!promise) return node;
    try {
      const children = await promise;
      return {
        ...node,
        childState: 'loaded' as const,
        children: await Promise.all(children.map(walk)),
      };
    } catch (err) {
      return { ...node, childState: 'error' as const, error: err as Error };
    }
  };

  return {
    ...result,
    rowRoot: await walk(result.rowRoot),
  };
};
