/**
 * @lynellf/tablekit-core — virtualization subpath entry.
 *
 * Re-exports the public surface of the virtualization module. Consumers
 * import via `@lynellf/tablekit-core/virtualization` to keep their bundle
 * small when they only need windowing without the row pipeline.
 */

export {
  createRowVirtualizer,
  getRange,
  getScrollOffsetForIndex,
  getTotalSize,
} from './rowVirtualizer';

export {
  createColumnVirtualizer,
} from './columnVirtualizer';

export type {
  VirtualItem,
  VirtualRow,
  RowVirtualizerResult,
  ColumnVirtualizerResult,
  VirtualizerLike,
} from './types';
