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
  private cache: Map<string, PivotResult<TRow>> = new Map();

  private key(_rowsRef: unknown, query: PivotQuery<TRow>): string {
    // Serialize the query to a stable JSON string. Skip the `rows` field
    // (keyed separately by reference); keep the rest.
    const { rows: _rows, ...rest } = query;
    const queryJson = JSON.stringify(rest, (_key, value) => {
      if (typeof value === 'function') return undefined; // never serialize fns
      return value;
    });
    return `r:${queryJson}`;
  }

  get(rowsRef: unknown, query: PivotQuery<TRow>): PivotResult<TRow> | undefined {
    return this.cache.get(this.key(rowsRef, query));
  }

  set(rowsRef: unknown, query: PivotQuery<TRow>, result: PivotResult<TRow>): void {
    this.cache.set(this.key(rowsRef, query), result);
  }

  clear(): void {
    this.cache.clear();
  }
}
