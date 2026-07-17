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
import { type AnnouncerChannel, createAnnouncerChannel } from './createAnnouncerChannel';
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
  gridRef: React.RefObject<HTMLDivElement>;
}

export const usePivotTable = <TRow>(
  options: UsePivotTableOptions<TRow>,
): UsePivotTableResult<TRow> => {
  // R5-ANNOUNCE-ONLY-005 fix: Create a stable channel for the announcer.
  // If options.announcer is an AnnouncerChannel (has subscribe), use it directly.
  // If it's a minimal Announcer (only announce), wrap it in a channel.
  // The channel is shared between the pivot (via setOptions) and ReactAnnouncer (via props).
  const announcerChannelRef = useRef<AnnouncerChannel | null>(null);
  if (announcerChannelRef.current === null) {
    if (options.announcer) {
      // Check if it's a full AnnouncerChannel or a minimal Announcer
      if (typeof (options.announcer as AnnouncerChannel).subscribe === 'function') {
        announcerChannelRef.current = options.announcer as AnnouncerChannel;
      } else {
        // Wrap minimal Announcer in a channel
        announcerChannelRef.current = createAnnouncerChannel(options.announcer);
      }
    } else {
      // No announcer provided — pivot factory will use getGlobalAnnouncer() as fallback
      // Create a no-op channel for ReactAnnouncer
      announcerChannelRef.current = createAnnouncerChannel({ announce: () => {} });
    }
  }

  const ref = useRef<PivotTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    // R5-R7-FIX: Always pass the channel to createPivotTable, not the minimal
    // announcer object. The channel is what ReactAnnouncer subscribes to, so
    // passing the minimal object directly would bypass the live-region subscription.
    ref.current = createPivotTable<TRow>({
      ...options,
      announcer: announcerChannelRef.current!,
    });
  }
  const pivot = ref.current;

  // Push the latest options after commit. The factory compares the semantic
  // pivot slices, so inline option objects do not create a render loop while
  // callbacks and controlled slices still stay current.
  //
  // R5-PIVOT-CHANNEL-004 fix: Always pass the stable channel in setOptions.
  // Factory setOptions assigns `announcer = next.announcer ?? noopAnnouncer`,
  // which disconnects the pivot from its channel after the update effect unless
  // we explicitly pass it back. ReactAnnouncer remains subscribed to the channel,
  // so post-mount pivot messages would otherwise be lost from the live region.
  const { announcer: _unused, ...optionsWithoutAnnouncer } = options;
  useEffect(() => {
    // R5-R7 fix: Always pass the channel to setOptions, not the minimal announcer.
    // The channel is what ReactAnnouncer subscribes to, so passing the minimal
    // announcer object would bypass the live-region subscription.
    pivot.setOptions({
      ...optionsWithoutAnnouncer,
      announcer: announcerChannelRef.current!,
    });
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
    // R5 fix: Pass the channel to ReactAnnouncer for proper subscription lifecycle.
    // This ensures instance isolation and post-mount message delivery.
    Announcer: () => React.createElement(ReactAnnouncer, { channel: announcerChannelRef.current! }),

    gridRef,
  };
};
