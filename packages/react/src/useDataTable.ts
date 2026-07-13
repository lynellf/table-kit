/**
 * @lynellf/tablekit-react — `useDataTable` hook.
 *
 * Spec §4.1: `useDataTable(options)` returns a stable instance; `setOptions`
 * is called on every render so the engine observes the latest options.
 *
 * M1 surface: returns the instance + state snapshot + Announcer component.
 * M3 phase 3: accepts `dataSource?: DataSource<TRow>` option and returns
 * `dataSourceState?: DataSourceState<TRow>` on the result.
 */

import { createDataTable } from '@lynellf/tablekit-core';
import type {
  DataTableInstance,
  DataTableOptions,
  DataTableState,
  TabBehavior,
} from '@lynellf/tablekit-core';
import type { DataSource, DataSourceState } from '@lynellf/tablekit-core/dataSource';
import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ReactAnnouncer } from './ReactAnnouncer';
import { type AnnouncerChannel, createAnnouncerChannel } from './createAnnouncerChannel';
import { createT } from './i18n/t';
import type { MessagesMap } from './messages';
import { useDataSource } from './useDataSource';
import { useTabBehavior } from './useTabBehavior';

export interface UseDataTableOptions<TRow> extends DataTableOptions<TRow> {
  /** M3 phase 3: wire a data source for server modes. */
  dataSource?: DataSource<TRow>;
  /** M6 phase 1: per-key announcer-string overrides for i18n. Defaults to English. */
  messages?: Partial<MessagesMap>;
  /**
   * M6 phase 2: how Tab behaves inside the grid.
   * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
   * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
   */
  tabBehavior?: TabBehavior;
  /**
   * R5 fix: Announcer channel for instance-owned announcements.
   * When provided, this channel is used for the announcer so custom announce-only
   * announcers work correctly. When omitted, uses an internal no-op channel.
   */
  announcer?: AnnouncerChannel;
}

export interface UseDataTableResult<TRow> {
  /** The stable state-engine instance. */
  table: DataTableInstance<TRow>;
  /** The current state snapshot (reactive). */
  state: DataTableState;
  /** Render this component to mount the announcer. */
  Announcer: () => ReactElement;
  /** M3 phase 3: always present (idle when no dataSource). */
  dataSourceState: DataSourceState<TRow>;
  /**
   * M6 phase 2: assign this ref to the root grid element to enable Tab behavior.
   * Consumers typically spread it into their grid div: <div {...table.getGridProps()} ref={gridRef} />
   */
  gridRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * React hook for `createDataTable`.
 *
 * Returns an Announcer component that must be rendered to enable announcements.
 * Consumers can render it anywhere in their tree (typically at the top level).
 *
 * When `dataSource` is provided, the hook internally calls `useDataSource` to
 * wire the data source and exposes `dataSourceState` on the return value.
 */
export const useDataTable = <TRow>(
  options: UseDataTableOptions<TRow>,
): UseDataTableResult<TRow> => {
  // R5 fix: Support options.announcer for custom announce-only announcers.
  // If options.announcer is provided, use it. Otherwise, create an internal no-op channel.
  const announcerChannelRef = useRef<AnnouncerChannel | null>(null);
  if (announcerChannelRef.current === null) {
    if (options.announcer) {
      // R5 fix: Use the provided announcer channel
      announcerChannelRef.current = options.announcer;
    } else {
      // Create a channel with a no-op announcer as the underlying implementation
      announcerChannelRef.current = createAnnouncerChannel({ announce: () => {} });
    }
  }

  // Create the instance once. The ref initializer runs only on mount.
  const ref = useRef<DataTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    // R5 fix: Create an announcer that wraps the channel so the table can use it.
    // The channel ensures proper subscription lifecycle and instance isolation.
    // Use the provided announcer if available, otherwise use the internal channel.
    const announcerToUse = options.announcer ?? announcerChannelRef.current!;
    ref.current = createDataTable<TRow>({
      ...options,
      announcer: announcerToUse,
    });
  }
  const table = ref.current;

  // ── Side-effect: push the latest options into the instance.
  //
  // setOptions is a side effect: it can call notify(), which schedules a
  // re-render via useSyncExternalStore. We intentionally run it in an effect
  // (after commit) rather than during render — React 19's concurrent renderer
  // will otherwise coalesce the notify into the in-flight render cycle and
  // trip "Maximum update depth exceeded" once any controlled object-valued
  // slice (e.g., pagination) re-derives to the same values via the broken
  // shallowEqual. The dep is `[options, table]` because:
  //   - We MUST re-fire after every render so the instance picks up the
  //     latest controlled-slice values (`state`, `columns`, `data`, …).
  //     Using only `[table]` would leave the instance with a stale snapshot
  //     of options on subsequent renders and the controlled-slice contract
  //     would silently break.
  //   - We rely on `sliceValuesEqual` to keep setOptions a no-op when the
  //     post-commit options derive the same state, so the per-render effect
  //     does not storm notifications.
  //
  // R1 fix: Column pruning is handled by core `setOptions` in `createDataTable`.
  // The core calls `__pruneColumnIds` when columns change, so the React adapter
  // does NOT need to call it separately. This prevents duplicate callback delivery
  // for controlled column replacement.
  //
  // R5 fix: Always include announcer in setOptions call. When the consumer doesn't
  // provide an announcer, options.announcer is undefined. Passing undefined to setOptions
  // would overwrite the internal channel that was set during createDataTable.
  // We always pass the announcer (consumer-provided or internal channel).
  const { announcer: _unusedAnnouncer, ...optionsWithoutAnnouncer } = options;
  useEffect(() => {
    // Always include announcer: consumer-provided (if any) or internal channel
    table.setOptions({
      ...optionsWithoutAnnouncer,
      announcer: options.announcer ?? announcerChannelRef.current!,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, table]);

  // subscribe: useCallback so React doesn't re-subscribe every render.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);

  // getSnapshot: returns the same reference until state actually changes.
  const getSnapshot = useCallback(() => table.getState(), [table]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // M6 phase 1: i18n translator (created once per hook; no per-call allocation).
  const t = useMemo(() => createT(options.messages), [options.messages]);

  // M3 phase 3: Always call useDataSource unconditionally (R3 fix).
  // When dataSource is null, it returns idle state without subscriptions.
  const dataSourceState = useDataSource(
    table as DataTableInstance<TRow> & Parameters<typeof useDataSource<TRow>>[0],
    options.dataSource ?? null,
    t,
  );

  // M6 phase 2: tabBehavior ref and hook.
  // Consumers assign gridRef.current to the root grid element so the Tab handler
  // can blur/focus as needed.
  const tabBehavior = options.tabBehavior ?? 'exit';
  const gridRef = useRef<HTMLDivElement>(null);
  useTabBehavior({ gridRef, tabBehavior });

  return {
    table,
    state,
    // R5 fix: Pass the shared announcer instance to ReactAnnouncer.
    // This ensures the same announcer is used by both the table and the live region.
    // R5 fix: Pass the channel to ReactAnnouncer for proper subscription lifecycle.
    // This ensures instance isolation and post-mount message delivery.
    Announcer: () => {
      return React.createElement(ReactAnnouncer, { channel: announcerChannelRef.current! });
    },
    dataSourceState,
    gridRef,
  };
};
