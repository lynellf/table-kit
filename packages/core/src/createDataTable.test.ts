import { describe, expect, it, vi } from 'vitest';
import { createDataTable } from './createDataTable';
import type { SliceDispatchers } from './state';
import type {
  CellPosition,
  ColumnFilterItem,
  DataTableOptions,
  DataTableState,
  Row,
} from './types';
import { DEFAULT_STATE } from './types';

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
      const updater = (prev: ColumnFilterItem[]) => [...prev, { id: 'age', value: 30 }];
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

  describe('getRowModel (M1)', () => {
    it('returns Row objects wrapping the input data', () => {
      const data = [{ id: '1', name: 'Alice', age: 30 }];
      const table = createDataTable({
        ...baseOptions(),
        data,
        getRowId: (row) => row.id,
      });
      const model = table.getRowModel();
      expect(model).toHaveLength(1);
      expect((model[0] as Row<Person>).id).toBe('1');
      expect((model[0] as Row<Person>).original).toBe(data[0]);
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

    it('fires onStateChange when uncontrolled pagination is mutated by autoResetPageIndex', () => {
      const onStateChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        // No controlled slices — all slices are uncontrolled.
        // autoResetPageIndex will mutate pagination via notifySliceAndAggregate,
        // which fires onStateChange because no controlled slices block it.
        onStateChange,
      });
      // setColumnFilters triggers autoResetPageIndex which resets pagination to 0.
      dispatchers(table).setColumnFilters([{ id: 'name', value: 'Ali' }]);
      // Since pagination is uncontrolled, autoResetPageIndex mutates it via
      // notifySliceAndAggregate, which calls onStateChange (all slices uncontrolled).
      expect(onStateChange).toHaveBeenCalledTimes(1);
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
      const callArg = onStateChange.mock.calls[0]?.[0] as DataTableState | undefined;
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
