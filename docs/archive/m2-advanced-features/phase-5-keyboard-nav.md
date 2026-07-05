# Phase 5 — Keyboard Navigation / Focus Management

**Goal:** Ship WAI-ARIA APG **grid** keyboard navigation per spec §7.5: roving tabindex on cells; arrow keys / Home / End / Ctrl+Home / Ctrl+End / PageUp / PageDown / Tab / Shift+Tab (exit) / Enter / F2 (enter cell) / Escape (return); `navigationMode: 'cell' | 'none'` with role downgrade for `'none'`; `setFocusedCell` public dispatcher + helpers (`navigateCell`, `navigateToEdge`, `navigateByPage`); `keepMounted` integration so the focused cell's row + column stay mounted even when scrolled out; `onKeyDown` handler in `getGridProps()` that runs the library navigation after the consumer's handler, respecting `event.defaultPrevented`.

After this phase:
- `DataTableOptions.navigationMode: 'cell' | 'none'` (default `'cell'`). `'row'` is reserved for M4 PivotTable.
- `DataTableOptions.rowIndexAttribute?: string` — default `'data-row-index'` (consumer escape hatch).
- `table.navigateCell(direction)` returns the new `{ rowId, columnId } | null` (or sets it via `setFocusedCell` if the dispatcher form is used).
- `table.navigateToEdge(scope: 'row' | 'grid')` jumps to row start/end or grid corner.
- `table.navigateByPage(delta: -1 | 1)` jumps one viewport of rows (computed from current scroll offset).
- `cell.getCellProps()` emits `tabIndex: focused ? 0 : -1` and `data-focused: 'true' | undefined` when `navigationMode === 'cell'`.
- `table.getGridProps()` emits `tabIndex: -1` (was `0` in M1) when `navigationMode === 'cell'` — focus enters via the focused cell, not the grid root.
- When `navigationMode === 'none'`, the grid root emits `role="table"`, cells emit `role="cell"`, and no `tabIndex` is emitted.
- `keepMounted` callback in the virtualizer receives the focused cell's row index + column index.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/keyboardNav.ts` | Pure helpers: `navigateCell`, `navigateToEdge`, `navigateByPage`, `KEY_BINDINGS` (the key → action map), `NavigationMode` type |
| `packages/core/src/keyboardNav.test.ts` | Tests for all navigation actions |
| `packages/react/src/useKeyboardNav.ts` | React adapter hook that wires `onKeyDown` to the library handler |
| `packages/react/src/useKeyboardNav.test.tsx` | Tests for key handling |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/types.ts` | Add `navigationMode`, `rowIndexAttribute` to `DataTableOptions`; add `navigateCell`, `navigateToEdge`, `navigateByPage`, `getNavigationMode` to `DataTableInstance`; add `NavigationMode` type |
| `packages/core/src/createDataTable.ts` | Wire `navigationMode` (default `'cell'`); `setFocusedCell` already exists; add `navigateCell`/`navigateToEdge`/`navigateByPage`; emit `onKeyDown` in `getGridProps()`; emit `tabIndex` + `data-focused` in `cell.getCellProps()`; downgrade role for `none` mode |
| `packages/core/src/rows.ts` | `defaultCellProps` emits `tabIndex` + `data-focused`; role downgrade for `none` |
| `packages/core/src/headers.ts` | `getGridProps` downgrade; emit `onKeyDown` |
| `packages/core/src/index.ts` | Re-export keyboard nav helpers |
| `packages/core/package.json` | Add `./keyboard-nav` subpath |
| `packages/react/src/index.ts` | Re-export `useKeyboardNav` |

---

## 3. File contents

### 3.1 `packages/core/src/keyboardNav.ts`

```ts
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
  // Ctrl+Home / Ctrl+End → grid corners
  PageUp: { action: 'navigateByPage', arg: -1 },
  PageDown: { action: 'navigateByPage', arg: 1 },
  // Tab / Shift+Tab → exit the grid (no library action)
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
  shiftKey: boolean,
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
    rowId: ctx.columnIdByIndex[0]
      ? (Array.from(ctx.rowIndexById.keys())[0] ?? '')
      : '',
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
```

### 3.2 `packages/core/src/keyboardNav.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  navigateByPage,
  navigateCell,
  navigateToEdge,
  resolveKeyBinding,
} from './keyboardNav';
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
  return { rowIndexById, columnIdByIndex, rowCount, columnCount };
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
```

### 3.3 `packages/core/src/createDataTable.ts` (additions)

```ts
// ─── New imports ───────────────────────────────────────────────────────────
import {
  navigateCell as navigateCellHelper,
  navigateToEdge as navigateToEdgeHelper,
  navigateByPage as navigateByPageHelper,
  resolveKeyBinding,
  type NavigationDirection,
} from './keyboardNav';

class DataTable<TRow> implements DataTableInstance<TRow> {
  private navigationMode: 'cell' | 'row' | 'none' = 'cell';
  // viewport row count is supplied by the adapter via __setViewportRowCount
  private viewportRowCount = 25;

  // ... existing fields/methods ...

  setNavigationMode(mode: 'cell' | 'row' | 'none'): void {
    this.navigationMode = mode;
  }
  getNavigationMode(): 'cell' | 'row' | 'none' {
    return this.navigationMode;
  }

  /**
   * Build a `KeyboardNavContext` for the navigation helpers.
   * The map/array construction is O(n) per call; phase 6 (validator)
   * may memoize this if profiling shows it matters.
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

  navigateCell(direction: NavigationDirection): void {
    const next = navigateCellHelper(this.buildNavContext(), this.state.focusedCell, direction);
    if (next) this.applyChange('focusedCell', next);
  }

  navigateToEdge(scope: 'row-start' | 'row-end' | 'grid-start' | 'grid-end'): void {
    const next = navigateToEdgeHelper(this.buildNavContext(), this.state.focusedCell, scope);
    if (next) this.applyChange('focusedCell', next);
  }

  navigateByPage(delta: -1 | 1): void {
    const next = navigateByPageHelper(
      this.buildNavContext(),
      this.state.focusedCell,
      delta,
      this.viewportRowCount,
    );
    if (next) this.applyChange('focusedCell', next);
  }

  __setViewportRowCount(n: number): void {
    this.viewportRowCount = n;
  }

  /**
   * Roving tabindex + onKeyDown emission in `getGridProps`.
   * When navigationMode is 'cell', the grid root gets tabIndex=-1
   * (focus enters via the focused cell). When 'none', it stays at
   * tabIndex=0 (M1 behavior; consumers navigate via Tab through cells).
   */
  getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
    const baseProps: Record<string, unknown> = {
      'aria-rowcount': this.getRowCount() + 1,
      'aria-colcount': this.getVisibleColumns().length,
    };
    if (this.navigationMode === 'cell') {
      baseProps.role = 'grid';
      baseProps.tabIndex = -1;
    } else if (this.navigationMode === 'none') {
      baseProps.role = 'table';
      baseProps.tabIndex = 0;
    } else {
      // 'row' is M4 — emit default grid role; runtime warning.
      baseProps.role = 'grid';
      baseProps.tabIndex = -1;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          '[tablekit] navigationMode: "row" is reserved for PivotTable (M4). Falling back to "cell" semantics.',
        );
      }
    }
    // onKeyDown: library handler stashed under __lib_onKeyDown by mergeProps.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (this.navigationMode !== 'cell') return; // only 'cell' has keyboard nav
      const binding = resolveKeyBinding(event.key, event.ctrlKey, event.shiftKey);
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
          // M2 doesn't ship the "enter cell interior" focus trap; that's a
          // consumer concern (M6 polish). Library does nothing.
          break;
      }
    };
    return mergeProps(baseProps, { onKeyDown, ...consumerProps });
  }
}
```

The `getHeaderGroups` path passes `getGridProps` through `mergeProps` so the consumer's `onKeyDown` runs first and the library's runs after (with `defaultPrevented` respected). The M1 `mergeProps` already supports this.

### 3.4 `packages/core/src/rows.ts` (modify `defaultCellProps`)

```ts
const defaultCellProps = <TRow, TValue>(
  cell: Cell<TRow, TValue>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const table = cell.getContext().table as unknown as { getNavigationMode?: () => string; state: { focusedCell: CellPosition | null } };
  const mode = table.getNavigationMode?.() ?? 'cell';
  const isFocused =
    table.state.focusedCell?.rowId === cell.row.id &&
    table.state.focusedCell?.columnId === cell.column.id;

  const props: Record<string, unknown> = {
    'aria-colindex': cell.getContext().colIndex + 1,
    key: cell.id,
  };
  if (mode === 'none') {
    props.role = 'cell';
  } else {
    props.role = 'gridcell';
  }
  if (mode === 'cell') {
    props.tabIndex = isFocused ? 0 : -1;
    if (isFocused) props['data-focused'] = 'true';
  }
  if (cell.column.getIsPinned()) {
    props['data-pinned'] = cell.column.getIsPinned();
  }
  return mergeProps(props, consumerProps);
};
```

### 3.5 `packages/core/src/types.ts` (additions)

```ts
// ─── New types appended ────────────────────────────────────────────────────

export type NavigationMode = 'cell' | 'row' | 'none';
export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

// Append to DataTableOptions:
navigationMode?: NavigationMode;
rowIndexAttribute?: string;

// Append to DataTableInstance:
// ─── Keyboard navigation (M2) ────────────────────────────────────────────
setNavigationMode(mode: NavigationMode): void;
getNavigationMode(): NavigationMode;
navigateCell(direction: NavigationDirection): void;
navigateToEdge(scope: 'row-start' | 'row-end' | 'grid-start' | 'grid-end'): void;
navigateByPage(delta: -1 | 1): void;
```

### 3.6 `packages/core/src/index.ts` (additions)

```ts
// ─── Keyboard nav helpers (M2 Phase 5) ─────────────────────────────────────
export {
  KEY_BINDINGS,
  navigateCell,
  navigateToEdge,
  navigateByPage,
  resolveKeyBinding,
} from './keyboardNav';
export type { NavigationMode, NavigationDirection } from './keyboardNav';
```

Add `./keyboard-nav` subpath:

```json
// packages/core/package.json:
"./keyboard-nav": {
  "types": "./dist/keyboard-nav.d.ts",
  "import": "./dist/keyboard-nav.es.js"
}
```

### 3.7 `packages/react/src/useKeyboardNav.ts`

```ts
/**
 * @lynellf/tablekit-react — useKeyboardNav hook.
 *
 * Spec §7.5: roving tabindex + APG keyboard navigation. The library
 * handler is stashed in the grid's `getGridProps` result under
 * `__lib_onKeyDown` (per M1's mergeProps convention). This hook is a
 * convenience for consumers who don't use `getGridProps` directly
 * (e.g., they spread the grid props onto a custom element).
 *
 * For most consumers, `useDataTable`'s result already wires `onKeyDown`
 * via `getGridProps`. The hook is exported for completeness.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';

export const useKeyboardNav = <TRow>(_instance: DataTableInstance<TRow>) => {
  // No-op for M2: the library handler is emitted via getGridProps.
  // Future: this hook can register global keyboard shortcuts (Cmd+F
  // to focus the search box, etc.) — deferred to M6.
};
```

### 3.8 `packages/react/src/useKeyboardNav.test.tsx`

```tsx
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import { useDataTable } from './useDataTable';

describe('keyboard navigation via getGridProps', () => {
  it('emits onKeyDown that handles ArrowDown', () => {
    const instance = createDataTable({
      data: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => (r as { id: string }).id,
    });
    const gridProps = instance.getGridProps();
    const onKeyDown = gridProps.onKeyDown as (e: KeyboardEvent) => void;

    // Initial focus on r1 c0
    instance.setFocusedCell({ rowId: '1', columnId: 'name' });
    onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(instance.getState().focusedCell).toEqual({ rowId: '2', columnId: 'name' });
  });

  it('respects event.defaultPrevented', () => {
    const instance = createDataTable({
      data: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => (r as { id: string }).id,
    });
    const gridProps = instance.getGridProps();
    const onKeyDown = gridProps.onKeyDown as (e: KeyboardEvent) => void;
    instance.setFocusedCell({ rowId: '1', columnId: 'name' });
    onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown', defaultPrevented: true } as KeyboardEvent));
    expect(instance.getState().focusedCell).toEqual({ rowId: '1', columnId: 'name' });
  });
});

describe('useDataTable renders grid with onKeyDown', () => {
  it('integrates via getGridProps', () => {
    const Probe = () => {
      const { table } = useDataTable({
        data: [{ id: '1', name: 'Alice' }],
        columns: [{ id: 'name', accessor: 'name' }],
        getRowId: (r) => (r as { id: string }).id,
      });
      return <div data-testid="grid" {...table.getGridProps()} />;
    };
    const { getByTestId } = render(<Probe />);
    const grid = getByTestId('grid');
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('tabindex')).toBe('-1');
    expect(typeof (grid as unknown as Record<string, unknown>).__lib_onKeyDown).toBe('function');
  });
});
```

### 3.9 `packages/react/src/index.ts` (additions)

```ts
// ─── Keyboard nav hook (M2 Phase 5) ─────────────────────────────────────────
export { useKeyboardNav } from './useKeyboardNav';
```

---

## 4. Commands

```bash
pnpm --filter @lynellf/tablekit-core test -- keyboardNav
pnpm --filter @lynellf/tablekit-react test -- useKeyboardNav
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. Keyboard nav tests pass
pnpm --filter @lynellf/tablekit-core test keyboardNav
# Expected: ~25 new tests pass

# 2. Arrow keys move focus
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{id:'1',n:'A'},{id:'2',n:'B'},{id:'3',n:'C'}],
    columns: [{id:'n', accessor:'n'}],
    getRowId: r => r.id,
  });
  t.setFocusedCell({rowId:'1', columnId:'n'});
  const props = t.getGridProps();
  props.onKeyDown(new KeyboardEvent('keydown', {key: 'ArrowDown'}));
  console.log(t.getState().focusedCell);  // {rowId: '2', columnId: 'n'}
"
# Expected: { rowId: '2', columnId: 'n' }

# 3. Cell emits tabIndex={0} for focused cell
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{id:'1',n:'A'}],
    columns: [{id:'n', accessor:'n'}],
    getRowId: r => r.id,
  });
  t.setFocusedCell({rowId:'1', columnId:'n'});
  const rows = t.getRowModel();
  const cellProps = rows[0].getVisibleCells()[0].getCellProps();
  console.log('tabIndex:', cellProps.tabIndex);  // 0
  console.log('data-focused:', cellProps['data-focused']);  // 'true'
"
# Expected: tabIndex: 0, data-focused: 'true'

# 4. navigationMode: 'none' downgrades role
node -e "
  const { createDataTable } = await import('@lynellf/tablekit-core');
  const t = createDataTable({
    data: [{id:'1',n:'A'}],
    columns: [{id:'n', accessor:'n'}],
    getRowId: r => r.id,
    navigationMode: 'none',
  });
  const props = t.getGridProps();
  console.log('role:', props.role);  // 'table'
  console.log('tabIndex:', props.tabIndex);  // 0
  const cellProps = t.getRowModel()[0].getVisibleCells()[0].getCellProps();
  console.log('cell role:', cellProps.role);  // 'cell'
  console.log('cell tabIndex:', cellProps.tabIndex);  // undefined
"
# Expected: role: table, tabIndex: 0, cell role: cell, cell tabIndex: undefined
```

---

## 6. Out-of-scope (deferred to later phases)

- **APG `treegrid` row-mode keyboard nav** — M4 PivotTable. Left/Right for expand/collapse; `aria-expanded`; `aria-level`.
- **Focus trap inside cell interior widgets** — Enter/F2 enters the cell's content; the spec says "focus moves inside". M2 ships the key bindings (resolveKeyBinding returns `{ action: 'enterCell' }`) but does not implement the focus shift. M6 polish.
- **Screen reader manual matrix** — M6 release gate.
- **`tabBehavior: 'exit' | 'cells'` option** — §16 risk #4. M2 ships APG exit-only; the option is deferred to M6 polish.
- **PageUp/PageDown scroll integration** — phase 5's `navigateByPage` moves focus by viewport size; the virtualizer's `scrollToIndex` is not called automatically. M6 polish may wire the focus change to `scrollToIndex` so the new focus is always visible.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **APG conformance vs consumer customization** — consumers may want different keys | `KEY_BINDINGS` is exported; consumers can override by adding a `keydown` listener that preventDefaults and dispatches custom actions. |
| **`focusedCell` controlled-mode + auto-navigate** — when `focusedCell` is controlled, the consumer must call `setFocusedCell` for navigation to work | Same as M0's controlled-slice contract: the library hands the updater to the consumer; consumer applies it. Tested in phase 5. |
| **`getRowModel()` rebuild cost during navigation** — `navigateCell` calls `buildNavContext` which calls `getRowModel()` | Memoization (phase 1) ensures this is O(1) when state hasn't changed. Phase 5's per-navigation rebuild is amortized. |
| **`keyboardNav` test environment + KeyboardEvent** — jsdom supports basic `KeyboardEvent` constructors | Tests use the `KeyboardEvent` constructor directly; works in jsdom. |
| **Role downgrade for `none` mode** — consumers who toggle mode lose grid semantics | Documented as irreversible per instance (decision D4). Consumers create a new instance to change modes. |
| **`getNavigationMode` not yet exposed on the cell context** — `defaultCellProps` reads via cast `(cell.getContext().table as unknown as ...)` | Phase 7 refactor adds the typed accessor; phase 5 ships the cast for expediency. Documented in the cell-prop-getter comment. |
| **`useKeyboardNav` is a no-op** — most consumers use `getGridProps` directly | Documented. The hook is exported for completeness; future M6 polish may add global keyboard shortcuts. |
| **Bundle size** — keyboard nav math + types + grid-prop wiring adds ~0.5 kB core gzip | Tree-shakeable subpath. |
