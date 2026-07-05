/**
 * @lynellf/tablekit-react — `useDataSource` hook.
 *
 * Spec §5.2: "useDataSource(table, source) (or the dataSource option) wires
 * it up: it derives the manual* flags from capabilities, watches the relevant
 * state slices, builds RowsQuery, aborts stale requests via AbortSignal, and
 * exposes status: 'idle' | 'loading' | 'error', error, and refetch()."
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  DataSource,
  DataSourceState,
  DataSourceStatus,
} from '@lynellf/tablekit-core/dataSource';
import { validateModeConfiguration } from '@lynellf/tablekit-core/dataSource';
import type { DataTableInstance, DataTableOptions } from '@lynellf/tablekit-core';

/** Return type. `data` is the latest successful result; consumers use it as the `data` prop. */
export interface UseDataSourceResult<TRow> {
  status: DataSourceStatus;
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
}

type DataTableInstanceWithSeams<TRow> = DataTableInstance<TRow> & {
  __getDataSourceState(): DataSourceState<TRow>;
  __setDataSourceState(state: DataSourceState<TRow>): void;
  __buildRowsQuery(capabilities: {
    sort: 'client' | 'server';
    filter: 'client' | 'server';
    paginate: 'client' | 'server';
  }): import('@lynellf/tablekit-core/dataSource').RowsQuery;
};

/**
 * Wire a `DataSource<TRow>` to a `DataTableInstance<TRow>`.
 *
 * Uses useSyncExternalStore to subscribe to the table's data source state changes.
 * This ensures re-renders happen at the right time, avoiding infinite loops.
 */
export const useDataSource = <TRow>(
  table: DataTableInstanceWithSeams<TRow>,
  source: DataSource<TRow>,
): UseDataSourceResult<TRow> => {
  // Subscribe to the table's data source state.
  const subscribe = useCallback(
    (onChange: () => void) => table.subscribe(onChange),
    [table],
  );
  const getSnapshot = useCallback(
    () => table.__getDataSourceState(),
    [table],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Refs for mutable values.
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef(source);
  const fetchingRef = useRef(false);
  sourceRef.current = source;

  // Stable refetch function.
  const refetch = useCallback(() => {
    // Trigger a refetch by aborting and updating state
    abortRef.current?.abort();
    const currentState = table.__getDataSourceState();
    table.__setDataSourceState({
      ...currentState,
      status: 'loading',
    });
  }, [table]);

  // ─── Single combined effect ──────────────────────────────────────────────
  useEffect(() => {
    // 1. Validate mode.
    const caps = sourceRef.current.capabilities;
    const syntheticOptions: Partial<DataTableOptions<TRow>> = {
      manualPagination: caps.paginate === 'server',
      manualSorting: caps.sort === 'server',
      manualFiltering: caps.filter === 'server',
    };
    validateModeConfiguration(syntheticOptions as DataTableOptions<TRow>);

    // 2. Thread capabilities into the instance.
    table.setOptions({
      data: [],
      columns: [],
      manualSorting: caps.sort === 'server',
      manualFiltering: caps.filter === 'server',
      manualPagination: caps.paginate === 'server',
    });

    // 3. Fetch function.
    const runFetch = () => {
      if (fetchingRef.current) return false;
      fetchingRef.current = true;

      try {
        const query = table.__buildRowsQuery(sourceRef.current.capabilities);

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const priorState = table.__getDataSourceState();
        const loadingState: DataSourceState<TRow> = {
          status: 'loading',
          data: priorState.data,
          refetch,
        };
        if (priorState.error !== undefined) {
          loadingState.error = priorState.error;
        }
        table.__setDataSourceState(loadingState);

        const result = sourceRef.current.getRows(query, { signal: controller.signal });

        const handleResult = (awaited: { rows: TRow[]; totalRowCount?: number }) => {
          if (controller.signal.aborted) return;

          const successState: DataSourceState<TRow> = {
            status: 'success',
            data: awaited.rows,
            refetch,
          };
          if (awaited.totalRowCount !== undefined) {
            successState.totalRowCount = awaited.totalRowCount;
          }
          table.__setDataSourceState(successState);
          table.announce(`Loaded ${awaited.rows.length} rows`);

          if (
            sourceRef.current.capabilities.paginate === 'server' &&
            typeof awaited.totalRowCount === 'number'
          ) {
            table.setOptions({
              data: [],
              columns: [],
              manualPagination: true,
              rowCount: awaited.totalRowCount,
            });
          }
        };

        const handleError = (err: unknown) => {
          if (controller.signal.aborted) return;

          const errorState: DataSourceState<TRow> = {
            status: 'error',
            data: priorState.data,
            error: err instanceof Error ? err : new Error(String(err)),
            refetch,
          };
          table.__setDataSourceState(errorState);
        };

        if (result instanceof Promise) {
          result.then(handleResult).catch(handleError).finally(() => {
            fetchingRef.current = false;
          });
        } else {
          handleResult(result);
          fetchingRef.current = false;
        }

        return true;
      } catch (err) {
        handleError(err);
        fetchingRef.current = false;
        return false;
      }
    };

    // 4. Run initial fetch.
    runFetch();

    // 5. Subscribe to table state changes (for controlled state).
    const unsubscribe = table.subscribe(() => {
      if (fetchingRef.current) return;
      runFetch();
    });

    return () => {
      abortRef.current?.abort();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, table]);

  // Build return with only defined optional fields.
  const result: UseDataSourceResult<TRow> = {
    status: snapshot.status,
    data: snapshot.data,
    refetch,
  };
  if (snapshot.totalRowCount !== undefined) {
    result.totalRowCount = snapshot.totalRowCount;
  }
  if (snapshot.error !== undefined) {
    result.error = snapshot.error;
  }

  return result;
};
