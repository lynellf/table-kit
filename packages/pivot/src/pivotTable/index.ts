/**
 * @lynellf/tablekit-pivot/pivotTable — public barrel.
 *
 * Subpath import:
 *   import { createPivotTable } from '@lynellf/tablekit-pivot/pivotTable';
 */

export { createPivotTable } from './factory';
export { getVisibleRows } from './visibleRows';
export { getHeaderRows } from './headerRows';
export type { HeaderEntry } from './headerRows';
export {
  getBodyProps,
  getFooterProps,
  getGridProps,
  getHeaderProps,
  getRowHeaderProps,
  getRowProps,
  getToggleExpandedProps,
  getTotalsColumnProps,
} from './propGetters';
export { announceExpansion, announceSorting, announceTotals } from './announcer';
