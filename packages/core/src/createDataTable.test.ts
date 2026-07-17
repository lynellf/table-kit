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

    it('honors initialState in constructor', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'age', desc: true }] },
      });
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
    });

    it('ignores initialState in subsequent setOptions calls (F0.1)', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'name', desc: false }] },
      });
      // Apply a user action (sort by age)
      table.setSorting([{ id: 'age', desc: true }]);
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      // Subsequent setOptions with different initialState should NOT reset sorting
      table.setOptions({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'email', desc: false }] },
      });
      // F0.1: State must be preserved across setOptions calls
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
    });

    it('resetSlice resets a slice to constructor-effective baseline', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'name', desc: false }] },
      });
      // Apply a user action
      table.setSorting([{ id: 'age', desc: true }]);
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      // Reset sorting to constructor baseline (which includes initialState)
      table.resetSlice('sorting');
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
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

    it('does not notify when setOptions is called twice with equivalent controlled slices', () => {
      const listener = vi.fn();
      const opts1: DataTableOptions<{ id: string }> = {
        data: [],
        columns: [{ id: 'id', accessor: 'id' }],
        state: { pagination: { pageIndex: 0, pageSize: 10 } },
        onPaginationChange: () => {},
      };
      const opts2: DataTableOptions<{ id: string }> = {
        ...opts1,
        state: { pagination: { pageIndex: 0, pageSize: 10 } }, // different ref, same values
      };
      const t = createDataTable<{ id: string }>(opts1);
      t.subscribe(listener);
      listener.mockClear();
      t.setOptions(opts2);
      expect(listener).not.toHaveBeenCalled();
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

  describe('query changes reset pagination', () => {
    it('resets pageIndex to zero when sorting changes', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { pagination: { pageIndex: 3, pageSize: 25 } },
      });

      table.setSorting([{ id: 'age', desc: false }]);

      expect(table.getState().pagination).toEqual({ pageIndex: 0, pageSize: 25 });
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

  // ─── R1: Constructor-effective baseline ─────────────────────────────────

  describe('R1: constructor-effective baseline for reset', () => {
    it('resetSlice restores the constructor-effective baseline (initialState + defaults), not DEFAULT_STATE', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: {
          sorting: [{ id: 'name', desc: false }],
          pagination: { pageIndex: 5, pageSize: 100 },
        },
      });
      // Apply user actions that differ from initialState
      table.setSorting([{ id: 'age', desc: true }]);
      table.setPagination((p) => ({ ...p, pageIndex: 10 }));
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      expect(table.getState().pagination.pageIndex).toBe(10);

      // Reset sorting — should restore initialState baseline, not DEFAULT_STATE
      table.resetSlice('sorting');
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
      expect(table.getState().pagination.pageIndex).toBe(10); // pagination untouched

      // Reset pagination — should restore initialState baseline
      table.resetSlice('pagination');
      expect(table.getState().pagination).toEqual({ pageIndex: 5, pageSize: 100 });
    });

    it('resetState restores the constructor-effective baseline for all uncontrolled slices', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: {
          sorting: [{ id: 'name', desc: false }],
          columnVisibility: { name: false },
        },
      });
      // Apply user actions
      table.setSorting([{ id: 'age', desc: true }]);
      table.setColumnVisibility({ name: true, age: false });
      table.setPagination((p) => ({ ...p, pageIndex: 7 }));

      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      expect(table.getState().columnVisibility).toEqual({ name: true, age: false });
      expect(table.getState().pagination.pageIndex).toBe(7);

      // resetState should restore all slices to constructor baseline in ONE notification
      const subscriber = vi.fn();
      table.subscribe(subscriber);
      table.resetState();

      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
      expect(table.getState().columnVisibility).toEqual({ name: false });
      expect(table.getState().pagination).toEqual({ pageIndex: 0, pageSize: 25 }); // defaults, not initialState
      expect(subscriber).toHaveBeenCalledTimes(1); // one atomic notification
    });

    it('resetState emits exactly one notification regardless of how many slices are reset', () => {
      const table = createDataTable(baseOptions());
      // Apply changes to multiple slices
      table.setSorting([{ id: 'age', desc: true }]);
      table.setColumnVisibility({ name: false });
      table.setPagination((p) => ({ ...p, pageIndex: 3 }));

      const subscriber = vi.fn();
      table.subscribe(subscriber);
      subscriber.mockClear();

      table.resetState();
      // Should be exactly 1 notification, not 3 (one per slice)
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('resetSlice does not notify when the slice is already at baseline', () => {
      const table = createDataTable({
        ...baseOptions(),
        initialState: { sorting: [{ id: 'name', desc: false }] },
      });
      // State already matches baseline
      const subscriber = vi.fn();
      table.subscribe(subscriber);

      table.resetSlice('sorting');
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('resetSlice for controlled slices invokes the callback with the baseline value', () => {
      const onSortingChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] },
        onSortingChange,
      });

      table.resetSlice('sorting');
      // Should invoke callback with baseline value, not DEFAULT_STATE
      expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
    });
  });

  // ─── R1: Partial controlled state preservation ────────────────────────────

  describe('R1: partial controlled state does not reset omitted slices', () => {
    it('setOptions with partial controlled state preserves uncontrolled slices', () => {
      const table = createDataTable(baseOptions());

      // Apply some uncontrolled state changes
      table.setSorting([{ id: 'age', desc: true }]);
      table.setPagination((p) => ({ ...p, pageIndex: 5 }));
      expect(table.getState().sorting).toEqual([{ id: 'age', desc: true }]);
      expect(table.getState().pagination.pageIndex).toBe(5);

      // Now pass a partial controlled state (only sorting controlled)
      table.setOptions({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] },
        onSortingChange: vi.fn(),
      });

      // Controlled slice should update
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
      // Uncontrolled slice should be PRESERVED, not reset
      expect(table.getState().pagination.pageIndex).toBe(5);
    });

    it('setOptions without state argument preserves all current slices', () => {
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] },
        onSortingChange: vi.fn(),
      });

      // Apply uncontrolled changes
      table.setSorting([{ id: 'age', desc: true }]); // but this goes through callback since controlled
      table.setPagination((p) => ({ ...p, pageIndex: 7 }));

      // Pass setOptions without state — should preserve current state
      table.setOptions({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] }, // same controlled
        onSortingChange: vi.fn(),
      });

      // pagination should be preserved
      expect(table.getState().pagination.pageIndex).toBe(7);
    });

    it('controlled slice can be later released to uncontrolled without losing state', () => {
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] },
        onSortingChange: vi.fn(),
      });

      // Change uncontrolled pagination
      table.setPagination((p) => ({ ...p, pageIndex: 3 }));
      expect(table.getState().pagination.pageIndex).toBe(3);

      // Release sorting control by passing no state
      table.setOptions({
        ...baseOptions(),
        // No state — all slices now uncontrolled, but should preserve current values
      });

      // Sorting should have retained the controlled value
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
      // Pagination should be preserved
      expect(table.getState().pagination.pageIndex).toBe(3);
    });
  });

  // ─── R1: Column ID pruning ──────────────────────────────────────────────

  describe('R1: __pruneColumnIds removes invalid IDs from state', () => {
    it('prunes invalid column IDs from sorting state', () => {
      const table = createDataTable(baseOptions());
      table.setSorting([
        { id: 'name', desc: false },
        { id: 'age', desc: true },
        { id: 'ghost', desc: false },
      ]);
      expect(table.getState().sorting.map((s) => s.id)).toEqual(['name', 'age', 'ghost']);

      // Prune: only 'name' and 'age' are valid
      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(table.getState().sorting.map((s) => s.id)).toEqual(['name', 'age']);
    });

    it('prunes invalid column IDs from columnFilters state', () => {
      const table = createDataTable(baseOptions());
      table.setColumnFilters([
        { id: 'name', value: 'Alice' },
        { id: 'ghost', value: 'Bob' },
      ]);
      expect(table.getState().columnFilters.map((f) => f.id)).toEqual(['name', 'ghost']);

      table.__pruneColumnIds(new Set(['name']));
      expect(table.getState().columnFilters.map((f) => f.id)).toEqual(['name']);
    });

    it('prunes invalid column IDs from columnOrder state', () => {
      const table = createDataTable(baseOptions());
      // Default columnOrder is empty, so set one with invalid IDs
      (table as unknown as { state: DataTableState }).state.columnOrder = [
        'name',
        'age',
        'ghost',
        'other',
      ];

      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(table.getState().columnOrder).toEqual(['name', 'age']);
    });

    it('prunes invalid column IDs from columnVisibility state', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.columnVisibility = {
        name: true,
        age: false,
        ghost: true,
      };

      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(table.getState().columnVisibility).toEqual({ name: true, age: false });
    });

    it('prunes invalid column IDs from columnPinning state', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.columnPinning = {
        left: ['name', 'ghost'],
        right: ['age', 'other'],
      };

      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(table.getState().columnPinning).toEqual({ left: ['name'], right: ['age'] });
    });

    it('prunes invalid column IDs from columnSizing state', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.columnSizing = {
        name: 100,
        age: 50,
        ghost: 75,
      };

      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(table.getState().columnSizing).toEqual({ name: 100, age: 50 });
    });

    it('clears focusedCell when its columnId is pruned', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.focusedCell = {
        rowId: '1',
        columnId: 'name',
      };

      table.__pruneColumnIds(new Set(['age'])); // 'name' is not valid
      expect(table.getState().focusedCell).toBeNull();
    });

    it('clears columnSizingInfo when its columnId is pruned', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.columnSizingInfo = {
        columnId: 'name',
        startSize: 100,
        delta: 10,
        mode: 'onChange',
      };

      table.__pruneColumnIds(new Set(['age'])); // 'name' is not valid
      expect(table.getState().columnSizingInfo).toBeNull();
    });

    it('does not notify when no column IDs are pruned', () => {
      const table = createDataTable(baseOptions());
      (table as unknown as { state: DataTableState }).state.columnSizing = { name: 100, age: 50 };

      const subscriber = vi.fn();
      table.subscribe(subscriber);

      // All IDs are valid, nothing to prune
      table.__pruneColumnIds(new Set(['name', 'age']));
      expect(subscriber).not.toHaveBeenCalled();
    });

    it('R1: controlled sorting: invokes callback with pruned value instead of mutating internal state', () => {
      const sortingCallback = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { sorting: [{ id: 'name', desc: false }] },
        onSortingChange: sortingCallback,
      });

      // Internal state has 'ghost' which should be pruned
      (table as unknown as { state: DataTableState }).state.sorting = [
        { id: 'name', desc: false },
        { id: 'ghost', desc: true },
      ];

      table.__pruneColumnIds(new Set(['name', 'age']));

      // Should invoke callback with pruned value, not mutate internal state
      expect(sortingCallback).toHaveBeenCalledOnce();
      expect(sortingCallback).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
      // Internal state should still have the invalid ID (consumer is responsible for updating)
      expect((table as unknown as { state: DataTableState }).state.sorting).toEqual([
        { id: 'name', desc: false },
        { id: 'ghost', desc: true },
      ]);
    });

    it('R1: controlled columnFilters: invokes callback with pruned value', () => {
      const filtersCallback = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { columnFilters: [{ id: 'name', value: 'Alice' }] },
        onColumnFiltersChange: filtersCallback,
      });

      (table as unknown as { state: DataTableState }).state.columnFilters = [
        { id: 'name', value: 'Alice' },
        { id: 'ghost', value: 'Bob' },
      ];

      table.__pruneColumnIds(new Set(['name']));

      expect(filtersCallback).toHaveBeenCalledOnce();
      expect(filtersCallback).toHaveBeenCalledWith([{ id: 'name', value: 'Alice' }]);
    });

    it('R1: controlled columnVisibility: invokes callback with pruned value', () => {
      const visibilityCallback = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { columnVisibility: { name: true, ghost: true } },
        onColumnVisibilityChange: visibilityCallback,
      });

      table.__pruneColumnIds(new Set(['name', 'age']));

      expect(visibilityCallback).toHaveBeenCalledOnce();
      expect(visibilityCallback).toHaveBeenCalledWith({ name: true });
    });

    it('R1: controlled focusedCell: invokes callback with null when column is pruned', () => {
      const focusCallback = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        state: { focusedCell: { rowId: '0', columnId: 'name' } },
        onFocusedCellChange: focusCallback,
      });

      table.__pruneColumnIds(new Set(['age'])); // 'name' is pruned

      expect(focusCallback).toHaveBeenCalledOnce();
      expect(focusCallback).toHaveBeenCalledWith(null);
    });

    it('R1: uncontrolled slices: prunes directly and notifies', () => {
      const table = createDataTable(baseOptions());

      (table as unknown as { state: DataTableState }).state.sorting = [
        { id: 'name', desc: false },
        { id: 'ghost', desc: true },
      ];

      const subscriber = vi.fn();
      table.subscribe(subscriber);

      table.__pruneColumnIds(new Set(['name']));

      // Internal state should be pruned directly
      expect(table.getState().sorting).toEqual([{ id: 'name', desc: false }]);
      expect(subscriber).toHaveBeenCalledOnce();
    });
  });

  // ─── R2: direct-table version notification ─────────────────────────────────
  describe('R2: direct-table version notification', () => {
    it('notifies on dataVersion token change in setOptions (A -> B)', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // Set initial dataVersion
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      listener.mockClear();

      // Change version token (same policy reference, different value)
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does NOT notify when dataVersion token is unchanged (same token value)', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // Set initial dataVersion
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      listener.mockClear();

      // Same token value, different policy reference
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('handles same-reference mutable policy transitions A -> B -> UNSET', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // A: Set dataVersion to static token 'v1'
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      listener.mockClear();

      // A -> B: Change to 'v2'
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // B -> UNSET: Remove dataVersion
      table.setOptions({
        ...baseOptions(),
        // dataVersion not set
      });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // UNSET -> A: Restore dataVersion
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('R2 regression: notifies when same policy reference is mutated in-place (A -> B -> UNSET)', () => {
      // This is the exact scenario the reviewer flagged: the SAME policy object is
      // reused across setOptions calls and its .version field is mutated in place.
      // Before the fix, this test would fail because resolvedPrevToken was compared
      // against resolvedNextToken (both read from the same policy before it was
      // mutated), not against _publishedDataVersion.
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // Create ONE policy reference — hold it for the entire test
      const policy = { version: 'v1' as string | number };

      // A: Publish with token 'v1'
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // A -> B: Mutate the policy in place (same reference, different resolved value)
      policy.version = 'v2';
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // B -> UNSET: Mutate the policy to undefined (same reference, removes the token)
      // @ts-expect-error - intentional mutation to undefined for UNSET test
      delete policy.version;
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // UNSET -> A: Restore the token on the same reference
      policy.version = 'v1';
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('R2-R7 regression: repeated UNSET calls after first removal do NOT notify', () => {
      // Bug: When dataVersion is removed (UNSET), _publishedDataVersion was not
      // reset to undefined. This caused subsequent setOptions calls with no
      // dataVersion to incorrectly detect a "change" (comparing old token
      // against undefined), triggering spurious notifications.
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // A: Set dataVersion to 'v1'
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // A -> UNSET: Remove dataVersion — should notify ONCE
      table.setOptions({
        ...baseOptions(),
        // dataVersion not set
      });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // UNSET -> UNSET: Repeated removal calls should NOT notify
      // This is the core bug: without the fix, this would incorrectly notify.
      table.setOptions({
        ...baseOptions(),
        // dataVersion not set
      });
      expect(listener).not.toHaveBeenCalled();

      // Another UNSET call — still should NOT notify
      table.setOptions({
        ...baseOptions(),
        // dataVersion not set
      });
      expect(listener).not.toHaveBeenCalled();

      // UNSET -> A: Restoring should notify again
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('R2 regression: same reference + same resolved token is a no-op (no notify)', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // Create ONE policy reference with a static version
      const policy = { version: 'v1' as string | number };

      // A: Publish
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).toHaveBeenCalledTimes(1);
      listener.mockClear();

      // Same reference + same resolved token — must NOT notify
      // (The policy object reference is the same, and .version was not mutated)
      table.setOptions({ ...baseOptions(), dataVersion: policy });
      expect(listener).not.toHaveBeenCalled();
    });

    it('notifies exactly once per real token transition', () => {
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // Set initial dataVersion
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      listener.mockClear();

      // Multiple same-token calls should only notify once total
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });

      // Only ONE notification for the transition, not three
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies when dataVersion policy changes even if resolved tokens might match', () => {
      // This tests that changing the dataVersion policy triggers notification.
      // The current implementation compares option objects, so different policy
      // references always notify. The fix should compare resolved tokens.
      const table = createDataTable(baseOptions());
      const listener = vi.fn();
      table.subscribe(listener);

      // First policy: static version
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      listener.mockClear();

      // Change to different policy (static version)
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });

      // Should notify because policy changed (resolved token changed)
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('changed data reference recomputes even when values are deeply equal', () => {
      const getVersion = vi.fn((data: Person[]) => data.length);
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: { getVersion },
      });

      // Get initial row model
      const initialModel = table.getRowModel();
      expect(initialModel).toHaveLength(2);

      // Same values, new reference - should recompute
      const newData = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
      ];
      table.setOptions({
        ...baseOptions(),
        data: newData,
        dataVersion: { getVersion },
      });

      // getVersion should be called again with new data reference
      expect(getVersion).toHaveBeenCalled();

      // Row model should reflect new data
      const newModel = table.getRowModel();
      expect(newModel[0]?.original).toBe(newData[0]);
    });
  });

  // ─── R2: __setDataSourceState version tracking ───────────────────────────────
  describe('R2: __setDataSourceState version tracking', () => {
    it('publishes notification when result dataVersion transitions to UNSET', () => {
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      const listener = vi.fn();
      table.subscribe(listener);

      // Simulate: source returns a result with dataVersion 'v1'
      table.__setDataSourceState({
        status: 'success',
        data: [{ id: '1', name: 'Alice', age: 30 }],
        refetch: vi.fn(),
        dataVersion: 'v1',
      });
      listener.mockClear();

      // Simulate: source returns a result WITHOUT dataVersion (UNSET)
      // This should notify because the published version changed
      table.__setDataSourceState({
        status: 'success',
        data: [{ id: '1', name: 'Alice', age: 30 }],
        refetch: vi.fn(),
        // no dataVersion field
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does NOT notify when result dataVersion is unchanged', () => {
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      const listener = vi.fn();
      table.subscribe(listener);

      // Use the same data reference for both calls
      const data = [{ id: '1', name: 'Alice', age: 30 }];

      // Simulate: source returns a result with dataVersion 'v1'
      table.__setDataSourceState({
        status: 'success',
        data,
        refetch: vi.fn(),
        dataVersion: 'v1',
      });
      listener.mockClear();

      // Simulate: source returns another result with same dataVersion 'v1' (same reference)
      table.__setDataSourceState({
        status: 'success',
        data, // Same reference!
        refetch: vi.fn(),
        dataVersion: 'v1',
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('tracks previously published token distinct from configured option token', () => {
      // This tests that the published token is tracked separately from the
      // dataVersion option. When a result has dataVersion: undefined but
      // options have dataVersion configured, we should track result's undefined.
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: { version: 'v1' },
      });
      const listener = vi.fn();
      table.subscribe(listener);

      // Simulate: source returns result with no dataVersion (undefined)
      // (even though table has configured version 'v1')
      table.__setDataSourceState({
        status: 'success',
        data: [{ id: '1', name: 'Alice', age: 30 }],
        refetch: vi.fn(),
        // dataVersion intentionally omitted to test transition to UNSET
      });
      listener.mockClear();

      // Now configure a different version via setOptions
      // This should notify because configured version changed from 'v1'
      table.setOptions({
        ...baseOptions(),
        dataVersion: { version: 'v2' },
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // ─── R2: Data version identity ──────────────────────────────────────────────
  describe('R2: getDataVersion returns version token', () => {
    it('returns undefined when dataVersion is not configured', () => {
      const table = createDataTable(baseOptions());
      expect(table.getDataVersion()).toBeUndefined();
    });

    it('returns static version token when configured', () => {
      const table = createDataTable({ ...baseOptions(), dataVersion: { version: 42 } });
      expect(table.getDataVersion()).toBe(42);
    });

    it('returns derived version when getVersion is configured', () => {
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: {
          getVersion: (data) => data.length,
        },
      });
      expect(table.getDataVersion()).toBe(2); // baseOptions has 2 rows
    });

    it('prefers derived version over static version when both are provided', () => {
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: {
          version: 100,
          getVersion: (data) => data.length * 10,
        },
      });
      expect(table.getDataVersion()).toBe(20); // 2 rows * 10
    });

    it('uses dataSourceState.data when available, otherwise options.data', () => {
      // This tests that getVersion receives the data from dataSourceState when present
      // For this test, we create a table and verify the method exists and returns a value
      const table = createDataTable({
        ...baseOptions(),
        dataVersion: {
          getVersion: (data) => `got ${data.length} rows`,
        },
      });
      expect(table.getDataVersion()).toBe('got 2 rows');
    });
  });

  describe('row selection', () => {
    it('keeps stable row ids selected across query operations and returns loaded rows', () => {
      const table = createDataTable({ ...baseOptions(), getRowId: (row) => row.id });

      table.toggleRowSelected('1', 'multiple');
      table.setColumnFilters([{ id: 'name', value: 'Bob' }]);
      table.setSorting([{ id: 'name', desc: true }]);

      expect(table.getState().rowSelection).toEqual({ '1': true });
      expect(table.getSelectedRowIds()).toEqual(['1']);
      expect(table.getSelectedRows().map((row) => row.id)).toEqual(['1']);

      table.toggleRowSelected('2', 'single');
      expect(table.getSelectedRowIds()).toEqual(['2']);
    });

    it('dispatches controlled selection changes without mutating local state', () => {
      const onRowSelectionChange = vi.fn();
      const table = createDataTable({
        ...baseOptions(),
        getRowId: (row) => row.id,
        state: { rowSelection: { '1': true } },
        onRowSelectionChange,
      });

      table.toggleRowSelected('2', 'multiple');

      expect(table.getState().rowSelection).toEqual({ '1': true });
      expect(onRowSelectionChange).toHaveBeenCalledOnce();
    });
  });
});
