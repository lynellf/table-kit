/**
 * @lynellf/tablekit-pivot — public type surface.
 *
 * Spec §9.1: Pivot configuration (PivotConfig, FieldRef, MeasureDef, PivotFilter).
 * Spec §9.3: Aggregation engines (AggregationEngine).
 * Spec §9.4: Result model (PivotResult, PivotColumnNode, PivotRowNode, PivotLeafColumn).
 * Spec §9.6: Totals (TotalsConfig).
 * Spec §9.7: Pivot sorting (PivotSortingState).
 *
 * Source-of-truth mapping to docs/initial-spec.md §9.
 */

import type {
  CellPosition,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  Updater,
} from '@lynellf/tablekit-core';

// Re-export core types for pivot package consumers
export type { Updater, Announcer } from '@lynellf/tablekit-core';
export type {
  CellPosition,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
} from '@lynellf/tablekit-core';

// ─────────────────────────────────────────────────────────────────────────────
// Callback types (Phase 1 F0.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callback function type for state change handlers.
 * Accepts an Updater<T> (value or function) and returns void.
 * This is the correct type for onChange handlers in React.
 */
export type OnChangeFn<T> = (updater: Updater<T>) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Primitive aliases
// ─────────────────────────────────────────────────────────────────────────────

/** The value of a field for a given row (opaque to the engine). */
export type FieldValue = string | number | boolean | null | undefined;

/**
 * Stable identity for a row in the pivot tree. Serialized path form: '["West","Q3"]'.
 * Engine MUST produce identical RowPathKey values for the same path on every
 * compute; consumers rely on this for server expansion / controlled state.
 */
export type RowPathKey = string;

/** Stable identity for a leaf column (column-path × measure). E.g. '["2024"]::sales_sum'. */
export type LeafColumnId = string;

/** Stable identity for a measure. Equal to MeasureDef.id. */
export type MeasureId = string;

// ─────────────────────────────────────────────────────────────────────────────
// Pivot configuration (§9.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reference to a field in the source dataset.
 *
 * String form: just the field name. Object form: name + optional accessor
 * (main-thread only) + label (opaque render slot) + sortComparator (registry
 * name for group-label ordering).
 *
 * Inline accessors are legal on the main-thread engine. Anything crossing a
 * boundary (worker / server) must use the string form (P3).
 */
export type FieldRef<TRow = unknown> =
  | string
  | {
      field: string;
      accessor?: (row: TRow) => FieldValue;
      label?: unknown;
      sortComparator?: string;
    };

/**
 * A measure definition. `aggregator` defaults to 'sum' (spec §9.2) — resolved
 * via the aggregator registry. Inline aggregator objects are legal on the
 * main-thread engine; registry names are required for worker/server (P3).
 */
export interface MeasureDef<TRow = unknown, TIn = unknown, TAcc = unknown, TOut = unknown> {
  id: MeasureId;
  field?: string;
  accessor?: (row: TRow) => TIn;
  aggregator?: string | Aggregator<TIn, TAcc, TOut>;
  label?: unknown;
  /** Opaque format hint passed through to render context (e.g., 'currency', 'percent'). */
  format?: string;
}

/**
 * Pre-aggregation filter on the source dataset. Three shapes:
 *  - `{ field, op, value }` — declarative; server/worker-capable.
 *  - `{ predicate }` — inline function; main-thread only.
 *  - `{ predicateRef, args? }` — registry name; worker/server-capable.
 *
 * Spec §9.1 P3: only registry-name shapes cross a boundary.
 */
export type PivotFilter<TRow = unknown> =
  | { field: string; op: 'equals' | 'in' | 'notIn' | 'range' | 'contains'; value: unknown }
  | { predicate: (row: TRow) => boolean }
  | { predicateRef: string; args?: unknown };

/** Totals configuration (§9.6). */
export interface TotalsConfig {
  /** Render the grand-total row in the footer rowgroup. Default: true. */
  grandTotalRow?: boolean;
  /** Render the grand-total column (one leaf per measure, right-pinned by default). Default: true. */
  grandTotalColumn?: boolean;
  /** Position of the grand-total column within the leafColumns array. Default: 'end'. */
  grandTotalColumnPosition?: 'start' | 'end';
  /** Subtotals per group level. M4 honors 'none' only; 'perLevel' is v1.5. Default: 'none'. */
  subtotals?: 'none' | 'perLevel';
}

/** Top-level pivot configuration (§9.1). */
export interface PivotConfig<TRow = unknown> {
  rows: Array<FieldRef<TRow>>;
  columns: Array<FieldRef<TRow>>;
  measures: Array<MeasureDef<TRow>>;
  filters?: Array<PivotFilter<TRow>>;
  totals?: TotalsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pivot state (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Expansion state: a map of RowPathKey → expanded boolean. */
export type PivotExpansionState = Record<RowPathKey, boolean>;

/**
 * Pivot sorting (§9.7). Per-level ordering within each parent.
 *
 * - `{ by: 'label' }` orders groups by their label (uses field's `sortComparator`).
 * - `{ by: 'measure', measureId, columnPath? }` orders groups by a measure value
 *   (optionally under a specific column path).
 */
export type PivotSortingState = Array<
  | {
      level: number;
      by: 'label';
      desc: boolean;
      comparator?: string;
    }
  | {
      level: number;
      by: 'measure';
      measureId: MeasureId;
      columnPath?: Array<FieldValue>;
      desc: boolean;
    }
>;

/**
 * Pivot state. Shares `columnPinning`, `columnSizing`, `columnSizingInfo`, and
 * `focusedCell` with DataTableState. The pivot-specific slices are:
 * - `pivot`: the PivotConfig (controlled/uncontrolled).
 * - `expanded`: Record<RowPathKey, boolean>.
 * - `pivotSorting`: Array<{ level, by, … }>.
 */
export interface PivotTableState {
  pivot: PivotConfig;
  expanded: PivotExpansionState;
  pivotSorting: PivotSortingState;
  columnPinning: ColumnPinningState;
  columnSizing: ColumnSizingState;
  columnSizingInfo: ColumnResizeSession | null;
  focusedCell: CellPosition | null;
}

/** Default state for `createPivotTable`. */
export const DEFAULT_PIVOT_STATE: PivotTableState = {
  pivot: { rows: [], columns: [], measures: [] },
  expanded: {},
  pivotSorting: [],
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator interface (§9.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reducer-shaped aggregator. `merge` is REQUIRED so that worker/server engines
 * can aggregate chunks in parallel and merge, and so that subtotals and grand
 * totals are merges of child accumulators rather than re-scans (spec §9.2).
 *
 * - `init()` returns the zero value for the accumulator.
 * - `accumulate(acc, value, row?)` folds one value into the accumulator.
 * - `merge(a, b)` combines two accumulators of the same shape.
 * - `finalize?(acc)` converts the accumulator to the output value (default: identity).
 *
 * Built-ins (phase 2): `sum`, `count`, `min`, `max`, `avg` (as a mergeable
 * `{sum, count}` pair).
 */
export interface Aggregator<TIn = unknown, TAcc = unknown, TOut = unknown> {
  init(): TAcc;
  accumulate(acc: TAcc, value: TIn, row?: unknown): TAcc;
  /** Required: combines two accumulators. */
  merge(a: TAcc, b: TAcc): TAcc;
  /** Optional: converts accumulator to output value. Default: identity. */
  finalize?(acc: TAcc): TOut;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation engine interface (§9.3)
// ─────────────────────────────────────────────────────────────────────────────

/** MaybePromise utility, mirror of dataSource's MaybePromise. */
export type MaybePromise<T> = T | Promise<T>;

/** Lifecycle state for the latest aggregation request. */
export type PivotTableStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * The aggregation engine seam. M4 ships only the main-thread implementation;
 * worker and server engines are M5.
 *
 * - `compute(q, ctx)` returns the full PivotResult for the given query, with
 *   children materialized only for paths in `q.expandedPaths` (lazy expansion).
 * - `computeChildren?(path, q, ctx)` materializes children of an already-aggregated
 *   node. Required for server expansion (M5); main-thread engine provides it.
 * - `dispose?()` cleans up engine resources (e.g., worker termination). M4's
 *   main-thread engine has nothing to dispose.
 */
export interface AggregationEngine<TRow = unknown> {
  compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): MaybePromise<PivotResult<TRow>>;
  computeChildren?(
    path: Array<FieldValue>,
    q: PivotQuery<TRow>,
    ctx: { signal: AbortSignal },
  ): MaybePromise<PivotRowNode<TRow>[]>;
  dispose?(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialized query (worker/server boundary, §9.3 P3)
// ─────────────────────────────────────────────────────────────────────────────

/** Serialized FieldRef — registry names only, no inline functions. */
export interface SerializedFieldRef {
  field: string;
  label?: unknown;
  sortComparator?: string;
}

/** Serialized MeasureDef — aggregator is a registry name only. */
export interface SerializedMeasureDef {
  id: MeasureId;
  field?: string;
  aggregator: string; // REQUIRED name; 'sum' is the default
  label?: unknown;
  format?: string;
}

/** Serialized PivotFilter — only registry-name shapes cross the boundary. */
export type SerializedPivotFilter =
  | { field: string; op: 'equals' | 'in' | 'notIn' | 'range' | 'contains'; value: unknown }
  | { predicateRef: string; args?: unknown };

/** Main-thread-only predicate retained on an executable PivotQuery. */
export interface InlinePivotFilter<TRow = unknown> {
  predicate: (row: TRow) => boolean;
}

/** A filter accepted by an engine before crossing a serialization boundary. */
export type PivotQueryFilter<TRow = unknown> = SerializedPivotFilter | InlinePivotFilter<TRow>;

/**
 * The query that travels to the engine. Always serializable when crossing a
 * worker/server boundary; inline forms are accepted by the main-thread engine.
 *
 * `rows` is the source dataset (M5 workers cache it on the worker side; M4
 * always passes it through `PivotQuery`).
 */
export interface PivotQuery<TRow = unknown> {
  rows: TRow[];
  rowsFieldRef: Array<SerializedFieldRef>;
  columnsFieldRef: Array<SerializedFieldRef>;
  measures: Array<SerializedMeasureDef>;
  filters: Array<PivotQueryFilter<TRow>>;
  totals: TotalsConfig;
  expandedPaths: Array<RowPathKey>;
  pivotSorting: PivotSortingState;
  /** Inline form for main-thread engine only; stripped when crossing boundary. */
  inlineAccessors?: {
    rows?: Array<{ field: string; accessor?: (row: TRow) => FieldValue }>;
    columns?: Array<{ field: string; accessor?: (row: TRow) => FieldValue }>;
    measures?: Array<{ id: MeasureId; accessor?: (row: TRow) => unknown }>;
    filters?: Array<{ predicate?: (row: TRow) => boolean }>;
    aggregators?: Record<MeasureId, Aggregator>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Result model (§9.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A leaf column — column-path × measure. The flattened render order
 * (including the totals column) is `leafColumns`.
 */
export interface PivotLeafColumn<_TRow = unknown> {
  id: LeafColumnId;
  /** Path of column-field values that lead to this leaf. Empty array when `columns` is empty. */
  path: Array<FieldValue>;
  measureId: MeasureId;
  /** True when this is a grand-total column leaf. */
  isTotal: boolean;
  /** Width in pixels (consumer-controlled; default 100). */
  size: number;
  /** Header text (render slot; opaque to core). */
  header: unknown;
  /** Optional pinned side (grand-total column defaults to 'right'). */
  pinned?: 'left' | 'right';
}

/**
 * A node in the column hierarchy. Leaves have `leaves` only; branches
 * have `children` and a computed `colSpan` for `aria-colspan` emission.
 */
export interface PivotColumnNode {
  /** Unique id (column-path + field). */
  id: string;
  /** Path of column-field values leading to this node. */
  path: Array<FieldValue>;
  /** Field value at this level (the label key). */
  label: FieldValue;
  /** Number of leaf columns under this node (for `aria-colspan`). */
  colSpan: number;
  /** When `children` is empty, this is a leaf (branches always have `leaves`). */
  leaves?: Array<PivotLeafColumn>;
  children?: Array<PivotColumnNode>;
}

/**
 * A node in the row tree. Children are populated lazily based on `expandedPaths`.
 *
 * `childState` semantics:
 *  - 'loaded': children materialized.
 *  - 'notLoaded': path NOT in `expandedPaths`; engine returned aggregated
 *    values but did not enumerate children.
 *  - 'loading' / 'error': used while an asynchronous engine materializes
 *    children.
 */
export interface PivotRowNode<TRow = unknown> {
  key: RowPathKey;
  path: Array<FieldValue>;
  level: number;
  label: FieldValue;
  hasChildren: boolean;
  childState: 'loaded' | 'notLoaded' | 'loading' | 'error';
  /** Materialized children. Absent when `childState === 'notLoaded'`. */
  children?: Array<PivotRowNode<TRow>>;
  /** Per-leaf-column finalized values. */
  values: Record<LeafColumnId, unknown>;
  /** Per-measure row totals (feeds the grand-total column). */
  rowTotals: Record<MeasureId, unknown>;
  /** Engine-specific error when `childState === 'error'`. */
  error?: Error;
}

/**
 * Top-level engine result. `rowRoot` is a synthetic root; its children are
 * the level-0 groups. `grandTotals` feeds the footer row.
 */
export interface PivotResult<TRow = unknown> {
  columnRoot: PivotColumnNode;
  leafColumns: Array<PivotLeafColumn<TRow>>;
  rowRoot: PivotRowNode<TRow>;
  grandTotals: Record<LeafColumnId, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PivotTable instance interface (placeholder; full surface lands in phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative facade. Full surface in phase 4. */
export interface PivotTableInstance<TRow = unknown> {
  getState(): PivotTableState;
  setOptions(options: PivotTableOptions<TRow>): void;
  subscribe(listener: () => void): () => void;
  getResult(): PivotResult<TRow>;
  getStatus(): PivotTableStatus;
  getError(): Error | undefined;
  getVisibleRows(): Array<PivotRowNode<TRow>>;
  getHeaderRows(): Array<Array<{ node: PivotColumnNode | PivotLeafColumn; colSpan: number }>>;
  getLeafColumns(): Array<PivotLeafColumn<TRow>>;
  setPivot(updater: Updater<PivotConfig<TRow>>): void;
  setExpanded(updater: Updater<PivotExpansionState>): void;
  toggleExpanded(path: Array<FieldValue>): void;
  setPivotSorting(updater: Updater<PivotSortingState>): void;
  /** F0.3: Set column pinning state. */
  setColumnPinning(updater: Updater<ColumnPinningState>): void;
  /** F0.3: Set column sizing state. */
  setColumnSizing(updater: Updater<ColumnSizingState>): void;
  /** F0.3: Set column resize session state. */
  setColumnSizingInfo(updater: Updater<ColumnResizeSession | null>): void;
  /** F0.3: Start a resize session for the given column. */
  startResize(columnId: string, startSize: number): void;
  /** F0.3: Adjust the current resize session by the given delta. */
  adjustResize(delta: number): void;
  /** F0.3: Commit the current resize session and update columnSizing. */
  commitResize(): void;
  /** F0.3: Cancel the current resize session without updating columnSizing. */
  cancelResize(): void;
  /** F0.3: Set focused cell state. */
  setFocusedCell(updater: Updater<CellPosition | null>): void;
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
  /** Prop getter for the root treegrid element. */
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  /** Prop getter for the body rowgroup. */
  getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  /** Prop getter for a row. */
  getRowProps(
    row: PivotRowNode<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** Prop getter for a row-header cell. */
  getRowHeaderProps(
    row: PivotRowNode<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** Prop getter for a column header. */
  getHeaderProps(
    node: PivotColumnNode | PivotLeafColumn,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** Prop getter for the expand/collapse toggle. */
  getToggleExpandedProps(
    row: PivotRowNode<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** Prop getter for the footer rowgroup (grand-total row). Returns null if totals.row is disabled. */
  getFooterProps(consumerProps?: Record<string, unknown>): Record<string, unknown> | null;
  /** Prop getter for a totals column leaf. */
  getTotalsColumnProps(
    leaf: PivotLeafColumn<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown>;
  /** Abort in-flight work and release engine resources. */
  dispose(): void;
}

/** Options accepted by `createPivotTable`. Full surface in phase 4. */
export interface PivotTableOptions<TRow = unknown> {
  data: TRow[];
  pivot: PivotConfig<TRow> | ((opts: { data: TRow[] }) => PivotConfig<TRow>);
  initialState?: Partial<PivotTableState>;
  state?: Partial<PivotTableState>;
  /** Phase 1 F0.3: Changed from Updater<T> to OnChangeFn<T>. */
  onPivotChange?: OnChangeFn<PivotConfig<TRow>>;
  /** Phase 1 F0.3: Changed from Updater<T> to OnChangeFn<T>. */
  onExpandedChange?: OnChangeFn<PivotExpansionState>;
  /** Phase 1 F0.3: Changed from Updater<T> to OnChangeFn<T>. */
  onPivotSortingChange?: OnChangeFn<PivotSortingState>;
  /** Phase 1 F0.3: Changed from Updater<T> to OnChangeFn<T>. */
  onStateChange?: OnChangeFn<PivotTableState>;
  /** Aggregation engine. Default: `createMainThreadEngine()`. */
  engine?: AggregationEngine<TRow>;
  /** Announcer. Default: `getGlobalAnnouncer()` (set by ReactAnnouncer in M1). */
  announcer?: import('@lynellf/tablekit-core').Announcer;
  /** getRowId for the source dataset. Default: index-based dev fallback (warning in M4). */
  getRowId?: (row: TRow, index: number) => string;
  /**
   * M6 phase 2: how Tab behaves inside the pivot grid.
   * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
   * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
   */
  tabBehavior?: import('@lynellf/tablekit-core').TabBehavior;
}
