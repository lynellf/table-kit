/**
 * @lynellf/tablekit-pivot/engine — main-thread engine.
 *
 * Implements `AggregationEngine<TRow>` for the main-thread execution environment.
 * Stateless: every `compute` call derives the result from the query. Memoization
 * is provided by `PivotResultCache`.
 *
 * Lazy expansion (§9.5):
 *  - `compute(q, ctx)` returns `rowRoot.children` materialized only for paths
 *    in `q.expandedPaths`. Unexpanded paths are aggregated (values + rowTotals
 *    present, `children = undefined`, `childState = 'notLoaded'`).
 *  - `computeChildren(path, q, ctx)` materializes the children of an already-
 *    aggregated node synchronously (returns an array of PivotRowNode).
 */

import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '../types';
import { PivotResultCache } from './cache';
import { buildPivotResult, rowPathKeyOf } from './treeBuilder';

export interface MainThreadEngineOptions {
  /** Enable memoization (default true). */
  cache?: boolean;
}

export const createMainThreadEngine = <TRow = unknown>(
  opts: MainThreadEngineOptions = {},
): AggregationEngine<TRow> => {
  const useCache = opts.cache !== false;
  const cache = useCache ? new PivotResultCache<TRow>() : null;

  return {
    compute(q: PivotQuery<TRow>, _ctx: { signal: AbortSignal }): PivotResult<TRow> {
      if (cache) {
        const cached = cache.get(q.rows, q);
        if (cached) return cached;
      }
      const result = buildPivotResult(q);
      if (cache) cache.set(q.rows, q, result);
      return result;
    },

    computeChildren(
      path: FieldValue[],
      q: PivotQuery<TRow>,
      _ctx: { signal: AbortSignal },
    ): PivotRowNode<TRow>[] {
      // Materialize children of `path` by re-running the engine with the path
      // added to expandedPaths, then walk to find the materialized children.
      const expandedKey = rowPathKeyOf(path);
      const childPaths = q.expandedPaths.includes(expandedKey)
        ? q.expandedPaths
        : [...q.expandedPaths, expandedKey];
      const expandedQuery: PivotQuery<TRow> = { ...q, expandedPaths: childPaths };
      const result = buildPivotResult(expandedQuery);
      const targetKey = rowPathKeyOf(path);
      const walk = (node: PivotRowNode<TRow>): PivotRowNode<TRow>[] | null => {
        if (node.key === targetKey) {
          return node.children ?? [];
        }
        if (!node.children) return null;
        for (const child of node.children) {
          const found = walk(child);
          if (found !== null) return found;
        }
        return null;
      };
      const children = walk(result.rowRoot);
      return children ?? [];
    },

    dispose(): void {
      cache?.clear();
    },
  };
};
