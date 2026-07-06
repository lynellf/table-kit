/**
 * @lynellf/tablekit-react — `usePivotTable` hook.
 *
 * Spec §4.1: `usePivotTable(options)` returns a stable instance; `setOptions`
 * is called on every render so the engine observes the latest options.
 *
 * Mirrors M0/M1/M2/M3 `useDataTable` pattern:
 *  - useRef initializer for stable instance identity
 *  - useEffect for setOptions (after-commit; sidesteps React 19 render storms)
 *  - useSyncExternalStore for state subscription
 *  - Returns { pivot, state, Announcer }
 */

import { setGlobalAnnouncer } from '@lynellf/tablekit-core';
import type { Announcer, TabBehavior } from '@lynellf/tablekit-core';
import { createPivotTable } from '@lynellf/tablekit-pivot';
import type {
  PivotTableInstance,
  PivotTableOptions,
  PivotTableState,
} from '@lynellf/tablekit-pivot';
import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ReactAnnouncer } from './ReactAnnouncer';
import type { MessagesMap } from './messages';
import { useTabBehavior } from './useTabBehavior';

export interface UsePivotTableOptions<TRow> extends PivotTableOptions<TRow> {
  /**
   * Optional announcer. Defaults to a no-op; consumers render `<Announcer />`
   * (from useDataTable or usePivotTable) to mount the ReactAnnouncer which
   * sets the global announcer.
   */
  announcer?: Announcer;
  /** M6 phase 1: per-key announcer-string overrides for i18n. Defaults to English. */
  messages?: Partial<MessagesMap>;
  /**
   * M6 phase 2: how Tab behaves inside the pivot grid.
   * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
   * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
   */
  tabBehavior?: TabBehavior;
}

export interface UsePivotTableResult<TRow> {
  pivot: PivotTableInstance<TRow>;
  state: PivotTableState;
  Announcer: () => ReactElement;
  /**
   * M6 phase 2: assign this ref to the root grid element to enable Tab behavior.
   */
  gridRef: React.RefObject<HTMLDivElement | null>;
}

export const usePivotTable = <TRow>(
  options: UsePivotTableOptions<TRow>,
): UsePivotTableResult<TRow> => {
  const ref = useRef<PivotTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createPivotTable<TRow>(options);
  }
  const pivot = ref.current;

  // Push latest options after every render.
  // We use a ref to track the previous options to avoid calling setOptions
  // on every render when nothing relevant changed. This prevents infinite loops
  // that can occur when setOptions always creates a new state object reference.
  const prevOptionsRef = useRef<UsePivotTableOptions<TRow> | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Deep compare the pivot config to avoid unnecessary setOptions calls.
    const prev = prevOptionsRef.current;
    const curr = optionsRef.current;

    // Always call setOptions on first render (prev is undefined).
    // On subsequent renders, only call if the pivot config changed.
    const pivotChanged = !prev || prev.pivot !== curr.pivot || prev.data !== curr.data;

    if (pivotChanged) {
      pivot.setOptions(curr);
      prevOptionsRef.current = curr;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivot]);

  // Side-effect: register the ReactAnnouncer globally if no announcer was provided.
  useEffect(() => {
    if (!options.announcer) {
      const reactAnnouncer: Announcer = {
        announce: (_msg: string, _politeness?: 'polite' | 'assertive') => {
          // The Announcer component sets the global announcer on mount.
          // Here we just no-op; the consumer's rendered <Announcer /> handles it.
        },
      };
      setGlobalAnnouncer(reactAnnouncer);
    }
    return () => {
      if (!options.announcer) setGlobalAnnouncer({ announce: () => {} });
    };
  }, [options.announcer]);

  const subscribe = useCallback((onChange: () => void) => pivot.subscribe(onChange), [pivot]);
  const getSnapshot = useCallback(() => pivot.getState(), [pivot]);

  // M6 phase 2: tabBehavior wiring.
  const tabBehavior = options.tabBehavior ?? 'exit';
  const gridRef = useRef<HTMLDivElement>(null);
  useTabBehavior({ gridRef, tabBehavior });

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    pivot,
    state,
    Announcer: () => React.createElement(ReactAnnouncer),
    gridRef,
  };
};
