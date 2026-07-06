/**
 * @lynellf/tablekit-worker/server — refetch orchestrator.
 *
 * Tracks current query and expanded paths; diffs on each compute to determine
 * which children need to be re-fetched (server expansion pattern).
 */

import type { FieldValue, PivotQuery, PivotRowNode } from '@lynellf/tablekit-pivot';

export interface RefetchOrchestratorOptions<TRow = unknown> {
  computeChildren: (
    path: FieldValue[],
    q: PivotQuery<TRow>,
    ctx: { signal: AbortSignal },
  ) => Promise<PivotRowNode<TRow>[]>;
  debounceMs?: number;
}

export interface RefetchState {
  /** Path → in-flight or resolved children. */
  cache: Map<string, Promise<PivotRowNode[]>>;
  /** Previous query's expanded paths. */
  prevExpandedPaths: string[];
  /** Previous query signature (used to invalidate paths on query change). */
  prevQueryKey: string;
}

/** Simple string hash for query key comparison. */
const queryKeyOf = (q: PivotQuery): string => {
  return JSON.stringify({
    rowsFieldRef: q.rowsFieldRef,
    columnsFieldRef: q.columnsFieldRef,
    measures: q.measures,
    filters: q.filters,
    totals: q.totals,
    pivotSorting: q.pivotSorting,
  });
};

export const createRefetchOrchestrator = <TRow = unknown>(
  opts: RefetchOrchestratorOptions<TRow>,
) => {
  const state: RefetchState = {
    cache: new Map(),
    prevExpandedPaths: [],
    prevQueryKey: '',
  };

  /**
   * Diff the new expanded paths against the previous set; for each path that
   * is newly expanded (or whose query context changed), schedule computeChildren.
   */
  const schedule = (q: PivotQuery, ctx: { signal: AbortSignal }): void => {
    const queryKey = queryKeyOf(q);
    const invalidateAll = queryKey !== state.prevQueryKey;
    if (invalidateAll) {
      state.cache.clear();
      state.prevQueryKey = queryKey;
    }

    const current = new Set(q.expandedPaths);
    const prev = new Set(state.prevExpandedPaths);
    state.prevExpandedPaths = q.expandedPaths;

    const toFetch: string[] = [];
    for (const path of current) {
      if (invalidateAll || !prev.has(path) || !state.cache.has(path)) {
        toFetch.push(path);
      }
    }

    const debounce = opts.debounceMs ?? 0;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const path of toFetch) {
      const pathValues = JSON.parse(path) as FieldValue[];
      const fetchFn = async () => {
        if (debounce > 0) await wait(debounce);
        return opts.computeChildren(pathValues, q as PivotQuery<TRow>, ctx);
      };
      state.cache.set(path, fetchFn());
    }
  };

  const getChildrenAsync = async (path: string): Promise<PivotRowNode[]> => {
    const promise = state.cache.get(path);
    if (!promise) throw new Error(`Path "${path}" not in expansion set.`);
    return promise;
  };

  const isPathLoading = (path: string): boolean => {
    return state.cache.has(path);
  };

  return {
    schedule,
    getChildrenAsync,
    isPathLoading,
    __state: state,
  };
};

export type { RefetchOrchestrator } from './createServerEngine';
