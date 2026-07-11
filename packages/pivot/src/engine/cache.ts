/**
 * @lynellf/tablekit-pivot/engine — query result cache.
 *
 * Memoizes engine `compute` results to meet the §12 perf budget. Keyed on:
 *   - `rows` reference (the source dataset)
 *   - serialized `query` (rows / columns / measures / filters / totals / expandedPaths / pivotSorting)
 *
 * Invalidation: cache miss → recompute. The reference-keyed approach matches M2's
 * `RowModelCache` pattern: consumers mutating `rows` in place get stale results
 * until they pass a new array reference. (Same caveat documented in M2.)
 */

import type { PivotQuery, PivotResult } from '../types';

export class PivotResultCache<TRow = unknown> {
  private cache = new WeakMap<object, Map<string, PivotResult<TRow>>>();
  private functionIds = new WeakMap<object, number>();
  private nextFunctionId = 1;

  private functionKey(fn: object): string {
    const existing = this.functionIds.get(fn);
    if (existing !== undefined) return `__tablekit_function_${existing}`;
    const id = this.nextFunctionId;
    this.nextFunctionId += 1;
    this.functionIds.set(fn, id);
    return `__tablekit_function_${id}`;
  }

  private key(query: PivotQuery<TRow>): string {
    // Serialize the query to a stable JSON string. The source rows reference
    // is the WeakMap key, so replacement datasets cannot reuse old results.
    const { rows: _rows, ...rest } = query;
    const queryJson = JSON.stringify(rest, (_key, value) => {
      if (typeof value === 'function') return this.functionKey(value);
      return value;
    });
    return `r:${queryJson}`;
  }

  get(rowsRef: unknown, query: PivotQuery<TRow>): PivotResult<TRow> | undefined {
    if (!rowsRef || (typeof rowsRef !== 'object' && typeof rowsRef !== 'function'))
      return undefined;
    return this.cache.get(rowsRef as object)?.get(this.key(query));
  }

  set(rowsRef: unknown, query: PivotQuery<TRow>, result: PivotResult<TRow>): void {
    if (!rowsRef || (typeof rowsRef !== 'object' && typeof rowsRef !== 'function')) return;
    const rowsCache = this.cache.get(rowsRef as object) ?? new Map<string, PivotResult<TRow>>();
    rowsCache.set(this.key(query), result);
    this.cache.set(rowsRef as object, rowsCache);
  }

  clear(): void {
    this.cache = new WeakMap();
  }
}
