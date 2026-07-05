/**
 * @lynellf/tablekit-core — `createDataTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, `getRowModel`. M1 adds the filter→sort→paginate pipeline,
 * pagination helpers, and `autoResetPageIndex`.
 */

import { noopAnnouncer, getGlobalAnnouncer } from './announcer';
import { defaultGetRowId } from './columns';
import { buildRowsQuery } from './dataSource/query';
import { synthesizePlaceholderRows } from './dataSource/placeholderRows';
import { validateModeConfiguration } from './dataSource/warnings';
import type { DataSourceCapabilities, DataSourceState } from './dataSource/types';
import type { Column } from './columns';
import { createColumns } from './columns';
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

  constructor(options: DataTableOptions<TRow>) {
    this.options = options;
    this.state = mergeInitialState(options.initialState, options.state);
    this.navigationMode = options.navigationMode ?? 'cell';
    // M3 phase 1: mixed-mode trap warning. One-shot dev warning.
    validateModeConfiguration(this.options);
  }

  getState(): DataTableState {
    return this.state;
  }

  setOptions(next: DataTableOptions<TRow>): void {
    if (Object.is(next, this.options)) return;
    const prev = this.options;
    const prevState = this.state;
    this.options = next;
    this.state = mergeInitialState(next.initialState, next.state);
    // M3 phase 1: re-validate when the option set changes (manual* flags flipped).
    if (
      prev.manualSorting !== next.manualSorting ||
      prev.manualFiltering !== next.manualFiltering ||
      prev.manualPagination !== next.manualPagination ||
      prev.allowWithinPageOperations !== next.allowWithinPageOperations
    ) {
      validateModeConfiguration(next);
    }
    // Notify listeners if state actually changed (e.g., initialState change).
    // Suppress notification during setOptions to prevent infinite loops with controlled state.
    if (
      stateChangedOnSlices(prevState, this.state, [
        'sorting',
        'columnFilters',
        'pagination',
        'columnOrder',
        'columnVisibility',
        'columnPinning',
        'columnSizing',
        'columnSizingInfo',
        'focusedCell',
      ])
    ) {
      this.suppressNotify = true;
      this.notify();
      this.suppressNotify = false;
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

  /** @internal Write the data source state. Used by the React hook. */
  __setDataSourceState(state: DataSourceState<TRow>): void {
    const prev = this.dataSourceState;
    // Only update if status, data, error, or totalRowCount actually changed.
    // Spreading { ...prev, refetch } creates a new object even when data is same;
    // we use JSON stringify for deep comparison of the data field.
    const dataChanged =
      prev.data !== state.data &&
      JSON.stringify(prev.data) !== JSON.stringify(state.data);
    const statusChanged = prev.status !== state.status;
    const errorChanged = prev.error !== state.error;
    const totalRowCountChanged = prev.totalRowCount !== state.totalRowCount;
    if (!statusChanged && !dataChanged && !errorChanged && !totalRowCountChanged) {
      // Only refetch changed — skip to avoid unnecessary state updates.
      this.dataSourceState = state;
      return;
    }
    this.dataSourceState = state;
    // NOTE: We intentionally do NOT call this.notify() here.
    // The useDataSource hook manages its own local React state via useState/setSnapshot.
    // Calling notify() would cause the table's subscribers (including useDataSource itself!)
    // to fire, creating an infinite loop: runFetch -> __setDataSourceState -> notify -> runFetch
    // The table's getGridProps/getBodyProps read this.dataSourceState directly,
    // so they'll pick up the new state on the next render cycle.
  }

  /**
   * @internal
   * Build a `RowsQuery` from the current state + capabilities. Encapsulates
   * the column resolution + filterFn-name resolution so the React hook
   * doesn't need to expose columns or options publicly.
   *
   * For controlled slices, uses the consumer-provided state from options.state
   * instead of the internal state.
   */
  __buildRowsQuery(capabilities: DataSourceCapabilities) {
    // For controlled slices, use the options state instead of internal state
    const sorting = isSliceControlled(this.options.state, 'sorting')
      ? this.options.state.sorting
      : this.state.sorting;
    const columnFilters = isSliceControlled(this.options.state, 'columnFilters')
      ? this.options.state.columnFilters
      : this.state.columnFilters;
    const pagination = isSliceControlled(this.options.state, 'pagination')
      ? this.options.state.pagination
      : this.state.pagination;
    const state = {
      ...this.state,
      sorting,
      columnFilters,
      pagination,
    };
    const columns = this.getResolvedColumns();
    return buildRowsQuery(state, columns, { capabilities });
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
    const stateChanged =
      memoKey.sorting !== state.sorting ||
      memoKey.columnFilters !== state.columnFilters ||
      memoKey.pagination !== state.pagination;

    if (!dataChanged && !stateChanged && memoKey.cachedRows) {
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

    // Update cache
    this.rowModelCache.setCachedResult(rows, state, result);
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
      const total = this.options.rowCount ?? this.options.data.length;
      return computePageCount(total, pageSize);
    }
    const fullRowCount = this.getFullRowCount();
    return computePageCount(fullRowCount, pageSize);
  }

  getRowCount(): number {
    if (this.options.manualPagination === true) {
      return this.options.rowCount ?? this.options.data.length;
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
    // Use global announcer if available, otherwise fall back to options announcer.
    // This allows the React adapter to set up the announcer after the table is created.
    const global = getGlobalAnnouncer();
    if (global !== noopAnnouncer) {
      global.announce(message, politeness);
    } else {
      this.getAnnouncer().announce(message, politeness);
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
