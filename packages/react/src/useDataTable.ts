/**
 * @lynellf/tablekit-react — `useDataTable` hook.
 *
 * Spec §4.1: `useDataTable(options)` returns a stable instance; `setOptions`
 * is called on every render so the engine observes the latest options.
 *
 * M1 surface: returns the instance + state snapshot + Announcer component.
 */

import { createDataTable } from '@lynellf/tablekit-core';
import type { DataTableInstance, DataTableOptions, DataTableState } from '@lynellf/tablekit-core';
import React from 'react';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ReactAnnouncer } from './ReactAnnouncer';

export interface UseDataTableResult<TRow> {
  /** The stable state-engine instance. */
  table: DataTableInstance<TRow>;
  /** The current state snapshot (reactive). */
  state: DataTableState;
  /** Render this component to mount the announcer. */
  Announcer: () => ReactElement;
}

/**
 * React hook for `createDataTable`.
 *
 * Returns an Announcer component that must be rendered to enable announcements.
 * Consumers can render it anywhere in their tree (typically at the top level).
 */
export const useDataTable = <TRow>(options: DataTableOptions<TRow>): UseDataTableResult<TRow> => {
  // Create the instance once. The ref initializer runs only on mount.
  const ref = useRef<DataTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createDataTable<TRow>(options);
  }
  const table = ref.current;

  // Push the latest options into the instance on every render.
  table.setOptions(options);

  // subscribe: useCallback so React doesn't re-subscribe every render.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);

  // getSnapshot: returns the same reference until state actually changes.
  const getSnapshot = useCallback(() => table.getState(), [table]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    table,
    state,
    Announcer: () => {
      return React.createElement(ReactAnnouncer);
    },
  };
};
