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

  // With no column dimensions, the root owns the measure leaves directly.
  if (!columnRoot.children || columnRoot.children.length === 0) {
    if (columnRoot.leaves && columnRoot.leaves.length > 0) {
      rows.push(columnRoot.leaves.map((leaf) => ({ node: leaf, colSpan: 1 })));
    }
    return rows;
  }

  // Each iteration represents one column-field depth. Branch nodes at the
  // current depth belong in that row; their children are the next row. A
  // totals wrapper has leaves but no children, so it is emitted once at the
  // depth where it is attached without inventing unlabeled hierarchy rows.
  let current = columnRoot.children;
  while (current.length > 0) {
    const row: HeaderEntry[] = [];
    const next: PivotColumnNode[] = [];
    for (const node of current) {
      row.push({ node, colSpan: node.colSpan });
      if (node.children && node.children.length > 0) next.push(...node.children);
    }
    rows.push(row);
    current = next;
  }

  return rows;
};
