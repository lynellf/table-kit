/**
 * @lynellf/tablekit-core — pinning helpers (M2 Phase 2).
 *
 * Spec §7.3: column pinning state. M0 declares the `columnPinning` slice
 * and the `Column.getIsPinned/getPinnedOffset` getters. M1 added `moveColumn`
 * that crosses pinning boundaries. Phase 2 ships:
 *   - togglePinColumn(id, side) convenience
 *   - pinColumns/unpinColumns batch helpers
 *   - announcer wiring on pin/unpin
 */

import type { ColumnPinningState } from './types';

export type PinSide = 'left' | 'right' | false;

/**
 * Apply a pin toggle for a single column. Returns the new `columnPinning`
 * slice, or `null` if no change is needed.
 *
 * `side` semantics:
 *   - 'left': append the column to `left` (remove from `right` first if present)
 *   - 'right': append the column to `right` (remove from `left` first if present)
 *   - false: remove the column from both `left` and `right`
 *
 * Idempotent: pinning an already-pinned column on the same side is a no-op.
 */
export const togglePinColumn = (
  state: ColumnPinningState,
  columnId: string,
  side: PinSide,
): ColumnPinningState | null => {
  const isOnLeft = state.left.includes(columnId);
  const isOnRight = state.right.includes(columnId);

  if (side === false) {
    if (!isOnLeft && !isOnRight) return null;
    return {
      left: state.left.filter((id) => id !== columnId),
      right: state.right.filter((id) => id !== columnId),
    };
  }

  if (side === 'left') {
    if (isOnLeft) return null;
    return {
      left: [...state.left.filter((id) => id !== columnId), columnId],
      right: state.right.filter((id) => id !== columnId),
    };
  }

  // side === 'right'
  if (isOnRight) return null;
  return {
    left: state.left.filter((id) => id !== columnId),
    right: [...state.right.filter((id) => id !== columnId), columnId],
  };
};

/**
 * Pin multiple columns to the same side in a single state change.
 * Returns the new state or `null` if no change.
 */
export const pinColumns = (
  state: ColumnPinningState,
  columnIds: string[],
  side: 'left' | 'right',
): ColumnPinningState | null => {
  const otherSide = side === 'left' ? 'right' : 'left';
  // Remove from both sides, then append to the target side in the given order.
  const targetBase = state[side].filter((id) => !columnIds.includes(id));
  const otherFiltered = state[otherSide].filter((id) => !columnIds.includes(id));
  const target = [...targetBase, ...columnIds];
  const next: ColumnPinningState = {
    left: side === 'left' ? target : otherFiltered,
    right: side === 'right' ? target : otherFiltered,
  };
  // Idempotency: short-circuit if nothing changed.
  if (
    next.left.length === state.left.length &&
    next.right.length === state.right.length &&
    next.left.every((id, i) => id === state.left[i]) &&
    next.right.every((id, i) => id === state.right[i])
  ) {
    return null;
  }
  return next;
};

/**
 * Unpin multiple columns in a single state change.
 * Returns the new state or `null` if no change.
 */
export const unpinColumns = (
  state: ColumnPinningState,
  columnIds: string[],
): ColumnPinningState | null => {
  const next: ColumnPinningState = {
    left: state.left.filter((id) => !columnIds.includes(id)),
    right: state.right.filter((id) => !columnIds.includes(id)),
  };
  if (next.left.length === state.left.length && next.right.length === state.right.length) {
    return null;
  }
  return next;
};

/**
 * Build the announcer message for a pin change. M1 hardcodes English; M6
 * introduces the `messages` map.
 */
export const pinAnnouncement = (columnId: string, next: PinSide, previous: PinSide): string => {
  if (next === previous) return ''; // no-op
  if (next === false) return `Unpinned ${columnId}`;
  if (previous === false) return `Pinned ${columnId} to ${next}`;
  return `Moved ${columnId} from ${previous} to ${next}`;
};
