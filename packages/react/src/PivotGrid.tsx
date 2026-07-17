import type { PivotColumnNode, PivotLeafColumn, PivotRowNode } from '@lynellf/tablekit-pivot';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import type { PivotGridProps, PivotGridValueContext } from './PivotGrid.types';
import { type UsePivotTableOptions, usePivotTable } from './usePivotTable';
import { getVirtualWindow } from './virtualWindow';
import './styles.css';

export type { PivotGridProps, PivotGridValueContext } from './PivotGrid.types';

const DEFAULT_HEIGHT = 480;
const DEFAULT_WIDTH = 800;
const DEFAULT_ROW_HEIGHT = 36;
const DEFAULT_ROW_HEADER_WIDTH = 220;
const HEADER_ROW_HEIGHT = 32;

type PivotCssProperties = CSSProperties & Record<`--tk-${string}`, string>;
type HeaderEntry = { node: PivotColumnNode | PivotLeafColumn; colSpan: number };

const renderSlot = (slot: unknown, context: unknown, fallback: ReactNode): ReactNode => {
  if (typeof slot === 'function') return (slot as (value: unknown) => ReactNode)(context);
  if (slot === null || slot === undefined) return fallback;
  return slot as ReactNode;
};

const labelOf = (node: PivotColumnNode | PivotLeafColumn): unknown =>
  'label' in node ? node.label : node.header;

export function PivotGrid<TRow>(props: PivotGridProps<TRow>) {
  const {
    data,
    pivot: pivotConfig,
    engine,
    getRowId,
    dataVersion,
    initialState,
    state: controlledState,
    onPivotChange,
    onExpandedChange,
    onPivotSortingChange,
    onFocusedCellChange,
    onStateChange,
    announcer,
    messages,
    tabBehavior,
    height = DEFAULT_HEIGHT,
    width = DEFAULT_WIDTH,
    rowHeight = DEFAULT_ROW_HEIGHT,
    rowHeaderWidth = DEFAULT_ROW_HEADER_WIDTH,
    overscanRows = 4,
    overscanColumns = 2,
    className,
    'aria-label': ariaLabel = 'Pivot grid',
    loadingContent = 'Loading pivot…',
    emptyContent = 'No pivot rows to display.',
    errorContent = (error: Error) => `Unable to aggregate rows: ${error.message}`,
    renderValue,
  } = props;

  const options: UsePivotTableOptions<TRow> = {
    data,
    pivot: pivotConfig,
    ...(engine ? { engine } : {}),
    ...(getRowId ? { getRowId } : {}),
    ...(dataVersion ? { dataVersion } : {}),
    ...(initialState ? { initialState } : {}),
    ...(controlledState ? { state: controlledState } : {}),
    ...(onPivotChange ? { onPivotChange } : {}),
    ...(onExpandedChange ? { onExpandedChange } : {}),
    ...(onPivotSortingChange ? { onPivotSortingChange } : {}),
    ...(onFocusedCellChange ? { onFocusedCellChange } : {}),
    ...(onStateChange ? { onStateChange } : {}),
    ...(announcer ? { announcer } : {}),
    ...(messages ? { messages } : {}),
    ...(tabBehavior ? { tabBehavior } : {}),
  };
  const { pivot, state, Announcer, gridRef } = usePivotTable(options);
  const result = pivot.getResult();
  const rows = pivot.getVisibleRows();
  const leafColumns = pivot.getLeafColumns();
  const engineHeaderRows = pivot.getHeaderRows();
  const hasLeafHeaderRow = engineHeaderRows.some((row) =>
    row.some(({ node }) => 'measureId' in node),
  );
  const needsMeasureHeaderRow =
    !hasLeafHeaderRow && (state.pivot.measures.length > 1 || engineHeaderRows.length === 0);
  const headerRows: HeaderEntry[][] = needsMeasureHeaderRow
    ? [...engineHeaderRows, leafColumns.map((node) => ({ node, colSpan: 1 }))]
    : engineHeaderRows;
  const headerHeight = Math.max(1, headerRows.length) * HEADER_ROW_HEIGHT;
  const showGrandTotal = state.pivot.totals?.grandTotalRow !== false && leafColumns.length > 0;

  const [viewport, setViewport] = useState({ top: 0, left: 0, height, width });
  const focusedRowIndex = state.focusedCell
    ? rows.findIndex((row) => row.key === state.focusedCell?.rowId)
    : undefined;
  const rowWindow = getVirtualWindow({
    sizes: rows.map(() => rowHeight),
    scrollOffset: Math.max(0, viewport.top - headerHeight),
    viewportSize: viewport.height,
    overscan: overscanRows,
    ...(focusedRowIndex !== undefined ? { keepIndex: focusedRowIndex } : {}),
  });
  const focusedColumnIndex = state.focusedCell
    ? leafColumns.findIndex((leaf) => leaf.id === state.focusedCell?.columnId)
    : undefined;
  const columnWindow = getVirtualWindow({
    sizes: leafColumns.map((leaf) => leaf.size),
    scrollOffset: Math.max(0, viewport.left - rowHeaderWidth),
    viewportSize: Math.max(0, viewport.width - rowHeaderWidth),
    overscan: overscanColumns,
    ...(focusedColumnIndex !== undefined ? { keepIndex: focusedColumnIndex } : {}),
  });
  const renderedLeaves = columnWindow.items.flatMap((item) => {
    const leaf = leafColumns[item.index];
    return leaf ? [{ leaf, ...item }] : [];
  });
  const firstLeafIndex = columnWindow.items[0]?.index ?? 0;
  const lastLeafIndex = columnWindow.items.at(-1)?.index ?? -1;
  const leafStarts = leafColumns.reduce<number[]>((starts, leaf, index) => {
    void leaf;
    starts.push(index === 0 ? 0 : (starts[index - 1] ?? 0) + (leafColumns[index - 1]?.size ?? 0));
    return starts;
  }, []);
  const contentWidth = rowHeaderWidth + columnWindow.totalSize;
  const bodyHeight = rowWindow.totalSize + (showGrandTotal ? rowHeight : 0);
  const status = pivot.getStatus();
  const rootError = pivot.getError();

  const renderCellValue = (
    value: unknown,
    row: PivotRowNode<TRow> | null,
    leaf: PivotLeafColumn<TRow>,
    isGrandTotal: boolean,
  ): ReactNode => {
    const context: PivotGridValueContext<TRow> = { value, row, leaf, isGrandTotal };
    return renderValue ? renderValue(context) : String(value ?? '');
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focused = pivot.getState().focusedCell;
    if (!focused || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key))
      return;
    const rowIndex = rows.findIndex((row) => row.key === focused.rowId);
    const columnIndex = leafColumns.findIndex((leaf) => leaf.id === focused.columnId);
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
        leafColumns.length - 1,
        columnIndex + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
      ),
    );
    const nextRow = rows[nextRowIndex];
    const nextLeaf = leafColumns[nextColumnIndex];
    if (!nextRow || !nextLeaf) return;
    event.preventDefault();
    pivot.setFocusedCell({ rowId: nextRow.key, columnId: nextLeaf.id });
  };

  useEffect(() => {
    const focused = state.focusedCell;
    if (!focused) return;
    const cell = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('[data-pivot-cell-id]') ?? [],
    ).find((element) => element.dataset.pivotCellId === `${focused.rowId}:${focused.columnId}`);
    cell?.focus();
  }, [gridRef, state.focusedCell]);

  const rootStyle: PivotCssProperties = {
    '--tk-grid-height': `${height}px`,
    '--tk-grid-width': `${width}px`,
    '--tk-row-height': `${rowHeight}px`,
    '--tk-pivot-row-header-width': `${rowHeaderWidth}px`,
  };

  return (
    <div className={['tk-pivot-grid', className].filter(Boolean).join(' ')} style={rootStyle}>
      <Announcer />
      <div
        {...pivot.getGridProps()}
        ref={gridRef}
        className="tk-pivot-viewport"
        aria-label={ariaLabel}
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
        <div className="tk-pivot-header" style={{ width: contentWidth, height: headerHeight }}>
          <div
            role="columnheader"
            className="tk-pivot-corner"
            style={{ left: 0, width: rowHeaderWidth }}
          >
            Rows
          </div>
          {headerRows.map((headerRow, rowIndex) => {
            let leafIndex = 0;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: hierarchy depth is stable
                key={rowIndex}
                role="row"
                className="tk-pivot-header-row"
                style={{ top: rowIndex * HEADER_ROW_HEIGHT, height: HEADER_ROW_HEIGHT }}
              >
                {headerRow.flatMap(({ node, colSpan }) => {
                  const startIndex = leafIndex;
                  const endIndex = leafIndex + colSpan - 1;
                  leafIndex += colSpan;
                  if (endIndex < firstLeafIndex || startIndex > lastLeafIndex) return [];
                  const start = leafStarts[startIndex] ?? 0;
                  const end = (leafStarts[endIndex] ?? start) + (leafColumns[endIndex]?.size ?? 0);
                  return [
                    <div
                      key={`${rowIndex}:${node.id}`}
                      {...pivot.getHeaderProps(node)}
                      className="tk-pivot-column-header"
                      style={{ left: rowHeaderWidth + start, width: end - start }}
                    >
                      {renderSlot(labelOf(node), { node, pivot }, String(labelOf(node) ?? ''))}
                    </div>,
                  ];
                })}
              </div>
            );
          })}
        </div>

        <div
          {...pivot.getBodyProps()}
          className="tk-pivot-body"
          style={{ height: bodyHeight, width: contentWidth }}
        >
          {rowWindow.items.map(({ index, start }) => {
            const row = rows[index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                {...pivot.getRowProps(row)}
                className="tk-pivot-row"
                style={{ top: start, height: rowHeight, width: contentWidth }}
              >
                <div
                  {...pivot.getRowHeaderProps(row)}
                  className="tk-pivot-row-header"
                  style={{ left: 0, width: rowHeaderWidth, paddingLeft: 8 + row.level * 16 }}
                >
                  {row.hasChildren && (
                    <button type="button" {...pivot.getToggleExpandedProps(row)}>
                      {state.expanded[row.key] ? '−' : '+'}
                    </button>
                  )}
                  <span>{String(row.label ?? '')}</span>
                  {row.childState === 'loading' && <span role="status">Loading…</span>}
                  {row.childState === 'error' && row.error && (
                    <span role="alert">
                      {row.error.message}
                      <button
                        type="button"
                        aria-label={`Retry ${String(row.label)}`}
                        onClick={() => pivot.retryRow(row.path)}
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
                {renderedLeaves.map(({ leaf, start: columnStart, size }) => {
                  const focused =
                    state.focusedCell?.rowId === row.key && state.focusedCell.columnId === leaf.id;
                  return (
                    <div
                      key={leaf.id}
                      role="gridcell"
                      className="tk-pivot-cell"
                      data-pivot-cell-id={`${row.key}:${leaf.id}`}
                      tabIndex={focused ? 0 : -1}
                      style={{ left: rowHeaderWidth + columnStart, width: size }}
                      onFocus={() => pivot.setFocusedCell({ rowId: row.key, columnId: leaf.id })}
                      onClick={(event) => event.currentTarget.focus()}
                      onKeyDown={() => {}}
                    >
                      {renderCellValue(row.values[leaf.id], row, leaf, false)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {showGrandTotal && (
            <div
              role="row"
              className="tk-pivot-row tk-pivot-grand-total"
              data-total="row"
              style={{ top: rowWindow.totalSize, height: rowHeight, width: contentWidth }}
            >
              <div
                role="rowheader"
                className="tk-pivot-row-header"
                style={{ left: 0, width: rowHeaderWidth }}
              >
                Grand total
              </div>
              {renderedLeaves.map(({ leaf, start, size }) => (
                <div
                  key={leaf.id}
                  role="gridcell"
                  className="tk-pivot-cell"
                  style={{ left: rowHeaderWidth + start, width: size }}
                >
                  {renderCellValue(result.grandTotals[leaf.id], null, leaf, true)}
                </div>
              ))}
            </div>
          )}

          {status === 'loading' && rows.length === 0 && (
            <div role="status" className="tk-pivot-state">
              {loadingContent}
            </div>
          )}
          {status === 'success' && rows.length === 0 && (
            <div role="status" className="tk-pivot-state">
              {emptyContent}
            </div>
          )}
          {status === 'error' && rows.length === 0 && rootError && (
            <div role="alert" className="tk-pivot-state">
              {errorContent(rootError)}
              <button type="button" onClick={pivot.retry}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
