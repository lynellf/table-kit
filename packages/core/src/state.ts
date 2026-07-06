/**
 * @lynellf/tablekit-core — state engine.
 *
 * Implements the controlled-slice contract (spec §4.2):
 *   - Each slice is independently controllable.
 *   - When controlled, the engine requests changes via the slice callback
 *     and never mutates internal state.
 *   - When uncontrolled, the engine applies the updater synchronously.
 *   - `onStateChange` fires after slice-specific callbacks, only when at
 *     least one slice actually changed.
 *
 * Reducer shape:
 *   Each slice has a `next(prev, updater, ctx)` function that resolves the
 *   next slice value. The factory's dispatch loop calls the right one based
 *   on which slice the consumer's API call targeted.
 */

import type {
  CellPosition,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  DataTableState,
  PaginationState,
  SortItem,
  Updater,
} from './types';
import { DEFAULT_STATE } from './types';
import { shallowEqual, sliceValuesEqual } from './utils';

/**
 * Apply an Updater<T> to a value. Synchronously invokes the function form.
 */
export const resolveUpdater = <T>(prev: T, updater: Updater<T>): T => {
  return typeof updater === 'function' ? (updater as (old: T) => T)(prev) : updater;
};

/** All slice keys. Stable order = insertion order of DataTableState. */
export type StateSliceKey = keyof DataTableState;

type SliceChangeKey =
  | 'sorting'
  | 'columnFilters'
  | 'pagination'
  | 'columnOrder'
  | 'columnVisibility'
  | 'columnPinning'
  | 'columnSizing'
  | 'columnSizingInfo'
  | 'focusedCell';

export type SliceCallbacks = {
  [K in SliceChangeKey]?: (updater: Updater<DataTableState[K]>) => void;
};

/**
 * A `setState`-style API on the instance. Each method corresponds to one slice.
 * For controlled slices, the method dispatches the updater via the slice
 * callback; for uncontrolled slices, it applies the updater to local state.
 */
export interface SliceDispatchers {
  setSorting(updater: Updater<SortItem[]>): void;
  setColumnFilters(updater: Updater<ColumnFilterItem[]>): void;
  setPagination(updater: Updater<PaginationState>): void;
  setColumnOrder(updater: Updater<string[]>): void;
  setColumnVisibility(updater: Updater<Record<string, boolean>>): void;
  setColumnPinning(updater: Updater<ColumnPinningState>): void;
  setColumnSizing(updater: Updater<ColumnSizingState>): void;
  setColumnSizingInfo(updater: Updater<ColumnResizeSession | null>): void;
  setFocusedCell(updater: Updater<CellPosition | null>): void;
}

/**
 * Pure slice reducers. Each reducer takes the current state, a updater, and
 * returns the next state. `setFocusedCell` and `setColumnSizingInfo` accept
 * `null` as a sentinel ("clear").
 */
export const applySliceChange = <K extends SliceChangeKey>(
  state: DataTableState,
  slice: K,
  updater: Updater<DataTableState[K]>,
): DataTableState => {
  const prev = state[slice];
  const next = resolveUpdater(prev, updater);
  if (Object.is(prev, next)) return state;
  const nextState = { ...state, [slice]: next };
  // Avoid creating a new state reference when nothing changed (shallow equality).
  if (shallowEqual(state, nextState)) return state;
  return nextState;
};

/**
 * Determine whether a slice is controlled. A slice is controlled when the
 * consumer's `options.state` contains that key (regardless of value).
 */
export const isSliceControlled = <K extends SliceChangeKey>(
  optionsState: Partial<DataTableState> | undefined,
  slice: K,
): boolean => {
  if (!optionsState) return false;
  return Object.prototype.hasOwnProperty.call(optionsState, slice);
};

/**
 * Build the effective state object by overlaying consumer-controlled slices
 * onto defaults. `initialState` fills in uncontrolled slices; `state` overrides
 * for controlled slices.
 *
 * When `controlledState` is undefined (e.g., useDataSource calls setOptions
 * without a `state` property), we preserve the existing controlled values by
 * spreading an empty object rather than undefined. This prevents the
 * "Maximum update depth exceeded" bug where useDataSource's setOptions calls
 * would reset controlled slices to defaults, triggering unnecessary notifications.
 */
export const mergeInitialState = (
  initialState: Partial<DataTableState> | undefined,
  controlledState: Partial<DataTableState> | undefined,
): DataTableState => {
  return {
    ...DEFAULT_STATE,
    ...(initialState ?? {}),
    ...(controlledState ?? {}),
  };
};

/**
 * Return the slice keys the consumer said are controlled. Used to short-circuit
 * notifications: we don't fire `onStateChange` if no controlled slice differs.
 */
export const controlledSliceKeys = (
  optionsState: Partial<DataTableState> | undefined,
): SliceChangeKey[] => {
  if (!optionsState) return [];
  return Object.keys(optionsState) as SliceChangeKey[];
};

/**
 * Compare two states, shallowly, restricted to the supplied slice keys.
 * Used by the dispatcher to decide whether `onStateChange` should fire.
 */
export const stateChangedOnSlices = (
  prev: DataTableState,
  next: DataTableState,
  slices: SliceChangeKey[],
): boolean => {
  for (const slice of slices) {
    if (!sliceValuesEqual(prev[slice], next[slice])) {
      return true;
    }
  }
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// M4 generic helpers for PivotTableState (signature-compatible for M0 callers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply an updater to a slice of any state shape. M4 widens this from
 * `DataTableState`-specific to generic `Record<string, unknown>`.
 */
export const applySliceChangeGeneric = <
  TState extends Record<string, unknown>,
  K extends keyof TState,
>(
  state: TState,
  slice: K,
  updater: Updater<TState[K]>,
): TState => {
  const prev = state[slice];
  const next = resolveUpdater(prev, updater);
  if (Object.is(prev, next)) return state;
  const nextState = { ...state, [slice]: next };
  if (shallowEqual(state, nextState as Record<string, unknown>)) return state;
  return nextState;
};

/**
 * Merge initial + controlled state for any state shape.
 * M4 generic widening.
 */
export const mergeInitialStateGeneric = <TState extends Record<string, unknown>>(
  initial: Partial<TState> | undefined,
  controlled: Partial<TState> | undefined,
  defaults: TState,
): TState => {
  return { ...defaults, ...(initial ?? {}), ...(controlled ?? {}) } as TState;
};

/**
 * Determine whether a slice is controlled for any state shape.
 */
export const isSliceControlledGeneric = <
  TState extends Record<string, unknown>,
  K extends keyof TState,
>(
  optionsState: Partial<TState> | undefined,
  slice: K,
): boolean => {
  if (!optionsState) return false;
  return Object.prototype.hasOwnProperty.call(optionsState, slice);
};

/**
 * Return the slice keys present in `optionsState` for any state shape.
 */
export const controlledSliceKeysGeneric = <TState extends Record<string, unknown>>(
  optionsState: Partial<TState> | undefined,
): Array<keyof TState> => {
  if (!optionsState) return [];
  return Object.keys(optionsState) as Array<keyof TState>;
};

/**
 * Determine whether any of `slices` changed between prev and next for any state shape.
 */
export const stateChangedOnSlicesGeneric = <TState extends Record<string, unknown>>(
  prev: TState,
  next: TState,
  slices: Array<keyof TState>,
): boolean => {
  for (const slice of slices) {
    if (!Object.is(prev[slice], next[slice])) return true;
  }
  return false;
};
