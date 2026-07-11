/**
 * @lynellf/tablekit-pivot/serialize — `buildPivotQuery` (spec §13).
 *
 * Pure PivotConfig → PivotQuery serializer. Strips inline forms when crossing
 * a boundary (M5 worker/server); M4's main-thread engine accepts inline forms.
 *
 * Used by the React hook (phase 5) when the engine option changes to a
 * worker/server engine (M5 plumbing). For phase 6, the serializer is exported
 * for consumers building their own worker engines.
 */

import type {
  Aggregator,
  FieldRef,
  InlinePivotFilter,
  PivotConfig,
  PivotExpansionState,
  PivotQuery,
  PivotSortingState,
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
  TotalsConfig,
} from '../types';

export interface BuildPivotQueryOptions {
  /** Strip inline forms (default: false for main-thread; M5 sets true). */
  serialize?: boolean;
  /** Already-resolved expandedPaths (RowPathKey[]). */
  expandedPaths?: string[];
}

const serializeFieldRef = <TRow>(ref: FieldRef<TRow>): SerializedFieldRef => {
  if (typeof ref === 'string') return { field: ref };
  const out: SerializedFieldRef = { field: ref.field };
  if (ref.label !== undefined) out.label = ref.label;
  if (ref.sortComparator !== undefined) out.sortComparator = ref.sortComparator;
  return out;
};

const serializeMeasure = <TRow>(m: import('../types').MeasureDef<TRow>): SerializedMeasureDef => ({
  id: m.id,
  ...(m.field !== undefined ? { field: m.field } : {}),
  aggregator: typeof m.aggregator === 'string' ? m.aggregator : 'sum',
  ...(m.label !== undefined ? { label: m.label } : {}),
  ...(m.format !== undefined ? { format: m.format } : {}),
});

const serializeFilter = <TRow>(
  f: import('../types').PivotFilter<TRow>,
  serialize: boolean,
): SerializedPivotFilter | InlinePivotFilter<TRow> | null => {
  if ('predicateRef' in f)
    return { predicateRef: f.predicateRef, args: 'args' in f ? f.args : undefined };
  if ('predicate' in f) {
    if (serialize) return null; // strip inline predicates when serializing
    return { predicate: f.predicate }; // main-thread accepts inline
  }
  return {
    field: f.field,
    op: f.op as 'equals' | 'in' | 'notIn' | 'range' | 'contains',
    value: f.value,
  };
};

export const buildPivotQuery = <TRow>(
  data: TRow[],
  pivot: PivotConfig<TRow>,
  expanded: PivotExpansionState,
  sorting: PivotSortingState,
  totals: TotalsConfig,
  opts: BuildPivotQueryOptions = {},
): PivotQuery<TRow> => {
  const serialize = opts.serialize === true;

  const filters = (pivot.filters ?? [])
    .map((f) => serializeFilter(f, serialize))
    .filter((f): f is SerializedPivotFilter => f !== null);

  const expandedPaths =
    opts.expandedPaths ??
    Object.entries(expanded)
      .filter(([, v]) => v)
      .map(([k]) => k);

  return {
    rows: data,
    rowsFieldRef: pivot.rows.map(serializeFieldRef),
    columnsFieldRef: pivot.columns.map(serializeFieldRef),
    measures: pivot.measures.map(serializeMeasure),
    filters,
    totals,
    expandedPaths,
    pivotSorting: sorting,
    ...(serialize
      ? {}
      : {
          inlineAccessors: {
            rows: pivot.rows.map((r) =>
              typeof r === 'string'
                ? { field: r }
                : { field: r.field, ...(r.accessor ? { accessor: r.accessor } : {}) },
            ),
            columns: pivot.columns.map((r) =>
              typeof r === 'string'
                ? { field: r }
                : { field: r.field, ...(r.accessor ? { accessor: r.accessor } : {}) },
            ),
            measures: pivot.measures.filter((m) => m.accessor !== undefined),
            aggregators: pivot.measures.reduce<Record<string, Aggregator>>((out, measure) => {
              if (typeof measure.aggregator === 'object' && measure.aggregator !== null) {
                out[measure.id] = measure.aggregator;
              }
              return out;
            }, {}),
          },
        }),
  };
};
