/**
 * @lynellf/tablekit-core/dataSource — public types for Level 1 server orchestration.
 *
 * Spec §5.1 (RowsQuery shape), §5.2 (DataSource interface), §5.3 (mixed-mode trap).
 * Mirrors the spec verbatim where the spec gives a shape; introduces `MaybePromise<T>`
 * as a shared utility used by `createClientDataSource` and the React hook.
 *
 * v2.0.0: Added DataVersion, OffsetPagination, CursorPagination, and pagination strategy.
 */

/** A value that may be a promise of T or T directly. */
export type MaybePromise<T> = T | Promise<T>;

/** Per-concern capability: 'client' (resolved locally) or 'server' (resolved remotely). */
export type Capability = 'client' | 'server';

/**
 * Pagination strategy used by the data source.
 * - 'offset': uses page-based pagination (pageIndex, pageSize).
 * - 'cursor': uses cursor-based pagination (cursor, direction, limit).
 */
export type PaginationStrategy = 'offset' | 'cursor';

/**
 * Capabilities per concern. Spec §5.2: every concern is independently configurable.
 * v2.0.0: Added `pagination` strategy field.
 */
export interface DataSourceCapabilities {
  sort: Capability;
  filter: Capability;
  paginate: Capability;
  /** Pagination strategy. Default: 'offset'. 'cursor' requires server-side support. */
  pagination?: PaginationStrategy;
}

// ─── Data identity (v2.0.0) ─────────────────────────────────────────────────────

/**
 * Data version escape hatch for mutable data patterns.
 *
 * By default, the engine treats data as immutable: same reference = no update.
 * When data is mutated in-place (common in live-updating datasets), consumers
 * can publish a new version token to signal that the data changed even if
 * the array reference is unchanged.
 *
 * `DataVersion` can be:
 * - A string/number token (consumer-provided version identifier)
 * - A `getDataVersion: () => string | number` function (derived version)
 *
 * v2.0.0: Added as part of the data identity escape hatch.
 */
export interface DataVersion<TRow = unknown> {
  /**
   * Static version token. When provided, the engine compares this token
   * instead of the data array reference to determine if an update occurred.
   */
  version?: string | number;
  /**
   * Function to derive the version token from the data.
   * Called with the current data array; return value is compared to the
   * previous version to detect changes.
   */
  getVersion?: (data: TRow[]) => string | number;
}

// ─── Pagination wire types (v2.0.0) ───────────────────────────────────────────────

/**
 * Offset-based pagination query. Used when `paginationStrategy === 'offset'`.
 * This is the traditional page-index/page-size model.
 */
export interface OffsetPagination {
  type: 'offset';
  /** Zero-based page index. */
  offset: number;
  /** Number of rows per page. */
  limit: number;
}

/**
 * Cursor-based pagination query. Used when `paginationStrategy === 'cursor'`.
 * The server returns `nextCursor` and/or `previousCursor` in the response,
 * which the consumer passes back on subsequent requests.
 */
export interface CursorPagination {
  type: 'cursor';
  /**
   * The cursor from the previous response (or `null`/`undefined` for the first request).
   * Direction determines which page to fetch relative to the cursor.
   */
  cursor: string | null | undefined;
  /**
   * Pagination direction. 'next' fetches rows after the cursor;
   * 'previous' fetches rows before the cursor.
   */
  direction?: 'next' | 'previous';
  /** Number of rows to fetch. */
  limit: number;
}

/** Discriminated union of pagination wire types. */
export type PaginationWire = OffsetPagination | CursorPagination;

/**
 * Cursor state exposed by the data source.
 * Consumers use this to store the current cursor for subsequent requests.
 */
export interface CursorState {
  /** Cursor for fetching the next page. */
  nextCursor?: string | null;
  /** Cursor for fetching the previous page. */
  previousCursor?: string | null;
}

/**
 * Cursor result from the data source response.
 * Contains the cursors for navigating to adjacent pages.
 */
export interface CursorResult {
  /** Cursor to fetch the next page of results. */
  nextCursor?: string | null;
  /** Cursor to fetch the previous page of results. */
  previousCursor?: string | null;
}

/**
 * Extended data source state with cursor support.
 * Used when `paginationStrategy === 'cursor'`.
 */
export interface DataSourceStateWithCursor<TRow> extends DataSourceState<TRow> {
  /** Cursor state for navigating cursor-based pagination. */
  cursor?: CursorState;
}

/**
 * Extended rows result with cursor information.
 * Used when `paginationStrategy === 'cursor'`.
 */
export interface RowsResult<TRow> {
  rows: TRow[];
  totalRowCount?: number;
  /** Cursor for the next page. Present only when there are more rows. */
  nextCursor?: string | null;
  /** Cursor for the previous page. Present only when paginating backwards. */
  previousCursor?: string | null;
}

/**
 * A filter item as it travels in `RowsQuery` (spec §5.1). The `filterFn` field carries
 * the registry **name** of the filter predicate; the consumer's server looks the name
 * up in their own registry. Inline functions MUST NOT cross the wire.
 */
export interface SerializedFilter {
  /** Column id this filter applies to. */
  id: string;
  /** Filter value (opaque to core; the consumer/server contract interprets it). */
  value: unknown;
  /** Registry name of the predicate. Omitted when the column's filterFn is the default. */
  filterFn?: string;
}

/**
 * The outbound query spec (spec §5.1). Fully JSON-serializable.
 * - `sorting` is included regardless of capability (the server may apply it OR not).
 * - `filters` is included regardless of capability (the server may apply it OR not).
 * - `pagination` is included only when `capabilities.paginate === 'server'`.
 *
 * Server-side consumers resolve only the concerns marked `'server'`; client-side
 * consumers resolve the rest locally. The wire shape is identical.
 */
export interface RowsQuery {
  sorting: import('../types').SortItem[];
  filters: SerializedFilter[];
  /**
   * Discriminated pagination wire type. When `capabilities.paginate === 'server'`:
   * - 'offset' strategy: `{ type: 'offset', offset, limit }`
   * - 'cursor' strategy: `{ type: 'cursor', cursor, direction?, limit }`
   *
   * v2.0.0: Changed from `PaginationState` to `PaginationWire` discriminated union.
   */
  pagination?: PaginationWire;
}

/**
 * Status state machine for `useDataSource`. Spec §5.2 lists three states
 * (`idle | loading | error`); the four-state model adds `success` to
 * distinguish "no fetch in flight, no data" (`idle`) from "previous fetch
 * completed, data is fresh" (`success`). `getRowModel()` reads this to
 * decide between `data` and placeholder rows.
 */
export type DataSourceStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * The state exposed by `useDataSource` (spec §5.2). `data` is non-null iff
 * `status === 'success'`; `error` is non-null iff `status === 'error'`.
 * `refetch()` re-runs the current query with a fresh AbortController.
 */
export interface DataSourceState<TRow> {
  status: DataSourceStatus;
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
}

/**
 * The Level 1 data source interface (spec §5.2). The consumer implements
 * `getRows` against their API; the library handles abort, refetch, and
 * `RowsQuery` serialization.
 *
 * v2.0.0: Supports cursor-based pagination via the RowsResult interface.
 */
export interface DataSource<TRow> {
  capabilities: DataSourceCapabilities;
  getRows(q: RowsQuery, ctx: { signal: AbortSignal }): MaybePromise<RowsResult<TRow>>;
}

/**
 * Options passed to `buildRowsQuery`. `capabilities` is the source of truth for
 * which concerns are in scope; `defaultFilterFn` is the registry name stripped
 * from outbound filters when the column's `filterFn` resolves to it (saves bytes).
 */
export interface BuildRowsQueryOptions {
  capabilities: DataSourceCapabilities;
  /** The default filter fn name to strip from outbound filters. Defaults to 'equals'. */
  defaultFilterFn?: string;
  /**
   * If true, the consumer has confirmed they understand the mixed-mode trap
   * (`paginate: 'server'` with client-side sort/filter applies within the page).
   */
  allowWithinPageOperations?: boolean;
}

/** Options for `createClientDataSource`. */
export interface CreateClientDataSourceOptions<TRow> {
  /** Override `capabilities`. Default: all 'client'. */
  capabilities?: Partial<DataSourceCapabilities>;
  /** Required for server-paginated client sources: total row count when paginate === 'server'. */
  totalRowCount?: number;
  /** Override `getRowId`. Default: `defaultGetRowId` (dev fallback). */
  getRowId?: (row: TRow, index: number) => string;
  /** v2.0.0: Data version for mutable data patterns. */
  dataVersion?: DataVersion<TRow>;
}
