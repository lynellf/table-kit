/**
 * @lynellf/tablekit-core — `createDataTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, `getRowModel`. M1 adds the filter→sort→paginate pipeline,
 * pagination helpers, and `autoResetPageIndex`.
 */

import { getGlobalAnnouncer, noopAnnouncer } from './announcer';
import { defaultGetRowId } from './columns';
import type { Column } from './columns';
import { createColumns } from './columns';
import { synthesizePlaceholderRows } from './dataSource/placeholderRows';
import { buildRowsQuery } from './dataSource/query';
import { validateNoUnregisteredFilterFns } from './dataSource/query';
import { QueryKeySerializationError, QueryKeySerializationErrorCode } from './dataSource/queryKey';
import type { CursorSelection, DataSourceCapabilities, DataSourceState } from './dataSource/types';
import { validateModeConfiguration } from './dataSource/warnings';
import { buildHeaderGroups } from './headers';
import type { HeaderContext } from './headers';
import {
  type NavigationDirection,
  navigateByPage as navigateByPageHelper,
  navigateCell as navigateCellHelper,
  navigateToEdge as navigateToEdgeHelper,
  resolveKeyBinding,
} from './keyboardNav';
import { moveColumn } from './ordering';
import {
  type PinSide,
  pinAnnouncement,
  pinColumns as pinColumnsHelper,
  togglePinColumn as togglePinColumnHelper,
  unpinColumns as unpinColumnsHelper,
} from './pinning';
import { filterRows } from './pipeline/filter';
import { RowModelCache } from './pipeline/memo';
import { computePageCount, paginateRows } from './pipeline/paginate';
import { sortRows, toggleSortItem } from './pipeline/sort';
import { mergeProps } from './propGetters';
import { cancelResize as cancelResizeHelper, resizeAnnouncement, resizeColumn } from './resize';
import { buildVisibleCells } from './rows';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  stateChangedOnSlices,
} from './state';
import type { SliceDispatchers } from './state';
import type {
  Announcer,
  Cell,
  CellPosition,
  ColumnFilterItem,
  ColumnPinningState,
  ColumnResizeSession,
  ColumnSizingState,
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  PaginationState,
  Row,
  Row as RowInterface,
} from './types';
import { createColumnVirtualizer } from './virtualization/columnVirtualizer';
import { createRowVirtualizer } from './virtualization/rowVirtualizer';
import type { ColumnVirtualizerResult, RowVirtualizerResult } from './virtualization/types';
import {
  toggleAllColumnsVisibility,
  toggleColumnVisibility as toggleColumnVisibilityHelper,
} from './visibility';

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

/**
 * Implementation class. Public surface is the `DataTableInstance<TRow>`
 * interface; the class is not exported.
 */
class DataTable<TRow> implements DataTableInstance<TRow> {
  private options: DataTableOptions<TRow>;
  private state: DataTableState;
  private listeners: Set<() => void> = new Set();
  private rowModelCache = new RowModelCache<TRow>();
  // Flag to prevent subscription firing during setOptions
  private suppressNotify = false;
  // Scroll + viewport state — set by the React adapter in phase 4.
  // Default to 0/0 so the pure virtualizer produces sensible output in
  // SSR (no rows are "above the fold" until scrollOffset > 0).
  private scrollOffset = 0;
  private viewportSize = 0;
  private columnScrollOffset = 0;
  private columnViewportSize = 0;
  // Resize mode
  private resizeMode: 'onChange' | 'onEnd' = 'onChange';
  // Navigation mode
  private navigationMode: 'cell' | 'row' | 'none' = 'cell';
  // Viewport row count for navigateByPage
  private viewportRowCount = 25;

  // M3 phase 3: data source state. Written by useDataSource via __setDataSourceState.
  private dataSourceState: DataSourceState<TRow> = {
    status: 'idle',
    data: null,
    refetch: () => {
      /* no-op until the hook wires refetch */
    },
  };

  // R1: Constructor-effective baseline for resetSlice/resetState.
  // Captures DEFAULT_STATE + initialState + constructor state.
  private constructorBaseline: DataTableState;

  constructor(options: DataTableOptions<TRow>) {
    this.options = options;
    this.state = mergeInitialState(options.initialState, options.state);
    // Capture the constructor-effective baseline for reset operations.
    this.constructorBaseline = this.state;
    this.navigationMode = options.navigationMode ?? 'cell';
    // M3 phase 1: mixed-mode trap warning. One-shot dev warning.
    validateModeConfiguration(this.options);
  }

  getState(): DataTableState {
    return this.state;
  }

  setOptions(next: DataTableOptions<TRow>): void {
    const prevOptions = this.options;
    // Track first setOptions call to ensure notify() is called on initial render.
    // Since the constructor sets this.options directly (not via setOptions),
    // we check if this.options was already set to determine if this is the first call.
    const isFirstSetOptions = prevOptions === undefined;

    // R2-R7 fix: Capture the previous dataVersion BEFORE reassigning options.
    // Previously the code assigned this.options=next first, then captured
    // prevDataVersion from this.options — which was already the NEW value,
    // making the comparison always false.
    const prevDataVersion = prevOptions?.dataVersion;

    const prevState = this.state;
    this.options = next;

    // R1 fix: Track if columns changed for pruning.
    const columnsChanged =
      prevOptions !== undefined &&
      next.columns !== prevOptions.columns &&
      next.columns !== undefined;

    // Phase 1 F0.1 / R1: Preserve ALL state slices on subsequent setOptions calls.
    // - When next.state is provided, preserve current values for omitted slices
    //   (partial controlled state must not reset omitted slices).
    // - When next.state is undefined, preserve all current values
    //   (omitted slices must not reset per spec).
    // - initialState is constructor-only; subsequent calls treat it as undefined
    //   to prevent re-initializing state from defaults.
    const controlledState = (() => {
      // First setOptions call: let mergeInitialState handle initialState.
      if (prevOptions === undefined) {
        return next.state;
      }

      if (next.state !== undefined) {
        // next.state is defined (partial or full controlled update):
        // preserve current values for slices NOT in next.state.
        // This ensures partial controlled state does not reset omitted slices.
        const partial: Partial<DataTableState> = { ...this.state };
        Object.assign(partial, next.state);
        return partial;
      }

      // next.state is undefined: preserve ALL current slices.
      // (omitted slices must not reset per spec)
      return { ...this.state };
    })();

    // F0.1 fix: initialState is constructor-only. Subsequent calls ignore it.
    const initialStateForMerge = isFirstSetOptions ? next.initialState : undefined;

    const nextState = mergeInitialState(initialStateForMerge, controlledState);

    // Only update this.state if the derived state actually differs.
    // This prevents useSyncExternalStore's getSnapshot() from returning
    // a new reference when nothing changed, which would cause an infinite loop.
    const slicesChanged = stateChangedOnSlices(prevState, nextState, [
      'sorting',
      'columnFilters',
      'pagination',
      'columnOrder',
      'columnVisibility',
      'columnPinning',
      'columnSizing',
      'columnSizingInfo',
      'focusedCell',
    ]);

    if (slicesChanged) {
      this.state = nextState;
    }

    // R3-MANUAL-CAPABILITY-OVERLAY fix: Reapply the capability overlay after
    // every setOptions call so it survives option updates.
    if (this._capabilityOverlay) {
      this._applyOverlayToOptions();
    }

    // R1 fix: Prune invalid column IDs from state slices when columns change.
    // This runs in the core setOptions path so direct factory consumers also get pruning.
    // The React adapter may also call this; the method is idempotent (checks if columns actually changed).
    if (columnsChanged && next.columns) {
      const validColumnIds = new Set(next.columns.map((c) => c.id));
      this.__pruneColumnIds(validColumnIds);
    }

    // M3 phase 1: re-validate when the option set changes (manual* flags flipped).
    if (
      !isFirstSetOptions &&
      prevOptions !== undefined &&
      (prevOptions.manualSorting !== next.manualSorting ||
        prevOptions.manualFiltering !== next.manualFiltering ||
        prevOptions.manualPagination !== next.manualPagination ||
        prevOptions.allowWithinPageOperations !== next.allowWithinPageOperations)
    ) {
      validateModeConfiguration(next);
    }

    // R2-R7 fix: Check if dataVersion changed. dataVersion is in options, not state,
    // so we need to explicitly compare it. If dataVersion changes, we must notify
    // so that useSyncExternalStore subscribers (like useDataSource) re-check the version.
    // Handle three cases:
    // 1. Both undefined: no change
    // 2. Object reference changed: use Object.is for proper comparison
    // 3. Same reference with different internal token: handled by comparing resolved values
    const dataVersionChanged =
      prevDataVersion !== next.dataVersion && !Object.is(prevDataVersion, next.dataVersion);

    // Notify listeners:
    // - Always notify on first setOptions call (to initialize useSyncExternalStore)
    // - After first call, only notify if state actually changed
    // - Also notify if dataVersion changed (even if state slices didn't change)
    // - Skip if options reference is unchanged (no-op call)
    if (Object.is(next, prevOptions)) return;
    if (isFirstSetOptions || slicesChanged || dataVersionChanged) {
      this.notify();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── DataSource seams (M3) ────────────────────────────────────────────────────

  /** @internal Read the data source state. Used by the React hook. */
  __getDataSourceState(): DataSourceState<TRow> {
    return this.dataSourceState;
  }

  /** @internal Previous data version for change detection. */
  private _prevDataVersion?: string | number;

  /** @internal Write the data source state. Used by the React hook. */
  __setDataSourceState(state: DataSourceState<TRow>): void {
    const prev = this.dataSourceState;

    // F0.5: Treat data identity as reference-based by default.
    // Reference equality is sufficient for typical data-fetching patterns.
    // For mutable data patterns (same reference, mutated content), check version.
    const dataChanged = prev.data !== state.data;

    // R2 fix: If data reference is unchanged but dataVersion is configured,
    // check if the version changed to detect mutable data updates.
    let versionChanged = false;
    if (!dataChanged && prev.data === state.data && this.options.dataVersion) {
      const prevVersion = this._prevDataVersion ?? this.getDataVersion();
      // Compute version from the new data
      const dv = this.options.dataVersion;
      const newVersion = dv.getVersion ? dv.getVersion(state.data ?? []) : dv.version;
      versionChanged = prevVersion !== newVersion;
      // Only track defined versions
      if (newVersion !== undefined) {
        this._prevDataVersion = newVersion;
      }
    }

    // R2 fix: Also compare incoming state.dataVersion and cursor transitions.
    // If the incoming state carries a different dataVersion or cursor, we must notify.
    const incomingDataVersion = state.dataVersion;
    const prevDataVersion = prev.dataVersion;
    const dataVersionFieldChanged = incomingDataVersion !== prevDataVersion;

    // R2 fix: Compare cursor state transitions.
    const cursorChanged =
      prev.cursor?.nextCursor !== state.cursor?.nextCursor ||
      prev.cursor?.previousCursor !== state.cursor?.previousCursor;

    const statusChanged = prev.status !== state.status;
    const errorChanged = prev.error !== state.error;
    const totalRowCountChanged = prev.totalRowCount !== state.totalRowCount;

    if (
      !statusChanged &&
      !dataChanged &&
      !errorChanged &&
      !totalRowCountChanged &&
      !versionChanged &&
      !dataVersionFieldChanged &&
      !cursorChanged
    ) {
      // No meaningful change — skip to avoid unnecessary state updates.
      this.dataSourceState = state;
      return;
    }
    this.dataSourceState = state;
    // Always call notify() to trigger useSyncExternalStore re-renders
    this.notify();
  }

  /**
   * @internal F0.2 / R3-MANUAL-CAPABILITY-OVERLAY: Apply data-source capability
   * flags as a stable overlay that survives setOptions calls.
   *
   * Unlike __setManualFlags (which directly mutated options), this:
   * 1. Stores the overlay internally
   * 2. Reapplies it after every setOptions call
   * 3. Replaces it on source/capability changes
   * 4. Clears it when source is removed
   */
  private _capabilityOverlay: {
    manualSorting: boolean;
    manualFiltering: boolean;
    manualPagination: boolean;
  } | null = null;

  __applyCapabilityOverlay(overlay: {
    manualSorting: boolean;
    manualFiltering: boolean;
    manualPagination: boolean;
  }): void {
    this._capabilityOverlay = overlay;
    this._applyOverlayToOptions();
  }

  private _applyOverlayToOptions(): void {
    if (this._capabilityOverlay) {
      this.options = {
        ...this.options,
        manualSorting: this._capabilityOverlay.manualSorting,
        manualFiltering: this._capabilityOverlay.manualFiltering,
        manualPagination: this._capabilityOverlay.manualPagination,
      };
    }
  }

  /**
   * @internal
   * Build a `RowsQuery` from the current state + capabilities. Encapsulates
   * the column resolution + filterFn-name resolution so the React hook
   * doesn't need to expose columns or options publicly.
   *
   * For controlled slices, uses the consumer-provided state from options.state
   * instead of the internal state.
   *
   * v2.0.0: R2 fix - now accepts optional cursor and dataVersion for
   * cursor-based pagination and mutable data identity.
   */
  __buildRowsQuery(
    capabilities: DataSourceCapabilities,
    cursor?: CursorSelection,
    dataVersion?: string | number,
  ) {
    // For controlled slices, use the options state instead of internal state
    const sorting = isSliceControlled(this.options.state, 'sorting')
      ? this.options.state!.sorting!
      : this.state.sorting;
    const columnFilters = isSliceControlled(this.options.state, 'columnFilters')
      ? this.options.state!.columnFilters!
      : this.state.columnFilters;
    const pagination = isSliceControlled(this.options.state, 'pagination')
      ? this.options.state!.pagination!
      : this.state.pagination;
    const state = {
      ...this.state,
      sorting,
      columnFilters,
      pagination,
    };
    const columns = this.getResolvedColumns();

    // B7-SERIALIZER-FILTER-FUNCTION fix: Validate for unregistered filter functions
    // before building the query. If found, throw a FUNCTION_VALUE error so the
    // caller (useDataSource) can publish error state WITHOUT calling getRows.
    const unregisteredColumnId = validateNoUnregisteredFilterFns(
      { sorting, columnFilters, pagination } as DataTableState,
      columns,
    );
    if (unregisteredColumnId !== null) {
      throw new QueryKeySerializationError(
        QueryKeySerializationErrorCode.FUNCTION_VALUE,
        'function',
        `filters.${unregisteredColumnId}`,
      );
    }

    // R2 fix: Thread cursor and dataVersion through to buildRowsQuery.
    // Use spread to avoid exactOptionalPropertyTypes issues with undefined values.
    const queryOpts: Parameters<typeof buildRowsQuery>[2] = { capabilities };
    if (cursor !== undefined) {
      queryOpts.cursor = cursor;
    }
    if (dataVersion !== undefined) {
      queryOpts.dataVersion = dataVersion;
    }
    // B7-SERIALIZER-FILTER-FUNCTION fix: Validate for unregistered filter functions
    // before building the query. If found, useDataSource will publish error state.
    // buildRowsQuery returns the raw RowsQuery (backward compatible).
    return buildRowsQuery(state, columns, queryOpts);
  }

  // ─── Row model (M1: filter → sort → paginate pipeline) ─────────────────────

  getRowModel(): Row<TRow>[] {
    // M3 phase 4: render placeholders while loading and no fresh data is available.
    if (this.dataSourceState.status === 'loading' && this.dataSourceState.data === null) {
      const count = this.options.placeholderRows ?? this.state.pagination.pageSize;
      return synthesizePlaceholderRows<TRow>(count) as unknown as Row<TRow>[];
    }

    const columns = this.getResolvedColumns();
    const { state, options } = this;
    // When the data source has fresh data, use it instead of options.data.
    let rows: TRow[] = this.dataSourceState.data ?? options.data;

    // R2 fix: Resolve dataVersion for memo cache.
    // Use accepted dataVersion from dataSourceState first (remote result token),
    // then fall back to table-configured token.
    const dataVersion = this.dataSourceState.dataVersion ?? this.getDataVersion();

    if (options.manualFiltering !== true) {
      rows = filterRows({ rows, filters: state.columnFilters, columns });
    }
    if (options.manualSorting !== true) {
      rows = sortRows({ rows, sorting: state.sorting, columns });
    }
    if (options.manualPagination !== true) {
      rows = paginateRows({ rows, pagination: state.pagination });
    }

    // Memoize based on the computed rows identity
    const memoKey = this.rowModelCache.getMemoKey();
    const dataChanged = memoKey.data !== rows;
    // R2 fix: Compare dataVersion for cache validity.
    const versionChanged = memoKey.dataVersion !== dataVersion;
    const stateChanged =
      memoKey.sorting !== state.sorting ||
      memoKey.columnFilters !== state.columnFilters ||
      memoKey.pagination !== state.pagination;

    if (!dataChanged && !versionChanged && !stateChanged && memoKey.cachedRows) {
      return memoKey.cachedRows;
    }

    const getRowId = options.getRowId ?? (defaultGetRowId as (row: TRow, index: number) => string);
    const visibleColumns = this.getVisibleColumns();

    const result = rows.map((original, index) => {
      const id = getRowId(original, index);
      const base: RowInterface<TRow> = {
        id,
        index,
        original,
        // eslint-disable-next-line @typescript-eslint/no-empty-object-style
        getVisibleCells: () => [],
        getRowProps: () => ({}),
      };
      // biome-ignore lint/suspicious/noExplicitAny: intentional type manipulation to build self-referential row object
      (base as any).getVisibleCells = () =>
        buildVisibleCells(base, visibleColumns, this) as Cell<TRow>[];
      // biome-ignore lint/suspicious/noExplicitAny: intentional type manipulation to build self-referential row object
      (base as any).getRowProps = (consumerProps?: Record<string, unknown>) => {
        const merged = mergeProps(
          {
            role: 'row',
            'aria-rowindex': base.index + 2, // header row is 1
          },
          consumerProps ?? {},
        );
        // Filter out key to avoid React JSX spread warning
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _k, ...rest } = merged as Record<string, unknown>;
        return rest;
      };
      return base;
    }) as Row<TRow>[];

    // Update cache with dataVersion
    this.rowModelCache.setCachedResult(rows, state, result, dataVersion);
    return result;
  }

  /**
   * @internal
   * React adapter calls this on scroll events.
   */
  __setScrollState(scrollOffset: number, viewportSize: number): void {
    this.scrollOffset = scrollOffset;
    this.viewportSize = viewportSize;
  }
  /**
   * @internal
   * React adapter calls this on horizontal scroll events.
   */
  __setColumnScrollState(scrollOffset: number, viewportSize: number): void {
    this.columnScrollOffset = scrollOffset;
    this.columnViewportSize = viewportSize;
  }

  // ─── Pinning helpers (M2 Phase 2) ─────────────────────────────────────────

  togglePin = (columnId: string, side: PinSide): void => {
    const previous = this.state.columnPinning.left.includes(columnId)
      ? ('left' as const)
      : this.state.columnPinning.right.includes(columnId)
        ? ('right' as const)
        : false;
    const next = togglePinColumnHelper(this.state.columnPinning, columnId, side);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    const msg = pinAnnouncement(columnId, side, previous);
    if (msg) this.announce(msg);
  };

  pinColumns = (columnIds: string[], side: 'left' | 'right'): void => {
    const next = pinColumnsHelper(this.state.columnPinning, columnIds, side);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    this.announce(
      `Pinned ${columnIds.length === 1 ? columnIds[0] : `${columnIds.length} columns`} to ${side}`,
    );
  };

  unpinColumns = (columnIds: string[]): void => {
    const next = unpinColumnsHelper(this.state.columnPinning, columnIds);
    if (next === null) return;
    this.applyChange('columnPinning', next);
    this.announce(
      `Unpinned ${columnIds.length === 1 ? columnIds[0] : `${columnIds.length} columns`}`,
    );
  };

  // ─── Resize mode + interaction (M2 Phase 3) ──────────────────────────────────────

  setResizeMode = (mode: 'onChange' | 'onEnd'): void => {
    this.resizeMode = mode;
  };

  getResizeMode = (): 'onChange' | 'onEnd' => {
    return this.resizeMode;
  };

  /**
   * Begin a resize session.
   */
  startResize = (columnId: string, startSize: number, _clientX: number): void => {
    this.applyChange('columnSizingInfo', {
      columnId,
      startSize,
      delta: 0,
      mode: this.resizeMode,
    });
  };

  /**
   * Adjust the in-progress resize by a pixel delta.
   */
  adjustResize = (columnId: string, deltaPx: number): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    this.applyChange('columnSizingInfo', { ...session, delta: deltaPx });
    if (this.resizeMode === 'onChange') {
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (!col) return;
      const out = resizeColumn({
        columnSizing: this.state.columnSizing,
        session: { ...session, delta: deltaPx },
        minSize: col.getMinSize(),
        maxSize: col.getMaxSize(),
      });
      this.applyChange('columnSizing', out.columnSizing);
    }
  };

  /**
   * Commit the in-progress resize.
   */
  commitResize = (columnId: string): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    if (this.resizeMode === 'onEnd') {
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (!col) return;
      const out = resizeColumn({
        columnSizing: this.state.columnSizing,
        session,
        minSize: col.getMinSize(),
        maxSize: col.getMaxSize(),
      });
      this.applyChange('columnSizing', out.columnSizing);
      this.announce(
        resizeAnnouncement(col.id, out.columnSizing[col.id] ?? session.startSize, col.id),
      );
    } else {
      const col = this.getResolvedColumns().find((c) => c.id === columnId);
      if (col) {
        this.announce(
          resizeAnnouncement(col.id, this.state.columnSizing[col.id] ?? session.startSize, col.id),
        );
      }
    }
    this.applyChange('columnSizingInfo', null);
  };

  /**
   * Cancel the in-progress resize and revert to the start size.
   */
  cancelResize = (columnId: string): void => {
    const session = this.state.columnSizingInfo;
    if (!session || session.columnId !== columnId) return;
    const reverted = cancelResizeHelper(this.state.columnSizing, session);
    this.applyChange('columnSizing', reverted);
    this.applyChange('columnSizingInfo', null);
  };

  // ─── Keyboard navigation (M2 Phase 5) ──────────────────────────────────────

  setNavigationMode = (mode: 'cell' | 'row' | 'none'): void => {
    this.navigationMode = mode;
  };

  getNavigationMode = (): 'cell' | 'row' | 'none' => {
    return this.navigationMode;
  };

  /**
   * Build a KeyboardNavContext for the navigation helpers.
   */
  private buildNavContext() {
    const visibleColumns = this.getVisibleColumns();
    const rows = this.getRowModel();
    const rowIndexById = new Map<string, number>();
    for (const row of rows) rowIndexById.set(row.id, row.index);
    const columnIdByIndex = visibleColumns.map((c) => c.id);
    return {
      state: this.state,
      rowIndexById,
      columnIdByIndex,
      rowCount: rows.length,
      columnCount: visibleColumns.length,
    };
  }

  navigateCell = (direction: NavigationDirection): void => {
    const next = navigateCellHelper(this.buildNavContext(), this.state.focusedCell, direction);
    if (next) this.applyChange('focusedCell', next);
  };

  navigateToEdge = (scope: 'row-start' | 'row-end' | 'grid-start' | 'grid-end'): void => {
    const next = navigateToEdgeHelper(this.buildNavContext(), this.state.focusedCell, scope);
    if (next) this.applyChange('focusedCell', next);
  };

  navigateByPage = (delta: -1 | 1): void => {
    const next = navigateByPageHelper(
      this.buildNavContext(),
      this.state.focusedCell,
      delta,
      this.viewportRowCount,
    );
    if (next) this.applyChange('focusedCell', next);
  };

  __setViewportRowCount = (n: number): void => {
    this.viewportRowCount = n;
  };

  getRowVirtualizer(): RowVirtualizerResult<TRow> {
    return createRowVirtualizer<TRow>({
      rows: this.getRowModel(),
      estimateSize: () => 33, // M2 default; consumers override via the React adapter's SizeObserver
      scrollOffset: this.scrollOffset,
      viewportSize: this.viewportSize,
      keepMounted: () => {
        // Phase 5 wires the focused cell's row index into keepMounted.
        // For now, return [] (no keepMounted).
        return [];
      },
    });
  }

  getCenterVirtualizer(): ColumnVirtualizerResult {
    const center = this.getCenterLeafColumns();
    return createColumnVirtualizer<TRow>({
      columns: center,
      scrollOffset: this.columnScrollOffset,
      viewportSize: this.columnViewportSize,
      keepMounted: () => [],
    });
  }

  // ─── Column resolution helpers ─────────────────────────────────────────────

  private getResolvedColumns(): Array<Column<TRow, unknown>> {
    return createColumns(this.options.columns, this.state);
  }

  getVisibleColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsVisible());
  }

  getLeftLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'left');
  }

  getCenterLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === false);
  }

  getRightLeafColumns(): Array<Column<TRow, unknown>> {
    return this.getResolvedColumns().filter((c) => c.getIsPinned() === 'right');
  }

  // ─── Column visibility (M1 Phase 3) ─────────────────────────────────────────

  /**
   * Toggle a single column's visibility.
   */
  toggleColumnVisibility = (columnId: string): void => {
    const next = toggleColumnVisibilityHelper(this.state.columnVisibility, columnId);
    if (Object.is(next, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', next);
  };

  /**
   * Toggle all columns at once.
   */
  toggleAllColumnsVisibility = (next?: boolean): void => {
    const allIds = this.options.columns.map((c) => c.id);
    const out = toggleAllColumnsVisibility(this.state.columnVisibility, allIds, next);
    if (Object.is(out, this.state.columnVisibility)) return;
    this.applyChange('columnVisibility', out);
  };

  // ─── Pagination helpers (M1) ────────────────────────────────────────────────

  getCanPreviousPage(): boolean {
    return this.state.pagination.pageIndex > 0;
  }

  getCanNextPage(): boolean {
    return this.state.pagination.pageIndex < this.getPageCount() - 1;
  }

  getPageCount(): number {
    const { pageSize } = this.state.pagination;
    if (this.options.manualPagination === true) {
      // F0.2: Prefer dataSourceState.totalRowCount (from useDataSource) over options.rowCount.
      // This keeps total-row count in data-source state rather than mutating table options.
      const total =
        this.dataSourceState.totalRowCount ?? this.options.rowCount ?? this.options.data.length;
      return computePageCount(total, pageSize);
    }
    const fullRowCount = this.getFullRowCount();
    return computePageCount(fullRowCount, pageSize);
  }

  getRowCount(): number {
    if (this.options.manualPagination === true) {
      // F0.2: Prefer dataSourceState.totalRowCount (from useDataSource) over options.rowCount.
      const total =
        this.dataSourceState.totalRowCount ?? this.options.rowCount ?? this.options.data.length;
      return total;
    }
    return this.getFullRowCount();
  }

  private getFullRowCount(): number {
    const columns = this.getResolvedColumns();
    let rows: TRow[] = this.options.data;
    if (this.options.manualFiltering !== true) {
      rows = filterRows({ rows, filters: this.state.columnFilters, columns });
    }
    if (this.options.manualSorting !== true) {
      rows = sortRows({ rows, sorting: this.state.sorting, columns });
    }
    return rows.length;
  }

  nextPage = (): void => {
    this.applyChange('pagination', (p) => ({ ...p, pageIndex: p.pageIndex + 1 }));
  };

  previousPage = (): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageIndex: Math.max(0, p.pageIndex - 1),
    }));
  };

  setPageIndex = (updater: number | ((old: number) => number)): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageIndex:
        typeof updater === 'function' ? (updater as (old: number) => number)(p.pageIndex) : updater,
    }));
  };

  setPageSize = (updater: number | ((old: number) => number)): void => {
    this.applyChange('pagination', (p) => ({
      ...p,
      pageSize:
        typeof updater === 'function' ? (updater as (old: number) => number)(p.pageSize) : updater,
    }));
  };

  // ─── Column ordering (M1 Phase 2) ──────────────────────────────────────────

  /**
   * Move a column to a new index or side. Per spec §8.3: re-pins when crossing
   * pinning boundaries.
   *
   * Applies `columnOrder` and (if changed) `columnPinning` through their
   * respective dispatchers. Controlled-slice semantics are honored.
   */
  moveColumn = (id: string, to: number | 'left' | 'right' | 'center' | false): void => {
    const visibleIds = this.getVisibleColumns().map((c) => c.id);
    const result = moveColumn(
      {
        columnOrder: this.state.columnOrder,
        columnPinning: this.state.columnPinning,
        columnVisibility: this.state.columnVisibility,
      },
      visibleIds,
      id,
      to,
    );
    if (result.columnOrder) {
      this.applyChange('columnOrder', result.columnOrder);
    }
    if (result.columnPinning) {
      this.applyChange('columnPinning', result.columnPinning);
    }
  };

  // ─── Announcer (M1) ────────────────────────────────────────────────────────

  private getAnnouncer(): Announcer {
    return this.options.announcer ?? noopAnnouncer;
  }

  /** Announce a message via the live-region. Used by useDataSource on success. */
  announce = (message: string, politeness: 'polite' | 'assertive' = 'polite'): void => {
    // R5 fix: Prefer the instance announcer (from options) over the global announcer.
    // The global announcer is only a fallback when no instance announcer is supplied.
    // This ensures each grid's announcements stay in its own live-region channel
    // and unmounting one grid cannot replace another's channel.
    const instance = this.getAnnouncer();
    if (instance && instance !== noopAnnouncer) {
      instance.announce(message, politeness);
    } else {
      // Fall back to global announcer only when no instance announcer is configured
      const global = getGlobalAnnouncer();
      if (global !== noopAnnouncer) {
        global.announce(message, politeness);
      }
    }
  };

  // ─── Header structure + prop getters (M1 Phase 5) ─────────────────────────────

  /**
   * Build the header context for prop getters.
   */
  private getHeaderContext(): HeaderContext<TRow> {
    return {
      instance: {
        toggleSorting: (id: string, append?: boolean) => {
          const next = toggleSortItem(this.state.sorting, id, {
            append: append ?? false,
          });
          this.applyChange('sorting', next);
        },
        getColumnCount: () => this.getVisibleColumns().length,
        getRowCount: () => this.getRowCount(),
        announce: (msg: string) => this.announce(msg),
      },
    };
  }

  /**
   * Return the full header structure (one group per level — M1 has one).
   */
  getHeaderGroups() {
    const visibleColumns = this.getVisibleColumns();
    return buildHeaderGroups<TRow>(visibleColumns, this.getHeaderContext());
  }

  /**
   * Root grid prop getter. M1: emits role="grid" + aria-rowcount + aria-colcount.
   * M2: adds keyboard navigation for cell mode.
   */
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    const baseProps: Record<string, unknown> = {
      'aria-rowcount': this.getRowCount() + 1, // +1 for header row
      'aria-colcount': this.getVisibleColumns().length,
    };

    if (this.navigationMode === 'cell') {
      baseProps.role = 'grid';
      baseProps.tabIndex = -1; // Focus enters via the focused cell
    } else if (this.navigationMode === 'none') {
      baseProps.role = 'table';
      baseProps.tabIndex = 0;
    } else {
      baseProps.role = 'grid';
      baseProps.tabIndex = -1;
    }

    // onKeyDown: library keyboard navigation handler
    const onKeyDown = (...args: unknown[]) => {
      const event = args[0] as
        | { key?: string; ctrlKey?: boolean; defaultPrevented?: boolean }
        | undefined;
      if (event?.defaultPrevented) return;
      if (this.navigationMode !== 'cell') return;
      const binding = resolveKeyBinding(event?.key ?? '', event?.ctrlKey ?? false, false);
      if (!binding) return;
      switch (binding.action) {
        case 'navigateCell':
          this.navigateCell(binding.arg);
          break;
        case 'navigateToEdge':
          this.navigateToEdge(binding.arg);
          break;
        case 'navigateByPage':
          this.navigateByPage(binding.arg);
          break;
        case 'enterCell':
        case 'exitCell':
          // M2 doesn't ship the focus trap; consumer handles this
          break;
      }
    };

    // M3 phase 4: aria-busy + aria-invalid + data-loading when data source is wired.
    if (this.dataSourceState.status === 'loading') {
      baseProps['aria-busy'] = 'true';
      baseProps['data-loading'] = 'true';
    }
    if (this.dataSourceState.status === 'error') {
      baseProps['aria-invalid'] = 'true';
    }

    return mergeProps(baseProps, { onKeyDown }, consumerProps);
  }

  /**
   * Body rowgroup prop getter.
   */
  getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = { role: 'rowgroup' };
    // M3 phase 4: aria-busy + data-loading on body when loading.
    if (this.dataSourceState.status === 'loading') {
      base['aria-busy'] = 'true';
      base['data-loading'] = 'true';
    }
    return mergeProps(base, consumerProps);
  }

  // ─── State change application ───────────────────────────────────────────────

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
    return o[CB[slice as SliceChangeKey]] as ((updater: unknown) => void) | undefined;
  }

  private notifySliceAndAggregate(prev: DataTableState, next: DataTableState): void {
    if (this.options.onStateChange) {
      if (
        stateChangedOnSlices(
          prev,
          next,
          controlledSliceKeys(this.options.state).length === 0
            ? [
                'sorting',
                'columnFilters',
                'pagination',
                'columnOrder',
                'columnVisibility',
                'columnPinning',
                'columnSizing',
                'columnSizingInfo',
                'focusedCell',
              ]
            : (Object.keys(this.options.state as object) as Array<keyof DataTableState>),
        )
      ) {
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

  // ─── Public slice dispatchers ───────

  setSorting = (
    updater:
      | DataTableState['sorting']
      | ((old: DataTableState['sorting']) => DataTableState['sorting']),
  ): void => {
    this.applyChange('sorting', updater);
  };
  setColumnFilters = (
    updater: ColumnFilterItem[] | ((old: ColumnFilterItem[]) => ColumnFilterItem[]),
  ): void => {
    this.applyChange('columnFilters', updater);
    // autoResetPageIndex (default true): reset pageIndex to 0 on filter change.
    // Route through the controlled-slice-aware method.
    this.resetPaginationOnFilterChange();
    // Announce filter result count.
    this.announce(`Filters applied. ${this.getFullRowCount()} rows.`);
  };

  /**
   * autoResetPageIndex logic. When pagination is uncontrolled, apply the reset
   * locally (fires onStateChange). When pagination is controlled, invoke the
   * slice callback only (consumer owns the slice).
   */
  private resetPaginationOnFilterChange(): void {
    if (this.options.autoResetPageIndex === false) return;
    const prev = this.state;
    const next: DataTableState = {
      ...prev,
      pagination: { ...prev.pagination, pageIndex: 0 },
    };
    if (Object.is(prev.pagination.pageIndex, 0)) return; // already at 0
    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }
  setPagination = (
    updater: PaginationState | ((old: PaginationState) => PaginationState),
  ): void => {
    this.applyChange('pagination', updater);
  };
  setColumnOrder = (updater: string[] | ((old: string[]) => string[])): void => {
    this.applyChange('columnOrder', updater);
  };
  setColumnVisibility = (
    updater: Record<string, boolean> | ((old: Record<string, boolean>) => Record<string, boolean>),
  ): void => {
    this.applyChange('columnVisibility', updater);
  };
  setColumnPinning = (
    updater: ColumnPinningState | ((old: ColumnPinningState) => ColumnPinningState),
  ): void => {
    this.applyChange('columnPinning', updater);
  };
  setColumnSizing = (
    updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState),
  ): void => {
    this.applyChange('columnSizing', updater);
  };
  setColumnSizingInfo = (
    updater:
      | ColumnResizeSession
      | null
      | ((old: ColumnResizeSession | null) => ColumnResizeSession | null),
  ): void => {
    this.applyChange('columnSizingInfo', updater);
  };
  setFocusedCell = (
    updater: CellPosition | null | ((old: CellPosition | null) => CellPosition | null),
  ): void => {
    this.applyChange('focusedCell', updater);
  };

  // ─── State reset (Phase 1 F0.1) ─────────────────────────────────────────────

  /**
   * Reset all state slices to the constructor-effective baseline.
   * Respects the controlled-slice contract: if a slice is controlled (present in options.state),
   * it is NOT reset; only uncontrolled slices are affected.
   * Emits one atomic notification for all reset slices.
   */
  resetState(): void {
    const slices: SliceChangeKey[] = [
      'sorting',
      'columnFilters',
      'pagination',
      'columnOrder',
      'columnVisibility',
      'columnPinning',
      'columnSizing',
      'columnSizingInfo',
      'focusedCell',
    ];

    const prev = this.state;
    let next = prev;
    let anyChange = false;

    for (const slice of slices) {
      const controlled = isSliceControlled(this.options.state, slice);
      if (controlled) continue; // Skip controlled slices

      const baselineValue = this.constructorBaseline[slice];
      if (Object.is(prev[slice], baselineValue)) continue; // No change needed

      next = { ...next, [slice]: baselineValue };
      anyChange = true;
    }

    if (!anyChange) return;

    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }

  /**
   * Reset a specific state slice to the constructor-effective baseline.
   * Respects the controlled-slice contract: if the slice is controlled (present in options.state),
   * it is NOT reset; the slice callback is invoked instead (consumer owns the state).
   */
  resetSlice(slice: keyof DataTableState): void {
    const controlled = isSliceControlled(this.options.state, slice as SliceChangeKey);
    if (controlled) {
      // Controlled slices: invoke the callback with the baseline value to signal reset.
      // The consumer decides what value to pass back.
      const cb = this.sliceCallback(slice as SliceChangeKey);
      if (cb) {
        cb(this.constructorBaseline[slice as SliceChangeKey]);
      }
      return;
    }

    // Uncontrolled slices: reset to constructor baseline
    const prev = this.state;
    const next: DataTableState = {
      ...prev,
      [slice]: this.constructorBaseline[slice as SliceChangeKey],
    };

    if (Object.is(prev[slice], next[slice])) return;
    this.state = next;
    this.notifySliceAndAggregate(prev, next);
  }

  /**
   * @internal
   * Prune invalid column IDs from state slices when columns change.
   * Called by the React adapter after columns are updated.
   *
   * R1 fix: Respects the controlled-slice contract. For uncontrolled slices,
   * prunes directly. For controlled slices, invokes the callback with the
   * pruned value so the consumer can update their state.
   */
  __pruneColumnIds(validColumnIds: Set<string>): void {
    const prev = this.state;
    let next = prev;
    let anyChange = false;
    // Track which slices changed for notification purposes
    const changedSlices: SliceChangeKey[] = [];

    // ─── Sorting ────────────────────────────────────────────────────────────────
    const validSorting = prev.sorting.filter((s) => validColumnIds.has(s.id));
    const sortingActuallyChanged =
      validSorting.length !== prev.sorting.length ||
      !validSorting.every((item, i) => Object.is(item, prev.sorting[i]));
    if (sortingActuallyChanged) {
      if (isSliceControlled(this.options.state, 'sorting')) {
        // Controlled: invoke callback with pruned value
        const cb = this.sliceCallback('sorting');
        if (cb) cb(validSorting);
      } else {
        // Uncontrolled: apply directly
        next = { ...next, sorting: validSorting };
        changedSlices.push('sorting');
      }
      anyChange = true;
    }

    // ─── Column Filters ─────────────────────────────────────────────────────────
    const validColumnFilters = prev.columnFilters.filter((f) => validColumnIds.has(f.id));
    const filtersActuallyChanged =
      validColumnFilters.length !== prev.columnFilters.length ||
      !validColumnFilters.every((item, i) => Object.is(item, prev.columnFilters[i]));
    if (filtersActuallyChanged) {
      if (isSliceControlled(this.options.state, 'columnFilters')) {
        const cb = this.sliceCallback('columnFilters');
        if (cb) cb(validColumnFilters);
      } else {
        next = { ...next, columnFilters: validColumnFilters };
        changedSlices.push('columnFilters');
      }
      anyChange = true;
    }

    // ─── Column Order ───────────────────────────────────────────────────────────
    const validColumnOrder = prev.columnOrder.filter((id) => validColumnIds.has(id));
    const orderActuallyChanged =
      validColumnOrder.length !== prev.columnOrder.length ||
      !validColumnOrder.every((item, i) => Object.is(item, prev.columnOrder[i]));
    if (orderActuallyChanged) {
      if (isSliceControlled(this.options.state, 'columnOrder')) {
        const cb = this.sliceCallback('columnOrder');
        if (cb) cb(validColumnOrder);
      } else {
        next = { ...next, columnOrder: validColumnOrder };
        changedSlices.push('columnOrder');
      }
      anyChange = true;
    }

    // ─── Column Visibility ───────────────────────────────────────────────────────
    const validColumnVisibility: Record<string, boolean> = {};
    for (const id of validColumnIds) {
      if (Object.prototype.hasOwnProperty.call(prev.columnVisibility, id)) {
        validColumnVisibility[id] = prev.columnVisibility[id]!;
      }
    }
    const prevVisKeys = Object.keys(prev.columnVisibility).sort();
    const validVisKeys = Object.keys(validColumnVisibility).sort();
    let visibilityChanged = false;
    if (prevVisKeys.length !== validVisKeys.length) {
      visibilityChanged = true;
    } else {
      for (let i = 0; i < prevVisKeys.length; i++) {
        const k = prevVisKeys[i]!;
        const validK = validVisKeys[i]!;
        if (k !== validK || !Object.is(prev.columnVisibility[k], validColumnVisibility[k])) {
          visibilityChanged = true;
          break;
        }
      }
    }
    if (visibilityChanged) {
      if (isSliceControlled(this.options.state, 'columnVisibility')) {
        const cb = this.sliceCallback('columnVisibility');
        if (cb) cb(validColumnVisibility);
      } else {
        next = { ...next, columnVisibility: validColumnVisibility };
        changedSlices.push('columnVisibility');
      }
      anyChange = true;
    }

    // ─── Column Pinning ────────────────────────────────────────────────────────
    const validLeft = prev.columnPinning.left.filter((id) => validColumnIds.has(id));
    const validRight = prev.columnPinning.right.filter((id) => validColumnIds.has(id));
    const pinningActuallyChanged =
      validLeft.length !== prev.columnPinning.left.length ||
      !validLeft.every((item, i) => Object.is(item, prev.columnPinning.left[i])) ||
      validRight.length !== prev.columnPinning.right.length ||
      !validRight.every((item, i) => Object.is(item, prev.columnPinning.right[i]));
    if (pinningActuallyChanged) {
      const newPinning = { left: validLeft, right: validRight };
      if (isSliceControlled(this.options.state, 'columnPinning')) {
        const cb = this.sliceCallback('columnPinning');
        if (cb) cb(newPinning);
      } else {
        next = { ...next, columnPinning: newPinning };
        changedSlices.push('columnPinning');
      }
      anyChange = true;
    }

    // ─── Column Sizing ─────────────────────────────────────────────────────────
    const validColumnSizing: ColumnSizingState = {};
    for (const id of validColumnIds) {
      if (Object.prototype.hasOwnProperty.call(prev.columnSizing, id)) {
        validColumnSizing[id] = prev.columnSizing[id]!;
      }
    }
    const prevSizingKeys = Object.keys(prev.columnSizing).sort();
    const validSizingKeys = Object.keys(validColumnSizing).sort();
    let sizingChanged = false;
    if (prevSizingKeys.length !== validSizingKeys.length) {
      sizingChanged = true;
    } else {
      for (let i = 0; i < prevSizingKeys.length; i++) {
        const k = prevSizingKeys[i]!;
        const validK = validSizingKeys[i]!;
        if (k !== validK || !Object.is(prev.columnSizing[k], validColumnSizing[k])) {
          sizingChanged = true;
          break;
        }
      }
    }
    if (sizingChanged) {
      if (isSliceControlled(this.options.state, 'columnSizing')) {
        const cb = this.sliceCallback('columnSizing');
        if (cb) cb(validColumnSizing);
      } else {
        next = { ...next, columnSizing: validColumnSizing };
        changedSlices.push('columnSizing');
      }
      anyChange = true;
    }

    // ─── Focused Cell ─────────────────────────────────────────────────────────
    if (prev.focusedCell !== null && !validColumnIds.has(prev.focusedCell.columnId)) {
      if (isSliceControlled(this.options.state, 'focusedCell')) {
        const cb = this.sliceCallback('focusedCell');
        if (cb) cb(null);
      } else {
        next = { ...next, focusedCell: null };
        changedSlices.push('focusedCell');
      }
      anyChange = true;
    }

    // ─── Column Sizing Info ─────────────────────────────────────────────────────
    if (prev.columnSizingInfo !== null && !validColumnIds.has(prev.columnSizingInfo.columnId)) {
      if (isSliceControlled(this.options.state, 'columnSizingInfo')) {
        const cb = this.sliceCallback('columnSizingInfo');
        if (cb) cb(null);
      } else {
        next = { ...next, columnSizingInfo: null };
        changedSlices.push('columnSizingInfo');
      }
      anyChange = true;
    }

    if (!anyChange) return;

    // For uncontrolled changes, update state and notify
    if (changedSlices.length > 0) {
      this.state = next;
      this.notify();
    }
  }

  /**
   * Returns the current data version token.
   *
   * R2 fix: Exposes version identity at the table boundary for mutable
   * data patterns. When `dataVersion` is configured with a `getVersion`
   * function, this method calls it with the current data to derive the token.
   * When configured with a static `version`, this returns that value.
   *
   * @returns The current version token, or undefined if `dataVersion` is not configured.
   */
  getDataVersion(): string | number | undefined {
    const dv = this.options.dataVersion;
    if (!dv) return undefined;

    // If getVersion is provided, call it with the current data
    if (dv.getVersion) {
      // Use the data from the data source if available, otherwise use options.data
      const data = this.dataSourceState.data ?? this.options.data;
      return dv.getVersion(data);
    }

    // Otherwise return the static version token
    return dv.version;
  }
}

/**
 * Public factory.
 */
export const createDataTable = <TRow>(options: DataTableOptions<TRow>): DataTableInstance<TRow> => {
  const instance = new DataTable<TRow>(options);
  return instance as DataTableInstance<TRow> & SliceDispatchers;
};

export { defaultGetRowId };
export type { Column };
