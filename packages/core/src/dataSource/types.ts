/**
 * @lynellf/tablekit-core/dataSource — public types for Level 1 server orchestration.
 *
 * Spec §5.1 (RowsQuery shape), §5.2 (DataSource interface), §5.3 (mixed-mode trap).
 * Mirrors the spec verbatim where the spec gives a shape; introduces `MaybePromise<T>`
 * as a shared utility used by `createClientDataSource` and the React hook.
 */

/** A value that may be a promise of T or T directly. */
export type MaybePromise<T> = T | Promise<T>;

/** Per-concern capability: 'client' (resolved locally) or 'server' (resolved remotely). */
export type Capability = 'client' | 'server';

/** Capabilities per concern. Spec §5.2: every concern is independently configurable. */
export interface DataSourceCapabilities {
  sort: Capability;
  filter: Capability;
  paginate: Capability;
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
  pagination?: import('../types').PaginationState;
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
 */
export interface DataSource<TRow> {
  capabilities: DataSourceCapabilities;
  getRows(
    q: RowsQuery,
    ctx: { signal: AbortSignal },
  ): MaybePromise<{ rows: TRow[]; totalRowCount?: number }>;
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
}
