/**
 * @lynellf/tablekit-core — column ordering.
 *
 * Spec §8.3: `table.moveColumn(id, toIndex)`. Reordering across pinning
 * boundaries re-pins to the target region.
 *
 * The function is pure: it returns a new partial state with the updated
 * `columnOrder` and (when crossing pinning boundaries) the updated
 * `columnPinning`. The factory applies both via the controlled-slice
 * contract.
 */

import type { ColumnPinningState, DataTableState } from './types';

type Side = 'left' | 'right' | 'center';

/**
 * Move a column to a new position.
 *
 * `to` accepts:
 *   - a number: linear index in the visible leaf column list.
 *   - a string `'left' | 'right' | 'center'`: move to the end of the named region.
 *   - `false`: move to center (unpin).
 *
 * Returns a partial state with the new `columnOrder` and (if applicable)
 * `columnPinning` slices.
 */
export interface MoveColumnResult {
  columnOrder?: string[];
  columnPinning?: ColumnPinningState;
}

export const moveColumn = (
  state: Pick<DataTableState, 'columnOrder' | 'columnPinning' | 'columnVisibility'>,
  columnIds: string[], // ordered list of currently-visible leaf column ids
  id: string,
  to: number | Side | false,
): MoveColumnResult => {
  const currentIndex = columnIds.indexOf(id);
  if (currentIndex === -1) {
    // Column not in the visible list (hidden or unknown) → no-op.
    return {};
  }

  // Determine current side BEFORE any modifications
  const currentSide = sideAtIndex(state.columnPinning, currentIndex, columnIds);

  // Resolve destination index and side.
  let destIndex: number;
  let destSide: Side;
  if (typeof to === 'number') {
    destIndex = Math.max(0, Math.min(to, columnIds.length - 1));
    destSide = sideAtIndex(state.columnPinning, destIndex, columnIds);
  } else if (to === 'left') {
    destSide = 'left';
    destIndex = 0; // prepend to left region
  } else if (to === 'right') {
    destSide = 'right';
    destIndex = columnIds.length; // append to right region
  } else {
    // to === 'center' or to === false → move to center
    destSide = 'center';
    // For center, place after all left-pinned items.
    // When moving from left:
    //   - If 'a' is the LAST item in left[], it should go to left.length (the start of center)
    //   - Otherwise, it should go to left.length - 1 (after the remaining left items)
    // When moving from center/right, it's left.length.
    if (currentSide === 'left') {
      const leftItems = state.columnPinning.left;
      const isLastInLeft = leftItems[leftItems.length - 1] === id;
      destIndex = isLastInLeft
        ? state.columnPinning.left.length
        : state.columnPinning.left.length - 1;
    } else {
      destIndex = state.columnPinning.left.length;
    }
  }

  // Move in the columnIds array.
  const reordered = [...columnIds];
  reordered.splice(currentIndex, 1);

  // After removing the element, calculate the insertion point in the shorter array.
  // Just use destIndex directly - this works for all cases:
  // - Move 'a' from 0 to 3: adjustedDest = 3 → ['b','c','d','a']
  // - Move 'd' from 3 to 0: adjustedDest = 0 → ['d','a','b','c']
  // - Move 'a' from 0 to 2: adjustedDest = 2 → ['b','c','a','d']
  // - Stay at 1: adjustedDest = 1 → ['a','b','c','d']
  const adjustedDest = destIndex;
  reordered.splice(adjustedDest, 0, id);

  // Determine if pinning changed.
  const newPinning: ColumnPinningState | undefined =
    currentSide !== destSide ? { ...state.columnPinning } : undefined;

  if (newPinning && currentSide !== 'center') {
    // Remove from current pinned region.
    if (currentSide === 'left') {
      newPinning.left = newPinning.left.filter((c) => c !== id);
    } else {
      newPinning.right = newPinning.right.filter((c) => c !== id);
    }
  }
  if (newPinning && destSide !== 'center') {
    // Insert into destination region.
    if (destSide === 'left') {
      newPinning.left = [...newPinning.left, id];
    } else {
      newPinning.right = [...newPinning.right, id];
    }
  }

  return {
    columnOrder: reordered,
    ...(newPinning ? { columnPinning: newPinning } : {}),
  };
};

/**
 * Determine which side (left/right/center) the column at the given index
 * belongs to, given the current pinning.
 */
const sideAtIndex = (pinning: ColumnPinningState, index: number, columnIds: string[]): Side => {
  const leftCount = pinning.left.length;
  const rightCount = pinning.right.length;
  if (index < leftCount) return 'left';
  if (index >= columnIds.length - rightCount) return 'right';
  return 'center';
};
