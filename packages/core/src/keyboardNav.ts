/**
 * @lynellf/tablekit-core — keyboard navigation helpers (M2 Phase 5).
 *
 * Spec §7.5: WAI-ARIA APG grid keyboard pattern with roving tabindex.
 * This module is pure: it takes the current state + a key event and
 * returns the new `focusedCell` (or null if no change).
 *
 * DOM specifics (the `onKeyDown` handler wiring) live in the React
 * adapter (`useKeyboardNav`). The key → action map is exported as
 * `KEY_BINDINGS` so consumers can override keys if needed.
 */

import type { CellPosition, DataTableState } from './types';

export type NavigationMode = 'cell' | 'row' | 'none';
export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

export interface KeyboardNavContext<TRow> {
  state: DataTableState;
  /** Resolve rowId → index in the current row model. */
  rowIndexById: Map<string, number>;
  /** Resolve columnIndex → columnId (logical, all visible columns including pinned). */
  columnIdByIndex: string[];
  /** Total row count (logical). */
  rowCount: number;
  /** Total column count (logical). */
  columnCount: number;
}

/**
 * Key → action map. APG grid conformance table per spec §7.5.
 */
export const KEY_BINDINGS = {
  ArrowUp: { action: 'navigateCell', arg: 'up' as NavigationDirection },
  ArrowDown: { action: 'navigateCell', arg: 'down' as NavigationDirection },
  ArrowLeft: { action: 'navigateCell', arg: 'left' as NavigationDirection },
  ArrowRight: { action: 'navigateCell', arg: 'right' as NavigationDirection },
  Home: { action: 'navigateToEdge', arg: 'row-start' },
  End: { action: 'navigateToEdge', arg: 'row-end' },
  PageUp: { action: 'navigateByPage', arg: -1 },
  PageDown: { action: 'navigateByPage', arg: 1 },
  Enter: { action: 'enterCell' },
  F2: { action: 'enterCell' },
  Escape: { action: 'exitCell' },
} as const;

export type KeyBindingAction =
  | { action: 'navigateCell'; arg: NavigationDirection }
  | { action: 'navigateToEdge'; arg: 'row-start' | 'row-end' | 'grid-start' | 'grid-end' }
  | { action: 'navigateByPage'; arg: -1 | 1 }
  | { action: 'enterCell' }
  | { action: 'exitCell' }
  | null;

export const resolveKeyBinding = (
  key: string,
  ctrlKey: boolean,
  _shiftKey: boolean,
): KeyBindingAction => {
  if (key === 'Home' && ctrlKey) return { action: 'navigateToEdge', arg: 'grid-start' };
  if (key === 'End' && ctrlKey) return { action: 'navigateToEdge', arg: 'grid-end' };
  const binding = (KEY_BINDINGS as Record<string, KeyBindingAction>)[key];
  return binding ?? null;
};

/**
 * Move the focused cell one step in the given direction.
 * Returns the new `{ rowId, columnId }` or `null` if the focus is at
 * the grid edge and cannot move further.
 */
export const navigateCell = <TRow>(
  ctx: KeyboardNavContext<TRow>,
  current: CellPosition | null,
  direction: NavigationDirection,
): CellPosition | null => {
  if (ctx.rowCount === 0 || ctx.columnCount === 0) return null;
  const start: CellPosition = current ?? {
    rowId: Array.from(ctx.rowIndexById.keys())[0] ?? '',
    columnId: ctx.columnIdByIndex[0] ?? '',
  };
  let { rowId, columnId } = start;

  // Resolve current indices
  const rowIdx = rowId ? (ctx.rowIndexById.get(rowId) ?? 0) : 0;
  const colIdx = Math.max(0, ctx.columnIdByIndex.indexOf(columnId));

  let nextRowIdx = rowIdx;
  let nextColIdx = colIdx;

  switch (direction) {
    case 'up':
      nextRowIdx = Math.max(0, rowIdx - 1);
      break;
    case 'down':
      nextRowIdx = Math.min(ctx.rowCount - 1, rowIdx + 1);
      break;
    case 'left':
      nextColIdx = Math.max(0, colIdx - 1);
      break;
    case 'right':
      nextColIdx = Math.min(ctx.columnCount - 1, colIdx + 1);
      break;
  }

  if (nextRowIdx === rowIdx && nextColIdx === colIdx) return null; // at edge

  const nextRowId = Array.from(ctx.rowIndexById.keys())[nextRowIdx];
  const nextColumnId = ctx.columnIdByIndex[nextColIdx];
  if (nextRowId === undefined || nextColumnId === undefined) return null;
  return { rowId: nextRowId, columnId: nextColumnId };
};

/**
 * Jump to the row start/end or grid start/end. Returns the new position.
 */
export const navigateToEdge = <TRow>(
  ctx: KeyboardNavContext<TRow>,
  current: CellPosition | null,
  edge: 'row-start' | 'row-end' | 'grid-start' | 'grid-end',
): CellPosition | null => {
  if (ctx.rowCount === 0 || ctx.columnCount === 0) return null;
  const firstRowId = Array.from(ctx.rowIndexById.keys())[0];
  const lastRowId = Array.from(ctx.rowIndexById.keys()).at(-1);
  const firstColId = ctx.columnIdByIndex[0];
  const lastColId = ctx.columnIdByIndex.at(-1);
  if (!firstRowId || !lastRowId || !firstColId || !lastColId) return null;

  if (edge === 'grid-start') return { rowId: firstRowId, columnId: firstColId };
  if (edge === 'grid-end') return { rowId: lastRowId, columnId: lastColId };

  // Row edge: keep current row, jump to col start/end
  const rowId = current?.rowId ?? firstRowId;
  return { rowId, columnId: edge === 'row-start' ? firstColId : lastColId };
};

/**
 * Jump one viewport of rows. The viewport size is supplied by the adapter.
 */
export const navigateByPage = <TRow>(
  ctx: KeyboardNavContext<TRow>,
  current: CellPosition | null,
  delta: -1 | 1,
  viewportRowCount: number,
): CellPosition | null => {
  if (ctx.rowCount === 0 || ctx.columnCount === 0) return null;
  const firstRowId = Array.from(ctx.rowIndexById.keys())[0];
  const lastRowId = Array.from(ctx.rowIndexById.keys()).at(-1);
  const columnId = current?.columnId ?? ctx.columnIdByIndex[0] ?? '';
  if (!firstRowId || !lastRowId || !columnId) return null;
  const startIdx = current ? (ctx.rowIndexById.get(current.rowId) ?? 0) : 0;
  const nextIdx = Math.max(0, Math.min(ctx.rowCount - 1, startIdx + delta * viewportRowCount));
  const nextRowId = Array.from(ctx.rowIndexById.keys())[nextIdx];
  if (!nextRowId) return null;
  return { rowId: nextRowId, columnId };
};
