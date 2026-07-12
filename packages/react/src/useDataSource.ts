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
 *
 * R3 fix: Request orchestration is separate from status notifications.
 * Status/data/cursor/version publication must not recursively start requests.
 * Controlled state changes trigger fetch via a re-render + ref comparison.
 */

import type { DataTableInstance, DataTableOptions } from '@lynellf/tablekit-core';
import type {
  CursorDirection,
  CursorSelection,
  CursorState,
  DataSource,
  DataSourceCapabilities,
  DataSourceState,
  DataSourceStatus,
  RowsResult,
} from '@lynellf/tablekit-core/dataSource';
import { validateModeConfiguration } from '@lynellf/tablekit-core/dataSource';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defaultMessages } from './messages';
import type { AnnouncerKey } from './messages';

/** Return type. `data` is the latest successful result; consumers use it as the `data` prop. */
export interface UseDataSourceResult<TRow> {
  status: DataSourceStatus;
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
  /** v2.0.0: Cursor state for navigating cursor-based pagination. */
  cursor?: CursorState;
  /**
   * v2.0.0: Navigate to a specific cursor position.
   * Only available for cursor-capable data sources.
   * Calling this starts a new query for the selected cursor.
   */
  selectCursor?: (cursor: string | null, direction: CursorDirection) => void;
}

type DataTableInstanceWithSeams<TRow> = DataTableInstance<TRow> & {
  __getDataSourceState(): DataSourceState<TRow>;
  __setDataSourceState(state: DataSourceState<TRow>): void;
  __setManualFlags(
    manualSorting: boolean,
    manualFiltering: boolean,
    manualPagination: boolean,
  ): void;
  // R2 fix: Accept cursor selection and dataVersion for cursor pagination.
  __buildRowsQuery(
    capabilities: DataSourceCapabilities,
    cursor?: CursorSelection,
    dataVersion?: string | number,
  ): import('@lynellf/tablekit-core/dataSource').RowsQuery;
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
 * R2 fix: Use resolved DataVersionToken instead of dataLen for mutable data detection.
 */
const buildQueryKey = <TRow>(
  source: DataSource<TRow> | null | undefined,
  query: ReturnType<DataTableInstanceWithSeams<TRow>['__buildRowsQuery']>,
  dataVersion: string | number | undefined,
  refetchNonce: number,
): string => {
  // R3 fix: Use source object reference identity via unique token, not a constant string.
  const sourceToken = getSourceToken(source);
  // R2 fix: Use dataVersion token instead of dataLen for mutable data patterns.
  return JSON.stringify({ sourceToken, query, dataVersion, refetchNonce });
};

/**
 * R3 fix: In-flight request entry.
 * Used for one-request-per-key guarantee including React Strict Mode effect replay.
 * A replay reattaches to the same entry rather than calling getRows again or aborting it.
 */
interface InFlightEntry<_TRow> {
  key: string;
  controller: AbortController;
  requestToken: number;
  status: 'pending' | 'resolved' | 'rejected' | 'aborted';
}

/**
 * Sentinel value for no published data version.
 * Used to distinguish "no version configured" from "version is undefined".
 */
const UNSET_DATA_VERSION = Symbol('UNSET_DATA_VERSION');
type DataVersionSentinel = typeof UNSET_DATA_VERSION;

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
  const sourceRef = useRef(source);
  const refetchNonceRef = useRef(0);
  // R2 fix: Cursor selection owned by the hook.
  // Initial selection is { cursor: null, direction: 'next' }.
  const cursorSelectionRef = useRef<CursorSelection>({ cursor: null, direction: 'next' });
  sourceRef.current = source;

  // R3 fix: Track in-flight request entry for one-request-per-key guarantee.
  // Includes Strict Mode effect replay handling.
  const inFlightRef = useRef<InFlightEntry<TRow> | null>(null);
  // R3 fix: Guard flag to prevent recursive requests from status publication.
  const processingRef = useRef(false);
  // Track the previous query context to detect cursor resets.
  const prevQueryContextRef = useRef<{
    sourceRef: DataSource<TRow> | null | undefined;
    paginationStrategy: string | undefined;
    pageSize: number;
    sort: unknown;
    filter: unknown;
    paginationRef: unknown; // Track pagination object reference for controlled state
  } | null>(null);
  // R3-SWR-004 fix: Track the previously published token for SWR retention.
  const publishedDataVersionRef = useRef<string | number | DataVersionSentinel>(UNSET_DATA_VERSION);
  // R3 fix: Track previous pagination for controlled state change detection.
  // This is updated after each render and compared in the effect.
  const prevControlledPaginationRef = useRef<{ pageIndex: number; pageSize: number } | null>(null);

  // R3 fix: State variable to force re-render/effect when controlled pagination changes.
  // The subscription increments this, which triggers a new effect run.
  const [controlledStateVersion, setControlledStateVersion] = useState(0);

  // Stable refetch function.
  const refetch = useCallback(() => {
    // Increment nonce to force a new query
    refetchNonceRef.current += 1;
  }, []);

  // R2 fix: Stable selectCursor function for cursor-capable sources.
  const selectCursor = useCallback((cursor: string | null, direction: CursorDirection) => {
    cursorSelectionRef.current = { cursor, direction };
    refetchNonceRef.current += 1;
  }, []);

  // Subscribe to the table's data source state.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);
  const getSnapshot = useCallback(() => table.__getDataSourceState(), [table]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ─── Effect for controlled state change detection ─────────────────────────
  // R3 fix: Subscribe to table state changes to detect controlled pagination changes.
  // When detected, increment controlledStateVersion to trigger the main effect.
  useEffect(() => {
    if (!source) return;

    const unsubscribe = table.subscribe(() => {
      // Check if controlled pagination changed by object reference
      const currentPagination = table.getState().pagination;
      const prevControlled = prevControlledPaginationRef.current;

      if (prevControlled) {
        // Detect controlled pagination changes
        if (
          prevControlled.pageIndex !== currentPagination.pageIndex ||
          prevControlled.pageSize !== currentPagination.pageSize
        ) {
          // Controlled pagination changed - trigger effect re-run
          setControlledStateVersion((v) => v + 1);
        }
      }

      // Update the ref for next comparison
      prevControlledPaginationRef.current = {
        pageIndex: currentPagination.pageIndex,
        pageSize: currentPagination.pageSize,
      };
    });

    return unsubscribe;
  }, [table, source]);

  // ─── Main effect ──────────────────────────────────────────────────────────
  // R3 fix: Effect is keyed by source reference + controlledStateVersion.
  // Status/data/cursor/version publication must not recursively start requests.
  useEffect(() => {
    // R3 fix: Handle null source by setting idle state and aborting in-flight requests
    if (!sourceRef.current) {
      // Abort any in-flight request
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      // Clear cursor and reset query context
      prevQueryContextRef.current = null;
      publishedDataVersionRef.current = UNSET_DATA_VERSION;
      // Set idle state with null data (no prior data retained for null source)
      table.__setDataSourceState({
        status: 'idle',
        data: null,
        refetch,
      });
      return;
    }

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

    // ─── Request orchestration ─────────────────────────────────────────────
    //
    // Build the request descriptor. This is derived from the current committed
    // snapshot and source reference. It contains only request inputs, not status.
    //
    // R2 fix: Resolve dataVersion from table configuration.
    const resolvedDataVersion = table.getDataVersion();

    // Get current query context from the table state
    const currentTableState = table.getState();
    const currentPagination = currentTableState.pagination;
    const currentContext = {
      sourceRef: sourceRef.current,
      paginationStrategy: caps.pagination ?? 'offset',
      pageSize: currentTableState.pagination.pageSize,
      sort: currentTableState.sorting,
      filter: currentTableState.columnFilters,
      paginationRef: currentPagination, // Track pagination object for controlled state
    };
    const prevContext = prevQueryContextRef.current;

    // R3 fix: Check if this is a fresh mount or a re-run.
    // On fresh mount, we always want to fetch.
    const isFreshMount = prevContext === null;

    // Check if any non-cursor context changed (requires cursor reset and new request)
    const contextChanged =
      prevContext === null ||
      prevContext.sourceRef !== currentContext.sourceRef ||
      prevContext.paginationStrategy !== currentContext.paginationStrategy ||
      prevContext.pageSize !== currentContext.pageSize ||
      prevContext.sort !== currentContext.sort ||
      prevContext.filter !== currentContext.filter ||
      // R3 fix: Also detect controlled pagination changes by object reference
      prevContext.paginationRef !== currentContext.paginationRef;

    // R3-B1 fix: Reset cursor selection on non-cursor context changes
    if (contextChanged) {
      cursorSelectionRef.current = { cursor: null, direction: 'next' };
      prevQueryContextRef.current = currentContext;
    }

    // Skip fetch if this is a re-run without context change
    // (e.g., status publication from a different request that doesn't affect our query)
    if (!isFreshMount && !contextChanged) {
      // No new request needed
      return;
    }

    // Build the query with current cursor selection
    const query = table.__buildRowsQuery(
      sourceRef.current!.capabilities,
      cursorSelectionRef.current,
      resolvedDataVersion,
    );

    // Build the canonical descriptor key
    const queryKey = buildQueryKey(
      sourceRef.current!,
      query,
      resolvedDataVersion,
      refetchNonceRef.current,
    );

    // Get prior state for SWR
    const priorState = table.__getDataSourceState();

    // R3 fix: Check for replay scenario (Strict Mode effect cleanup/replay).
    // If the same key is already in-flight and not resolved/rejected, reattach.
    const existing = inFlightRef.current;
    if (existing && existing.key === queryKey && existing.status === 'pending') {
      // Reattachment: don't abort, don't start new request, just keep the entry
      return;
    }

    // R3 fix: Abort and retire any previous in-flight entry for a different key
    if (existing && existing.key !== queryKey) {
      existing.controller.abort();
      existing.status = 'aborted';
    }

    // Abort the old controller if any
    const oldController = inFlightRef.current?.controller;
    if (oldController) {
      oldController.abort();
    }

    // Create new in-flight entry
    const controller = new AbortController();
    const requestToken = Date.now(); // Simple unique token for this implementation
    inFlightRef.current = {
      key: queryKey,
      controller,
      requestToken,
      status: 'pending',
    };

    // Set processing guard to prevent recursive requests from status publication
    processingRef.current = true;

    // ─── Publication helpers ────────────────────────────────────────────────
    //
    // R3-SWR-004 fix: Carry prior metadata through loading/error states.
    // This implements stale-while-revalidate unconditionally.
    const getStaleMetadata = (): Pick<
      DataSourceState<TRow>,
      'totalRowCount' | 'cursor' | 'dataVersion'
    > => {
      const metadata: Pick<DataSourceState<TRow>, 'totalRowCount' | 'cursor' | 'dataVersion'> = {};
      // R3-SWR-004: Retain prior totalRowCount during SWR
      if (priorState.totalRowCount !== undefined) {
        metadata.totalRowCount = priorState.totalRowCount;
      }
      // Retain prior cursor metadata during SWR
      if (priorState.cursor !== undefined) {
        metadata.cursor = priorState.cursor;
      }
      // Retain previously published data version during SWR
      if (publishedDataVersionRef.current !== UNSET_DATA_VERSION) {
        metadata.dataVersion = publishedDataVersionRef.current as string | number;
      }
      return metadata;
    };

    // Publish loading state with SWR metadata
    const loadingState: DataSourceState<TRow> = {
      status: 'loading',
      data: priorState.data,
      refetch,
      ...getStaleMetadata(),
    };
    if (priorState.error !== undefined) {
      loadingState.error = priorState.error;
    }
    table.__setDataSourceState(loadingState);

    // Hoist handlers so the catch (synchronous getRows throw) can reach them.
    const handleResult = (result: RowsResult<TRow>) => {
      // R3 fix: Only process if this is still the latest request (token match)
      if (controller.signal.aborted || inFlightRef.current?.requestToken !== requestToken) {
        if (inFlightRef.current && inFlightRef.current.requestToken === requestToken) {
          inFlightRef.current.status = 'aborted';
        }
        return;
      }

      inFlightRef.current!.status = 'resolved';

      // R2 fix: Copy cursor state from RowsResult.
      // Only include cursor if we have at least one defined cursor value.
      const hasNextCursor = result.nextCursor !== undefined;
      const hasPreviousCursor = result.previousCursor !== undefined;
      const cursor: CursorState | undefined =
        hasNextCursor || hasPreviousCursor
          ? {
              nextCursor: result.nextCursor ?? null,
              previousCursor: result.previousCursor ?? null,
            }
          : undefined;

      // R2-VERSION-002: Accept result token and update published version.
      // The result token becomes the new published version.
      const acceptedToken = result.dataVersion ?? resolvedDataVersion;
      if (acceptedToken !== undefined) {
        publishedDataVersionRef.current = acceptedToken;
      } else if (resolvedDataVersion === undefined) {
        // Tokenless result: transition to unset (invalidates same-ref cache)
        publishedDataVersionRef.current = UNSET_DATA_VERSION;
      }

      const successState: DataSourceState<TRow> = {
        status: 'success',
        data: result.rows,
        refetch,
        ...getStaleMetadata(), // R3-SWR-004: Retain metadata from last accepted result
      };
      if (result.totalRowCount !== undefined) {
        successState.totalRowCount = result.totalRowCount;
      }
      if (cursor !== undefined) {
        successState.cursor = cursor;
      }
      if (acceptedToken !== undefined) {
        successState.dataVersion = acceptedToken;
      }
      // Clear processing guard before publication
      processingRef.current = false;
      table.__setDataSourceState(successState);
      table.announce(t('loadingFinished', result.rows.length));
    };

    const handleError = (err: unknown) => {
      // R3 fix: Only process if this is still the latest request
      if (controller.signal.aborted || inFlightRef.current?.requestToken !== requestToken) {
        if (inFlightRef.current && inFlightRef.current.requestToken === requestToken) {
          inFlightRef.current.status = 'aborted';
        }
        return;
      }

      inFlightRef.current!.status = 'rejected';
      const errorState: DataSourceState<TRow> = {
        status: 'error',
        data: priorState.data,
        error: err instanceof Error ? err : new Error(String(err)),
        refetch,
        ...getStaleMetadata(), // R3-SWR-004: Retain metadata during error
      };
      // Clear processing guard before publication
      processingRef.current = false;
      table.__setDataSourceState(errorState);
    };

    // Execute the request
    try {
      const result = sourceRef.current!.getRows(query, { signal: controller.signal });

      if (result instanceof Promise) {
        result.then(handleResult).catch(handleError);
      } else {
        handleResult(result);
      }
    } catch (err) {
      handleError(err);
    }

    // Cleanup: abort on unmount, schedule microtask release for Strict Mode replay
    return () => {
      // Clear processing guard on cleanup
      processingRef.current = false;
      // R3 fix: Don't abort immediately - schedule for microtask so Strict Mode
      // effect replay can reattach to the same entry before it's released
      const entry = inFlightRef.current;
      if (entry && entry.key === queryKey) {
        // Mark as pending cleanup - if replay happens, the check above will reattach
        queueMicrotask(() => {
          // If still the same entry and not resolved, abort it
          if (inFlightRef.current === entry && entry.status === 'pending') {
            controller.abort();
            entry.status = 'aborted';
          }
        });
      } else {
        // Different key, abort immediately
        controller.abort();
      }
    };
    // R3 fix: Include source AND controlledStateVersion so the effect re-runs when:
    // 1. Source changes (null ↔ non-null transitions)
    // 2. Controlled pagination changes (via the subscription incrementing controlledStateVersion)
  }, [refetch, table, t, source, controlledStateVersion]);

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
  // R2 fix: Expose cursor state and selectCursor for cursor-capable sources.
  if (snapshot.cursor !== undefined) {
    result.cursor = snapshot.cursor;
  }
  // R2 fix: Expose selectCursor only for cursor-capable sources.
  if (source?.capabilities.pagination === 'cursor') {
    result.selectCursor = selectCursor;
  }

  return result;
};
