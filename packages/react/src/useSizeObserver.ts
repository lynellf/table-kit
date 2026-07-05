/**
 * @lynellf/tablekit-react — useSizeObserver hook.
 *
 * Wraps the browser's `ResizeObserver` to feed measured sizes into the
 * virtualizer's `measureElement(index, size)` callback. Each rendered
 * row + column element registers itself via a `data-virtual-index`
 * attribute; the hook observes the parent and dispatches size changes
 * to the matching index.
 *
 * Consumers attach the hook at the grid level; the hook uses
 * event delegation (a single ResizeObserver on the grid) for perf.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import type { RowVirtualizerResult, ColumnVirtualizerResult } from '@lynellf/tablekit-core/virtualization';
import { useEffect } from 'react';

export interface SizeObserverOptions<TRow> {
  gridRef: React.RefObject<HTMLElement | null>;
  rowVirtualizer: RowVirtualizerResult<TRow>;
  columnVirtualizer: ColumnVirtualizerResult;
}

export const useSizeObserver = <TRow>(
  options: SizeObserverOptions<TRow>,
): void => {
  const { gridRef, rowVirtualizer, columnVirtualizer } = options;

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return; // SSR / older browsers

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const type = target.getAttribute('data-virtual-type');
        const indexAttr = target.getAttribute('data-virtual-index');
        if (type === null || indexAttr === null) continue;
        const index = Number.parseInt(indexAttr, 10);
        if (Number.isNaN(index)) continue;
        const size =
          type === 'row'
            ? entry.contentRect.height
            : entry.contentRect.width;
        if (type === 'row') rowVirtualizer.measureElement(index, size);
        else columnVirtualizer.measureElement(index, size);
      }
    });

    // Observe all currently-mounted virtual elements.
    const rowEls = el.querySelectorAll<HTMLElement>('[data-virtual-type="row"]');
    for (const rowEl of rowEls) ro.observe(rowEl);
    const colEls = el.querySelectorAll<HTMLElement>('[data-virtual-type="column"]');
    for (const colEl of colEls) ro.observe(colEl);

    return () => ro.disconnect();
  }, [gridRef, rowVirtualizer, columnVirtualizer]);
};
