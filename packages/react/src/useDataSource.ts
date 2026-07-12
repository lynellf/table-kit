/**
 * @lynellf/tablekit-react — `useDataSource` hook.
 *
 * Spec §5.2: "useDataSource(table, source) (or the dataSource option) wires
 * it up: it derives the manual* flags from capabilities, watches the relevant
 * state slices, builds RowsQuery, aborts stale requests via AbortSignal, and
 * exposes status: 'idle' | 'loading' | 'error', error, and refetch()."
 *
 * v2.0.0 Changes:
 * - Source can now be null/undefined (returns idle state, no subscriptions)
 * - Added request token for race condition protection
 * - Added stable query key for deduplication
 */

import type { DataTableInstance, DataTableOptions } from '@lynellf/tablekit-core';
import type {
  DataSource,
  DataSourceState,
  DataSourceStatus,
} from '@lynellf/tablekit-core/dataSource';
import { validateModeConfiguration } from '@lynellf/tablekit-core/dataSource';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { defaultMessages } from './messages';
import type { AnnouncerKey } from './messages';

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
  __setManualFlags(
    manualSorting: boolean,
    manualFiltering: boolean,
    manualPagination: boolean,
  ): void;
  __buildRowsQuery(capabilities: {
    sort: 'client' | 'server';
    filter: 'client' | 'server';
    paginate: 'client' | 'server';
  }): import('@lynellf/tablekit-core/dataSource').RowsQuery;
};

/**
 * R3 fix: Source identity tracker.
 * Uses a Map to assign unique tokens to source objects by reference.
 * This ensures different source instances produce different query keys.
 */
const _sourceTokenMap = new WeakMap<DataSource<unknown>, string>();
let _sourceTokenCounter = 0;

const getSourceToken = <TRow>(source: DataSource<TRow> | null | undefined): string => {
  if (!source) return 'null';
  let token = _sourceTokenMap.get(source);
  if (!token) {
    token = `source_${++_sourceTokenCounter}`;
    _sourceTokenMap.set(source, token);
  }
  return token;
};

/**
 * v2.0.0: Build a stable JSON-safe query key from source identity and table state.
 * The key is used to detect when a new request should be issued vs reusing cached data.
 *
 * R3 fix: Include actual source identity (object reference) in the key, not a constant string.
 * This ensures different source instances produce different query keys.
 */
const buildQueryKey = <TRow>(
  source: DataSource<TRow> | null | undefined,
  query: ReturnType<DataTableInstanceWithSeams<TRow>['__buildRowsQuery']>,
  data: TRow[] | null,
  refetchNonce: number,
): string => {
  // R3 fix: Use source object reference identity via unique token, not a constant string.
  const sourceToken = getSourceToken(source);
  return JSON.stringify({ sourceToken, query, dataLen: data?.length ?? null, refetchNonce });
};

/**
 * Wire a `DataSource<TRow>` to a `DataTableInstance<TRow>`.
 *
 * Uses useSyncExternalStore to subscribe to the table's data source state changes.
 * This ensures re-renders happen at the right time, avoiding infinite loops.
 *
 * Spec §4.2 F0.2: This hook MUST NOT write sparse { data: [], columns: [] } to
 * setOptions. It derives manual* flags before passing them, and keeps total-row
 * count in data-source state rather than mutating table options.
 *
 * v2.0.0: Source can be null/undefined, which returns idle state without subscriptions.
 *
 * @param translator - Optional i18n translator. When provided, announcer calls
 *   route through the translator instead of using hardcoded English strings.
 */
export const useDataSource = <TRow>(
  table: DataTableInstanceWithSeams<TRow>,
  source: DataSource<TRow> | null | undefined,
  translator?: (key: AnnouncerKey, ...args: unknown[]) => string,
): UseDataSourceResult<TRow> => {
  const t =
    translator ??
    ((key: AnnouncerKey) => {
      const val = defaultMessages[key];
      return typeof val === 'function' ? (val as (...a: unknown[]) => string)() : (val as string);
    });

  // Refs for mutable values.
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef(source);
  const requestTokenRef = useRef(0);
  const refetchNonceRef = useRef(0);
  const lastQueryKeyRef = useRef<string | null>(null);
  sourceRef.current = source;

  // Stable refetch function.
  const refetch = useCallback(() => {
    // Increment nonce to force a new query
    refetchNonceRef.current += 1;
    const currentState = table.__getDataSourceState();
    table.__setDataSourceState({
      ...currentState,
      status: 'loading',
    });
  }, [table]);

  // ─── v2.0.0: Handle nullable source ──────────────────────────────────────────
  // When source is null/undefined, return idle state without subscriptions
  const hasSource = source != null;

  // Subscribe to the table's data source state.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);
  const getSnapshot = useCallback(() => table.__getDataSourceState(), [table]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // When no source, return idle state
  if (!hasSource) {
    const idleResult: UseDataSourceResult<TRow> = {
      status: 'idle',
      data: null,
      refetch,
    };
    return idleResult;
  }

  // ─── Single combined effect ──────────────────────────────────────────────
  useEffect(() => {
    // v2.0.0: Skip if no source
    if (!sourceRef.current) return;

    // 1. Validate mode capabilities.
    const caps = sourceRef.current.capabilities;
    validateModeConfiguration({
      manualPagination: caps.paginate === 'server',
      manualSorting: caps.sort === 'server',
      manualFiltering: caps.filter === 'server',
    } as DataTableOptions<TRow>);

    // F0.2: Do NOT write sparse { data: [], columns: [] } to setOptions.
    // Use the internal __setManualFlags seam to update capability flags only.
    // This avoids overwriting the consumer's data and columns options.
    table.__setManualFlags(
      caps.sort === 'server',
      caps.filter === 'server',
      caps.paginate === 'server',
    );

    // v2.0.0: Fetch function with request token for race condition protection
    const runFetch = () => {
      // v2.0.0: Increment request token to track this specific request
      const currentToken = ++requestTokenRef.current;

      const query = table.__buildRowsQuery(sourceRef.current!.capabilities);
      const priorState = table.__getDataSourceState();

      // Build query key and check if we should skip
      const queryKey = buildQueryKey(
        sourceRef.current!,
        query,
        priorState.data,
        refetchNonceRef.current,
      );

      // Skip if query key hasn't changed (same source, same params, no refetch)
      // This prevents unnecessary requests when state hasn't meaningfully changed
      if (queryKey === lastQueryKeyRef.current && priorState.status === 'success') {
        return false;
      }
      lastQueryKeyRef.current = queryKey;

      // Abort the in-flight request, if any, before starting a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const loadingState: DataSourceState<TRow> = {
        status: 'loading',
        data: priorState.data,
        refetch,
      };
      if (priorState.error !== undefined) {
        loadingState.error = priorState.error;
      }
      table.__setDataSourceState(loadingState);

      // Hoist handlers so the catch (synchronous getRows throw) can reach them.
      // v2.0.0: Check requestToken to prevent stale responses
      const handleResult = (awaited: { rows: TRow[]; totalRowCount?: number }) => {
        // v2.0.0: Only process if this is still the latest request
        if (controller.signal.aborted || requestTokenRef.current !== currentToken) return;

        const successState: DataSourceState<TRow> = {
          status: 'success',
          data: awaited.rows,
          refetch,
        };
        if (awaited.totalRowCount !== undefined) {
          successState.totalRowCount = awaited.totalRowCount;
        }
        table.__setDataSourceState(successState);
        table.announce(t('loadingFinished', awaited.rows.length));
      };

      const handleError = (err: unknown) => {
        // v2.0.0: Only process if this is still the latest request
        if (controller.signal.aborted || requestTokenRef.current !== currentToken) return;
        const errorState: DataSourceState<TRow> = {
          status: 'error',
          data: priorState.data,
          error: err instanceof Error ? err : new Error(String(err)),
          refetch,
        };
        table.__setDataSourceState(errorState);
      };

      try {
        const result = sourceRef.current!.getRows(query, { signal: controller.signal });

        if (result instanceof Promise) {
          result.then(handleResult).catch(handleError);
        } else {
          handleResult(result);
        }
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    };

    // 4. Run initial fetch.
    runFetch();

    // 5. Subscribe to table state changes (for controlled state).
    const unsubscribe = table.subscribe(() => {
      runFetch();
    });

    return () => {
      abortRef.current?.abort();
      unsubscribe();
    };
  }, [refetch, table, t]);

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
