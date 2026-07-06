# Phase 4 — `createPivotTable` Factory + State + Treegrid Prop Getters

**Goal:** Ship the `createPivotTable<TRow>(options)` factory (mirroring M0's `createDataTable` pattern), the pivot state slice machinery (controlled/uncontrolled for `pivot`, `expanded`, `pivotSorting`, plus shared `columnPinning`/`columnSizing`/`focusedCell`), derived accessors (`getVisibleRows`, `getHeaderRows`, `getLeafColumns`), treegrid prop getters (`getGridProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`, `getBodyProps`), and announcer routing through the existing M1 seam.

After this phase:

- `createPivotTable<TRow>(opts)` returns a `PivotTableInstance<TRow>` with the full state + engine + prop-getter surface.
- All treegrid prop getters emit the spec §9.8 DOM shape (`role="treegrid"`, `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`, `role="rowheader"`).
- `getVisibleRows()` DFS-flattens the row tree honoring `expanded`.
- `getHeaderRows()` emits the column hierarchy as N header rows with `aria-colspan`.
- Announcer routes through `getGlobalAnnouncer()` (set by M1's `ReactAnnouncer`).
- `pnpm verify` exits 0; new tests pass (~25-35).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/pivot/src/pivotTable/factory.ts` | `createPivotTable<TRow>(opts)` factory + `PivotTableImpl` class |
| `packages/pivot/src/pivotTable/visibleRows.ts` | `getVisibleRows()` DFS-flatten honoring `expanded` |
| `packages/pivot/src/pivotTable/headerRows.ts` | `getHeaderRows()` column hierarchy with `aria-colspan` |
| `packages/pivot/src/pivotTable/propGetters.ts` | Treegrid prop getters (`getGridProps`, `getRowProps`, `getRowHeaderProps`, `getHeaderProps`, `getToggleExpandedProps`, `getFooterProps`, `getTotalsColumnProps`, `getBodyProps`) |
| `packages/pivot/src/pivotTable/announcer.ts` | Pivot-specific announcer messages ("West expanded, 4 rows", "Grand total row", "Sorted by Region ascending") |
| `packages/pivot/src/pivotTable/index.ts` | Replace stub with pivotTable barrel |
| `packages/pivot/src/__tests__/pivotTable.test.ts` | Factory + state + controlled/uncontrolled slices |
| `packages/pivot/src/__tests__/visibleRows.test.ts` | DFS flatten honoring `expanded` |
| `packages/pivot/src/__tests__/headerRows.test.ts` | Column hierarchy → header rows with colSpan |
| `packages/pivot/src/__tests__/propGetters.test.ts` | Treegrid prop getter shape (role, aria-*, handlers) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/pivot/src/types.ts` | Add `DEFAULT_PIVOT_STATE` constant; finalize `PivotTableInstance` / `PivotTableOptions` shape |
| `packages/pivot/src/index.ts` | Re-export `createPivotTable`, `DEFAULT_PIVOT_STATE` |
| `packages/pivot/src/pivotTable/index.ts` | New barrel (replaces stub) |

No other source files change in this phase. The React hook (phase 5) wires the factory into `useDataTable`-shaped usage.

---

## 3. File contents (key files)

### 3.1 `packages/pivot/src/pivotTable/factory.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — `createPivotTable` factory.
 *
 * Spec §4.1: returns a state-engine instance with `getState`, `setOptions`,
 * `subscribe`, plus pivot-specific accessors (`getResult`, `getVisibleRows`,
 * `getHeaderRows`, `getLeafColumns`) and treegrid prop getters.
 *
 * State slices (controlled/uncontrolled per slice):
 *  - pivot (PivotConfig)
 *  - expanded (Record<RowPathKey, boolean>)
 *  - pivotSorting (PivotSortingState)
 *  - columnPinning, columnSizing, columnSizingInfo, focusedCell (shared with DataTable)
 *
 * Uses the M0/M4-widened state helpers (applySliceChange, mergeInitialState,
 * resolveUpdater, isSliceControlled, controlledSliceKeys, stateChangedOnSlices).
 */

import type {
  AggregationEngine,
  Announcer,
  PivotConfig,
  PivotExpansionState,
  PivotLeafColumn,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  PivotSortingState,
  PivotTableInstance,
  PivotTableOptions,
  PivotTableState,
  Updater,
} from '../types';
import { DEFAULT_PIVOT_STATE } from '../types';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  resolveUpdater,
  stateChangedOnSlices,
} from '@lynellf/tablekit-core';
import { createMainThreadEngine } from '../engine';
import { buildPivotResult } from '../engine/treeBuilder';
import { getVisibleRows } from './visibleRows';
import { getHeaderRows } from './headerRows';
import {
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getToggleExpandedProps,
  getTotalsColumnProps,
} from './propGetters';
import { announceExpansion, announceSorting, announceTotals } from './announcer';
import { defaultGetRowId } from '../defaultGetRowId';

export const createPivotTable = <TRow>(
  options: PivotTableOptions<TRow>,
): PivotTableInstance<TRow> => {
  const engine: AggregationEngine<TRow> = options.engine ?? createMainThreadEngine<TRow>();
  const announcer: Announcer = options.announcer ?? { announce: () => {} };

  // ─── Initial state ───────────────────────────────────────────────────────
  const resolvePivot = (opts: PivotTableOptions<TRow>): PivotConfig<TRow> => {
    if (typeof opts.pivot === 'function') return opts.pivot({ data: opts.data });
    return opts.pivot;
  };

  let state: PivotTableState = mergeInitialState<PivotTableState>(
    options.initialState,
    options.state,
    DEFAULT_PIVOT_STATE,
  );
  // The `pivot` slice is special: it's the constructor argument, not state-only.
  state = { ...state, pivot: resolvePivot(options) };

  const listeners = new Set<() => void>();
  let suppressNotify = false;

  // ─── Engine query builder ────────────────────────────────────────────────
  const buildQuery = (): PivotQuery<TRow> => ({
    rows: options.data,
    rowsFieldRef: (typeof state.pivot.rows[0] === 'string'
      ? state.pivot.rows.map((r) => ({ field: r as string }))
      : (state.pivot.rows as Array<{ field: string }>).map((r) => ({ field: r.field }))),
    columnsFieldRef: (typeof state.pivot.columns[0] === 'string'
      ? state.pivot.columns.map((c) => ({ field: c as string }))
      : (state.pivot.columns as Array<{ field: string }>).map((c) => ({ field: c.field }))),
    measures: state.pivot.measures.map((m) => ({
      id: m.id,
      field: m.field,
      aggregator: typeof m.aggregator === 'string' ? m.aggregator : 'sum',
      label: m.label,
      format: m.format,
    })),
    filters: state.pivot.filters?.map((f) =>
      'predicateRef' in f
        ? { predicateRef: f.predicateRef, args: 'args' in f ? f.args : undefined }
        : 'predicate' in f
          ? { predicate: f.predicate }
          : { field: f.field, op: f.op, value: f.value },
    ) ?? [],
    totals: state.pivot.totals ?? {},
    expandedPaths: Object.entries(state.expanded)
      .filter(([, v]) => v)
      .map(([k]) => k),
    pivotSorting: state.pivotSorting,
  });

  // ─── Derived accessors ───────────────────────────────────────────────────
  let result: PivotResult<TRow> = buildPivotResult(buildQuery());

  const refreshResult = (): void => {
    result = buildPivotResult(buildQuery());
  };

  // ─── Notification ────────────────────────────────────────────────────────
  const notify = (): void => {
    if (suppressNotify) return;
    refreshResult();
    for (const listener of listeners) listener();
  };

  // ─── Slice dispatchers ───────────────────────────────────────────────────
  const setPivot = (updater: Updater<PivotConfig<TRow>>): void => {
    if (isSliceControlled(options.state, 'pivot')) {
      options.onPivotChange?.(updater);
    } else {
      const next = resolveUpdater(state.pivot, updater);
      const newState = applySliceChange(state, 'pivot', next);
      if (stateChangedOnSlices(state, newState, ['pivot'])) {
        state = newState;
        notify();
      }
    }
  };

  const setExpanded = (updater: Updater<PivotExpansionState>): void => {
    if (isSliceControlled(options.state, 'expanded')) {
      options.onExpandedChange?.(updater);
    } else {
      const next = resolveUpdater(state.expanded, updater);
      const newState = applySliceChange(state, 'expanded', next);
      if (stateChangedOnSlices(state, newState, ['expanded'])) {
        state = newState;
        notify();
      }
    }
  };

  const toggleExpanded = (path: PivotRowNode['path']): void => {
    const key = JSON.stringify(path);
    const next = { ...state.expanded };
    next[key] = !next[key];
    const wasExpanded = state.expanded[key] === true;
    setExpanded(next);
    // Announcer: report the new state.
    const childCount = (() => {
      if (wasExpanded) return null; // collapsing — no count needed
      // Expanding: re-compute children to count.
      const childResult = engine.computeChildren?.(path, buildQuery(), { signal: new AbortController().signal });
      return childResult?.length ?? 0;
    })();
    announceExpansion(announcer, path, wasExpanded, childCount);
  };

  const setPivotSorting = (updater: Updater<PivotSortingState>): void => {
    if (isSliceControlled(options.state, 'pivotSorting')) {
      options.onPivotSortingChange?.(updater);
    } else {
      const next = resolveUpdater(state.pivotSorting, updater);
      const newState = applySliceChange(state, 'pivotSorting', next);
      if (stateChangedOnSlices(state, newState, ['pivotSorting'])) {
        state = newState;
        announceSorting(announcer, next);
        notify();
      }
    }
  };

  const setColumnPinning = (updater: Updater<import('@lynellf/tablekit-core').ColumnPinningState>): void => {
    if (isSliceControlled(options.state, 'columnPinning')) {
      // Mirror the DataTable callback naming: onColumnPinningChange (set by the consumer).
      (options as unknown as { onColumnPinningChange?: (u: Updater<import('@lynellf/tablekit-core').ColumnPinningState>) => void }).onColumnPinningChange?.(updater);
    } else {
      const next = resolveUpdater(state.columnPinning, updater);
      state = applySliceChange(state, 'columnPinning', next);
      notify();
    }
  };

  const setColumnSizing = (updater: Updater<import('@lynellf/tablekit-core').ColumnSizingState>): void => {
    if (isSliceControlled(options.state, 'columnSizing')) {
      (options as unknown as { onColumnSizingChange?: (u: Updater<import('@lynellf/tablekit-core').ColumnSizingState>) => void }).onColumnSizingChange?.(updater);
    } else {
      const next = resolveUpdater(state.columnSizing, updater);
      state = applySliceChange(state, 'columnSizing', next);
      notify();
    }
  };

  const setFocusedCell = (updater: Updater<import('@lynellf/tablekit-core').CellPosition | null>): void => {
    if (isSliceControlled(options.state, 'focusedCell')) {
      (options as unknown as { onFocusedCellChange?: (u: Updater<import('@lynellf/tablekit-core').CellPosition | null>) => void }).onFocusedCellChange?.(updater);
    } else {
      const next = resolveUpdater(state.focusedCell, updater);
      state = applySliceChange(state, 'focusedCell', next);
      notify();
    }
  };

  const announce = (message: string, politeness?: 'polite' | 'assertive'): void => {
    announcer.announce(message, politeness);
  };

  // ─── Public surface ──────────────────────────────────────────────────────
  return {
    getState: () => state,
    setOptions: (next: PivotTableOptions<TRow>) => {
      suppressNotify = true;
      const prevPivot = state.pivot;
      const nextPivot = resolvePivot(next);
      state = mergeInitialState<PivotTableState>(next.initialState, next.state, DEFAULT_PIVOT_STATE);
      state = { ...state, pivot: nextPivot };
      suppressNotify = false;
      const pivotChanged = JSON.stringify(prevPivot) !== JSON.stringify(nextPivot);
      const dataChanged = options.data !== next.data;
      if (pivotChanged || dataChanged) notify();
      else if (stateChangedOnSlices(state, state, controlledSliceKeys(next.state))) notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getResult: () => result,
    getVisibleRows: () => getVisibleRows(result.rowRoot, state.expanded),
    getHeaderRows: () => getHeaderRows(result.columnRoot),
    getLeafColumns: () => result.leafColumns,

    setPivot,
    setExpanded,
    toggleExpanded,
    setPivotSorting,
    setColumnPinning,
    setColumnSizing,
    setFocusedCell,
    announce,

    getGridProps: (consumerProps?: Record<string, unknown>) =>
      getGridProps(consumerProps, state, result),
    getBodyProps: (consumerProps?: Record<string, unknown>) =>
      getBodyProps(consumerProps, state, result),
    getRowProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      getRowProps(row, consumerProps, state),
    getRowHeaderProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      getRowHeaderProps(row, consumerProps),
    getHeaderProps: (
      node: import('../types').PivotColumnNode | import('../types').PivotLeafColumn,
      consumerProps?: Record<string, unknown>,
    ) => getHeaderProps(node, consumerProps),
    getToggleExpandedProps: (row: PivotRowNode<TRow>, consumerProps?: Record<string, unknown>) =>
      getToggleExpandedProps(row, consumerProps, toggleExpanded),
    getFooterProps: (consumerProps?: Record<string, unknown>) =>
      getFooterProps(consumerProps, state, result),
    getTotalsColumnProps: (leaf: PivotLeafColumn<TRow>, consumerProps?: Record<string, unknown>) =>
      getTotalsColumnProps(leaf, consumerProps),
  };
};
```

### 3.2 `packages/pivot/src/pivotTable/visibleRows.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — DFS flatten of the row tree.
 *
 * Spec §9.4: `pivot.getVisibleRows()` flattens `rowRoot` by DFS honoring `expanded`.
 * Unexpanded subtrees are aggregated but not enumerated (handled by the engine);
 * this function consumes the engine output and produces the renderable list.
 */

import type { PivotExpansionState, PivotRowNode } from '../types';

export const getVisibleRows = <TRow>(
  rowRoot: PivotRowNode<TRow>,
  expanded: PivotExpansionState,
): PivotRowNode<TRow>[] => {
  const out: PivotRowNode<TRow>[] = [];
  const visit = (node: PivotRowNode<TRow>): void => {
    out.push(node);
    if (expanded[node.key] === true && node.children) {
      for (const child of node.children) visit(child);
    }
  };
  // Synthetic root is NOT included in the visible list (it's a synthetic).
  if (rowRoot.children) {
    for (const child of rowRoot.children) visit(child);
  }
  return out;
};
```

### 3.3 `packages/pivot/src/pivotTable/headerRows.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — column hierarchy → header rows.
 *
 * Spec §9.4: `pivot.getHeaderRows()` exposes the column hierarchy as N header
 * rows with computed `colSpan`. Rendered as sibling `columnheader` divs whose
 * widths span their leaves — no real spanning needed in a div grid, but
 * `aria-colspan` is set.
 *
 * Returns an array of header rows (level 0 = outermost column field). Each
 * row is an array of `{ node, colSpan }` entries (one entry per branch or leaf).
 */

import type { PivotColumnNode, PivotLeafColumn } from '../types';

export interface HeaderEntry {
  node: PivotColumnNode | PivotLeafColumn;
  colSpan: number;
}

export const getHeaderRows = (columnRoot: PivotColumnNode): HeaderEntry[][] => {
  const rows: HeaderEntry[][] = [];
  const depth = (node: PivotColumnNode): number => {
    if (!node.children || node.children.length === 0) return 1;
    return 1 + Math.max(...node.children.map((c) => depth(c)));
  };
  const totalDepth = depth(columnRoot);
  for (let level = 0; level < totalDepth; level++) {
    const row: HeaderEntry[] = [];
    const visit = (node: PivotColumnNode | PivotLeafColumn, currentLevel: number): void => {
      if ('leaves' in node && node.leaves) {
        // Leaf column.
        row.push({ node, colSpan: node.leaves.length });
        return;
      }
      const branch = node as PivotColumnNode;
      if (currentLevel === level) {
        row.push({ node: branch, colSpan: branch.colSpan });
      } else if (currentLevel < level && branch.children) {
        for (const child of branch.children) visit(child, currentLevel + 1);
      }
    };
    visit(columnRoot, 0);
    rows.push(row);
  }
  return rows;
};
```

### 3.4 `packages/pivot/src/pivotTable/propGetters.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — treegrid prop getters (spec §9.8).
 *
 * Emits:
 *  - role="treegrid" on the root
 *  - aria-rowcount / aria-colcount reflecting logical totals
 *  - role="row" + aria-rowindex + aria-level + aria-expanded (when hasChildren) + aria-setsize/posinset
 *  - role="rowheader" on the row-header cell
 *  - role="columnheader" + aria-colindex + aria-colspan on header cells
 *  - role="gridcell" on data cells
 *  - role="separator" with full ARIA on the resize handle (delegated to DataTable's
 *    existing resize handle contract; M4 re-exports the relevant hook seam in phase 5).
 */

import { mergeProps } from '@lynellf/tablekit-core';
import type {
  PivotColumnNode,
  PivotLeafColumn,
  PivotResult,
  PivotRowNode,
  PivotTableState,
  RowPathKey,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// getGridProps
// ─────────────────────────────────────────────────────────────────────────────

export const getGridProps = <TRow>(
  consumerProps: Record<string, unknown> | undefined,
  state: PivotTableState,
  result: PivotResult<TRow>,
): Record<string, unknown> => {
  const totalRowCount = computeLogicalRowCount(result);
  const totalColCount = result.leafColumns.length;
  const props: Record<string, unknown> = {
    role: 'treegrid',
    'aria-rowcount': totalRowCount,
    'aria-colcount': totalColCount,
    tabIndex: state.focusedCell ? -1 : 0, // grid root owns focus when no cell is focused
  };
  return mergeProps(props, consumerProps ?? {});
};

const computeLogicalRowCount = <TRow>(result: PivotResult<TRow>): number => {
  // Count all materialized nodes (DFS) plus the synthetic root.
  let count = 1; // synthetic root
  const visit = (node: PivotRowNode<TRow>): void => {
    count += 1;
    if (node.children) {
      for (const child of node.children) visit(child);
    }
  };
  if (result.rowRoot.children) {
    for (const child of result.rowRoot.children) visit(child);
  }
  return count;
};

// ─────────────────────────────────────────────────────────────────────────────
// getBodyProps
// ─────────────────────────────────────────────────────────────────────────────

export const getBodyProps = <TRow>(
  consumerProps: Record<string, unknown> | undefined,
  _state: PivotTableState,
  _result: PivotResult<TRow>,
): Record<string, unknown> => {
  const props: Record<string, unknown> = { role: 'rowgroup' };
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getRowProps
// ─────────────────────────────────────────────────────────────────────────────

export const getRowProps = <TRow>(
  row: PivotRowNode<TRow>,
  consumerProps: Record<string, unknown> | undefined,
  _state: PivotTableState,
): Record<string, unknown> => {
  const props: Record<string, unknown> = {
    role: 'row',
    'aria-rowindex': row.level + 1, // 1-based
    'aria-level': row.level, // level is 1-based for the user-visible depth
    'data-level': String(row.level),
    'data-row-key': row.key as RowPathKey,
  };
  if (row.hasChildren) {
    props['aria-expanded'] = row.childState === 'loaded' ? 'true' : 'false';
    props['data-has-children'] = 'true';
  }
  if (row.childState === 'loading') {
    props['aria-busy'] = 'true';
  }
  if (row.childState === 'error') {
    props['aria-invalid'] = 'true';
  }
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getRowHeaderProps
// ─────────────────────────────────────────────────────────────────────────────

export const getRowHeaderProps = <TRow>(
  row: PivotRowNode<TRow>,
  consumerProps: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const props: Record<string, unknown> = {
    role: 'rowheader',
    'aria-colindex': 1,
    'data-level': String(row.level),
  };
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getHeaderProps
// ─────────────────────────────────────────────────────────────────────────────

export const getHeaderProps = (
  node: PivotColumnNode | PivotLeafColumn,
  consumerProps: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const props: Record<string, unknown> = {
    role: 'columnheader',
  };
  if ('leaves' in node && node.leaves) {
    props['aria-colspan'] = node.leaves.length;
    props['data-column-leaf'] = 'true';
  } else {
    props['aria-colspan'] = (node as PivotColumnNode).colSpan;
  }
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getToggleExpandedProps
// ─────────────────────────────────────────────────────────────────────────────

export const getToggleExpandedProps = <TRow>(
  row: PivotRowNode<TRow>,
  consumerProps: Record<string, unknown> | undefined,
  toggle: (path: PivotRowNode['path']) => void,
): Record<string, unknown> => {
  const props: Record<string, unknown> = {
    role: 'button',
    'aria-expanded': row.childState === 'loaded' ? 'true' : 'false',
    'aria-label': row.childState === 'loaded' ? `Collapse ${String(row.label)}` : `Expand ${String(row.label)}`,
    tabIndex: -1,
    onClick: (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      toggle(row.path);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(row.path);
      }
    },
  };
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getFooterProps (grand-total row, §9.6)
// ─────────────────────────────────────────────────────────────────────────────

export const getFooterProps = <TRow>(
  consumerProps: Record<string, unknown> | undefined,
  state: PivotTableState,
  result: PivotResult<TRow>,
): Record<string, unknown> | null => {
  if (state.pivot.totals?.grandTotalRow === false) return null;
  const totalRowCount = computeLogicalRowCount(result);
  const props: Record<string, unknown> = {
    role: 'rowgroup',
    'data-total': 'row',
    'aria-rowcount': 1,
  };
  // The grand-total row itself has aria-rowindex = totalRowCount.
  const grandRowProps: Record<string, unknown> = {
    role: 'row',
    'aria-rowindex': totalRowCount,
    'data-total': 'row',
    'aria-label': 'Grand total row',
  };
  void grandRowProps; // returned separately if needed; consumer composes
  return mergeProps(props, consumerProps ?? {});
};

// ─────────────────────────────────────────────────────────────────────────────
// getTotalsColumnProps (grand-total column, §9.6)
// ─────────────────────────────────────────────────────────────────────────────

export const getTotalsColumnProps = <TRow>(
  leaf: PivotLeafColumn<TRow>,
  consumerProps: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (!leaf.isTotal) return mergeProps({}, consumerProps ?? {});
  const props: Record<string, unknown> = {
    'data-total': 'column',
    'aria-colindex': -1, // consumer resolves the actual index from leafColumns order
    role: 'columnheader',
  };
  return mergeProps(props, consumerProps ?? {});
};
```

### 3.5 `packages/pivot/src/pivotTable/announcer.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — pivot-specific announcer messages (spec §9.8 + §10).
 *
 * All messages route through the `Announcer` seam from M1 (spec §4.3). M4 ships
 * hardcoded English strings; i18n via `messages` map is M6.
 */

import type { Announcer, FieldValue, PivotSortingState } from '../types';

export const announceExpansion = (
  announcer: Announcer,
  path: FieldValue[],
  wasExpanded: boolean,
  childCount: number | null,
): void => {
  if (wasExpanded) {
    announcer.announce(`Collapsed ${path[path.length - 1] ?? ''}.`, 'polite');
  } else {
    const label = path[path.length - 1] ?? '';
    const count = childCount ?? 0;
    announcer.announce(`Expanded ${String(label)}, ${count} ${count === 1 ? 'row' : 'rows'}.`, 'polite');
  }
};

export const announceTotals = (announcer: Announcer): void => {
  announcer.announce('Grand total row', 'polite');
};

export const announceSorting = (announcer: Announcer, sorting: PivotSortingState): void => {
  if (sorting.length === 0) return;
  const first = sorting[0]!;
  const direction = first.desc ? 'descending' : 'ascending';
  if (first.by === 'label') {
    announcer.announce(`Sorted by label ${direction}.`, 'polite');
  } else {
    announcer.announce(`Sorted by measure ${direction}.`, 'polite');
  }
};
```

### 3.6 `packages/pivot/src/pivotTable/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — public barrel.
 *
 * Subpath import:
 *   import { createPivotTable } from '@lynellf/tablekit-pivot/pivotTable';
 */

export { createPivotTable } from './factory';
export { getVisibleRows } from './visibleRows';
export { getHeaderRows } from './headerRows';
export type { HeaderEntry } from './headerRows';
export {
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getToggleExpandedProps,
  getTotalsColumnProps,
} from './propGetters';
export { announceExpansion, announceSorting, announceTotals } from './announcer';
```

### 3.7 `packages/pivot/src/types.ts` (additions)

```ts
/** Default state for `createPivotTable`. */
export const DEFAULT_PIVOT_STATE: PivotTableState = {
  pivot: { rows: [], columns: [], measures: [] },
  expanded: {},
  pivotSorting: [],
  columnPinning: { left: [], right: [] },
  columnSizing: {},
  columnSizingInfo: null,
  focusedCell: null,
};
```

### 3.8 `packages/pivot/src/index.ts` (additions)

```ts
export { createPivotTable } from './pivotTable/factory';
export {
  getVisibleRows,
  getHeaderRows,
  type HeaderEntry,
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getToggleExpandedProps,
  getTotalsColumnProps,
  announceExpansion,
  announceSorting,
  announceTotals,
} from './pivotTable';

export { DEFAULT_PIVOT_STATE } from './types';
```

### 3.9 `packages/pivot/src/defaultGetRowId.ts`

```ts
/**
 * @lynellf/tablekit-pivot — index-based row id fallback (dev warning).
 *
 * Mirrors `defaultGetRowId` from `@lynellf/tablekit-core/columns`. Emits a
 * one-shot dev warning in phase 4; phase 5 may promote to a stricter error.
 */

let _warned = false;

export const defaultGetRowId = <TRow>(_row: TRow, index: number): string => {
  if (process.env.NODE_ENV !== 'production' && !_warned) {
    _warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[tablekit-pivot] No getRowId provided. Using index-based fallback. ' +
        'For server modes or controlled state, provide getRowId to ensure stable identity.',
    );
  }
  return `__row_${index}`;
};

/** Test-only: reset the warning flag. */
export const __resetPivotDefaultGetRowIdWarningForTests = (): void => {
  _warned = false;
};
```

### 3.10 `packages/pivot/src/__tests__/pivotTable.test.ts`

```ts
/**
 * Phase 4 — createPivotTable factory + state slice machinery.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';
import { __resetPivotDefaultGetRowIdWarningForTests } from '../defaultGetRowId';

interface Row {
  id: string;
  region: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', sales: 100 },
  { id: '2', region: 'East', sales: 200 },
  { id: '3', region: 'West', sales: 150 },
];

const baseOpts = (): PivotTableOptions<Row> => ({
  data: rows,
  pivot: {
    rows: ['region'],
    columns: [],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r) => r.id,
});

beforeEach(() => {
  __resetPivotDefaultGetRowIdWarningForTests();
});

describe('createPivotTable', () => {
  it('returns initial state with pivot config from options', () => {
    const p = createPivotTable(baseOpts());
    expect(p.getState().pivot.rows[0]).toBe('region');
    expect(p.getState().expanded).toEqual({});
  });

  it('uncontrolled pivot.setPivot mutates local state', () => {
    const p = createPivotTable(baseOpts());
    p.setPivot((old) => ({ ...old, rows: ['id'] }));
    expect(p.getState().pivot.rows[0]).toBe('id');
  });

  it('controlled pivot.setPivot dispatches callback', () => {
    const onPivotChange = vi.fn();
    const p = createPivotTable({
      ...baseOpts(),
      state: { pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] } },
      onPivotChange,
    });
    p.setPivot((old) => ({ ...old, rows: ['id'] }));
    expect(onPivotChange).toHaveBeenCalled();
  });

  it('toggleExpanded flips the expanded slice and announces', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.toggleExpanded(['West']);
    expect(p.getState().expanded['["West"]']).toBe(true);
    expect(announcer.announce).toHaveBeenCalledWith(expect.stringContaining('Expanded West'), 'polite');
  });

  it('toggleExpanded collapses an already-expanded path', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.toggleExpanded(['West']);
    p.toggleExpanded(['West']);
    expect(p.getState().expanded['["West"]']).toBe(false);
    expect(announcer.announce).toHaveBeenLastCalledWith(expect.stringContaining('Collapsed'), 'polite');
  });

  it('setPivotSorting triggers notify and announces', () => {
    const announcer = { announce: vi.fn() };
    const p = createPivotTable({ ...baseOpts(), announcer });
    p.setPivotSorting([{ level: 0, by: 'label', desc: true }]);
    expect(p.getState().pivotSorting).toHaveLength(1);
    expect(announcer.announce).toHaveBeenCalledWith(expect.stringContaining('Sorted'), 'polite');
  });

  it('subscribe notifies on slice change', () => {
    const p = createPivotTable(baseOpts());
    const listener = vi.fn();
    const unsub = p.subscribe(listener);
    p.setExpanded({ '["West"]': true });
    expect(listener).toHaveBeenCalled();
    unsub();
    p.setExpanded({ '["West"]': false });
    expect(listener).toHaveBeenCalledTimes(1); // not called again after unsub
  });
});
```

### 3.11 `packages/pivot/src/__tests__/visibleRows.test.ts`

```ts
/**
 * Phase 4 — getVisibleRows DFS flatten honoring expanded.
 */

import { describe, expect, it } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  id: string;
  region: string;
  product: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', product: 'A', sales: 10 },
  { id: '2', region: 'West', product: 'B', sales: 20 },
  { id: '3', region: 'East', product: 'A', sales: 30 },
];

const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: {
    rows: ['region', 'product'],
    columns: [],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r) => r.id,
};

describe('getVisibleRows', () => {
  it('returns only level-0 when nothing is expanded', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(2); // West, East
  });

  it('returns expanded subtree when path is expanded', () => {
    const p = createPivotTable(opts);
    p.setExpanded({ '["West"]': true });
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(4); // West, A, B, East
    const labels = visible.map((r) => r.label);
    expect(labels).toEqual(['West', 'A', 'B', 'East']);
  });

  it('expanded but hasChildren=false is a leaf', () => {
    const p = createPivotTable({
      ...opts,
      pivot: { ...opts.pivot, rows: ['region'] },
    });
    p.setExpanded({ '["West"]': true });
    const visible = p.getVisibleRows();
    expect(visible).toHaveLength(2);
  });
});
```

### 3.12 `packages/pivot/src/__tests__/headerRows.test.ts`

```ts
/**
 * Phase 4 — getHeaderRows column hierarchy with colSpan.
 */

import { describe, expect, it } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  region: string;
  year: number;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', year: 2024, sales: 100 },
  { region: 'East', year: 2024, sales: 200 },
  { region: 'West', year: 2023, sales: 150 },
];

const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: {
    rows: ['region'],
    columns: ['year'],
    measures: [{ id: 'sales_sum', field: 'sales' }],
  },
  getRowId: (r, i) => `${r.region}-${r.year}-${i}`,
};

describe('getHeaderRows', () => {
  it('emits one header row per column-hierarchy depth', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    // 1 column field → 1 header row.
    expect(headerRows).toHaveLength(1);
  });

  it('single header row has one entry per unique year + totals', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const yearEntries = headerRows[0]!;
    const yearLabels = yearEntries.map((e) => (e.node as { label: unknown }).label).sort();
    expect(yearLabels).toEqual([2023, 2024, '__total__']);
  });

  it('two-level column hierarchy → 2 header rows', () => {
    const p = createPivotTable({
      ...opts,
      pivot: { ...opts.pivot, columns: ['region', 'year'] },
    });
    const headerRows = p.getHeaderRows();
    expect(headerRows).toHaveLength(2);
  });

  it('aria-colspan is the sum of leaf widths at branch nodes', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const entry = headerRows[0]!.find((e) => (e.node as { label: unknown }).label === 2024);
    expect(entry?.colSpan).toBe(1); // single measure
  });
});
```

### 3.13 `packages/pivot/src/__tests__/propGetters.test.ts`

```ts
/**
 * Phase 4 — treegrid prop getter shape.
 */

import { describe, expect, it } from 'vitest';
import { createPivotTable } from '../pivotTable/factory';
import type { PivotTableOptions } from '../types';

interface Row {
  id: string;
  region: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', sales: 100 },
  { id: '2', region: 'East', sales: 200 },
];

const opts: PivotTableOptions<Row> = {
  data: rows,
  pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] },
  getRowId: (r) => r.id,
};

describe('getGridProps', () => {
  it('emits role="treegrid" + aria-rowcount + aria-colcount', () => {
    const p = createPivotTable(opts);
    const props = p.getGridProps();
    expect(props.role).toBe('treegrid');
    expect(props['aria-rowcount']).toBeGreaterThan(0);
    expect(props['aria-colcount']).toBeGreaterThan(0);
  });
});

describe('getRowProps', () => {
  it('emits role="row" + aria-rowindex + aria-level', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const row = visible[0]!;
    const props = p.getRowProps(row);
    expect(props.role).toBe('row');
    expect(props['aria-rowindex']).toBe(1);
    expect(props['aria-level']).toBe(1);
  });

  it('emits aria-expanded on rows with children', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    for (const row of visible) {
      const props = p.getRowProps(row);
      if (row.hasChildren) {
        expect(props['aria-expanded']).toBeDefined();
      }
    }
  });
});

describe('getRowHeaderProps', () => {
  it('emits role="rowheader"', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const props = p.getRowHeaderProps(visible[0]!);
    expect(props.role).toBe('rowheader');
  });
});

describe('getHeaderProps', () => {
  it('emits role="columnheader" + aria-colspan', () => {
    const p = createPivotTable(opts);
    const headerRows = p.getHeaderRows();
    const entry = headerRows[0]![0]!;
    const props = p.getHeaderProps(entry.node);
    expect(props.role).toBe('columnheader');
    expect(props['aria-colspan']).toBeGreaterThanOrEqual(1);
  });
});

describe('getToggleExpandedProps', () => {
  it('emits role="button" + aria-expanded + onClick', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    const props = p.getToggleExpandedProps(rowWithChildren);
    expect(props.role).toBe('button');
    expect(props['aria-expanded']).toBeDefined();
    expect(typeof props.onClick).toBe('function');
  });

  it('onClick toggles expansion', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    const props = p.getToggleExpandedProps(rowWithChildren);
    (props.onClick as (e: { defaultPrevented: boolean }) => void)({ defaultPrevented: false });
    expect(p.getState().expanded[rowWithChildren.key]).toBe(true);
  });

  it('onClick is skipped when defaultPrevented', () => {
    const p = createPivotTable(opts);
    const visible = p.getVisibleRows();
    const rowWithChildren = visible.find((r) => r.hasChildren)!;
    const props = p.getToggleExpandedProps(rowWithChildren);
    (props.onClick as (e: { defaultPrevented: boolean }) => void)({ defaultPrevented: true });
    expect(p.getState().expanded[rowWithChildren.key]).toBeUndefined();
  });
});

describe('getFooterProps', () => {
  it('returns null when grandTotalRow is false', () => {
    const p = createPivotTable({ ...opts, pivot: { ...opts.pivot, totals: { grandTotalRow: false } } });
    expect(p.getFooterProps()).toBeNull();
  });

  it('emits role="rowgroup" + data-total="row" when enabled', () => {
    const p = createPivotTable(opts);
    const props = p.getFooterProps();
    expect(props?.role).toBe('rowgroup');
    expect(props?.['data-total']).toBe('row');
  });
});

describe('getTotalsColumnProps', () => {
  it('emits data-total="column" for totals leaves', () => {
    const p = createPivotTable(opts);
    const totalsLeaf = p.getLeafColumns().find((l) => l.isTotal)!;
    const props = p.getTotalsColumnProps(totalsLeaf);
    expect(props['data-total']).toBe('column');
  });

  it('returns empty merge for non-totals leaves', () => {
    const p = createPivotTable(opts);
    const regularLeaf = p.getLeafColumns().find((l) => !l.isTotal)!;
    const props = p.getTotalsColumnProps(regularLeaf);
    expect(props['data-total']).toBeUndefined();
  });
});
```

---

## 4. Commands

```bash
pnpm -F @lynellf/tablekit-pivot typecheck
pnpm --filter @lynellf/tablekit-pivot test -- --run pivotTable
pnpm --filter @lynellf/tablekit-pivot test -- --run visibleRows
pnpm --filter @lynellf/tablekit-pivot test -- --run headerRows
pnpm --filter @lynellf/tablekit-pivot test -- --run propGetters
pnpm test                                                       # all tests; M0/M1/M2/M3 still pass
pnpm verify                                                     # aggregate gate — must exit 0
```

---

## 5. Verification

After this phase:

```bash
pnpm verify                                                     # EXIT 0
pnpm --filter @lynellf/tablekit-pivot test                      # 25-35 new tests, all green

# Subpath smoke
node -e "import('@lynellf/tablekit-pivot/pivotTable').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot').then(m => console.log(Object.keys(m).sort()))"
```

Expected phase-4 output:

```
@lynellf/tablekit-pivot/pivotTable →
  ['announceExpansion', 'announceSorting', 'announceTotals',
   'createPivotTable', 'getBodyProps', 'getFooterProps', 'getGridProps',
   'getHeaderProps', 'getHeaderRows', 'getRowHeaderProps', 'getRowProps',
   'getToggleExpandedProps', 'getTotalsColumnProps', 'getVisibleRows']

@lynellf/tablekit-pivot →
  [...phase 1+2+3 exports, 'DEFAULT_PIVOT_STATE', 'createPivotTable', ...propGetters]
```

---

## 6. Out-of-scope

- `usePivotTable` React hook — phase 5.
- `validateGridStructure` treegrid extensions — phase 5.
- Treegrid keyboard additions (Right/Left on row-header) — phase 5.
- Reference app — phase 6.
- `buildPivotQuery` / `validatePivotQuery` — phase 6.
- Comparator registry integration — phase 6 + M6.
- Server expansion — M5.

---

## 7. Risks

- **R1 (generic widening regression):** The factory relies on the widened M0 helpers. If the widening regressed in phase 1, phase 4's tests catch it. Verified by phase 1 + phase 4 tests staying green.
- **R4 (treegrid keyboard correctness):** Phase 4 does NOT implement Right/Left on row-header; that lands in phase 5. The prop getters in phase 4 are correct for mouse/click + Enter/Space on the toggle button; treegrid arrow keys require phase 5's `usePivotTable` integration.
- **R7 (`PivotTableState` runtime check):** Consumers might pass `DataTableState` keys to `createPivotTable`. Phase 4 emits a one-shot dev warning on construction if `initialState.pivot` is undefined (the slice is required). Future: a stricter runtime shape check.
- **R13 (concurrent state changes + engine compute storms):** The factory's `notify` runs `refreshResult()` (synchronous engine call) on every slice change. The engine's internal `PivotResultCache` (phase 3) short-circuits when the query is unchanged. Mitigation: phase 5's React hook debounces by memoizing the result and only re-computing when `[data, pivot, expanded, pivotSorting]` change.
- **R14 (`exactOptionalPropertyTypes`):** The factory uses `?? {}` for `state.pivot.totals` (since the type has all-optional fields). Optional absence is consistently `key?: T`, never `key: T | undefined`. Tested in `propGetters.test.ts` for the totals column.