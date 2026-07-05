/**
 * @lynellf/tablekit-core — column visibility helpers.
 *
 * Spec §8.4: `columnVisibility: Record<string, boolean>` slice. Hidden
 * columns are excluded from `getVisibleColumns()` and from `getHeaderGroups()`.
 *
 * M0 already derives `Column.isVisible` per-column; this phase adds the
 * public helpers that toggle visibility.
 */

import type { ColumnPinningState } from './types';

/**
 * Toggle a single column's visibility. Returns the new `columnVisibility`
 * object (or the same reference if nothing changed).
 */
export const toggleColumnVisibility = (
  visibility: Record<string, boolean>,
  columnId: string,
): Record<string, boolean> => {
  const current = visibility[columnId];
  const next = current === false;
  return { ...visibility, [columnId]: next };
};

/**
 * Toggle all columns at once. When `next` is provided, set every column id
 * to that value; when undefined, flip every column to the opposite of the
 * most-common current value.
 *
 * Returns the new `columnVisibility` object.
 */
export const toggleAllColumnsVisibility = (
  visibility: Record<string, boolean>,
  allColumnIds: string[],
  next?: boolean,
): Record<string, boolean> => {
  let target: boolean;
  if (next !== undefined) {
    target = next;
  } else {
    // Flip: if most columns are visible, hide all; otherwise show all.
    const visibleCount = allColumnIds.filter((id) => visibility[id] !== false).length;
    target = visibleCount <= allColumnIds.length / 2;
  }
  const out: Record<string, boolean> = { ...visibility };
  for (const id of allColumnIds) {
    out[id] = target;
  }
  return out;
};

/**
 * Slice a list of column ids by pinning state. Used by phase 5's prop getters
 * to compute `getLeftLeafColumns`, `getCenterLeafColumns`, `getRightLeafColumns`.
 */
export const sliceColumnsByPinning = (
  columnIds: string[],
  pinning: ColumnPinningState,
): { left: string[]; center: string[]; right: string[] } => {
  const leftSet = new Set(pinning.left);
  const rightSet = new Set(pinning.right);
  const left: string[] = [];
  const center: string[] = [];
  const right: string[] = [];
  for (const id of columnIds) {
    if (leftSet.has(id)) left.push(id);
    else if (rightSet.has(id)) right.push(id);
    else center.push(id);
  }
  return {
    left,
    center,
    right,
  };
};
