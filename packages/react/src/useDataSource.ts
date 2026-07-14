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
 *
 * R3-REQUEST-TRIGGERING fix: The subscription tracks ALL query inputs (sort/filter/
 * paginate/capability) and the canonical descriptor effect re-runs when any
 * of them changes. The effect includes all capability fields/strategy, scalar
 * pagination, canonical sort/filter, cursor, outgoing token, and nonce.
 *
 * R3-SWR-CURSOR-THENABLE fix: Cursor metadata is explicitly cleared when the
 * result omits or mismatches cursor controls. SWR metadata is retained only when
 * compatible. Thenables are assimilated with Promise.resolve-equivalent handlers.
 *
 * R3-MANUAL-CAPABILITY-OVERLAY fix: Source capability flags are maintained in a
 * stable overlay ref, applied after every setOptions call, replaced on source/
 * capability changes, and cleared on source removal.
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
  MaybePromise,
  RowsResult,
} from '@lynellf/tablekit-core/dataSource';
import { buildQueryKey, validateModeConfiguration } from '@lynellf/tablekit-core/dataSource';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defaultMessages } from './messages';
import type { AnnouncerKey } from './messages';

/**
 * R3-THENABLE fix: Check if a value is a thenable (Promise-like) without using instanceof.
 * This handles custom thenable objects that aren't actual Promises.
 */
const isPromiseLike = <T>(value: MaybePromise<T>): value is Promise<T> =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof (value as { then?: unknown }).then === 'function';

/** Return type. `data` is the latest successful result; consumers use it as the `data` prop. */
export interface UseDataSourceResult<TRow> {
  status: DataSourceStatus;
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
  /** v2.0.0: Cursor state for navigating cursor-based pagination. */
  cursor?: CursorState;
  /** v2.0.0: Data version token for mutable data patterns. */
  dataVersion?: string | number;
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
  /** R3-MANUAL-CAPABILITY-OVERLAY fix: Apply the stable capability overlay. */
  __applyCapabilityOverlay(
    overlay: { manualSorting: boolean; manualFiltering: boolean; manualPagination: boolean } | null,
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
 * Sentinel value for no published data version.
 * Used to distinguish "no version configured" from "version is undefined".
 */
const UNSET_DATA_VERSION: unique symbol = Symbol('UNSET_DATA_VERSION');
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
  // R3 fix: Cleanup generation counter for Strict Mode microtask cancellation.
  // When effect cleanup runs, we increment this counter. The scheduled microtask
  // checks if it's still the current generation before aborting.
  const cleanupGenerationRef = useRef(0);
  // R2 fix: Cursor selection owned by the hook.
  // Initial selection is { cursor: null, direction: 'next' }.
  const cursorSelectionRef = useRef<CursorSelection>({ cursor: null, direction: 'next' });
  // Track whether selectCursor was the trigger for the current effect run
  const selectCursorTriggeredRef = useRef(false);
  // Track whether refetch was the trigger for the current effect run
  // R3-CURSOR-RESET-METADATA fix: refetch should preserve current cursor selection.
  const refetchTriggeredRef = useRef(false);
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
    sort: unknown;
    filter: unknown;
    paginationRef: unknown; // Track pagination object reference for controlled state
    refetchNonce: number; // Track refetch nonce for context comparison
    // R3-REQUEST-TRIGGERING fix: Include all capability fields and pagination.
    manualSorting: boolean;
    manualFiltering: boolean;
    manualPagination: boolean;
    pageSize: number;
  } | null>(null);
  // R3-SWR-004 fix: Track the previously published token for SWR retention.
  const publishedDataVersionRef = useRef<string | number | DataVersionSentinel>(UNSET_DATA_VERSION);

  // R3-REQUEST-TRIGGERING fix: Track the previous sorting and filtering state
  // for the controlled-state-change subscription.
  const prevControlledSortFilterRef = useRef<{
    sort: unknown;
    filter: unknown;
  } | null>(null);

  // R3 fix: Track previous pagination for controlled state change detection.
  // This is updated after each render and compared in the effect.
  const prevControlledPaginationRef = useRef<{ pageIndex: number; pageSize: number } | null>(null);

  // R3-REQUEST-TRIGGERING fix: State variable to force re-render/effect when
  // sort/filter state changes (for controlled slices).
  const [controlledStateVersion, setControlledStateVersion] = useState(0);
  // R3 fix: State variable to force effect when refetch is called.
  // This ensures the nonce change is visible to the effect.
  const [refetchVersion, setRefetchVersion] = useState(0);

  // Stable refetch function.
  const refetch = useCallback(() => {
    // Increment nonce to force a new query
    refetchNonceRef.current += 1;
    // R3-CURSOR-RESET-METADATA fix: Mark that refetch triggered this run so the effect preserves the selection
    refetchTriggeredRef.current = true;
    // Increment version to trigger effect re-run
    setRefetchVersion((v) => v + 1);
  }, []);

  // R2 fix: Stable selectCursor function for cursor-capable sources.
  // Increment refetchVersion to trigger the effect to rebuild the query with new cursor.
  const selectCursor = useCallback((cursor: string | null, direction: CursorDirection) => {
    cursorSelectionRef.current = { cursor, direction };
    // Mark that selectCursor triggered this run so the effect preserves the selection
    selectCursorTriggeredRef.current = true;
    // R2-CURSOR-TRIGGER-RESET fix: Increment refetchVersion to ensure effect re-runs
    // and rebuilds the query with the new cursor selection.
    setRefetchVersion((v) => v + 1);
  }, []);

  // Subscribe to the table's data source state.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);
  const getSnapshot = useCallback(() => table.__getDataSourceState(), [table]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // ─── Effect for controlled state change detection ─────────────────────────
  //
  // R3-REQUEST-TRIGGERING fix: Subscribe to table state changes to detect
  // controlled sorting, filtering, and pagination changes.
  // When detected, increment controlledStateVersion to trigger the main effect.
  useEffect(() => {
    if (!source) return;

    const unsubscribe = table.subscribe(() => {
      const currentState = table.getState();
      const prevSortFilter = prevControlledSortFilterRef.current;
      const prevPagination = prevControlledPaginationRef.current;
      let needsVersionBump = false;

      // Detect controlled sorting changes
      if (prevSortFilter !== null) {
        if (prevSortFilter.sort !== currentState.sorting) {
          needsVersionBump = true;
        }
        if (prevSortFilter.filter !== currentState.columnFilters) {
          needsVersionBump = true;
        }
      }

      // Detect controlled pagination changes
      if (prevPagination !== null) {
        if (
          prevPagination.pageIndex !== currentState.pagination.pageIndex ||
          prevPagination.pageSize !== currentState.pagination.pageSize
        ) {
          needsVersionBump = true;
        }
      }

      if (needsVersionBump) {
        setControlledStateVersion((v) => v + 1);
      }

      // Update the refs for next comparison
      prevControlledSortFilterRef.current = {
        sort: currentState.sorting,
        filter: currentState.columnFilters,
      };
      prevControlledPaginationRef.current = {
        pageIndex: currentState.pagination.pageIndex,
        pageSize: currentState.pagination.pageSize,
      };
    });

    return unsubscribe;
  }, [table, source]);

  // ─── Main effect ──────────────────────────────────────────────────────────
  //
  // R3-REQUEST-TRIGGERING fix: Effect is keyed by source reference + controlledStateVersion.
  // Status/data/cursor/version publication must not recursively start requests.
  // The descriptor is keyed on ALL committed query inputs:
  // source identity, all capability fields/strategy, scalar pagination,
  // canonical sort/filter, cursor, outgoing token, and nonce.
  useEffect(() => {
    // R3 fix: Handle null source by setting idle state and aborting in-flight requests
    if (!sourceRef.current) {
      // Abort any in-flight request
      inFlightRef.current?.controller.abort();
      inFlightRef.current = null;
      // Clear cursor and reset query context
      prevQueryContextRef.current = null;
      publishedDataVersionRef.current = UNSET_DATA_VERSION;
      // R3-R7-FIX: Reset cursor selection when source is removed.
      // This ensures the source-removal state clears owned cursor state.
      cursorSelectionRef.current = { cursor: null, direction: 'next' };
      // R3-CAPABILITY-RESTORATION fix: Clear the capability overlay on source removal.
      // Setting the overlay to null allows the consumer's explicit manualPagination/
      // manualSorting/manualFiltering options to remain authoritative after source removal.
      // See Slice 3 (R3 capability restoration) acceptance criteria.
      table.__applyCapabilityOverlay(null);
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
    // R3-MANUAL-CAPABILITY-OVERLAY fix: Use the stable overlay mechanism instead
    // of __setManualFlags directly. This ensures the overlay survives setOptions calls.
    table.__applyCapabilityOverlay({
      manualSorting: caps.sort === 'server',
      manualFiltering: caps.filter === 'server',
      manualPagination: caps.paginate === 'server',
    });

    // ─── Request orchestration ─────────────────────────────────────────────
    //
    // Build the request descriptor. This is derived from the current committed
    // snapshot and source reference. It contains only request inputs, not status.
    //
    // R2-SOURCE-VERSION-001 fix: Resolve dataVersion — source token first, table token second.
    // Source-owned versions win over table token and participate in request identity.
    const sourceDataVersion = sourceRef.current?.dataVersion;
    const resolvedDataVersion = sourceDataVersion ?? table.getDataVersion();

    // Get current query context from the table state
    const currentTableState = table.getState();
    const currentPagination = currentTableState.pagination;

    // R3-REQUEST-TRIGGERING fix: Include all capability fields in the context
    // so capability flips trigger a new request.
    const currentContext = {
      sourceRef: sourceRef.current,
      paginationStrategy: caps.pagination ?? 'offset',
      sort: currentTableState.sorting,
      filter: currentTableState.columnFilters,
      paginationRef: currentPagination, // Track pagination object for controlled state
      refetchNonce: refetchNonceRef.current, // Track refetch nonce for context comparison
      // R3-REQUEST-TRIGGERING fix: Include all capability fields.
      manualSorting: caps.sort === 'server',
      manualFiltering: caps.filter === 'server',
      manualPagination: caps.paginate === 'server',
      pageSize: currentTableState.pagination.pageSize,
    };
    const prevContext = prevQueryContextRef.current;

    // R3 fix: Check if this is a fresh mount or a re-run.
    // On fresh mount, we always want to fetch.
    const isFreshMount = prevContext === null;

    // Check if any non-cursor context changed (requires cursor reset and new request)
    // R3 fix: Include refetchNonceRef in context comparison so refetch() forces a new request.
    // R3-REQUEST-TRIGGERING fix: Include ALL context fields so any change triggers a new request.
    const prevRefetchNonce = prevQueryContextRef.current?.refetchNonce ?? 0;
    const contextChanged =
      prevContext === null ||
      prevContext.sourceRef !== currentContext.sourceRef ||
      prevContext.paginationStrategy !== currentContext.paginationStrategy ||
      prevContext.pageSize !== currentContext.pageSize ||
      prevContext.sort !== currentContext.sort ||
      prevContext.filter !== currentContext.filter ||
      prevContext.paginationRef !== currentContext.paginationRef ||
      prevRefetchNonce !== refetchNonceRef.current ||
      // R3-REQUEST-TRIGGERING fix: Capability changes also trigger a new request.
      prevContext.manualSorting !== currentContext.manualSorting ||
      prevContext.manualFiltering !== currentContext.manualFiltering ||
      prevContext.manualPagination !== currentContext.manualPagination;

    // R3-B1 fix: Reset cursor selection on non-cursor context changes.
    // But preserve the selection if selectCursor was the trigger for this run.
    // R3-CURSOR-RESET-METADATA fix: Also preserve selection if refetch was the trigger.
    if (contextChanged) {
      if (selectCursorTriggeredRef.current) {
        // selectCursor was called - preserve the new selection
        selectCursorTriggeredRef.current = false;
      } else if (refetchTriggeredRef.current) {
        // refetch was called - preserve current selection
        refetchTriggeredRef.current = false;
      } else {
        // Other context change - reset to first page
        cursorSelectionRef.current = { cursor: null, direction: 'next' };
      }
      prevQueryContextRef.current = currentContext;
    }

    // Skip fetch if this is a re-run without context change
    // (e.g., status publication from a different request that doesn't affect our query)
    // But still fetch if selectCursor was the trigger, even if context hasn't changed.
    if (!isFreshMount && !contextChanged && !selectCursorTriggeredRef.current) {
      // No new request needed
      return;
    }

    // Reset selectCursor trigger flag after checking early-return condition
    if (selectCursorTriggeredRef.current) {
      selectCursorTriggeredRef.current = false;
    }

    // Get prior state for SWR
    const priorState = table.__getDataSourceState();

    // B7-SERIALIZER-FILTER-FUNCTION fix: __buildRowsQuery now validates for
    // unregistered filter functions and throws a QueryKeySerializationError
    // with code FUNCTION_VALUE when an unregistered inline function is detected.
    // We catch it here and publish error state WITHOUT calling getRows.
    let query: import('@lynellf/tablekit-core/dataSource').RowsQuery;
    try {
      query = table.__buildRowsQuery(
        sourceRef.current!.capabilities,
        cursorSelectionRef.current,
        resolvedDataVersion,
      );
    } catch (err) {
      const errorState: DataSourceState<TRow> = {
        status: 'error',
        data: priorState.data,
        error: err instanceof Error ? err : new Error(String(err)),
        refetch,
        ...getStaleMetadata(priorState),
      };
      table.__setDataSourceState(errorState);
      return;
    }

    // Build query key with source token (not the DataSource object).
    // buildQueryKey accepts (query: RowsQuery, sourceToken: string, ...)
    const sourceToken = getSourceToken(sourceRef.current);
    const queryKeyResult = buildQueryKey(
      query,
      sourceToken,
      resolvedDataVersion,
      refetchNonceRef.current,
    );

    if (!queryKeyResult.valid) {
      // B7 fix: If the query key serializer found an error, publish error state.
      const errorState: DataSourceState<TRow> = {
        status: 'error',
        data: priorState.data,
        error: queryKeyResult.error,
        refetch,
        ...getStaleMetadata(priorState),
      };
      table.__setDataSourceState(errorState);
      return;
    }

    const queryKey = queryKeyResult.key;

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

    // R3-R7 fix: Capture source identity for stale-result guard.
    // If the source prop changes after render but before effect cleanup, we need
    // to detect that the result is from the wrong source.
    const currentSourceToken = getSourceToken(sourceRef.current);

    // Create new in-flight entry
    const controller = new AbortController();
    const requestToken = Date.now(); // Simple unique token for this implementation
    inFlightRef.current = {
      key: queryKey,
      sourceToken: currentSourceToken,
      controller,
      requestToken,
      status: 'pending',
    };

    // Set processing guard to prevent recursive requests from status publication
    processingRef.current = true;

    // Publish loading state with SWR metadata
    const loadingState: DataSourceState<TRow> = {
      status: 'loading',
      data: priorState.data,
      refetch,
      ...getStaleMetadata(priorState),
    };
    if (priorState.error !== undefined) {
      loadingState.error = priorState.error;
    }
    table.__setDataSourceState(loadingState);

    // Hoist handlers so the catch (synchronous getRows throw) can reach them.
    const handleResult = (result: RowsResult<TRow>) => {
      // R3-R7 fix: Guard against stale results from replaced sources.
      // Only process if this is still the latest request AND source hasn't changed.
      const isStale =
        controller.signal.aborted ||
        inFlightRef.current?.requestToken !== requestToken ||
        inFlightRef.current?.sourceToken !== currentSourceToken;
      if (isStale) {
        if (inFlightRef.current && inFlightRef.current.requestToken === requestToken) {
          inFlightRef.current.status = 'aborted';
        }
        // R3-R7 fix: Always reset processingRef when returning early, even if aborted.
        // Otherwise subsequent requests will be blocked by the processing guard.
        processingRef.current = false;
        return;
      }

      inFlightRef.current!.status = 'resolved';

      // R2 fix: Copy cursor state from RowsResult.
      // R3-SWR-CURSOR-THENABLE fix: Only include cursor if we have at least one defined cursor value.
      // If the result omits or has null cursors, do NOT retain prior cursor metadata.
      const hasNextCursor = result.nextCursor !== undefined;
      const hasPreviousCursor = result.previousCursor !== undefined;
      // Explicit cursor state: present only when at least one cursor is defined.
      const hasCursor = hasNextCursor || hasPreviousCursor;
      const cursor: CursorState | undefined = hasCursor
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
      };
      if (result.totalRowCount !== undefined) {
        successState.totalRowCount = result.totalRowCount;
      }
      // R3-SWR-CURSOR-THENABLE fix: Only include cursor when present in result.
      // Do NOT retain prior cursor when result has no cursor.
      if (cursor !== undefined) {
        successState.cursor = cursor;
      }
      // Only include dataVersion when we have a token (undefined means "no version")
      if (acceptedToken !== undefined) {
        successState.dataVersion = acceptedToken;
      }
      // Clear processing guard before publication
      processingRef.current = false;
      table.__setDataSourceState(successState);
      table.announce(t('loadingFinished', result.rows.length));
    };

    const handleError = (err: unknown) => {
      // R3-R7 fix: Guard against stale errors from replaced sources.
      // Only process if this is still the latest request AND source hasn't changed.
      const isStale =
        controller.signal.aborted ||
        inFlightRef.current?.requestToken !== requestToken ||
        inFlightRef.current?.sourceToken !== currentSourceToken;
      if (isStale) {
        if (inFlightRef.current && inFlightRef.current.requestToken === requestToken) {
          inFlightRef.current.status = 'aborted';
        }
        // R3-R7 fix: Always reset processingRef when returning early, even if aborted.
        // Otherwise subsequent requests will be blocked by the processing guard.
        processingRef.current = false;
        return;
      }

      inFlightRef.current!.status = 'rejected';
      const errorState: DataSourceState<TRow> = {
        status: 'error',
        data: priorState.data,
        error: err instanceof Error ? err : new Error(String(err)),
        refetch,
        ...getStaleMetadata(priorState),
      };
      // Clear processing guard before publication
      processingRef.current = false;
      table.__setDataSourceState(errorState);
    };

    // Execute the request
    try {
      const result = sourceRef.current!.getRows(query, { signal: controller.signal });

      // R3-THENABLE fix: Use isPromiseLike to detect thenables (not instanceof Promise).
      // Assimilate with Promise.resolve-equivalent: chain .then/.catch handlers
      // and ensure the promise chain resolves/rejects properly even if the
      // thenable returns void from its onFulfilled handler.
      if (isPromiseLike(result)) {
        // R3-THENABLE fix: Wrap in Promise.resolve to normalize the thenable.
        // This handles custom thenables that might return void from their
        // onFulfilled handler, which would cause a synchronous TypeError otherwise.
        Promise.resolve(result).then(handleResult).catch(handleError);
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
      // R3 fix: Use cleanup generation to cancel stale microtasks.
      // Increment the generation so any pending microtask from a previous cleanup
      // will see it's no longer current and skip abort.
      const myGeneration = ++cleanupGenerationRef.current;
      const entry = inFlightRef.current;
      if (entry && entry.key === queryKey) {
        // R3 fix: Schedule microtask with generation check.
        // If Strict Mode replays the effect before this microtask runs, the new
        // effect's reattachment check will find the pending entry and return early.
        // This microtask will then see the generation mismatch and skip abort.
        queueMicrotask(() => {
          // Only abort if: same entry, still pending, and still this generation
          if (
            inFlightRef.current === entry &&
            entry.status === 'pending' &&
            cleanupGenerationRef.current === myGeneration
          ) {
            controller.abort();
            entry.status = 'aborted';
          }
        });
      } else {
        // Different key or no entry, abort immediately
        controller.abort();
      }
    };
    // R3 fix: Include source AND controlledStateVersion so the effect re-runs when:
    // 1. Source changes (null ↔ non-null transitions)
    // 2. Controlled state changes (via the subscription incrementing controlledStateVersion)
    // R3 fix: Include refetchVersion so refetch() triggers a new request
  }, [refetch, table, t, source, controlledStateVersion, refetchVersion]);

  // ─── SWR Metadata Helper ───────────────────────────────────────────────
  //
  // R3-SWR-004 fix: Carry prior metadata through loading/error states.
  // R3-SWR-CURSOR-THENABLE fix: Only retain cursor if the prior state had one.
  // totalRowCount is always retained. dataVersion is retained only when accepted.
  const getStaleMetadata = (
    priorState: DataSourceState<TRow>,
  ): Pick<DataSourceState<TRow>, 'totalRowCount' | 'cursor' | 'dataVersion'> => {
    const metadata: Pick<DataSourceState<TRow>, 'totalRowCount' | 'cursor' | 'dataVersion'> = {};
    // R3-SWR-004: Retain prior totalRowCount during SWR
    if (priorState.totalRowCount !== undefined) {
      metadata.totalRowCount = priorState.totalRowCount;
    }
    // R3-SWR-CURSOR-THENABLE fix: Retain prior cursor ONLY if the prior state
    // actually had cursor metadata (meaning the source is cursor-capable).
    // If prior cursor is undefined, do NOT include it in the metadata.
    if (priorState.cursor !== undefined) {
      metadata.cursor = priorState.cursor;
    }
    // Retain previously published data version during SWR
    if (publishedDataVersionRef.current !== UNSET_DATA_VERSION) {
      metadata.dataVersion = publishedDataVersionRef.current as string | number;
    }
    return metadata;
  };

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
  // R2 fix: Expose dataVersion for mutable data patterns.
  if (snapshot.dataVersion !== undefined) {
    result.dataVersion = snapshot.dataVersion;
  }
  // R2 fix: Expose selectCursor only for cursor-capable sources.
  if (source?.capabilities.pagination === 'cursor') {
    result.selectCursor = selectCursor;
  }

  return result;
};

/**
 * R3 fix: In-flight request entry.
 * Used for one-request-per-key guarantee including React Strict Mode effect replay.
 * A replay reattaches to the same entry rather than calling getRows again or aborting it.
 * R3-R7 fix: Includes sourceToken to guard against stale results from replaced sources.
 */
interface InFlightEntry<_TRow> {
  key: string;
  sourceToken: string;
  controller: AbortController;
  requestToken: number;
  status: 'pending' | 'resolved' | 'rejected' | 'aborted';
}
