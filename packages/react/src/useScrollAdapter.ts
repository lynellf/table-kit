/**
 * @lynellf/tablekit-react — useScrollAdapter hook.
 *
 * Spec §6.3 + §7.1: the grid element IS the scroll container. This hook
 * reads `scrollTop` (rows) + `scrollLeft` (columns) from the ref on every
 * scroll event and pushes them into the core instance's scroll state.
 *
 * The core virtualizer is pure over its inputs; the adapter is the
 * dependency-inversion seam that supplies DOM measurements to core
 * (per spec §4.3 "Virtualization measurement").
 *
 * Consumers attach this to the grid element via the ref they pass to
 * `getGridProps({ ref: gridRef })`.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import { useEffect } from 'react';

export const useScrollAdapter = <TRow>(
  gridRef: React.RefObject<HTMLElement | null>,
  table: DataTableInstance<TRow>,
): void => {
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const pushState = () => {
      const instance = table as unknown as {
        __setScrollState: (offset: number, size: number) => void;
        __setColumnScrollState: (offset: number, size: number) => void;
      };
      instance.__setScrollState(el.scrollTop, el.clientHeight);
      instance.__setColumnScrollState(el.scrollLeft, el.clientWidth);
    };

    // Initial measurement on mount.
    pushState();

    const onScroll = () => pushState();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [gridRef, table]);

  // Also re-measure on resize (the viewport size changes).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const instance = table as unknown as {
        __setScrollState: (offset: number, size: number) => void;
        __setColumnScrollState: (offset: number, size: number) => void;
      };
      instance.__setScrollState(el.scrollTop, el.clientHeight);
      instance.__setColumnScrollState(el.scrollLeft, el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridRef, table]);
};
