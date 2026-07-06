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
