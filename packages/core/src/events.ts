/**
 * @lynellf/tablekit-core — interaction events.
 *
 * Spec §7.6: top-level options on `DataTableOptions`. Native ordering is
 * preserved (a double-click fires two `onCellClick`). Consumer props merge
 * with, and run before, internal handlers; internal behavior is skipped when
 * `event.defaultPrevented`.
 */

import type { Column } from './columns';
import type { Cell } from './rows';
import type { Row } from './rows';

export type InteractionSource = 'mouse' | 'keyboard' | 'touch';

/**
 * Context passed to every interaction callback. Per spec §7.6: includes the
 * table, row, column, cell, value, indices, and source.
 */
export interface CellEventContext<TRow, TValue = unknown> {
  table: unknown;
  row: Row<TRow>;
  column: Column<TRow, TValue>;
  cell: Cell<TRow, TValue>;
  value: TValue;
  rowIndex: number;
  colIndex: number;
  source: InteractionSource;
}

export type CellEventHandler<TRow, TValue = unknown> = (
  ctx: CellEventContext<TRow, TValue>,
  event: Event,
) => void;

export type HeaderEventHandler<TRow, TValue = unknown> = (
  ctx: { column: Column<TRow, TValue>; table: unknown },
  event: Event,
) => void;

export type RowEventHandler<TRow> = (ctx: { row: Row<TRow>; table: unknown }, event: Event) => void;

/**
 * Options bag for the §7.6 interaction callbacks. All callbacks are
 * optional. The shape is mixed into `DataTableOptions<TRow>` via M1 wiring.
 */
export interface InteractionOptions<TRow> {
  onCellClick?: CellEventHandler<TRow>;
  onCellDoubleClick?: CellEventHandler<TRow>;
  onCellContextMenu?: CellEventHandler<TRow>;
  onCellActivate?: CellEventHandler<TRow>;
  onCellFocusChange?: CellEventHandler<TRow>;
  onRowClick?: RowEventHandler<TRow>;
  onRowDoubleClick?: RowEventHandler<TRow>;
  onHeaderClick?: HeaderEventHandler<TRow>;
}
