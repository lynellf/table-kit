import { defaultGetRowId, resolveUpdater } from '@lynellf/tablekit-core';
import type { Cell, Column, Row } from '@lynellf/tablekit-core';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import type {
  DataGridCellEvent,
  DataGridProps,
  DataGridRowEvent,
  RowSelectionState,
} from './DataGrid.types';
import { type UseDataTableOptions, useDataTable } from './useDataTable';
import { getVirtualWindow } from './virtualWindow';
import './styles.css';

export type {
  DataGridCellEvent,
  DataGridHandle,
  DataGridProps,
  DataGridRowEvent,
  RowSelectionMode,
  RowSelectionState,
} from './DataGrid.types';

const DEFAULT_HEIGHT = 480;
const DEFAULT_WIDTH = 800;
const DEFAULT_ROW_HEIGHT = 36;
const SELECTION_COLUMN_WIDTH = 44;

type GridCssProperties = CSSProperties & Record<`--tk-${string}`, string>;

const renderSlot = (slot: unknown, context: unknown, fallback: ReactNode): ReactNode => {
  if (typeof slot === 'function') {
    return (slot as (value: unknown) => ReactNode)(context);
  }
  if (slot === null || slot === undefined) return fallback;
  return slot as ReactNode;
};

export function DataGrid<TRow>(props: DataGridProps<TRow>) {
  const {
    columns,
    ref,
    getRowId,
    initialState,
    state,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    onColumnOrderChange,
    onColumnVisibilityChange,
    onColumnPinningChange,
    onColumnSizingChange,
    onColumnSizingInfoChange,
    onFocusedCellChange,
    onStateChange,
    dataVersion,
    announcer,
    messages,
    navigationMode = 'cell',
    tabBehavior,
    rowSelectionMode = 'none',
    rowSelection,
    defaultRowSelection = {},
    onRowSelectionChange,
    onRowClick,
    onRowDoubleClick,
    onCellClick,
    onCellDoubleClick,
    height = DEFAULT_HEIGHT,
    width = DEFAULT_WIDTH,
    rowHeight = DEFAULT_ROW_HEIGHT,
    overscanRows = 4,
    overscanColumns = 2,
    pageSizeOptions = [10, 25, 50, 100],
    enableColumnResize = false,
    className,
    'aria-label': ariaLabel = 'Data grid',
    loadingContent = 'Loading rows…',
    emptyContent = 'No rows to display.',
    errorContent = (error: Error) => `Unable to load rows: ${error.message}`,
  } = props;

  const source = props.dataSource;
  if (
    source &&
    (source.capabilities.sort !== 'server' ||
      source.capabilities.filter !== 'server' ||
      source.capabilities.paginate !== 'server' ||
      source.capabilities.pagination === 'cursor')
  ) {
    throw new Error(
      'DataGrid server mode requires server sorting, filtering, and offset pagination.',
    );
  }

  const [loadedServerRows, setLoadedServerRows] = useState<TRow[]>([]);
  const [loadedServerCount, setLoadedServerCount] = useState<number | undefined>(undefined);
  const [internalSelection, setInternalSelection] =
    useState<RowSelectionState>(defaultRowSelection);
  const selection = rowSelection ?? internalSelection;
  const data = source ? loadedServerRows : (props.rows ?? []);

  const tableOptions: UseDataTableOptions<TRow> = {
    data,
    columns,
    navigationMode,
    ...(source ? { dataSource: source } : {}),
    ...(getRowId ? { getRowId } : {}),
    ...(initialState ? { initialState } : {}),
    state: { ...state, rowSelection: selection },
    ...(onSortingChange ? { onSortingChange } : {}),
    ...(onColumnFiltersChange ? { onColumnFiltersChange } : {}),
    ...(onPaginationChange ? { onPaginationChange } : {}),
    ...(onColumnOrderChange ? { onColumnOrderChange } : {}),
    ...(onColumnVisibilityChange ? { onColumnVisibilityChange } : {}),
    ...(onColumnPinningChange ? { onColumnPinningChange } : {}),
    ...(onColumnSizingChange ? { onColumnSizingChange } : {}),
    ...(onColumnSizingInfoChange ? { onColumnSizingInfoChange } : {}),
    ...(onFocusedCellChange ? { onFocusedCellChange } : {}),
    onRowSelectionChange: (updater) => {
      const next = resolveUpdater(selection, updater);
      if (rowSelection === undefined) setInternalSelection(next);
      onRowSelectionChange?.(next);
    },
    ...(onStateChange ? { onStateChange } : {}),
    ...(dataVersion ? { dataVersion } : {}),
    ...(announcer ? { announcer } : {}),
    ...(messages ? { messages } : {}),
    ...(tabBehavior ? { tabBehavior } : {}),
    ...(loadedServerCount !== undefined ? { rowCount: loadedServerCount } : {}),
  };

  const {
    table,
    state: tableState,
    dataSourceState,
    Announcer,
    gridRef,
  } = useDataTable(tableOptions);

  useEffect(() => {
    if (!source || dataSourceState.data === null) return;
    setLoadedServerRows(dataSourceState.data);
    setLoadedServerCount(dataSourceState.totalRowCount);
  }, [source, dataSourceState.data, dataSourceState.totalRowCount]);

  const updateSelection = (rowId: string) => {
    if (rowSelectionMode === 'none') return;
    table.toggleRowSelected(rowId, rowSelectionMode);
  };

  useImperativeHandle(
    ref,
    () => ({
      getSelectedRowIds: () => Object.keys(selection),
      getSelectedRows: () =>
        data.filter((row, index) => selection[(getRowId ?? defaultGetRowId)(row, index)]),
    }),
    [data, getRowId, selection],
  );

  const [viewport, setViewport] = useState({ top: 0, left: 0, height, width });
  const rows = table.getRowModel();
  const visibleColumns = table.getVisibleColumns();
  const focusedRowIndex = tableState.focusedCell
    ? rows.findIndex((row) => row.id === tableState.focusedCell?.rowId)
    : undefined;
  const rowWindow = getVirtualWindow({
    sizes: rows.map(() => rowHeight),
    scrollOffset: viewport.top,
    viewportSize: viewport.height,
    overscan: overscanRows,
    ...(focusedRowIndex !== undefined ? { keepIndex: focusedRowIndex } : {}),
  });
  const focusedColumnIndex = tableState.focusedCell
    ? visibleColumns.findIndex((column) => column.id === tableState.focusedCell?.columnId)
    : undefined;
  const columnWindow = getVirtualWindow({
    sizes: visibleColumns.map((column) => column.getSize()),
    scrollOffset: Math.max(
      0,
      viewport.left - (rowSelectionMode === 'none' ? 0 : SELECTION_COLUMN_WIDTH),
    ),
    viewportSize: viewport.width,
    overscan: overscanColumns,
    ...(focusedColumnIndex !== undefined ? { keepIndex: focusedColumnIndex } : {}),
  });
  const renderedColumns = columnWindow.items.flatMap((item) => {
    const column = visibleColumns[item.index];
    return column ? [{ column, ...item }] : [];
  });
  const selectionOffset = rowSelectionMode === 'none' ? 0 : SELECTION_COLUMN_WIDTH;
  const contentWidth = selectionOffset + columnWindow.totalSize;

  const rootStyle: GridCssProperties = {
    '--tk-grid-height': `${height}px`,
    '--tk-grid-width': `${width}px`,
    '--tk-row-height': `${rowHeight}px`,
  };

  const publishRowEvent = (
    callback: ((event: DataGridRowEvent<TRow>) => void) | undefined,
    row: Row<TRow>,
    nativeEvent: SyntheticEvent<HTMLDivElement>,
  ) => callback?.({ rowId: row.id, row: row.original, nativeEvent });

  const publishCellEvent = (
    callback: ((event: DataGridCellEvent<TRow>) => void) | undefined,
    cell: Cell<TRow>,
    nativeEvent: SyntheticEvent<HTMLDivElement>,
  ) =>
    callback?.({
      rowId: cell.row.id,
      row: cell.row.original,
      columnId: cell.column.id,
      value: cell.getValue(),
      nativeEvent,
    });

  const focusCell = (row: Row<TRow>, column: Column<TRow, unknown>) => {
    table.setFocusedCell({ rowId: row.id, columnId: column.id });
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = table.getState().focusedCell;
    if (!focused || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
      return;
    const rowIndex = rows.findIndex((row) => row.id === focused.rowId);
    const columnIndex = visibleColumns.findIndex((column) => column.id === focused.columnId);
    if (rowIndex < 0 || columnIndex < 0) return;
    const nextRowIndex = Math.max(
      0,
      Math.min(
        rows.length - 1,
        rowIndex + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0),
      ),
    );
    const nextColumnIndex = Math.max(
      0,
      Math.min(
        visibleColumns.length - 1,
        columnIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
      ),
    );
    const nextRow = rows[nextRowIndex];
    const nextColumn = visibleColumns[nextColumnIndex];
    if (!nextRow || !nextColumn) return;
    event.preventDefault();
    table.setFocusedCell({ rowId: nextRow.id, columnId: nextColumn.id });
  };

  useEffect(() => {
    const focused = tableState.focusedCell;
    if (!focused) return;
    const cell = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('[data-cell-id]') ?? [],
    ).find((element) => element.dataset.cellId === `${focused.rowId}:${focused.columnId}`);
    cell?.focus();
  }, [gridRef, tableState.focusedCell]);

  const status = source ? dataSourceState.status : rows.length === 0 ? 'empty' : 'success';
  const totalRowCount = source
    ? (dataSourceState.totalRowCount ?? loadedServerCount ?? 0)
    : table.getRowCount();
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <div className={['tk-data-grid', className].filter(Boolean).join(' ')} style={rootStyle}>
      <Announcer />
      <div
        {...table.getGridProps()}
        ref={gridRef}
        className="tk-grid-viewport"
        aria-label={ariaLabel}
        aria-colcount={visibleColumns.length + (rowSelectionMode === 'none' ? 0 : 1)}
        aria-rowcount={totalRowCount + 1}
        aria-busy={status === 'loading' ? true : undefined}
        onKeyDown={onGridKeyDown}
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({
            top: element.scrollTop,
            left: element.scrollLeft,
            height: element.clientHeight || height,
            width: element.clientWidth || width,
          });
        }}
      >
        <div role="row" className="tk-grid-header" style={{ width: contentWidth }}>
          {rowSelectionMode !== 'none' && (
            <div
              role="columnheader"
              className="tk-grid-selection-header"
              aria-label="Row selection"
            />
          )}
          {renderedColumns.map(({ column, start, size }) => {
            const sort = column.getIsSorted();
            const header = table
              .getHeaderGroups()[0]
              ?.headers.find((item) => item.id === column.id);
            const filter = tableState.columnFilters.find((item) => item.id === column.id);
            return (
              <div
                key={column.id}
                role="columnheader"
                className="tk-grid-column-header"
                aria-sort={sort === false ? undefined : sort === 'asc' ? 'ascending' : 'descending'}
                style={{ left: selectionOffset + start, width: size }}
              >
                <div className="tk-grid-header-label">
                  {renderSlot(column.def.header, { column, table }, column.id)}
                  {column.getCanSort() && (
                    <button
                      type="button"
                      className="tk-grid-sort-button"
                      aria-label={`Sort ${column.id}`}
                      onClick={() => {
                        const props = header?.getSortToggleProps();
                        (
                          props?.onClick as
                            | ((event: { defaultPrevented: boolean }) => void)
                            | undefined
                        )?.({ defaultPrevented: false });
                      }}
                    >
                      {sort === 'asc' ? '↑' : sort === 'desc' ? '↓' : '↕'}
                    </button>
                  )}
                </div>
                {column.getCanFilter() && (
                  <input
                    className="tk-grid-filter"
                    aria-label={`Filter ${column.id}`}
                    value={String(filter?.value ?? '')}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      table.setColumnFilters((current) => [
                        ...current.filter((item) => item.id !== column.id),
                        ...(value === '' ? [] : [{ id: column.id, value }]),
                      ]);
                    }}
                  />
                )}
                {enableColumnResize && header && (
                  <div {...header.getResizeHandleProps()} className="tk-grid-resize-handle" />
                )}
              </div>
            );
          })}
        </div>

        <div
          {...table.getBodyProps()}
          className="tk-grid-body"
          style={{ height: rowWindow.totalSize, width: contentWidth }}
        >
          {rowWindow.items.map(({ index, start }) => {
            const row = rows[index];
            if (!row) return null;
            const cells = new Map(row.getVisibleCells().map((cell) => [cell.column.id, cell]));
            return (
              <div
                key={row.id}
                {...row.getRowProps()}
                className="tk-grid-row"
                aria-selected={selection[row.id] === true ? true : undefined}
                data-row-id={row.id}
                style={{ top: start, height: rowHeight, width: contentWidth }}
                onClick={(event) => publishRowEvent(onRowClick, row, event)}
                onDoubleClick={(event) => publishRowEvent(onRowDoubleClick, row, event)}
              >
                {rowSelectionMode !== 'none' && (
                  <div role="gridcell" className="tk-grid-selection-cell">
                    <input
                      type={rowSelectionMode === 'single' ? 'radio' : 'checkbox'}
                      name={rowSelectionMode === 'single' ? 'tk-grid-selection' : undefined}
                      aria-label={`Select row ${row.id}`}
                      checked={selection[row.id] === true}
                      onChange={() => updateSelection(row.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </div>
                )}
                {renderedColumns.map(({ column, start: columnStart, size }) => {
                  const cell = cells.get(column.id);
                  if (!cell) return null;
                  const focused =
                    tableState.focusedCell?.rowId === row.id &&
                    tableState.focusedCell.columnId === column.id;
                  const initialFocusable =
                    tableState.focusedCell === null &&
                    index === 0 &&
                    column.id === visibleColumns[0]?.id;
                  return (
                    <div
                      key={cell.id}
                      role="gridcell"
                      className="tk-grid-cell"
                      data-cell-id={`${row.id}:${column.id}`}
                      tabIndex={focused || initialFocusable ? 0 : -1}
                      style={{ left: selectionOffset + columnStart, width: size }}
                      onFocus={() => focusCell(row, column)}
                      onClick={(event) => publishCellEvent(onCellClick, cell, event)}
                      onDoubleClick={(event) => publishCellEvent(onCellDoubleClick, cell, event)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        publishCellEvent(onCellClick, cell, event);
                      }}
                    >
                      {row.isPlaceholder
                        ? 'Loading…'
                        : renderSlot(
                            column.def.cell,
                            cell.getContext(),
                            String(cell.getValue() ?? ''),
                          )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {status === 'loading' && rows.length === 0 && (
            <div role="status" className="tk-grid-state">
              {loadingContent}
            </div>
          )}
          {status === 'empty' && (
            <div role="status" className="tk-grid-state">
              {emptyContent}
            </div>
          )}
          {status === 'error' && dataSourceState.error && (
            <div role="alert" className="tk-grid-state">
              {errorContent(dataSourceState.error)}
              <button type="button" onClick={dataSourceState.refetch}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tk-grid-footer" aria-label="Pagination">
        <span>{totalRowCount} rows</span>
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </button>
        <span>
          Page {tableState.pagination.pageIndex + 1} of {pageCount}
        </span>
        <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Next
        </button>
        <label>
          Rows per page
          <select
            value={tableState.pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.currentTarget.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
