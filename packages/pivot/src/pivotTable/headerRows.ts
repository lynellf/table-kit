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

  // Check if a node has children (intermediate levels)
  const hasChildren = (node: PivotColumnNode): boolean =>
    !!(node.children && node.children.length > 0);

  // Calculate depth: how many levels of branch nodes (not counting the root).
  // The root's children form level 0.
  const depth = (node: PivotColumnNode): number => {
    if (!hasChildren(node)) return 1; // Leaf level (only has leaves)
    return 1 + Math.max(...node.children!.map((c) => depth(c)));
  };

  const totalDepth = depth(columnRoot);

  // For the first level, use the root's children directly instead of the root itself.
  // This avoids including the root node (which has label: undefined) in the output.
  if (totalDepth >= 1) {
    const children = columnRoot.children;
    if (children && children.length > 0) {
      rows.push(
        children.map((child) => ({
          node: child as PivotColumnNode | PivotLeafColumn,
          colSpan: child.colSpan ?? 1,
        })),
      );
    }
  }

  // For deeper levels, traverse the tree starting from the root's children.
  // Only add rows if they contain at least one intermediate node (with children).
  for (let level = 1; level < totalDepth; level++) {
    const row: HeaderEntry[] = [];
    const visit = (node: PivotColumnNode | PivotLeafColumn, currentLevel: number): void => {
      const branch = node as PivotColumnNode;
      if (currentLevel === level) {
        // Only add this node if it has children (intermediate level).
        // Leaf nodes (with only leaves) should not be added at this level.
        if (hasChildren(branch)) {
          row.push({ node, colSpan: branch.colSpan ?? 1 });
        }
      } else if (currentLevel < level) {
        // Descend into children
        if (hasChildren(branch)) {
          for (const child of branch.children!) visit(child, currentLevel + 1);
        }
      }
    };
    // Start from root's children at level 1
    if (columnRoot.children) {
      for (const child of columnRoot.children) visit(child, 1);
    }
    // Only add this row if it has entries (has intermediate nodes at this level)
    if (row.length > 0) {
      rows.push(row);
    }
  }

  return rows;
};
