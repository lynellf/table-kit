/**
 * @lynellf/tablekit-worker/protocol — wire types for the worker boundary.
 *
 * Spec §9.3: Worker engine uses a structured-clone message protocol.
 * Rows are sent once via `setRows`; subsequent `compute` and `computeChildren`
 * calls send only the serialized `WirePivotQuery` (no rows, no inline functions).
 *
 * Wire types mirror the pivot package's types but exclude:
 *  - `rows` (sent once via setRows, cached in the worker)
 *  - `inlineAccessors` (stripped by buildPivotQuery({ serialize: true }))
 */

import type { FieldValue, PivotResult, PivotRowNode, RowPathKey } from '@lynellf/tablekit-pivot';

// ─────────────────────────────────────────────────────────────────────────────
// Wire query — stripped of rows and inline accessors
// ─────────────────────────────────────────────────────────────────────────────

/** Derived from PivotQuery, excludes rows (set once via setRows) and inlineAccessors. */
export type WirePivotQuery = {
  rowsFieldRef: Array<{ field: string; label?: unknown; sortComparator?: string }>;
  columnsFieldRef: Array<{ field: string; label?: unknown; sortComparator?: string }>;
  measures: Array<{
    id: string;
    field?: string;
    aggregator: string;
    label?: unknown;
    format?: string;
  }>;
  filters: Array<
    | { field: string; op: 'equals' | 'in' | 'notIn' | 'range' | 'contains'; value: unknown }
    | { predicateRef: string; args?: unknown }
  >;
  totals: {
    grandTotalRow?: boolean;
    grandTotalColumn?: boolean;
    grandTotalColumnPosition?: 'start' | 'end';
    subtotals?: 'none' | 'perLevel';
  };
  expandedPaths: Array<RowPathKey>;
  pivotSorting: Array<
    | { level: number; by: 'label'; desc: boolean; comparator?: string }
    | {
        level: number;
        by: 'measure';
        measureId: string;
        columnPath?: Array<FieldValue>;
        desc: boolean;
      }
  >;
};

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response types
// ─────────────────────────────────────────────────────────────────────────────

/** Monotonic request id; out-of-order responses are dropped. */
export type RequestId = number;

/** Discriminated union of all messages sent from main thread to worker. */
export type WorkerRequest =
  | { type: 'setRows'; requestId: RequestId; rows: unknown[] }
  | { type: 'compute'; requestId: RequestId; query: WirePivotQuery }
  | {
      type: 'computeChildren';
      requestId: RequestId;
      path: Array<FieldValue>;
      query: WirePivotQuery;
    }
  | { type: 'dispose'; requestId: RequestId };

/** Discriminated union of all messages sent from worker to main thread. */
export type WorkerResponse =
  | { type: 'setRows:ok'; requestId: RequestId }
  | { type: 'compute:ok'; requestId: RequestId; result: PivotResult }
  | { type: 'computeChildren:ok'; requestId: RequestId; children: Array<PivotRowNode> }
  | { type: 'dispose:ok'; requestId: RequestId }
  | { type: 'error'; requestId: RequestId; error: SerializedError };

/** Structured-clone-safe error shape. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}
