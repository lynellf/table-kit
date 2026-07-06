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
import type { DataTableInstance, DataTableOptions, DataTableState } from '@lynellf/tablekit-core';
import type { DataSource, DataSourceState } from '@lynellf/tablekit-core/dataSource';
import React from 'react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ReactAnnouncer } from './ReactAnnouncer';
import { useDataSource } from './useDataSource';

export interface UseDataTableOptions<TRow> extends DataTableOptions<TRow> {
  /** M3 phase 3: wire a data source for server modes. */
  dataSource?: DataSource<TRow>;
}

export interface UseDataTableResult<TRow> {
  /** The stable state-engine instance. */
  table: DataTableInstance<TRow>;
  /** The current state snapshot (reactive). */
  state: DataTableState;
  /** Render this component to mount the announcer. */
  Announcer: () => ReactElement;
  /** M3 phase 3: present iff `dataSource` option is provided. */
  dataSourceState?: DataSourceState<TRow>;
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
  // Create the instance once. The ref initializer runs only on mount.
  const ref = useRef<DataTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createDataTable<TRow>(options);
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
  useEffect(() => {
    table.setOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, table]);

  // subscribe: useCallback so React doesn't re-subscribe every render.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);

  // getSnapshot: returns the same reference until state actually changes.
  const getSnapshot = useCallback(() => table.getState(), [table]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // M3 phase 3: dataSource wiring
  const dataSourceState = options.dataSource
    ? useDataSource(
        table as DataTableInstance<TRow> & Parameters<typeof useDataSource<TRow>>[0],
        options.dataSource,
      )
    : undefined;

  return {
    table,
    state,
    Announcer: () => {
      return React.createElement(ReactAnnouncer);
    },
    ...(dataSourceState ? { dataSourceState } : {}),
  };
};
