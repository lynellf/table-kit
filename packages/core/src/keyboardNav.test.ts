import { describe, expect, it } from 'vitest';
import { navigateByPage, navigateCell, navigateToEdge, resolveKeyBinding } from './keyboardNav';
import type { CellPosition, DataTableState } from './types';

const baseState = (): DataTableState => ({
  sorting: [],
  columnFilters: [],
  pagination: { pageIndex: 0, pageSize: 25 },
  columnOrder: [],
  columnVisibility: {},
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
});

const makeCtx = (rowCount: number, columnCount: number) => {
  const rowIndexById = new Map<string, number>();
  const columnIdByIndex: string[] = [];
  for (let i = 0; i < rowCount; i++) rowIndexById.set(`r${i}`, i);
  for (let i = 0; i < columnCount; i++) columnIdByIndex.push(`c${i}`);
  return { rowIndexById, columnIdByIndex, rowCount, columnCount, state: baseState() };
};

describe('resolveKeyBinding', () => {
  it('resolves arrow keys to navigateCell', () => {
    expect(resolveKeyBinding('ArrowUp', false, false)).toEqual({
      action: 'navigateCell',
      arg: 'up',
    });
    expect(resolveKeyBinding('ArrowDown', false, false)).toEqual({
      action: 'navigateCell',
      arg: 'down',
    });
  });

  it('resolves Home to row-start', () => {
    expect(resolveKeyBinding('Home', false, false)).toEqual({
      action: 'navigateToEdge',
      arg: 'row-start',
    });
  });

  it('resolves Ctrl+Home to grid-start', () => {
    expect(resolveKeyBinding('Home', true, false)).toEqual({
      action: 'navigateToEdge',
      arg: 'grid-start',
    });
  });

  it('resolves PageUp / PageDown', () => {
    expect(resolveKeyBinding('PageUp', false, false)).toEqual({
      action: 'navigateByPage',
      arg: -1,
    });
  });

  it('resolves Enter / F2 to enterCell', () => {
    expect(resolveKeyBinding('Enter', false, false)).toEqual({ action: 'enterCell' });
    expect(resolveKeyBinding('F2', false, false)).toEqual({ action: 'enterCell' });
  });

  it('returns null for unmapped keys', () => {
    expect(resolveKeyBinding('a', false, false)).toBeNull();
  });
});

describe('navigateCell', () => {
  const ctx = makeCtx(10, 5);
  const start: CellPosition = { rowId: 'r5', columnId: 'c2' };

  it('moves up', () => {
    expect(navigateCell(ctx, start, 'up')).toEqual({ rowId: 'r4', columnId: 'c2' });
  });
  it('moves down', () => {
    expect(navigateCell(ctx, start, 'down')).toEqual({ rowId: 'r6', columnId: 'c2' });
  });
  it('moves left', () => {
    expect(navigateCell(ctx, start, 'left')).toEqual({ rowId: 'r5', columnId: 'c1' });
  });
  it('moves right', () => {
    expect(navigateCell(ctx, start, 'right')).toEqual({ rowId: 'r5', columnId: 'c3' });
  });
  it('returns null at top edge', () => {
    expect(navigateCell(ctx, { rowId: 'r0', columnId: 'c2' }, 'up')).toBeNull();
  });
  it('returns null at bottom edge', () => {
    expect(navigateCell(ctx, { rowId: 'r9', columnId: 'c2' }, 'down')).toBeNull();
  });
  it('returns null at left edge', () => {
    expect(navigateCell(ctx, { rowId: 'r5', columnId: 'c0' }, 'left')).toBeNull();
  });
  it('returns null at right edge', () => {
    expect(navigateCell(ctx, { rowId: 'r5', columnId: 'c4' }, 'right')).toBeNull();
  });
  it('starts at row 0 col 0 when no current', () => {
    expect(navigateCell(ctx, null, 'down')).toEqual({ rowId: 'r1', columnId: 'c0' });
  });
});

describe('navigateToEdge', () => {
  const ctx = makeCtx(10, 5);
  it('jumps to grid-start', () => {
    expect(navigateToEdge(ctx, { rowId: 'r5', columnId: 'c3' }, 'grid-start')).toEqual({
      rowId: 'r0',
      columnId: 'c0',
    });
  });
  it('jumps to grid-end', () => {
    expect(navigateToEdge(ctx, { rowId: 'r5', columnId: 'c3' }, 'grid-end')).toEqual({
      rowId: 'r9',
      columnId: 'c4',
    });
  });
  it('jumps to row-start', () => {
    expect(navigateToEdge(ctx, { rowId: 'r5', columnId: 'c3' }, 'row-start')).toEqual({
      rowId: 'r5',
      columnId: 'c0',
    });
  });
  it('jumps to row-end', () => {
    expect(navigateToEdge(ctx, { rowId: 'r5', columnId: 'c3' }, 'row-end')).toEqual({
      rowId: 'r5',
      columnId: 'c4',
    });
  });
});

describe('navigateByPage', () => {
  const ctx = makeCtx(100, 5);
  it('jumps down by viewport', () => {
    const out = navigateByPage(ctx, { rowId: 'r10', columnId: 'c2' }, 1, 25);
    expect(out).toEqual({ rowId: 'r35', columnId: 'c2' });
  });
  it('jumps up by viewport', () => {
    const out = navigateByPage(ctx, { rowId: 'r50', columnId: 'c2' }, -1, 25);
    expect(out).toEqual({ rowId: 'r25', columnId: 'c2' });
  });
  it('clamps to bounds', () => {
    const out = navigateByPage(ctx, { rowId: 'r90', columnId: 'c2' }, 1, 25);
    expect(out).toEqual({ rowId: 'r99', columnId: 'c2' });
  });
});

// Suppress unused warning for `baseState` — kept as documentation.
void baseState;
