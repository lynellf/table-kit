/**
 * @lynellf/tablekit-pivot/pivotTable — pivot-specific announcer messages (spec §9.8 + §10).
 *
 * All messages route through the `Announcer` seam from M1 (spec §4.3). M4 ships
 * hardcoded English strings; i18n via `messages` map is M6.
 */

import type { Announcer, FieldValue, PivotSortingState } from '../types';

export const announceExpansion = (
  announcer: Announcer,
  path: FieldValue[],
  wasExpanded: boolean,
  childCount: number | null,
): void => {
  if (wasExpanded) {
    announcer.announce(`Collapsed ${path[path.length - 1] ?? ''}.`, 'polite');
  } else {
    const label = path[path.length - 1] ?? '';
    const count = childCount ?? 0;
    announcer.announce(
      `Expanded ${String(label)}, ${count} ${count === 1 ? 'row' : 'rows'}.`,
      'polite',
    );
  }
};

export const announceTotals = (_announcer: Announcer): void => {
  // Grand-total row announcement handled by the consumer via a footer aria-label.
  // Per spec §9.8 the footer row is marked aria-label="Grand total row".
};

export const announceSorting = (announcer: Announcer, sorting: PivotSortingState): void => {
  if (sorting.length === 0) return;
  const first = sorting[0]!;
  const direction = first.desc ? 'descending' : 'ascending';
  if (first.by === 'label') {
    announcer.announce(`Sorted by label ${direction}.`, 'polite');
  } else {
    announcer.announce(`Sorted by measure ${direction}.`, 'polite');
  }
};
