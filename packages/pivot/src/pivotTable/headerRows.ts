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
    const visit = (
      node: PivotColumnNode | PivotLeafColumn,
      currentLevel: number,
    ): void => {
      if (currentLevel === level) {
        row.push({ node, colSpan: (node as PivotColumnNode).colSpan ?? 1 });
      } else if (currentLevel < level) {
        // Descend into children if available, or into leaves (both are arrays).
        const branch = node as PivotColumnNode;
        const children = (branch as { children?: PivotColumnNode[] }).children ?? (branch as { leaves?: PivotLeafColumn[] }).leaves;
        if (children) {
          for (const child of children as PivotColumnNode[]) visit(child, currentLevel + 1);
        }
      }
    };
    visit(columnRoot, 0);
    rows.push(row);
  }

  return rows;
};
