/**
 * @lynellf/tablekit-react — treegrid keyboard navigation.
 *
 * Spec §7.5 treegrid additions:
 *  - Right on a collapsed row-header cell: expands the row.
 *  - Right on an expanded row-header cell: moves focus to the first child row's row-header cell.
 *  - Left on an expanded row-header cell: collapses the row.
 *  - Left on a collapsed row-header cell: moves focus to the parent row's row-header cell.
 *
 * Non-row-header cells retain the M2 cell-mode keyboard navigation (Arrow keys
 * move by cell, Home/End by row start/end, etc.).
 *
 * Dispatched through the existing M2 `useKeyboardNav` by detecting whether
 * the focused cell is a row-header cell. This module computes the next focus
 * position; the React hook's onKeyDown handler dispatches it.
 */

import type { PivotResult, PivotRowNode, RowPathKey } from '@lynellf/tablekit-pivot';
import type { PivotTableInstance } from '@lynellf/tablekit-pivot';

export type PivotKeyboardAction =
  | { kind: 'expand'; path: unknown[] }
  | { kind: 'collapse'; path: unknown[] }
  | { kind: 'focusParent'; path: unknown[] }
  | { kind: 'focusFirstChild'; path: unknown[] };

const pathKeyOf = (path: unknown[]): RowPathKey => JSON.stringify(path);

/**
 * Find a node by key in the row tree.
 */
const findNodeByKey = <TRow>(
  node: PivotRowNode<TRow>,
  key: RowPathKey,
): PivotRowNode<TRow> | null => {
  if (node.key === key) return node;
  if (!node.children) return null;
  for (const child of node.children) {
    const found = findNodeByKey(child, key);
    if (found) return found;
  }
  return null;
};

/**
 * Find a node by path in the row tree.
 */
const findNodeByPath = <TRow>(
  node: PivotRowNode<TRow>,
  path: unknown[],
): PivotRowNode<TRow> | null => {
  const key = pathKeyOf(path);
  return findNodeByKey(node, key);
};

/**
 * Resolve a treegrid keyboard action from the current focus + key.
 * Returns null when the key is not a treegrid-specific binding (caller falls
 * through to the M2 cell-mode navigation).
 */
export const resolveTreegridKeyAction = <TRow>(
  pivot: PivotTableInstance<TRow>,
  focusedRowKey: RowPathKey | null,
  key: string,
): PivotKeyboardAction | null => {
  if (!focusedRowKey) return null;

  // Find the focused row in the engine result.
  const result: PivotResult<TRow> = pivot.getResult();
  let target: PivotRowNode<TRow> | null = null;

  if (result.rowRoot.children) {
    for (const child of result.rowRoot.children) {
      const found = findNodeByKey(child, focusedRowKey);
      if (found) {
        target = found;
        break;
      }
    }
  }

  if (!target) return null;

  // ArrowRight actions require the row to have children
  if (key === 'ArrowRight') {
    if (!target.hasChildren) return null;
    const expanded = pivot.getState().expanded[focusedRowKey] === true;
    if (!expanded) {
      return { kind: 'expand', path: target.path };
    }
    return { kind: 'focusFirstChild', path: target.path };
  }

  // ArrowLeft: collapse expanded row, or focus parent for collapsed/leaf rows
  if (key === 'ArrowLeft') {
    if (target.hasChildren) {
      const expanded = pivot.getState().expanded[focusedRowKey] === true;
      if (expanded) {
        return { kind: 'collapse', path: target.path };
      }
    }
    // Always return focusParent for ArrowLeft on collapsed/leaf rows
    return { kind: 'focusParent', path: target.path };
  }

  return null;
};

/**
 * Apply a treegrid action. Returns the new focused row key (or the same key
 * if the action was a no-op for the focused node).
 */
export const applyTreegridAction = <TRow>(
  pivot: PivotTableInstance<TRow>,
  action: PivotKeyboardAction,
  _currentFocusedRowKey: RowPathKey | null,
): RowPathKey | null => {
  const result: PivotResult<TRow> = pivot.getResult();

  switch (action.kind) {
    case 'expand':
      pivot.toggleExpanded(action.path as Parameters<typeof pivot.toggleExpanded>[0]);
      return pathKeyOf(action.path);
    case 'collapse':
      pivot.toggleExpanded(action.path as Parameters<typeof pivot.toggleExpanded>[0]);
      return pathKeyOf(action.path);
    case 'focusFirstChild': {
      const target = findNodeByPath(result.rowRoot, action.path);
      if (target?.children?.[0]) return target.children[0].key;
      return pathKeyOf(action.path);
    }
    case 'focusParent': {
      if (action.path.length <= 1) return pathKeyOf(action.path); // level-0: no parent
      const parentPath = action.path.slice(0, -1);
      return pathKeyOf(parentPath);
    }
  }
};
