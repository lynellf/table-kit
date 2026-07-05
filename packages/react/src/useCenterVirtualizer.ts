/**
 * @lynellf/tablekit-react — useCenterVirtualizer hook.
 *
 * Memoized wrapper around `table.getCenterVirtualizer()` for the column
 * virtualizer. Mirrors `useRowVirtualizer` for columns.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { ColumnVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useMemo, useRef } from 'react';

export const useCenterVirtualizer = <TRow>(
  table: DataTableInstance<TRow>,
): ColumnVirtualizerResult => {
  const measuredRef = useRef<Map<number, number>>(new Map());
  return useMemo(() => {
    const _scrollOffset =
      (table as unknown as { columnScrollOffset?: number }).columnScrollOffset ?? 0;
    const _viewportSize =
      (table as unknown as { columnViewportSize?: number }).columnViewportSize ?? 0;
    const result = table.getCenterVirtualizer();
    const wrappedMeasure = (index: number, size: number) => {
      measuredRef.current.set(index, size);
      result.measureElement(index, size);
    };
    return {
      ...result,
      columns: result.columns.map((c) => {
        const measured = measuredRef.current.get(c.index);
        if (typeof measured === 'number' && measured !== c.size) {
          return { ...c, size: measured };
        }
        return c;
      }),
      measureElement: wrappedMeasure,
    };
  }, [table]);
};
