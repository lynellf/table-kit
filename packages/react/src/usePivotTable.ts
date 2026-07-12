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
   * Optional announcer. Defaults to the global announcer set by ReactAnnouncer.
   * Consumers render `<Announcer />` (from useDataTable or usePivotTable) to
   * mount the ReactAnnouncer which manages the live-region.
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
  // R5 fix: Respect caller's announcer if provided, otherwise create internal one.
  // The announcer is shared between the pivot (via options) and ReactAnnouncer (via props).
  const announcerRef = useRef<Announcer | null>(null);
  if (announcerRef.current === null) {
    // Use caller's announcer if provided, otherwise create minimal internal one
    announcerRef.current = options.announcer ?? { announce: () => {} };
  }

  const ref = useRef<PivotTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    // R5 fix: Pass the announcer to the pivot factory so it uses our instance.
    // If caller provided announcer, it's already set in announcerRef.current.
    ref.current = createPivotTable<TRow>({ ...options, announcer: announcerRef.current });
  }
  const pivot = ref.current;

  // Push the latest options after commit. The factory compares the semantic
  // pivot slices, so inline option objects do not create a render loop while
  // callbacks and controlled slices still stay current.
  useEffect(() => {
    pivot.setOptions(options);
  }, [pivot, options]);

  // Phase 1 F0.5: The global announcer is managed by the ReactAnnouncer component,
  // not by this hook. Consumers must render <Announcer /> to enable announcements.
  // We no longer set or reset the global announcer here, as that caused issues
  // when multiple instances were mounted - unmounting one would disable announcements
  // for the other.

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
    // R5 fix: Pass the shared announcer instance to ReactAnnouncer.
    Announcer: () => React.createElement(ReactAnnouncer, { announcer: announcerRef.current! }),
    gridRef,
  };
};
