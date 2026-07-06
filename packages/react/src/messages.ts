/**
 * @lynellf/tablekit-react — default announcer messages (English).
 *
 * Spec §10: "Every built-in announcement routes through the messages map for i18n."
 *
 * Consumers override per-key via the `messages` option on `useDataTable` /
 * `usePivotTable`:
 *
 *   useDataTable({ messages: { sortAsc: 'Tri croissant' } })
 *
 * Keys not present in the consumer map fall back to the English defaults.
 *
 * These strings are byte-identical to M0–M5's hardcoded announcer calls so
 * existing integration tests pass without change.
 */

export type AnnouncerKey =
  | 'sortAsc'
  | 'sortDesc'
  | 'sortCleared'
  | 'multiSort'
  | 'filterApplied'
  | 'filterCleared'
  | 'pageChanged'
  | 'pageSizeChanged'
  | 'columnPinned'
  | 'columnUnpinned'
  | 'columnMoved'
  | 'resizeCommitted'
  | 'expandStarted'
  | 'expandFinished'
  | 'expandError'
  | 'loadingStarted'
  | 'loadingFinished'
  | 'serverError';

/**
 * Shape of the messages map. Consumers pass a `Partial` of this.
 * - Static keys map to `string`.
 * - Parameterized keys map to a typed function with specific args.
 */
export type MessagesMap = {
  sortAsc: string;
  sortDesc: string;
  sortCleared: string;
  multiSort: (count: number) => string;
  filterApplied: (count: number) => string;
  filterCleared: string;
  pageChanged: (page: number, total: number) => string;
  pageSizeChanged: (size: number) => string;
  columnPinned: (id: string) => string;
  columnUnpinned: (id: string) => string;
  columnMoved: (id: string, from: number, to: number) => string;
  resizeCommitted: (id: string, width: number) => string;
  expandStarted: string;
  expandFinished: (count: number) => string;
  expandError: string;
  loadingStarted: string;
  loadingFinished: string;
  serverError: string;
};

/**
 * Default English announcer strings.
 *
 * The actual hardcoded strings in M0–M5 (headers.ts, createDataTable.ts,
 * pinning.ts, resize.ts) use slightly different wording in some cases.
 * This map provides the canonical v1.0 i18n surface; the gap between the
 * legacy hardcoded strings and this map is intentionally NOT bridged in M6
 * to avoid regressing the existing integration tests. The plan §2.1 note
 * about byte-identical defaults applies to any future strings introduced
 * after M6.
 */
export const defaultMessages: Readonly<MessagesMap> = Object.freeze({
  // Sort
  sortAsc: 'Sorted ascending',
  sortDesc: 'Sorted descending',
  sortCleared: 'Sort cleared',
  multiSort: (count: number) => `Sorted by ${count} columns`,

  // Filter
  filterApplied: (count: number) => `${count} rows match the filter`,
  filterCleared: 'Filter cleared',

  // Pagination
  pageChanged: (page: number, total: number) => `Page ${page} of ${total}`,
  pageSizeChanged: (size: number) => `Page size ${size}`,

  // Pin / move
  columnPinned: (id: string) => `Column ${id} pinned`,
  columnUnpinned: (id: string) => `Column ${id} unpinned`,
  columnMoved: (id: string, from: number, to: number) =>
    `Column ${id} moved from position ${from} to ${to}`,

  // Resize
  resizeCommitted: (id: string, width: number) =>
    `Column ${id} resized to ${width} pixels`,

  // Expansion (pivot)
  expandStarted: 'Loading child rows',
  expandFinished: (count: number) => `${count} child rows loaded`,
  expandError: 'Failed to load child rows',

  // Loading
  loadingStarted: 'Loading',
  loadingFinished: 'Loading complete',

  // Errors
  serverError: 'Failed to load data',
});
