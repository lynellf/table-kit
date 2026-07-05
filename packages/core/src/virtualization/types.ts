/**
 * @lynellf/tablekit-core — virtualization types.
 *
 * Spec §7.1: row + column windowing engine. Core computes visible index
 * ranges from scroll offset + item sizes; DOM specifics live in the React
 * adapter (phase 4). The `VirtualizerLike` interface is the dependency-
 * inversion seam that lets consumers bridge TanStack Virtual later
 * (decision D1).
 */

import type { Row } from '../types';

/**
 * A virtual item — one entry in the windowed output. Index is the
 * *logical* (pre-windowing) index in the source array. `start` is the
 * pixel offset from the top (rows) or left (columns) of the virtualized
 * content area. `size` is the measured or estimated pixel size.
 */
export interface VirtualItem {
  /** Logical index in the source array. */
  index: number;
  /** Pixel offset from the start of the virtualized area. */
  start: number;
  /** Pixel size of this item (measured if available, else estimated). */
  size: number;
}

/**
 * A virtual row — the row + its positioning metadata. The consumer's
 * React renderer spreads `positionStyle` onto the row's outer div.
 *
 * Position uses `top: <offset>px` (NOT `transform: translateY`) per
 * spec §6.3 — a transformed ancestor becomes the containing block for
 * `position: sticky`, which silently breaks pinned columns.
 */
export interface VirtualRow<TRow> {
  row: Row<TRow>;
  index: number;
  start: number;
  size: number;
  /** Ready-to-spread CSS properties: `position: absolute; top: ${start}px; height: ${size}px; width: max-content;`. */
  positionStyle: { position: 'absolute'; top: string; height: string; width: 'max-content' };
}

export interface RowVirtualizerResult<TRow> {
  rows: VirtualRow<TRow>[];
  totalSize: number;
  /** Scroll the grid so the row at the given index is visible. Optional `align` = 'auto' | 'start' | 'center' | 'end'. */
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): number;
  /** Notify the virtualizer that a rendered row was measured. The adapter calls this with `(index, size)`. */
  measureElement: (index: number, size: number) => void;
  /** Currently-mounted indices, including `keepMounted` indices. Useful for tests. */
  mountedIndices(): number[];
}

export interface ColumnVirtualizerResult {
  columns: VirtualItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): number;
  measureElement: (index: number, size: number) => void;
  mountedIndices(): number[];
}

/**
 * Public injection seam (decision D1). Consumers may pass any
 * `VirtualizerLike` instance to override the built-in. Not wired in M2
 * (the option is reserved); M2.5+ can ship a TanStack Virtual bridge.
 */
export interface VirtualizerLike<TItem> {
  getVirtualItems(): TItem[];
  totalSize: number;
  scrollToIndex(index: number, align?: 'auto' | 'start' | 'center' | 'end'): void;
}
