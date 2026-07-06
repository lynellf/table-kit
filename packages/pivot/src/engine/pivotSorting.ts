/**
 * @lynellf/tablekit-pivot/engine — pivot sorting application (spec §9.7).
 *
 * Pivot sorting manifests as **group ordering**, applied per level within each
 * parent. Two modes:
 *  - `by: 'label'` (default): order groups by their label (using the field's
 *    `sortComparator` if provided; otherwise JS default).
 *  - `by: 'measure'`: order groups by a measure value (optionally under a
 *    specific column path).
 *
 * The engine applies sorting during tree construction; the React adapter
 * dispatches `setPivotSorting` and the engine re-derives on the next compute.
 */

import type { FieldValue, MeasureId, PivotConfig, PivotRowNode, PivotSortingState } from '../types';

/** Resolve a comparator name to a comparator function. Returns undefined if the name is unknown. */
type ComparatorFn = (a: FieldValue, b: FieldValue) => number;

const DEFAULT_LABEL_COMPARATOR: ComparatorFn = (a, b) => {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

// NOTE: comparatorForField is not yet wired (M6). Currently using DEFAULT_LABEL_COMPARATOR.

/**
 * Apply pivot sorting to the children of a single parent node at one level.
 * Mutates `children` in place (re-orders the array).
 */
export const applyPivotSortingAtLevel = <TRow>(
  children: PivotRowNode<TRow>[],
  level: number,
  pivotSorting: PivotSortingState,
  _pivotConfig: PivotConfig<TRow>,
  getMeasureValue: (
    node: PivotRowNode<TRow>,
    measureId: MeasureId,
    columnPath?: FieldValue[],
  ) => number,
  _registryLookup: (name: string) => ComparatorFn | undefined,
): void => {
  const rules = pivotSorting.filter((s) => s.level === level);
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (rule.by === 'label') {
      const comparator = DEFAULT_LABEL_COMPARATOR;
      const sign = rule.desc ? -1 : 1;
      children.sort((a, b) => sign * comparator(a.label, b.label));
    } else {
      // by: 'measure'
      const sign = rule.desc ? -1 : 1;
      children.sort((a, b) => {
        const av = getMeasureValue(a, rule.measureId, rule.columnPath);
        const bv = getMeasureValue(b, rule.measureId, rule.columnPath);
        if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
        if (Number.isNaN(av)) return 1;
        if (Number.isNaN(bv)) return -1;
        return sign * (av - bv);
      });
    }
  }
};
