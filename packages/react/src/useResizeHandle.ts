/**
 * @lynellf/tablekit-react — useResizeHandle hook.
 *
 * Spec §7.2: pointer-capture-based resize gesture. This hook wires
 * the native DOM events (pointermove + pointerup + pointercancel)
 * to the instance's resize dispatchers. Consumers using
 * `header.getResizeHandleProps()` directly do not need this hook
 * for keyboard, but do need it for pointer gestures because React's
 * pointer events don't include native setPointerCapture on every
 * target.
 *
 * Usage:
 *   const bind = useResizeHandle(instance);
 *   <div {...header.getResizeHandleProps(bind)} />
 *
 * The hook returns an object whose keys are merged into the prop
 * getter (via mergeProps).
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';
import { useCallback, useRef } from 'react';

export const useResizeHandle = <TRow>(instance: DataTableInstance<TRow>) => {
  const activeRef = useRef<{ columnId: string; startClientX: number; startSize: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const native = event.nativeEvent;
      // Find the column id from the closest columnheader ancestor.
      const headerEl = (event.currentTarget as HTMLElement).closest('[role="columnheader"]');
      const columnId = headerEl?.getAttribute('aria-controls') ?? headerEl?.getAttribute('data-column-id');
      if (!columnId) return;
      const startSizeAttr = headerEl?.getAttribute('aria-valuenow');
      const startSize = startSizeAttr ? Number.parseInt(startSizeAttr, 10) : 150;
      activeRef.current = { columnId, startClientX: native.clientX, startSize };
      (event.currentTarget as HTMLElement).setPointerCapture(native.pointerId);
      // Tell the instance to begin a resize session.
      (instance as unknown as {
        startResize: (id: string, size: number, x: number) => void;
      }).startResize(columnId, startSize, native.clientX);
    },
    [instance],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      const native = event.nativeEvent;
      const deltaPx = native.clientX - active.startClientX;
      (instance as unknown as {
        adjustResize: (id: string, deltaPx: number) => void;
      }).adjustResize(active.columnId, deltaPx);
    },
    [instance],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      (event.currentTarget as HTMLElement).releasePointerCapture(event.nativeEvent.pointerId);
      (instance as unknown as {
        commitResize: (id: string) => void;
      }).commitResize(active.columnId);
      activeRef.current = null;
    },
    [instance],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      (event.currentTarget as HTMLElement).releasePointerCapture(event.nativeEvent.pointerId);
      (instance as unknown as {
        cancelResize: (id: string) => void;
      }).cancelResize(active.columnId);
      activeRef.current = null;
    },
    [instance],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } as const;
};
