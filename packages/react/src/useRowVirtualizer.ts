/**
 * @lynellf/tablekit-react — useRowVirtualizer hook.
 *
 * Memoized wrapper around `table.getRowVirtualizer()`. The hook re-computes
 * the virtualizer only when `(scrollOffset, viewportSize, rowModelIdentity)`
 * changes — these are the inputs that affect the visible window.
 *
 * The measured-size cache (`measuredSizes` inside the pure factory) is
 * captured here in a `useRef` so measured sizes persist across calls
 * within the same component lifetime.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { RowVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useMemo, useRef } from 'react';

export const useRowVirtualizer = <TRow>(
  table: DataTableInstance<TRow>,
): RowVirtualizerResult<TRow> => {
  // Stable measured-size cache across hook calls.
  const measuredRef = useRef<Map<number, number>>(new Map());

  return useMemo(() => {
    const _tableState = table.getState();
    const _scrollOffset = (table as unknown as { scrollOffset?: number }).scrollOffset ?? 0;
    const _viewportSize = (table as unknown as { viewportSize?: number }).viewportSize ?? 0;
    const _rows = table.getRowModel();
    const result = table.getRowVirtualizer();
    // Wrap measureElement to persist into our ref.
    const wrappedMeasure = (index: number, size: number) => {
      measuredRef.current.set(index, size);
      result.measureElement(index, size);
    };
    return {
      ...result,
      rows: result.rows.map((r) => {
        const measured = measuredRef.current.get(r.index);
        if (typeof measured === 'number' && measured !== r.size) {
          return { ...r, size: measured };
        }
        return r;
      }),
      measureElement: wrappedMeasure,
    };
  }, [table]);
};
