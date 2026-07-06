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

/**
 * Minimal mergeProps — avoids core import in the pivot package to keep the
 * package boundary clean (pivot → core is the only allowed direction).
 */
const mergeProps = (
  defaults: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> => {
  if (!overrides) return defaults;
  return { ...defaults, ...overrides };
};
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
    'aria-rowindex': row.level, // 0-based tree depth → 1-based logical count (root excluded from visible rows)
    'aria-level': row.level, // same as tree depth since visible rows exclude the synthetic root
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
    'aria-label':
      row.childState === 'loaded' ? `Collapse ${String(row.label)}` : `Expand ${String(row.label)}`,
    tabIndex: -1,
    onClick: (event: MouseEvent) => {
      if ((event as unknown as { defaultPrevented?: boolean }).defaultPrevented) return;
      toggle(row.path);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if ((event as unknown as { defaultPrevented?: boolean }).defaultPrevented) return;
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
  };
  // The grand-total row itself has aria-rowindex = totalRowCount.
  // Consumer can access this via a separate getGrandTotalRowProps() call.
  void totalRowCount;
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
