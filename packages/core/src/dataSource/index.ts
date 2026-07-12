/**
 * @lynellf/tablekit-core/dataSource — Level 1 server orchestration.
 *
 * Subpath barrel. Consumers import via:
 *   import { buildRowsQuery, createClientDataSource } from '@lynellf/tablekit-core/dataSource'
 *
 * Mirrors the M2 per-feature subpath pattern (virtualization, resize, pinning, etc.).
 */

// ─── Types ──────────────────────────────────────────────────────────────
export type {
  MaybePromise,
  Capability,
  PaginationStrategy,
  DataSourceCapabilities,
  DataVersion,
  OffsetPagination,
  CursorPagination,
  CursorDirection,
  CursorSelection,
  PaginationWire,
  CursorState,
  CursorResult,
  DataSourceStateWithCursor,
  RowsResult,
  SerializedFilter,
  RowsQuery,
  DataSourceStatus,
  DataSourceState,
  DataSource,
  BuildRowsQueryOptions,
  CreateClientDataSourceOptions,
} from './types';

// ─── Serializer ─────────────────────────────────────────────────────────
export {
  buildRowsQuery,
  buildPaginationWire,
  validateNoUnregisteredFilterFns,
  __resetInlineFilterFnWarningForTests,
} from './query';

// ─── Query key ───────────────────────────────────────────────────────────
export {
  buildQueryKey,
  validateSerializable,
  QueryKeySerializationError,
  type QueryKeySerializationErrorCode,
  type SerializationErrorKind,
  type QueryKeyResult,
} from './queryKey';

// ─── Client data source ─────────────────────────────────────────────────
export { createClientDataSource } from './client';

// ─── Validation ─────────────────────────────────────────────────────────
export { validateModeConfiguration, __resetMixedModeWarningForTests } from './warnings';

// ─── Registry reverse lookups (re-exported from /registries) ──────────
export { nameOfSortingFn, nameOfFilterFn } from '../registries';

// ─── Placeholder rows ────────────────────────────────────────────────────
export { synthesizePlaceholderRows } from './placeholderRows';
export type { PlaceholderRow } from './placeholderRows';
