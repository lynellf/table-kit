/**
 * @lynellf/tablekit-core — Row and Cell derived types.
 *
 * Spec §4.4: derived objects exposed to renderers. `Row` carries
 * `id`, `index` (in the pipeline output), `original` (the source row),
 * and `getVisibleCells()`. `Cell` carries `id`, `row`, `column`,
 * `getValue()`, `getContext()`.
 *
 * Identity: rebuilt on every `buildRowModel()` call. Consumers must not hold
 * `Row`/`Cell` references across renders (same constraint M0 documents for
 * `Column`).
 *
 * Note: `Row`, `Cell`, and `CellContext` interfaces are declared in
 * `types.ts` to avoid circular imports. This module implements them.
 */

import type { Column } from './columns';
import { mergeProps } from './propGetters';
import type { Cell, CellContext, Row as RowInterface } from './types';

export type { Row, Cell, CellContext } from './types';

/**
 * Default cell props getter.
 */
const defaultCellProps = <TRow, TValue>(
  cell: Cell<TRow, TValue>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const isPinned = cell.column.getIsPinned();
  const props: Record<string, unknown> = {
    role: 'gridcell',
    'aria-colindex': cell.getContext().colIndex + 1,
    key: cell.id,
  };
  if (isPinned) {
    props['data-pinned'] = isPinned;
  }
  return mergeProps(props, consumerProps);
};

/**
 * Build a Cell from a Row + Column.
 *
 * The Cell is a fresh object every time — identity is not preserved across
 * `getVisibleCells()` calls. Consumers must read it in the render and not
 * hold references.
 */
export const buildCell = <TRow, TValue>(
  row: RowInterface<TRow>,
  column: Column<TRow, TValue>,
  colIndex: number,
  table?: unknown,
): Cell<TRow, TValue> => {
  const value = column.getValue(row.original, row.index);

  // Mutable context object — we fix the circular `cell` ref after creation.
  const ctx: CellContext<TRow, TValue> = {
    table,
    row: row as RowInterface<TRow>,
    column: column as Column<TRow, TValue>,
    // biome-ignore lint/suspicious/noExplicitAny: null is temporary; replaced below after cell is constructed
    cell: null as any as Cell<TRow, TValue>,
    value,
    rowIndex: row.index,
    colIndex,
  };

  const cell: Cell<TRow, TValue> = {
    id: `${row.id}:${column.id}`,
    row: row as RowInterface<TRow>,
    column: column as Column<TRow, TValue>,
    getValue: () => value,
    getContext: () => ctx,
    getCellProps: (consumerProps?: Record<string, unknown>) =>
      defaultCellProps(cell, consumerProps),
  };

  // Fix the circular reference now that cell is defined.
  ctx.cell = cell;

  return cell;
};

/**
 * Build the visible cells for a row, given the resolved columns and visibility.
 *
 * Hidden columns (columnVisibility[id] === false or column.isVisible === false)
 * are excluded from the output.
 */
export const buildVisibleCells = <TRow>(
  row: RowInterface<TRow>,
  columns: Array<Column<TRow, unknown>>,
  table?: unknown,
): Cell<TRow>[] => {
  const out: Cell<TRow>[] = [];
  let colIndex = 0;
  for (const col of columns) {
    if (!col.getIsVisible()) continue;
    out.push(buildCell(row, col, colIndex, table) as Cell<TRow>);
    colIndex += 1;
  }
  return out;
};
