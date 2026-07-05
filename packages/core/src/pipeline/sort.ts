/**
 * @lynellf/tablekit-core — sort pipeline stage.
 *
 * Pure function. Returns a new array sorted by the active `SortingState`.
 * Multi-sort: when multiple items are present, sort by index 0 first, then
 * index 1, etc. Stable sort (Array.prototype.sort is stable in ES2019+).
 *
 * Skipped when `options.manualSorting === true`.
 */

import type { Column } from '../columns';
import { getSortingFn } from '../registries/sorting';
import type { SortItem, SortingFn } from '../types';

type AnyRow = Record<string, unknown>;

export interface SortStageOptions<TRow> {
  rows: TRow[];
  sorting: SortItem[];
  columns: Array<Column<TRow, unknown>>;
}

type Comparator<TRow> = (a: TRow, b: TRow) => number;

const buildComparator = <TRow>(
  item: SortItem,
  columnsById: Map<string, Column<TRow, unknown>>,
): Comparator<TRow> | undefined => {
  const column = columnsById.get(item.id);
  if (!column) return undefined;
  const fn = resolveSortingFn<TRow>(column);
  if (!fn) return undefined;
  const direction = item.desc ? -1 : 1;
  return (a, b) => direction * (fn(a as unknown as AnyRow, b as unknown as AnyRow, column.id) ?? 0);
};

const resolveSortingFn = <TRow>(column: Column<TRow, unknown>): SortingFn<AnyRow> | undefined => {
  const def = column.def;
  if (typeof def.sortingFn === 'function') {
    return def.sortingFn as SortingFn<AnyRow>;
  }
  if (typeof def.sortingFn === 'string') {
    try {
      return getSortingFn<AnyRow>(def.sortingFn);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Public entry point.
 */
export const sortRows = <TRow>(opts: SortStageOptions<TRow>): TRow[] => {
  if (opts.sorting.length === 0) return opts.rows;

  const columnsById = new Map<string, Column<TRow, unknown>>();
  for (const col of opts.columns) columnsById.set(col.id, col);

  // Build comparator chain. Each SortItem contributes one comparator.
  // Array.prototype.sort is stable since ES2019.
  const comparators = opts.sorting
    .map((item) => buildComparator(item, columnsById))
    .filter((c): c is Comparator<TRow> => c !== undefined);

  if (comparators.length === 0) return opts.rows;
  return [...opts.rows].sort((a, b) => {
    for (const cmp of comparators) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });
};

/**
 * Sort spec toggle helper. Given a column id and the current sorting state,
 * compute the next state per the toggle cycle:
 *   - none → asc (or desc if sortDescFirst)
 *   - asc  → desc
 *   - desc → none (if enableSortingRemoval) / asc (otherwise)
 *
 * Multi-sort: when `append` is true, append to the array instead of replacing.
 * The caller is responsible for plumbing `append` (Shift+click); this helper
 * just computes the next array.
 */
export const toggleSortItem = (
  sorting: SortItem[],
  columnId: string,
  opts: {
    sortDescFirst?: boolean;
    enableSortingRemoval?: boolean;
    append?: boolean;
  } = {},
): SortItem[] => {
  const sortDescFirst = opts.sortDescFirst ?? false;
  const enableSortingRemoval = opts.enableSortingRemoval ?? true;
  const append = opts.append ?? false;

  const idx = sorting.findIndex((s) => s.id === columnId);
  if (idx === -1) {
    // Not present → add at the end as asc (or desc).
    const next: SortItem = { id: columnId, desc: sortDescFirst };
    return append || sorting.length === 0 ? [...sorting, next] : [next];
  }
  const current = sorting[idx]!;
  if (!current.desc) {
    // asc → desc
    const nextArr = [...sorting];
    nextArr[idx] = { id: current.id, desc: true };
    return nextArr;
  }
  // desc → none (if removal enabled) / asc
  if (enableSortingRemoval) {
    const nextArr = [...sorting];
    nextArr.splice(idx, 1);
    return nextArr;
  }
  const nextArr = [...sorting];
  nextArr[idx] = { id: current.id, desc: false };
  return nextArr;
};
