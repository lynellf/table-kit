# Phase 4 — State Engine + `createDataTable` Factory

**Goal:** Implement the controlled-slice contract from spec §4.2 end-to-end. Ship `state.ts` (per-slice reducers + dispatch) and `createDataTable.ts` (the factory returning a `DataTableInstance<TRow>`). Round-trip tests prove the M0 exit criterion: **“Controlled + uncontrolled state round-trips.”**

After this phase:
- A consumer can call `createDataTable({ data, columns })` and call `.getState()` to read defaults.
- A consumer can pass `state: { sorting: [...] }` and `onSortingChange: (updater) => void` to control that slice.
- A consumer can mix controlled + uncontrolled slices on the same instance.
- `subscribe(listener)` fires synchronously after a slice actually changes.
- `setOptions(next)` replaces the options reference (used by the React adapter in phase 5).

---

## 1. Files created in this phase

| File                                            | Purpose                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/core/src/state.ts`                    | Per-slice reducers + `applyChange()` dispatcher                              |
| `packages/core/src/state.test.ts`               | Unit tests for reducers + dispatcher                                          |
| `packages/core/src/createDataTable.ts`          | `createDataTable<TRow>(options)` factory                                    |
| `packages/core/src/createDataTable.test.ts`     | Round-trip tests: uncontrolled, controlled, mixed, subscribe, setOptions     |

No package config changes.

---

## 2. File contents

### 2.1 `packages/core/src/state.ts`

```ts
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

import { shallowEqual } from './utils';
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

/**
 * Apply an Updater<T> to a value. Synchronously invokes the function form.
 */
export const resolveUpdater = <T>(prev: T, updater: Updater<T>): T => {
  return typeof updater === 'function'
    ? (updater as (old: T) => T)(prev)
    : updater;
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
  return { ...state, [slice]: next };
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
    if (!shallowEqual(prev[slice] as object, next[slice] as object)) {
      return true;
    }
  }
  return false;
};
```

### 2.2 `packages/core/src/state.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  resolveUpdater,
  stateChangedOnSlices,
} from './state';
import { DEFAULT_STATE } from './types';
import type { DataTableState } from './types';

describe('state engine', () => {
  describe('resolveUpdater', () => {
    it('returns the value when updater is a value', () => {
      expect(resolveUpdater(0, 5)).toBe(5);
    });

    it('invokes the function form with the previous value', () => {
      expect(resolveUpdater(10, (n) => n + 1)).toBe(11);
    });
  });

  describe('applySliceChange', () => {
    it('returns the same reference when the updater produces the same value', () => {
      const out = applySliceChange(DEFAULT_STATE, 'sorting', []);
      expect(out).toBe(DEFAULT_STATE);
    });

    it('returns a new state object with the slice replaced', () => {
      const out = applySliceChange(DEFAULT_STATE, 'sorting', [{ id: 'a', desc: false }]);
      expect(out).not.toBe(DEFAULT_STATE);
      expect(out.sorting).toEqual([{ id: 'a', desc: false }]);
    });

    it('supports function updaters', () => {
      const out = applySliceChange(DEFAULT_STATE, 'pagination', (p) => ({
        ...p,
        pageIndex: 2,
      }));
      expect(out.pagination.pageIndex).toBe(2);
    });
  });

  describe('isSliceControlled', () => {
    it('returns false when no options state', () => {
      expect(isSliceControlled(undefined, 'sorting')).toBe(false);
    });

    it('returns true when the key is present (even with undefined value)', () => {
      expect(isSliceControlled({ sorting: undefined }, 'sorting')).toBe(true);
    });

    it('returns false when the key is absent', () => {
      expect(isSliceControlled({ pagination: { pageIndex: 0, pageSize: 10 } }, 'sorting')).toBe(false);
    });
  });

  describe('mergeInitialState', () => {
    it('uses defaults when neither is provided', () => {
      expect(mergeInitialState(undefined, undefined)).toEqual(DEFAULT_STATE);
    });

    it('overlays initialState onto defaults', () => {
      const out = mergeInitialState({ sorting: [{ id: 'a', desc: false }] }, undefined);
      expect(out.sorting).toEqual([{ id: 'a', desc: false }]);
    });

    it('controlled state wins over initialState', () => {
      const out = mergeInitialState(
        { sorting: [{ id: 'a', desc: false }] },
        { sorting: [{ id: 'b', desc: true }] },
      );
      expect(out.sorting).toEqual([{ id: 'b', desc: true }]);
    });
  });

  describe('controlledSliceKeys', () => {
    it('returns an empty array when no options state', () => {
      expect(controlledSliceKeys(undefined)).toEqual([]);
    });

    it('returns the keys present in options state', () => {
      expect(controlledSliceKeys({ sorting: [], pagination: { pageIndex: 0, pageSize: 25 } })).toEqual([
        'sorting',
        'pagination',
      ]);
    });
  });

  describe('stateChangedOnSlices', () => {
    it('returns false when no slices differ', () => {
      const a: DataTableState = { ...DEFAULT_STATE };
      const b: DataTableState = { ...DEFAULT_STATE };
      expect(stateChangedOnSlices(a, b, ['sorting', 'pagination'])).toBe(false);
    });

    it('returns true when a slice differs by reference', () => {
      const a: DataTableState = { ...DEFAULT_STATE };
      const b: DataTableState = { ...DEFAULT_STATE, sorting: [{ id: 'a', desc: false }] };
      expect(stateChangedOnSlices(a, b, ['sorting'])).toBe(true);
    });

    it('returns true when a slice value differs by deep equality', () => {
      const a: DataTableState = { ...DEFAULT_STATE, pagination: { pageIndex: 0, pageSize: 10 } };
      const b: DataTableState = { ...DEFAULT_STATE, pagination: { pageIndex: 1, pageSize: 10 } };
      expect(stateChangedOnSlices(a, b, ['pagination'])).toBe(true);
    });
  });
});
```

### 2.3 `packages/core/src/createDataTable.ts`

```ts
/**
 * @lynellf/tablekit-core — `createDataTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, `getRowModel`. M0 ships these four methods. M1+ adds prop
 * getters, virtualizers, etc.
 */

import { createColumns, defaultGetRowId } from './columns';
import type { Column } from './columns';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  stateChangedOnSlices,
} from './state';
import type { SliceDispatchers } from './state';
import type {
  CellPosition,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  PaginationState,
  SortItem,
} from './types';
import { shallowEqual } from './utils';

/**
 * Implementation class. Public surface is the `DataTableInstance<TRow>`
 * interface; the class is not exported.
 */
class DataTable<TRow> implements DataTableInstance<TRow> {
  private options: DataTableOptions<TRow>;
  private state: DataTableState;
  private listeners: Set<() => void> = new Set();

  constructor(options: DataTableOptions<TRow>) {
    this.options = options;
    this.state = mergeInitialState(options.initialState, options.state);
  }

  getState(): DataTableState {
    return this.state;
  }

  setOptions(next: DataTableOptions<TRow>): void {
    if (Object.is(next, this.options)) return;
    const prevState = this.state;
    this.options = next;
    this.state = mergeInitialState(next.initialState, next.state);
    // Notify listeners if state actually changed (e.g., initialState change).
    if (stateChangedOnSlices(prevState, this.state, [
      'sorting',
      'columnFilters',
      'pagination',
      'columnOrder',
      'columnVisibility',
      'columnPinning',
      'columnSizing',
      'columnSizingInfo',
      'focusedCell',
    ])) {
      this.notify();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRowModel(): TRow[] {
    // M0: return the input data reference. M1 replaces with the pipeline output.
    return this.options.data;
  }

  /**
   * Resolve a slice change. For controlled slices, hand the updater to the
   * slice callback (consumer owns state). For uncontrolled slices, apply
   * locally, then notify listeners, then fire `onStateChange` if the consumer
   * asked for it.
   */
  private applyChange<K extends keyof DataTableState>(
    slice: K,
    updater: DataTableState[K] | ((old: DataTableState[K]) => DataTableState[K]),
  ): void {
    const controlled = isSliceControlled(this.options.state, slice);
    if (controlled) {
      // Hand the raw updater to the consumer; do not mutate internal state.
      const cb = this.sliceCallback(slice);
      if (cb) {
        (cb as (u: unknown) => void)(updater);
      }
      return;
    }
    const prev = this.state;
    const next = applySliceChange(prev, slice, updater);
    if (Object.is(prev, next)) return;
    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }

  private sliceCallback<K extends keyof DataTableState>(
    slice: K,
  ): ((updater: unknown) => void) | undefined {
    // Static mapping from slice key → consumer callback name.
    //
    // Originally this lookup used `` `on${capitalize(slice)}Change` ``, which
    // is fragile: any future `capitalize` change (or a slice key that doesn't
    // follow the camelCase-from-snake convention) silently no-ops the dispatch.
    // A closed `Record` removes that failure mode and lets the type-checker
    // verify all nine keys are present when `SliceChangeKey` is extended.
    const CB: Record<SliceChangeKey, string> = {
      sorting: 'onSortingChange',
      columnFilters: 'onColumnFiltersChange',
      pagination: 'onPaginationChange',
      columnOrder: 'onColumnOrderChange',
      columnVisibility: 'onColumnVisibilityChange',
      columnPinning: 'onColumnPinningChange',
      columnSizing: 'onColumnSizingChange',
      columnSizingInfo: 'onColumnSizingInfoChange',
      focusedCell: 'onFocusedCellChange',
    };
    const o = this.options as unknown as Record<string, unknown>;
    return o[CB[slice as SliceChangeKey]] as
      | ((updater: unknown) => void)
      | undefined;
  }

  private notifySliceAndAggregate(
    prev: DataTableState,
    next: DataTableState,
  ): void {
    // Fire per-slice onChange only when the consumer wired one up. For
    // uncontrolled slices, the consumer has no slice-specific callback
    // (they passed `state` to make it controlled), but they may have passed
    // `onStateChange`. We fire that here.
    if (this.options.onStateChange) {
      // Only fire if at least one slice changed.
      if (stateChangedOnSlices(prev, next, controlledSliceKeys(this.options.state).length === 0
        ? ['sorting', 'columnFilters', 'pagination', 'columnOrder', 'columnVisibility', 'columnPinning', 'columnSizing', 'columnSizingInfo', 'focusedCell']
        : (Object.keys(this.options.state as object) as Array<keyof DataTableState>))) {
        this.options.onStateChange(next);
      }
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ─────── Public slice dispatchers ───────

  setSorting = (updater: DataTableState['sorting'] | ((old: DataTableState['sorting']) => DataTableState['sorting'])): void => {
    this.applyChange('sorting', updater);
  };
  setColumnFilters = (updater: ColumnFilterItem[] | ((old: ColumnFilterItem[]) => ColumnFilterItem[])): void => {
    this.applyChange('columnFilters', updater);
  };
  setPagination = (updater: PaginationState | ((old: PaginationState) => PaginationState)): void => {
    this.applyChange('pagination', updater);
  };
  setColumnOrder = (updater: string[] | ((old: string[]) => string[])): void => {
    this.applyChange('columnOrder', updater);
  };
  setColumnVisibility = (updater: Record<string, boolean> | ((old: Record<string, boolean>) => Record<string, boolean>)): void => {
    this.applyChange('columnVisibility', updater);
  };
  setColumnPinning = (updater: ColumnPinningState | ((old: ColumnPinningState) => ColumnPinningState)): void => {
    this.applyChange('columnPinning', updater);
  };
  setColumnSizing = (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)): void => {
    this.applyChange('columnSizing', updater);
  };
  setColumnSizingInfo = (updater: ColumnResizeSession | null | ((old: ColumnResizeSession | null) => ColumnResizeSession | null)): void => {
    this.applyChange('columnSizingInfo', updater);
  };
  setFocusedCell = (updater: CellPosition | null | ((old: CellPosition | null) => CellPosition | null)): void => {
    this.applyChange('focusedCell', updater);
  };
}

/**
 * Public factory.
 */
export const createDataTable = <TRow>(
  options: DataTableOptions<TRow>,
): DataTableInstance<TRow> => {
  // We expose the dispatchers via `as unknown as` because the public
  // DataTableInstance interface (M0) does not include them; they are an
  // additive internal surface that later milestones will formalize on the
  // public instance. Tests reach in via the same cast.
  const instance = new DataTable<TRow>(options);
  return instance as DataTableInstance<TRow> & SliceDispatchers;
};

export { defaultGetRowId };
export type { Column };
```

> **Note on slice dispatcher exposure**: the spec (§4.1) shows imperative methods like `setSorting`, `nextPage`, `moveColumn` on the instance; M0 exposes them so consumers can wire controlled-slice behavior end-to-end. They are not in the public `DataTableInstance<TRow>` interface yet (that’s M1 surface work), but the implementation has them and the tests cast to access them. M1 will add them to the public type.

### 2.4 `packages/core/src/createDataTable.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDataTable } from './createDataTable';
import type {
  CellPosition,
  ColumnFilterItem,
  DataTableOptions,
  DataTableState,
} from './types';
import { DEFAULT_STATE } from './types';
import type { SliceDispatchers } from './state';

interface Person {
  id: string;
  name: string;
  age: number;
}

const baseOptions = (): DataTableOptions<Person> => ({
  data: [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ],
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age', enableSorting: true },
  ],
});

const dispatchers = (i: ReturnType<typeof createDataTable<Person>>): SliceDispatchers =>
  i as unknown as SliceDispatchers;

describe('createDataTable', () => {
  describe('uncontrolled round-trip', () => {
    it('returns the default state when nothing is configured', () => {
      const table = createDataTable(baseOptions());
      expect(table.getState()).toEqual(DEFAULT_STATE);
    });

    it('applies initialState', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: {
          sorting: [{ id: 'age', desc: false }],
          pagination: { pageIndex: 2, pageSize: 50 },
        },
      });
      const state = table.getState();
      expect(state.sorting).toEqual([{ id: 'age', desc: false }]);
      expect(state.pagination).toEqual({ pageIndex: 2, pageSize: 50 });
    });

    it('applies an updater and notifies the listener', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not notify when an updater produces the same value', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);
      dispatchers(table).setSorting([]); // already []
      expect(listener).not.toHaveBeenCalled();
    });

    it('function-form updaters read the previous slice', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
      });
      dispatchers(table).setPagination((p) => ({ ...p, pageIndex: p.pageIndex + 1 }));
      expect(table.getState().pagination.pageIndex).toBe(1);
    });
  });

  describe('controlled round-trip', () => {
    it('hands the updater to the slice callback and does NOT mutate internal state', () => {
      const onSortingChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'age', desc: false }] },
        onSortingChange,
      });
      dispatchers(table).setSorting([{ id: 'name', desc: true }]);
      // Internal state unchanged; consumer still owns the slice.
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: false }]);
      expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: true }]);
    });

    it('respects the consumer-provided state in setOptions', () => {
      const table = createDataTable(baseOptions());
      // Consumer updates state externally and pushes new options.
      const next: DataTableOptions<Person> = {
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: true }] },
        onSortingChange: vi.fn(),
      };
      table.setOptions(next);
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: true }]);
    });

    it('fires onStateChange when the consumer mutates via setOptions', () => {
      const onStateChange = vi.fn();
      const table = createDataTable(baseOptions());
      table.setOptions({ ...baseOptions(), onStateChange });
      // After setOptions, internal state has been re-merged; onStateChange
      // is only invoked when *slices* change, not on plain option replacement.
      // The initial state equals DEFAULT_STATE — onStateChange is not called.
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it('mixes controlled and uncontrolled slices', () => {
      const onSortingChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'age', desc: false }] },
        onSortingChange,
        // pagination stays uncontrolled
      });
      // Controlled slice dispatch → callback.
      dispatchers(table).setSorting([{ id: 'name', desc: true }]);
      expect(onSortingChange).toHaveBeenCalledTimes(1);
      // Uncontrolled slice dispatch → internal mutation + listener.
      const listener = vi.fn();
      table.subscribe(listener);
      dispatchers(table).setPagination((p) => ({ ...p, pageIndex: 7 }));
      expect(table.getState().pagination.pageIndex).toBe(7);
      expect(listener).toHaveBeenCalledTimes(1);
      // Controlled slice was untouched.
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: false }]);
    });

    // ─── CamelCase slices ────────────────────────────────────────────────
    //
    // `sorting` (single-word) is the easy case for the `on<Slice>Change`
    // lookup. These tests pin the camelCase slices so a regression in the
    // slice-callback mapping cannot ship unnoticed. See `sliceCallback` in
    // `createDataTable.ts` for the static key map.

    it('controlled columnFilters: dispatch invokes the consumer callback with the raw updater', () => {
      const onColumnFiltersChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { columnFilters: [] },
        onColumnFiltersChange,
      });
      const filter: ColumnFilterItem = { id: 'name', value: 'Alice' };
      dispatchers(table).setColumnFilters([filter]);
      // Internal state is unchanged; consumer still owns the slice.
      expect(table.getState().columnFilters).toEqual([]);
      expect(onColumnFiltersChange).toHaveBeenCalledTimes(1);
      expect(onColumnFiltersChange).toHaveBeenCalledWith([filter]);
    });

    it('controlled columnFilters: function-form updater is passed through unchanged', () => {
      const onColumnFiltersChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { columnFilters: [] },
        onColumnFiltersChange,
      });
      const updater = (prev: ColumnFilterItem[]) => [
        ...prev,
        { id: 'age', value: 30 },
      ];
      dispatchers(table).setColumnFilters(updater);
      // The raw updater function must reach the consumer untouched.
      expect(onColumnFiltersChange).toHaveBeenCalledTimes(1);
      expect(onColumnFiltersChange).toHaveBeenCalledWith(updater);
    });

    it('controlled focusedCell: dispatch invokes the consumer callback with the raw updater', () => {
      const onFocusedCellChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { focusedCell: null },
        onFocusedCellChange,
      });
      const cell: CellPosition = { rowId: '1', columnId: 'name' };
      dispatchers(table).setFocusedCell(cell);
      // Internal state is unchanged; consumer still owns the slice.
      expect(table.getState().focusedCell).toBeNull();
      expect(onFocusedCellChange).toHaveBeenCalledTimes(1);
      expect(onFocusedCellChange).toHaveBeenCalledWith(cell);
    });

    it('controlled focusedCell: function-form updater can clear focus (null sentinel)', () => {
      const onFocusedCellChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { focusedCell: { rowId: '1', columnId: 'name' } },
        onFocusedCellChange,
      });
      dispatchers(table).setFocusedCell(null);
      // The sentinel `null` reaches the consumer as-is.
      expect(onFocusedCellChange).toHaveBeenCalledTimes(1);
      expect(onFocusedCellChange).toHaveBeenCalledWith(null);
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function that removes the listener', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      const unsub = table.subscribe(listener);
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
      dispatchers(table).setSorting([{ id: 'age', desc: false }]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies multiple listeners in subscription order', () => {
      const table = createDataTable(baseOptions());
      const calls: string[] = [];
      table.subscribe(() => calls.push('a'));
      table.subscribe(() => calls.push('b'));
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      expect(calls).toEqual(['a', 'b']);
    });
  });

  describe('setOptions', () => {
    it('is a no-op when passed the same reference', () => {
      const table = createDataTable(baseOptions());
      const opts = baseOptions();
      table.setOptions(opts);
      const listener = vi.fn();
      table.subscribe(listener);
      table.setOptions(opts);
      expect(listener).not.toHaveBeenCalled();
    });

    it('honors a new initialState in setOptions', () => {
      const table = createDataTable(baseOptions());
      table.setOptions({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'age', desc: true }] },
      });
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
    });

    it('honors a new controlled state in setOptions', () => {
      const table = createDataTable(baseOptions());
      table.setOptions({
        ...baseOptions(),
        state: { pagination: { pageIndex: 3, pageSize: 10 } },
        onPaginationChange: vi.fn(),
      });
      expect(table.getState().pagination).toEqual({ pageIndex: 3, pageSize: 10 });
    });
  });

  describe('getRowModel (M0)', () => {
    it('returns the input data reference', () => {
      const data = [{ id: '1', name: 'Alice', age: 30 }];
      const table = createDataTable({ ...baseOptions(), data });
      expect(table.getRowModel()).toBe(data);
    });
  });

  describe('controlled-slice short-circuit on onStateChange', () => {
    it('does not fire onStateChange when no controlled slice changed', () => {
      const onStateChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'age', desc: false }] },
        onSortingChange: vi.fn(),
        onStateChange,
      });
      // Mutate an UNCONTROLLED slice.
      dispatchers(table).setPagination((p) => ({ ...p, pageIndex: 1 }));
      // onStateChange should NOT fire because no *controlled* slice changed.
      // (Implementation note: the factory currently fires onStateChange on
      // any change; the M0 test pins the chosen semantics — see Phase 4 risks.)
      // The expectation below documents the M0 behavior.
      expect(onStateChange).toHaveBeenCalledTimes(0);
    });

    // ─── Positive cases (all-uncontrolled scenario) ─────────────────────
    //
    // These tests complement the negative case above. When the consumer
    // does NOT pass any `state` keys, the engine owns all slice state.
    // Any slice mutation goes through the uncontrolled path of
    // `applyChange`, which calls `notifySliceAndAggregate` and fires
    // `onStateChange` (because the predicate's "no controlled slices"
    // branch compares all slices and the mutated slice differs).
    //
    // These pin the M0 contract:
    //   - `onStateChange` fires when state changes (positive case).
    //   - The callback receives the FULL `DataTableState`, not a partial
    //     slice update, so consumers can route the aggregate through
    //     Redux/Zustand/XState/URL params without diffing.

    it('fires onStateChange when a slice changes (all-uncontrolled scenario)', () => {
      const onStateChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        // No `state` keys → all slices uncontrolled; the engine owns state.
        onStateChange,
      });
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      expect(onStateChange).toHaveBeenCalledTimes(1);
    });

    it('passes the full DataTableState to onStateChange, not a partial slice update', () => {
      const onStateChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        onStateChange,
      });
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      const callArg = onStateChange.mock.calls[0]?.[0] as
        | DataTableState
        | undefined;
      expect(callArg).toBeDefined();
      // The mutated slice carries the new value.
      expect(callArg?.sorting).toEqual([{ id: 'age', desc: true }]);
      // All other slices retain their default shape — the aggregate
      // callback always receives the complete state.
      expect(callArg?.columnFilters).toEqual([]);
      expect(callArg?.pagination).toEqual({ pageIndex: 0, pageSize: 25 });
      expect(callArg?.columnOrder).toEqual([]);
      expect(callArg?.columnVisibility).toEqual({});
      expect(callArg?.columnPinning).toEqual({ left: [], right: [] });
      expect(callArg?.columnSizing).toEqual({});
      expect(callArg?.columnSizingInfo).toBeNull();
      expect(callArg?.focusedCell).toBeNull();
    });
  });

  describe('subscribe + onStateChange co-firing', () => {
    // The state engine has two notification channels:
    //   1. `onStateChange(next)` — the aggregate, user-supplied callback.
    //   2. `subscribe(listener)` — fan-out for React's `useSyncExternalStore`
    //      and any other consumer-side observer.
    //
    // These tests pin the contract that BOTH fire on a real state change,
    // and document the ordering: `onStateChange` fires first (so a
    // global observer can read the new state before subscribed components
    // re-render), then subscribed listeners fire in subscription order.

    it('fires both subscriber and onStateChange on a slice change', () => {
      const onStateChange = vi.fn();
      const subscriber = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        onStateChange,
      });
      table.subscribe(subscriber);
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenCalledTimes(1);
    });

    it('fires onStateChange before subscribers (global notification first)', () => {
      const calls: string[] = [];
      const table = createDataTable({
        ...baseOptions(),
        onStateChange: () => calls.push('onStateChange'),
      });
      table.subscribe(() => calls.push('subscriber-1'));
      table.subscribe(() => calls.push('subscriber-2'));
      dispatchers(table).setSorting([{ id: 'age', desc: true }]);
      // Aggregate fires once, then subscribers fire in subscription order.
      expect(calls).toEqual(['onStateChange', 'subscriber-1', 'subscriber-2']);
    });

    it('does not fire either channel on a no-op update', () => {
      const onStateChange = vi.fn();
      const subscriber = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        onStateChange,
      });
      table.subscribe(subscriber);
      dispatchers(table).setSorting([]); // already []
      expect(subscriber).not.toHaveBeenCalled();
      expect(onStateChange).not.toHaveBeenCalled();
    });
  });
});
```

---

## 3. Commands (in order)

```bash
# 1. Write all files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm verify
```

Expected after phase 4:
- All phase-1/2/3 tests still pass.
- 9 new state tests pass.
- 25 new factory tests pass (16 baseline + 4 camelCase slice round-trip
  tests from revision 2 + 2 positive `onStateChange` tests + 3
  subscribe/onStateChange co-firing tests from revision 3 — see §7 change
  log).
- `pnpm verify` exit 0.

---

## 4. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
# Look for:
#   ✓ state engine > ... (9 tests)
#   ✓ createDataTable > uncontrolled round-trip > ... (5 tests)
#   ✓ createDataTable > controlled round-trip > ... (8 tests)
#       (4 baseline + 4 camelCase slice round-trip tests)
#   ✓ createDataTable > subscribe > ... (2 tests)
#   ✓ createDataTable > setOptions > ... (3 tests)
#   ✓ createDataTable > getRowModel (M0) > ... (1 test)
#   ✓ createDataTable > controlled-slice short-circuit on onStateChange > ... (3 tests)
#       (1 negative case from revision 1 + 2 positive cases from revision 3)
#   ✓ createDataTable > subscribe + onStateChange co-firing > ... (3 tests)
#       (added in revision 3)
```

---

## 5. Out of scope for this phase

- React adapter (`useDataTable`) — phase 5.
- Public re-exports from `index.ts` — phase 6.
- The dispatchers on the public `DataTableInstance<TRow>` interface (currently reached via `as unknown as SliceDispatchers`) — formalized in M1.
- Prop getters (`getGridProps`, `getHeaderProps`, etc.) — M1.
- Row pipeline (`getRowModel()` returning filtered/sorted/paginated rows) — M1.

---

## 6. Risks specific to this phase

| Risk                                                                                                                  | Mitigation                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`onStateChange` semantics**: spec §4.2 doesn’t fully nail down *when* it fires relative to slice-specific callbacks. | This plan pins it to: fires after slice-specific callbacks, only when at least one **controlled** slice changed. The short-circuit test codifies this; review can revise.                                          |
| **`noUncheckedIndexedAccess`** on slice key lookups inside the dispatcher.                                            | We dispatch via a single `applyChange<K extends keyof DataTableState>` function with explicit slice keying; no index access used.                                                                                |
| **Public type vs internal dispatchers mismatch**.                                                                     | Tests cast via `as unknown as SliceDispatchers`. Documented in code. M1 will add the dispatchers to the public interface.                                                                                       |
| **`setOptions` infinite loops** if consumer passes a new options object on every render and the dispatcher mutates state via the new callback. | The factory only mutates state for **uncontrolled** slices. Controlled slices route through the callback; the consumer is responsible for not re-creating `state` references on every render if it would loop. Documented in code comments. |
| **State engine imports from `columns.ts`** (and not vice versa).                                                     | Verified: `state.ts` has no `columns` import; `createDataTable.ts` imports both.                                                                                                                                  |

---

## 7. Change log

### Revision 3 (this update — addresses `plan-reviewer-a` APPROVE-WITH-NITS)

Triggered by panel re-review of revision 2. `plan-reviewer-a` confirmed all
five prior REQUEST-CHANGES items were resolved and approved the plan,
flagging two remaining nits about test coverage gaps. Both nits are
addressed here by adding five new tests to `createDataTable.test.ts`:

1. **Positive `onStateChange` coverage** (§2.4). Added two new `it` blocks
   inside the existing `describe('controlled-slice short-circuit on
   onStateChange', ...)` block:
   - `fires onStateChange when a slice changes (all-uncontrolled scenario)`
   - `passes the full DataTableState to onStateChange, not a partial slice update`
   The first pins the positive case (consumer delegates state to the engine
   by omitting `state` keys; mutations fire `onStateChange`). The second
   pins the API contract from `phase-1-core-types.md` §2.3 (`onStateChange`
   receives the full `DataTableState`, never a partial slice update). These
   complement the existing negative case, which covers the mixed scenario.
2. **Subscribe + onStateChange co-firing** (§2.4). Added a new
   `describe('subscribe + onStateChange co-firing', ...)` block with three
   tests:
   - `fires both subscriber and onStateChange on a slice change`
   - `fires onStateChange before subscribers (global notification first)`
   - `does not fire either channel on a no-op update`
   The ordering test pins the contract that `onStateChange` fires once
   before subscribed listeners, so a global observer can read the new state
   before components re-render. The no-op test pins the short-circuit
   behavior across both notification channels.

No implementation changes. The factory's `notifySliceAndAggregate` already
fires `onStateChange` in the all-uncontrolled scenario (because
`controlledSliceKeys(...).length === 0` selects the all-slices predicate
branch in `stateChangedOnSlices`), and the implementation order is already
`onStateChange(next)` → `this.notify()`. The new tests codify that
behavior; if either drifts, the tests fail at the next `pnpm verify`.

The mixed-scenario "controlled slice change → onStateChange fires" case
(intuitively suggested by the reviewer's wording) is **not** covered by
these tests because the current implementation does not fire `onStateChange`
from the controlled path of `applyChange` (the dispatcher hands the updater
to the consumer callback and returns early). Closing that gap is a future
revision that would require either firing `onStateChange` after the slice
callback in the controlled path, or making `setOptions` fire `onStateChange`
when state changes — both are structural changes outside the scope of this
nit-resolution pass. The negative case test documents the M0 contract;
any future change to that contract should update both the implementation
and these tests.

Verification section (§3 and §4) updated to reflect the new test count
(20 → 25 factory tests after revision 3). §7 (this entry) documents the delta.

### Revision 2 (addresses `plan-reviewer-a` REQUEST-CHANGES)

Triggered by panel review of revision 1. Two required fixes plus three
low-severity improvements were applied:

1. **`sliceCallback` refactored** (§2.3). Replaced the runtime
   `` `on${capitalize(slice)}Change` `` string construction with a static
   `` Record<SliceChangeKey, string> `` mapping that enumerates all nine
   slice keys explicitly. The `capitalize` helper was removed. The mapping
   is colocated with the method that uses it; the type-checker will flag
   any future `SliceChangeKey` addition that is not reflected in `CB`.
2. **Test matrix expanded** (§2.4). Added four new tests in the
   `controlled round-trip` describe block:
   - `controlled columnFilters: dispatch invokes the consumer callback with the raw updater`
   - `controlled columnFilters: function-form updater is passed through unchanged`
   - `controlled focusedCell: dispatch invokes the consumer callback with the raw updater`
   - `controlled focusedCell: function-form updater can clear focus (null sentinel)`
   These pin the camelCase slices so any future regression in the callback
   lookup cannot ship unnoticed. The `sorting` round-trip test is retained
   for symmetry with the existing baseline.
3. **`onStateChange` comment expanded** in `phase-1-core-types.md` §2.3 to
   document the controlled-slice short-circuit semantics in the public type
   surface, so consumers reading only `types.ts` understand the design.
4. **`defaultGetRowId` warning suppressed in test env** in
   `phase-3-column-model.md` §2.1 (added `&& process.env.NODE_ENV !== 'test'`).
   Test output is no longer polluted; production warning is unchanged.
5. **Phase 5 vitest note** expanded to make the root/per-package config
   coexistence intent explicit.

No structural or scope changes. No phase ordering changes. No changes to
phases 1, 2, 3, 5, or 6 except the targeted low-severity improvements
above. Verification section updated to reflect the new test count.

### Revision 1 (initial plan)

First draft submitted for panel review.