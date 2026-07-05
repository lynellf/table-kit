/**
 * @lynellf/tablekit-core — resize math (M2 Phase 3).
 *
 * Spec §7.2: column resizing. The math is pure; DOM specifics
 * (pointer capture, gesture handling) live in the React adapter
 * (`useResizeHandle`).
 *
 * Two modes:
 *   - 'onChange': `columnSizing` updates on every pointer move.
 *   - 'onEnd': `columnSizing` updates only on pointer up; the live
 *     delta is held in `columnSizingInfo.delta`.
 *
 * Constraints clamp to `[minSize, maxSize]`.
 */

import type { ColumnResizeSession, ColumnSizingState } from './types';

export const DEFAULT_RESIZE_STEP_PX = 10;

export interface ResizeColumnInput {
  columnSizing: ColumnSizingState;
  session: ColumnResizeSession;
  minSize: number;
  maxSize: number;
}

export interface ResizeColumnOutput {
  /** New columnSizing (only differs from input when the resize committed). */
  columnSizing: ColumnSizingState;
  /** True if the new size differs from the start size (a commit happened). */
  changed: boolean;
}

/**
 * Apply the resize session's delta to the column's size, clamping to
 * [minSize, maxSize]. Returns the new columnSizing slice.
 */
export const resizeColumn = (input: ResizeColumnInput): ResizeColumnOutput => {
  const { columnSizing, session, minSize, maxSize } = input;
  const requested = session.startSize + session.delta;
  const clamped = Math.max(minSize, Math.min(maxSize, requested));
  if (clamped === columnSizing[session.columnId]) {
    return { columnSizing, changed: false };
  }
  return {
    columnSizing: { ...columnSizing, [session.columnId]: clamped },
    changed: clamped !== session.startSize,
  };
};

/**
 * Cancel an in-progress resize: revert columnSizing to start size.
 * Returns the new columnSizing slice (or the same reference if unchanged).
 */
export const cancelResize = (
  columnSizing: ColumnSizingState,
  session: ColumnResizeSession | null,
): ColumnSizingState => {
  if (!session) return columnSizing;
  const current = columnSizing[session.columnId];
  if (current === session.startSize) return columnSizing;
  return { ...columnSizing, [session.columnId]: session.startSize };
};

/**
 * Clamp a target width to the column's [min, max] bounds.
 * Pure utility for keyboard-driven resize where the caller computes
 * the delta.
 */
export const clampColumnSize = (size: number, minSize: number, maxSize: number): number => {
  return Math.max(minSize, Math.min(maxSize, size));
};

/**
 * Build the announcer message for a resize commit.
 */
export const resizeAnnouncement = (
  columnId: string,
  newWidth: number,
  columnName?: string,
): string => {
  const label = columnName ?? columnId;
  return `${label} column, ${newWidth} pixels`;
};
