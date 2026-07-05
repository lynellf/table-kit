/**
 * @lynellf/tablekit-core/dataSource — placeholder row synthesis.
 *
 * Spec §10: "skeleton/placeholder rows are exposed so loading states are
 * perceivable." When the data source is loading and no fresh data is
 * available, the instance renders N placeholder rows so the consumer's
 * skeleton UI has a target to render against.
 */

import type { Row } from '../types';

/** A placeholder row with synthetic id and empty original. */
export interface PlaceholderRow<TRow> extends Row<TRow> {
  /** Synthetic id prefixed to avoid collision with real row ids. */
  readonly id: string;
  /** Index in the placeholder set. */
  readonly index: number;
  /** Empty placeholder; renderer uses this for skeleton UI. */
  readonly original: TRow;
  /** Marker for consumer renderers to detect placeholder rows. */
  readonly isPlaceholder: true;
}

/**
 * Build N placeholder rows. `getRowId` is NOT consulted (placeholder ids
 * are deterministic and prefixed to avoid collision with real ids).
 */
export const synthesizePlaceholderRows = <TRow>(count: number): PlaceholderRow<TRow>[] => {
  if (count <= 0) return [];
  const rows: PlaceholderRow<TRow>[] = [];
  for (let i = 0; i < count; i++) {
    const row: PlaceholderRow<TRow> = {
      id: `__placeholder_${i}`,
      index: i,
      // biome-ignore lint/suspicious/noExplicitAny: empty placeholder; renderer is consumer's skeleton
      original: {} as TRow,
      isPlaceholder: true as const,
      // biome-ignore lint/suspicious/noExplicitAny: intentional stub for self-referential row
      getVisibleCells: () => [] as unknown as ReturnType<Row<TRow>['getVisibleCells']>,
      // biome-ignore lint/suspicious/noExplicitAny: stub prop getter
      getRowProps: (consumerProps?: Record<string, unknown>) => {
        // Filter out key from consumer props to avoid React JSX spread warning.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _k, ...rest } = (consumerProps ?? {}) as Record<string, unknown>;
        return { 'data-placeholder': 'true', role: 'row', ...rest };
      },
    };
    rows.push(row);
  }
  return rows;
};
