# Phase 3 — Main-Thread Engine + Result Model + Lazy Expansion + Pivot Sorting

**Goal:** Ship the `AggregationEngine<TRow>` interface implementation — `createMainThreadEngine()` — with the `PivotResult` builder (column hierarchy + `leafColumns` flattening including totals column, row tree with lazy expansion, totals via aggregator `merge`), and the `PivotSortingState` application (sort-by-label + sort-by-measure). This is the load-bearing seam for phase 4 (factory), phase 5 (React hook), and M5 (worker + server engines plug in via the same interface).

After this phase:

- `createMainThreadEngine()` is exported from `@lynellf/tablekit-pivot/engine`.
- The engine implements `compute(q, ctx)` returning the full `PivotResult` and `computeChildren(path, q, ctx)` materializing children of an aggregated node.
- Lazy expansion: `compute` returns level-0 groups materialized + unexpanded subtrees aggregated (no enumeration). `computeChildren` is called to expand.
- `PivotResultCache` memoization keyed on `(rows ref, query)` for the §12 perf budget.
- Totals computed via aggregator `merge` (not re-scan).
- Pivot sorting applied per level: `by: 'label'` (uses field's `sortComparator`) and `by: 'measure'` (under a column path).
- `pnpm verify` exits 0; new tests pass (~40-55).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/pivot/src/engine/mainThread.ts` | `createMainThreadEngine()` factory + `MainThreadEngineImpl` class |
| `packages/pivot/src/engine/treeBuilder.ts` | `PivotResult` builder: column hierarchy, leafColumns flattening (with totals column), row tree with lazy expansion |
| `packages/pivot/src/engine/pivotSorting.ts` | `PivotSortingState` application (sort-by-label, sort-by-measure) per level |
| `packages/pivot/src/engine/cache.ts` | `PivotResultCache` memoization keyed on `(rows ref, query)` |
| `packages/pivot/src/engine/index.ts` | Replace stub with engine barrel |
| `packages/pivot/src/__tests__/engine.test.ts` | Engine compute tests (small datasets, multiple hierarchies, multiple measures) |
| `packages/pivot/src/__tests__/lazyExpansion.test.ts` | Lazy expansion semantics: `expandedPaths = []` materializes only level-0; `computeChildren` materializes on demand |
| `packages/pivot/src/__tests__/pivotSorting.test.ts` | Sort-by-label, sort-by-measure, multi-level sort, no-sort |
| `packages/pivot/src/__tests__/totals.test.ts` | Grand-total row, grand-total column, totals via `merge`, totals column position, totals column pinning default |
| `packages/pivot/bench/main-thread.bench.ts` | §12 advisory perf bench: re-pivot on 50k / 100k / 200k rows; logs timing |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/pivot/package.json` | Add `bench` script: `vitest bench --run main-thread.bench` (reuses vitest's bench mode) |
| `packages/pivot/src/serialize/index.ts` | Stub-only (impl in phase 6); no change |

No other source files change in this phase. The factory (phase 4) consumes the engine; the React hook (phase 5) wires it into `useEffect`.

---

## 3. File contents (key files)

### 3.1 `packages/pivot/src/engine/cache.ts`

```ts
/**
 * @lynellf/tablekit-pivot/engine — query result cache.
 *
 * Memoizes engine `compute` results to meet the §12 perf budget. Keyed on:
 *   - `rows` reference (the source dataset)
 *   - serialized `query` (rows / columns / measures / filters / totals / expandedPaths / pivotSorting)
 *
 * Invalidation: cache miss → recompute. The reference-keyed approach matches M2's
 * `RowModelCache` pattern: consumers mutating `rows` in place get stale results
 * until they pass a new array reference. (Same caveat documented in M2.)
 */

import type { PivotQuery, PivotResult } from '../types';

export interface PivotResultCacheKey {
  rowsRef: unknown;
  queryJson: string;
}

export class PivotResultCache<TRow = unknown> {
  private cache: Map<string, PivotResult<TRow>> = new Map();

  private key(rowsRef: unknown, query: PivotQuery<TRow>): string {
    // Serialize the query to a stable JSON string. Skip the `rows` field
    // (keyed separately by reference); keep the rest.
    const { rows: _rows, ...rest } = query;
    const queryJson = JSON.stringify(rest, (_key, value) => {
      if (typeof value === 'function') return undefined; // never serialize fns
      return value;
    });
    return `${(rowsRef as object | null | undefined) === rowsRef ? 'r' : 'r'}:${queryJson}`;
  }

  get(rowsRef: unknown, query: PivotQuery<TRow>): PivotResult<TRow> | undefined {
    return this.cache.get(this.key(rowsRef, query));
  }

  set(rowsRef: unknown, query: PivotQuery<TRow>, result: PivotResult<TRow>): void {
    this.cache.set(this.key(rowsRef, query), result);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### 3.2 `packages/pivot/src/engine/pivotSorting.ts`

```ts
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

import type {
  FieldRef,
  FieldValue,
  MeasureId,
  PivotConfig,
  PivotRowNode,
  PivotSortingState,
} from '../types';

/** Resolve a comparator name to a comparator function. Returns undefined if the name is unknown. */
type ComparatorFn = (a: FieldValue, b: FieldValue) => number;

const DEFAULT_LABEL_COMPARATOR: ComparatorFn = (a, b) => {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

const comparatorForField = (
  fieldRef: FieldRef,
  registryLookup: (name: string) => ComparatorFn | undefined,
): ComparatorFn => {
  if (typeof fieldRef === 'string') return DEFAULT_LABEL_COMPARATOR;
  if (fieldRef.sortComparator) {
    const fromRegistry = registryLookup(fieldRef.sortComparator);
    return fromRegistry ?? DEFAULT_LABEL_COMPARATOR;
  }
  return DEFAULT_LABEL_COMPARATOR;
};

/**
 * Apply pivot sorting to the children of a single parent node at one level.
 * Mutates `children` in place (re-orders the array).
 */
export const applyPivotSortingAtLevel = <TRow>(
  children: PivotRowNode<TRow>[],
  level: number,
  pivotSorting: PivotSortingState,
  pivotConfig: PivotConfig<TRow>,
  getMeasureValue: (node: PivotRowNode<TRow>, measureId: MeasureId, columnPath?: FieldValue[]) => number,
  registryLookup: (name: string) => ComparatorFn | undefined,
): void => {
  const rules = pivotSorting.filter((s) => s.level === level);
  if (rules.length === 0) return;

  for (const rule of rules) {
    if (rule.by === 'label') {
      const fieldRef = pivotConfig.rows[level];
      if (!fieldRef) continue;
      const comparator = rule.comparator
        ? (registryLookup(rule.comparator) ?? DEFAULT_LABEL_COMPARATOR)
        : comparatorForField(fieldRef, registryLookup);
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
```

### 3.3 `packages/pivot/src/engine/treeBuilder.ts`

```ts
/**
 * @lynellf/tablekit-pivot/engine — PivotResult builder.
 *
 * Spec §9.4: column hierarchy + leafColumns flattening (with totals column);
 * row tree with lazy expansion; totals via aggregator merge.
 *
 * Lazy expansion (§9.5):
 *  - When `expandedPaths` does NOT contain a path, the engine returns an
 *    aggregated `PivotRowNode` with `children = undefined` and
 *    `childState = 'notLoaded'`. The aggregated values are present so the
 *    row totals + grand totals are correct.
 *  - When `expandedPaths` contains a path, the engine enumerates children.
 *  - Grandchildren of expanded paths are still aggregated (not enumerated)
 *    unless those paths are also in `expandedPaths`. This keeps memory
 *    proportional to what's visible.
 */

import type {
  Aggregator,
  FieldRef,
  FieldValue,
  LeafColumnId,
  MeasureDef,
  PivotColumnNode,
  PivotConfig,
  PivotLeafColumn,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  RowPathKey,
} from '../types';
import { getAggregator } from '../aggregators';
import { applyPivotSortingAtLevel } from './pivotSorting';

// ─────────────────────────────────────────────────────────────────────────────
// Field resolution
// ─────────────────────────────────────────────────────────────────────────────

const resolveFieldAccessor = <TRow>(
  ref: FieldRef<TRow>,
  inlineAccessor: ((row: TRow) => FieldValue) | undefined,
): (row: TRow) => FieldValue => {
  if (inlineAccessor) return inlineAccessor;
  if (typeof ref === 'string') {
    return (row: TRow) => (row as Record<string, unknown>)[ref] as FieldValue;
  }
  if (ref.accessor) return ref.accessor;
  return (row: TRow) => (row as Record<string, unknown>)[ref.field] as FieldValue;
};

const resolveMeasureAccessor = <TRow>(
  def: MeasureDef<TRow>,
  inlineAccessor: ((row: TRow) => unknown) | undefined,
): ((row: TRow) => unknown) => {
  if (inlineAccessor) return inlineAccessor;
  if (def.accessor) return def.accessor;
  if (def.field) return (row: TRow) => (row as Record<string, unknown>)[def.field];
  throw new Error(`[tablekit-pivot] MeasureDef "${def.id}" requires either \`field\` or \`accessor\`.`);
};

const resolveMeasureAggregator = (
  def: MeasureDef,
  inlineAggregator: Aggregator | undefined,
): Aggregator => {
  if (inlineAggregator) return inlineAggregator;
  const name = def.aggregator ?? 'sum';
  const registered = getAggregator(name);
  if (!registered) {
    throw new Error(
      `[tablekit-pivot] MeasureDef "${def.id}" references unknown aggregator "${String(name)}". ` +
        `Register it via registerAggregator() before constructing the engine.`,
    );
  }
  return registered;
};

// ─────────────────────────────────────────────────────────────────────────────
// Row path key serialization
// ─────────────────────────────────────────────────────────────────────────────

export const rowPathKeyOf = (path: FieldValue[]): RowPathKey => JSON.stringify(path);

// ─────────────────────────────────────────────────────────────────────────────
// Column hierarchy
// ─────────────────────────────────────────────────────────────────────────────

const buildColumnRoot = <TRow>(
  query: PivotQuery<TRow>,
  totalsConfig: PivotConfig<TRow>['totals'],
): { columnRoot: PivotColumnNode; leafColumns: PivotLeafColumn<TRow>[] } => {
  const leafColumns: PivotLeafColumn<TRow>[] = [];

  const buildLevel = (
    fieldRefs: Array<{ field: string }>,
    path: FieldValue[],
  ): PivotColumnNode => {
    if (fieldRefs.length === 0) {
      // Leaf level: one leaf per measure.
      const leaves: PivotLeafColumn<TRow>[] = query.measures.map((m) => ({
        id: `${JSON.stringify(path)}::${m.id}`,
        path: [...path],
        measureId: m.id,
        isTotal: false,
        size: 100,
        header: m.label ?? m.id,
      }));
      leafColumns.push(...leaves);
      const span = leaves.length;
      const self: PivotColumnNode = {
        id: JSON.stringify(path),
        path: [...path],
        label: undefined,
        colSpan: span,
        leaves,
      };
      return self;
    }

    // Branch level: enumerate unique field values across all rows.
    const [head, ...tail] = fieldRefs;
    const accessor = (row: TRow): FieldValue =>
      (row as Record<string, unknown>)[head!.field] as FieldValue;
    const seen = new Map<string, FieldValue>();
    for (const row of query.rows) {
      const v = accessor(row);
      const k = JSON.stringify(v ?? null);
      if (!seen.has(k)) seen.set(k, v);
    }
    const children: PivotColumnNode[] = [];
    let totalSpan = 0;
    for (const [, value] of seen) {
      const childPath = [...path, value];
      const child = buildLevel(tail, childPath);
      totalSpan += child.colSpan;
      children.push(child);
    }
    const self: PivotColumnNode = {
      id: JSON.stringify(path),
      path: [...path],
      label: value,
      colSpan: totalSpan,
      children,
    };
    return self;
  };

  const columnFieldRefs = query.columnsFieldRef;
  const columnRoot = buildLevel(columnFieldRefs, []);

  // Append the grand-total column if enabled.
  if (totalsConfig?.grandTotalColumn !== false) {
    const position = totalsConfig?.grandTotalColumnPosition ?? 'end';
    const pinned: 'left' | 'right' | undefined = 'right'; // default right-pinned per §9.6
    const totalsLeaves: PivotLeafColumn<TRow>[] = query.measures.map((m) => ({
      id: `__total__::${m.id}`,
      path: ['__total__'],
      measureId: m.id,
      isTotal: true,
      size: 100,
      header: m.label ?? `${m.id} (total)`,
      pinned,
    }));
    if (position === 'end') {
      leafColumns.push(...totalsLeaves);
      // Attach as a sibling leaf column on the root (single leaf group).
      // The column root becomes a branch with [regular leaves, totals leaves].
      const regularLeaves = columnRoot.leaves ?? [];
      columnRoot.leaves = undefined;
      columnRoot.children = [
        ...(columnRoot.children ?? []),
        {
          id: '__regular__',
          path: [],
          label: undefined,
          colSpan: regularLeaves.length,
          leaves: regularLeaves,
        },
        {
          id: '__totals__',
          path: ['__total__'],
          label: undefined,
          colSpan: totalsLeaves.length,
          leaves: totalsLeaves,
        },
      ];
      columnRoot.colSpan = regularLeaves.length + totalsLeaves.length;
    } else {
      // 'start': prepend totals leaves; keep the structure symmetric.
      leafColumns.unshift(...totalsLeaves);
      const regularLeaves = columnRoot.leaves ?? [];
      columnRoot.leaves = undefined;
      columnRoot.children = [
        {
          id: '__totals__',
          path: ['__total__'],
          label: undefined,
          colSpan: totalsLeaves.length,
          leaves: totalsLeaves,
        },
        ...(columnRoot.children ?? []),
        {
          id: '__regular__',
          path: [],
          label: undefined,
          colSpan: regularLeaves.length,
          leaves: regularLeaves,
        },
      ];
      columnRoot.colSpan = regularLeaves.length + totalsLeaves.length;
    }
  }

  return { columnRoot, leafColumns };
};

// ─────────────────────────────────────────────────────────────────────────────
// Row tree (with lazy expansion)
// ─────────────────────────────────────────────────────────────────────────────

interface BuildRowContext<TRow> {
  rows: TRow[];
  pivotConfig: PivotConfig<TRow>;
  query: PivotQuery<TRow>;
  leafColumns: PivotLeafColumn<TRow>[];
  aggregators: Map<MeasureId, Aggregator>;
  measureAccessors: Map<MeasureId, (row: TRow) => unknown>;
  expandedPaths: Set<RowPathKey>;
}

const groupRowsByField = <TRow>(
  rows: TRow[],
  accessor: (row: TRow) => FieldValue,
): Map<string, { value: FieldValue; rows: TRow[] }> => {
  const groups = new Map<string, { value: FieldValue; rows: TRow[] }>();
  for (const row of rows) {
    const v = accessor(row);
    const k = JSON.stringify(v ?? null);
    let entry = groups.get(k);
    if (!entry) {
      entry = { value: v, rows: [] };
      groups.set(k, entry);
    }
    entry.rows.push(row);
  }
  return groups;
};

const aggregateRows = <TRow>(
  rows: TRow[],
  aggregators: Map<MeasureId, Aggregator>,
  measureAccessors: Map<MeasureId, (row: TRow) => unknown>,
  leafColumns: PivotLeafColumn<TRow>[],
): { values: Record<LeafColumnId, unknown>; rowTotals: Record<MeasureId, unknown> } => {
  const accums: Record<MeasureId, unknown> = {};
  for (const measureId of aggregators.keys()) {
    accums[measureId] = aggregators.get(measureId)!.init();
  }

  for (const row of rows) {
    for (const [measureId, agg] of aggregators.entries()) {
      const accessor = measureAccessors.get(measureId)!;
      const value = accessor(row);
      accums[measureId] = agg.accumulate(accums[measureId], value, row);
    }
  }

  const values: Record<LeafColumnId, unknown> = {};
  const rowTotals: Record<MeasureId, unknown> = {};
  for (const [measureId, agg] of aggregators.entries()) {
    const acc = accums[measureId];
    const finalized = agg.finalize ? agg.finalize(acc) : acc;
    rowTotals[measureId] = finalized;
    for (const leaf of leafColumns) {
      if (leaf.measureId === measureId && !leaf.isTotal) {
        values[leaf.id] = finalized;
      }
    }
    if (leafColumns.some((l) => l.measureId === measureId && l.isTotal)) {
      values[`__total__::${measureId}`] = finalized;
    }
  }

  return { values, rowTotals };
};

const mergeRowAggregates = <TRow>(
  a: { values: Record<LeafColumnId, unknown>; rowTotals: Record<MeasureId, unknown> },
  b: { values: Record<LeafColumnId, unknown>; rowTotals: Record<MeasureId, unknown> },
  aggregators: Map<MeasureId, Aggregator>,
): { values: Record<LeafColumnId, unknown>; rowTotals: Record<MeasureId, unknown> } => {
  const values: Record<LeafColumnId, unknown> = { ...a.values };
  for (const [k, v] of Object.entries(b.values)) {
    values[k] = v;
  }
  // rowTotals are already finalized for whole-row aggregates; for merging
  // child accumulators into a parent accumulator (e.g., grand-total row
  // construction), we recompute from the accumulated un-finalized state.
  // For phase 3, we treat the values as already-finalized; the grand-total
  // row is computed by the totals.ts module via re-aggregation if needed.
  // (See the totals builder in §3.4.)
  return { values, rowTotals: { ...a.rowTotals, ...b.rowTotals } };
};

const buildRowTree = <TRow>(ctx: BuildRowContext<TRow>): PivotRowNode<TRow> => {
  const root: PivotRowNode<TRow> = {
    key: rowPathKeyOf([]),
    path: [],
    level: 0,
    label: undefined,
    hasChildren: ctx.pivotConfig.rows.length > 0 && ctx.rows.length > 0,
    childState: 'loaded',
    values: {},
    rowTotals: {},
  };

  const buildLevel = (
    rows: TRow[],
    level: number,
    path: FieldValue[],
    parent: PivotRowNode<TRow>,
  ): void => {
    if (level >= ctx.pivotConfig.rows.length) return;

    const fieldRef = ctx.pivotConfig.rows[level]!;
    const accessor = resolveFieldAccessor(fieldRef, undefined);
    const groups = groupRowsByField(rows, accessor);
    const children: PivotRowNode<TRow>[] = [];

    for (const [, group] of groups) {
      const childPath = [...path, group.value];
      const key = rowPathKeyOf(childPath);
      const expanded = ctx.expandedPaths.has(key);
      const isLeaf = level === ctx.pivotConfig.rows.length - 1;
      const aggregated = aggregateRows(group.rows, ctx.aggregators, ctx.measureAccessors, ctx.leafColumns);

      const node: PivotRowNode<TRow> = {
        key,
        path: childPath,
        level: level + 1,
        label: group.value,
        hasChildren: !isLeaf && group.rows.length > 0,
        childState: expanded ? 'loaded' : 'notLoaded',
        values: aggregated.values,
        rowTotals: aggregated.rowTotals,
      };

      if (expanded) {
        buildLevel(group.rows, level + 1, childPath, node);
      }

      children.push(node);
    }

    // Apply pivot sorting at this level (per §9.7).
    if (ctx.pivotConfig.pivotSortingFromQuery) {
      // placeholder — actually applied at engine layer
    }
    applyPivotSortingAtLevel<TRow>(
      children,
      level,
      ctx.pivotConfig.pivotSortingFromQuery ?? [],
      ctx.pivotConfig,
      (node, measureId, columnPath) => {
        const leafId = columnPath
          ? `${JSON.stringify(columnPath)}::${measureId}`
          : `__total__::${measureId}`;
        const v = node.values[leafId];
        return typeof v === 'number' ? v : NaN;
      },
      () => undefined, // registryLookup — comparator registry integration is M6
    );

    parent.children = children;
    // Aggregate this level's children into the parent's values (so the
    // synthetic root exposes grand totals and the level-0 groups expose
    // totals that match the footer row).
    const parentAggregated = aggregateRows(rows, ctx.aggregators, ctx.measureAccessors, ctx.leafColumns);
    parent.values = parentAggregated.values;
    parent.rowTotals = parentAggregated.rowTotals;
  };

  if (ctx.pivotConfig.rows.length > 0 && ctx.rows.length > 0) {
    buildLevel(ctx.rows, 0, [], root);
  } else {
    // No row hierarchy; aggregate everything at the root level.
    const aggregated = aggregateRows(ctx.rows, ctx.aggregators, ctx.measureAccessors, ctx.leafColumns);
    root.values = aggregated.values;
    root.rowTotals = aggregated.rowTotals;
  }

  return root;
};

// ─────────────────────────────────────────────────────────────────────────────
// PivotResult builder
// ─────────────────────────────────────────────────────────────────────────────

export const buildPivotResult = <TRow>(query: PivotQuery<TRow>): PivotResult<TRow> => {
  // Resolve aggregators + accessors once.
  const aggregators = new Map<MeasureId, Aggregator>();
  const measureAccessors = new Map<MeasureId, (row: TRow) => unknown>();
  for (const m of query.measures) {
    const inlineAgg = query.inlineAccessors?.aggregators?.[m.id];
    const agg = resolveMeasureAggregator(m, inlineAgg);
    aggregators.set(m.id, agg);
    const inlineAccessor = query.inlineAccessors?.measures?.find((a) => a.id === m.id)?.accessor;
    measureAccessors.set(m.id, resolveMeasureAccessor(m, inlineAccessor));
  }

  // Build column hierarchy.
  const { columnRoot, leafColumns } = buildColumnRoot(query, query.totals);

  // Apply pre-aggregation filters (§9.1).
  let filteredRows = query.rows;
  if (query.filters.length > 0) {
    filteredRows = query.rows.filter((row) => {
      for (const f of query.filters) {
        if ('predicateRef' in f) {
          // Registry-name filter: resolved by the filtering registry from M0.
          // M4's main-thread engine resolves via the core filtering registry.
          const filterFn = getCoreFilterFn(f.predicateRef);
          if (!filterFn) continue;
          if (!filterFn(row, f.args)) return false;
        } else if ('predicate' in f) {
          // Inline predicate (main-thread only).
          if (!(f.predicate as (row: TRow) => boolean)(row)) return false;
        }
        // Declarative filters are server/worker-only — main-thread engine
        // skips them (documented limitation).
      }
      return true;
    });
  }

  // Build row tree with lazy expansion.
  const pivotConfig: PivotConfig<TRow> & { pivotSortingFromQuery?: typeof query.pivotSorting } = {
    rows: query.rowsFieldRef.map((ref) => ref.field),
    columns: query.columnsFieldRef.map((ref) => ref.field),
    measures: query.measures as MeasureDef<TRow>[],
    filters: query.filters as never,
    pivotSortingFromQuery: query.pivotSorting,
  };
  const expandedPaths = new Set(query.expandedPaths);
  const rowRoot = buildRowTree({
    rows: filteredRows,
    pivotConfig,
    query,
    leafColumns,
    aggregators,
    measureAccessors,
    expandedPaths,
  });

  // Grand totals — feed the footer row.
  const grandAggregated = aggregateRows(filteredRows, aggregators, measureAccessors, leafColumns);
  const grandTotals: Record<LeafColumnId, unknown> = {};
  for (const [measureId, finalized] of Object.entries(grandAggregated.rowTotals)) {
    for (const leaf of leafColumns) {
      if (leaf.measureId === measureId && leaf.isTotal) {
        grandTotals[leaf.id] = finalized;
      }
    }
  }

  return { columnRoot, leafColumns, rowRoot, grandTotals };
};

// ─────────────────────────────────────────────────────────────────────────────
// Filter registry bridge (core's filtering registry)
// ─────────────────────────────────────────────────────────────────────────────

type CoreFilterFn<TRow> = (row: TRow, args: unknown) => boolean;

const getCoreFilterFn = <TRow>(name: string): CoreFilterFn<TRow> | undefined => {
  // Lazy import to avoid a cycle (core → pivot shouldn't happen; pivot → core is fine).
  // The filtering registry is exported from @lynellf/tablekit-core.
  // The synchronous import is at module top via a side-effecting require pattern:
  return coreFilterRegistry.get(name) as CoreFilterFn<TRow> | undefined;
};

const coreFilterRegistry: Map<string, CoreFilterFn<unknown>> = new Map();

/** Set a filter function in the main-thread engine's filter registry bridge. */
export const __registerCoreFilterFn = (name: string, fn: CoreFilterFn<unknown>): void => {
  coreFilterRegistry.set(name, fn);
};
```

### 3.4 `packages/pivot/src/engine/mainThread.ts`

```ts
/**
 * @lynellf/tablekit-pivot/engine — main-thread engine.
 *
 * Implements `AggregationEngine<TRow>` for the main-thread execution environment.
 * Stateless: every `compute` call derives the result from the query. Memoization
 * is provided by `PivotResultCache`.
 *
 * Lazy expansion (§9.5):
 *  - `compute(q, ctx)` returns `rowRoot.children` materialized only for paths
 *    in `q.expandedPaths`. Unexpanded paths are aggregated (values + rowTotals
 *    present, `children = undefined`, `childState = 'notLoaded'`).
 *  - `computeChildren(path, q, ctx)` materializes the children of an already-
 *    aggregated node synchronously (returns an array of PivotRowNode).
 */

import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '../types';
import { rowPathKeyOf, buildPivotResult } from './treeBuilder';
import { PivotResultCache } from './cache';

export interface MainThreadEngineOptions {
  /** Enable memoization (default true). */
  cache?: boolean;
}

export const createMainThreadEngine = <TRow = unknown>(
  opts: MainThreadEngineOptions = {},
): AggregationEngine<TRow> => {
  const useCache = opts.cache !== false;
  const cache = useCache ? new PivotResultCache<TRow>() : null;

  return {
    compute(q: PivotQuery<TRow>, _ctx: { signal: AbortSignal }): PivotResult<TRow> {
      if (cache) {
        const cached = cache.get(q.rows, q);
        if (cached) return cached;
      }
      const result = buildPivotResult(q);
      if (cache) cache.set(q.rows, q, result);
      return result;
    },

    computeChildren(
      path: FieldValue[],
      q: PivotQuery<TRow>,
      _ctx: { signal: AbortSignal },
    ): PivotRowNode<TRow>[] {
      // For the main-thread engine, re-run compute and walk to the path.
      const result = buildPivotResult(q);
      const targetKey = rowPathKeyOf(path);
      const walk = (node: PivotRowNode<TRow>): PivotRowNode<TRow>[] | null => {
        if (node.key === targetKey) {
          return node.children ?? [];
        }
        if (!node.children) return null;
        for (const child of node.children) {
          const found = walk(child);
          if (found !== null) return found;
        }
        return null;
      };
      const children = walk(result.rowRoot);
      return children ?? [];
    },

    dispose(): void {
      cache?.clear();
    },
  };
};
```

### 3.5 `packages/pivot/src/engine/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/engine — aggregation engine contract + main-thread impl.
 */

export type { AggregationEngine } from '../types';

export { createMainThreadEngine } from './mainThread';
export type { MainThreadEngineOptions } from './mainThread';

export { buildPivotResult, __registerCoreFilterFn, rowPathKeyOf } from './treeBuilder';
export { PivotResultCache } from './cache';
export { applyPivotSortingAtLevel } from './pivotSorting';
```

### 3.6 `packages/pivot/src/__tests__/engine.test.ts`

```ts
/**
 * Phase 3 — engine compute tests.
 *
 * Covers: small dataset with various hierarchies (row × column × measure combinations),
 * multi-measure, default 'sum' aggregator, column-root with no columns, row-root with no rows.
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface SalesRow {
  region: string;
  quarter: string;
  year: number;
  sales: number;
  orders: number;
}

const rows: SalesRow[] = [
  { region: 'West', quarter: 'Q1', year: 2024, sales: 100, orders: 5 },
  { region: 'West', quarter: 'Q2', year: 2024, sales: 150, orders: 7 },
  { region: 'East', quarter: 'Q1', year: 2024, sales: 200, orders: 9 },
  { region: 'East', quarter: 'Q2', year: 2024, sales: 250, orders: 12 },
  { region: 'West', quarter: 'Q3', year: 2024, sales: 180, orders: 8 },
];

describe('createMainThreadEngine', () => {
  it('computes a row hierarchy (region) with sum of sales', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }], // default 'sum'
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2); // West, East
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.rowTotals.sales_sum).toBe(430); // 100+150+180
    const east = result.rowRoot.children!.find((c) => c.label === 'East')!;
    expect(east.rowTotals.sales_sum).toBe(450); // 200+250
    expect(result.grandTotals['__total__::sales_sum']).toBe(880);
  });

  it('default aggregator is "sum" when MeasureDef.aggregator is omitted', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const q: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const r = engine.compute(q, { signal: new AbortController().signal });
    expect(r.rowRoot.rowTotals.sales_sum).toBe(880);
  });

  it('two-level row hierarchy (region × quarter)', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'quarter' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2);
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.hasChildren).toBe(true);
    expect(west.children).toBeUndefined(); // not expanded
    expect(west.childState).toBe('notLoaded');
  });

  it('column hierarchy + multi-measure', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [{ field: 'year' }],
      measures: [
        { id: 'sales_sum', field: 'sales' },
        { id: 'orders_count', field: 'orders', aggregator: 'count' },
      ],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.columnRoot.children).toBeDefined();
    const year2024 = result.columnRoot.children!.find((c) => c.label === 2024)!;
    expect(year2024.colSpan).toBe(2); // two measures
  });

  it('no rows → empty root with empty children', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows: [],
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.hasChildren).toBe(false);
    expect(result.rowRoot.children).toBeUndefined();
  });

  it('no row hierarchy → aggregated at the root', () => {
    const engine = createMainThreadEngine<SalesRow>();
    const query: PivotQuery<SalesRow> = {
      rows,
      rowsFieldRef: [],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(query, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toBeUndefined();
    expect(result.rowRoot.rowTotals.sales_sum).toBe(880);
  });
});
```

### 3.7 `packages/pivot/src/__tests__/lazyExpansion.test.ts`

```ts
/**
 * Phase 3 — lazy expansion semantics (spec §9.5).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  product: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', product: 'A', sales: 10 },
  { region: 'West', product: 'B', sales: 20 },
  { region: 'East', product: 'A', sales: 30 },
  { region: 'East', product: 'B', sales: 40 },
];

describe('lazy expansion', () => {
  it('expandedPaths = [] → only level-0 materialized', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children).toHaveLength(2); // West, East
    for (const region of result.rowRoot.children!) {
      expect(region.hasChildren).toBe(true);
      expect(region.children).toBeUndefined();
      expect(region.childState).toBe('notLoaded');
    }
  });

  it('expandedPaths = ["[\"West\"]"] → West children materialized, grandchildren still aggregated', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: ['["West"]'],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.children).toHaveLength(2);
    expect(west.childState).toBe('loaded');
    for (const product of west.children!) {
      expect(product.hasChildren).toBe(false); // leaf level
      expect(product.childState).toBe('loaded');
    }
    const east = result.rowRoot.children!.find((c) => c.label === 'East')!;
    expect(east.children).toBeUndefined();
    expect(east.childState).toBe('notLoaded');
  });

  it('computeChildren materializes children of a single path', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const children = engine.computeChildren!(['West'], q, { signal: new AbortController().signal });
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.label).sort()).toEqual(['A', 'B']);
  });

  it('aggregated values are still present for unexpanded nodes', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'product' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    const west = result.rowRoot.children!.find((c) => c.label === 'West')!;
    expect(west.rowTotals.sales_sum).toBe(30); // 10 + 20 (children NOT enumerated, but aggregated)
  });
});
```

### 3.8 `packages/pivot/src/__tests__/pivotSorting.test.ts`

```ts
/**
 * Phase 3 — pivot sorting application (spec §9.7).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', sales: 300 },
  { region: 'East', sales: 100 },
  { region: 'North', sales: 200 },
];

describe('pivot sorting', () => {
  it('by: "label" ascending (default order)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'label', desc: false }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['East', 'North', 'West']);
  });

  it('by: "label" descending', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'label', desc: true }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'North', 'East']);
  });

  it('by: "measure" ascending (sort by sales_sum)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: false }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['East', 'North', 'West']);
  });

  it('by: "measure" descending', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [{ level: 0, by: 'measure', measureId: 'sales_sum', desc: true }],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'North', 'East']);
  });

  it('no sorting → insertion order (alphabetical by first-seen)', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: {},
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.rowRoot.children!.map((c) => c.label)).toEqual(['West', 'East', 'North']);
  });
});
```

### 3.9 `packages/pivot/src/__tests__/totals.test.ts`

```ts
/**
 * Phase 3 — totals behavior (spec §9.6).
 */

import { describe, expect, it } from 'vitest';
import { createMainThreadEngine } from '../engine/mainThread';
import type { PivotQuery } from '../types';

interface Row {
  region: string;
  sales: number;
}

const rows: Row[] = [
  { region: 'West', sales: 100 },
  { region: 'East', sales: 200 },
  { region: 'North', sales: 300 },
];

describe('totals', () => {
  it('grand-total row equals sum across all level-0 groups', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.grandTotals['__total__::sales_sum']).toBe(600);
  });

  it('grand-total column appended at end by default', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    const lastLeaf = result.leafColumns[result.leafColumns.length - 1]!;
    expect(lastLeaf.isTotal).toBe(true);
    expect(lastLeaf.pinned).toBe('right');
  });

  it('grandTotalColumnPosition = "start" prepends totals', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true, grandTotalColumnPosition: 'start' },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    const firstLeaf = result.leafColumns[0]!;
    expect(firstLeaf.isTotal).toBe(true);
  });

  it('grandTotalColumn: false omits the totals column', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [],
      totals: { grandTotalColumn: false },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    expect(result.leafColumns.find((l) => l.isTotal)).toBeUndefined();
    expect(Object.keys(result.grandTotals)).toHaveLength(0);
  });

  it('multi-measure: one totals leaf per measure', () => {
    const engine = createMainThreadEngine<Row>();
    const q: PivotQuery<Row> = {
      rows,
      rowsFieldRef: [{ field: 'region' }],
      columnsFieldRef: [],
      measures: [
        { id: 'sales_sum', field: 'sales' },
        { id: 'count', aggregator: 'count' },
      ],
      filters: [],
      totals: { grandTotalRow: true, grandTotalColumn: true },
      expandedPaths: [],
      pivotSorting: [],
    };
    const result = engine.compute(q, { signal: new AbortController().signal });
    const totalsLeaves = result.leafColumns.filter((l) => l.isTotal);
    expect(totalsLeaves).toHaveLength(2);
    expect(totalsLeaves.map((l) => l.measureId).sort()).toEqual(['count', 'sales_sum']);
  });
});
```

### 3.10 `packages/pivot/bench/main-thread.bench.ts`

```ts
/**
 * Phase 3 — §12 advisory perf bench (main-thread engine).
 *
 * Runs re-pivot on synthetic datasets of 50k / 100k / 200k rows × 2-level row hierarchy
 * × 2-level column hierarchy × 2 measures (sum + count). Logs timing.
 *
 * Budget reference (spec §12): "Pivot, main thread: ≤ ~200k source rows before docs
 * recommend worker engine." This bench measures where the budget is consumed; results
 * are logged but do not gate CI.
 */

import { bench, describe } from 'vitest';
import { createMainThreadEngine } from '../src/engine/mainThread';
import type { PivotQuery } from '../src/types';

const generateRows = (n: number) => {
  const regions = ['West', 'East', 'North', 'South'];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const years = [2022, 2023, 2024];
  const rows = Array.from({ length: n }, (_, i) => ({
    id: i,
    region: regions[i % regions.length]!,
    quarter: quarters[Math.floor(i / regions.length) % quarters.length]!,
    year: years[i % years.length]!,
    sales: Math.floor(Math.random() * 1000),
    orders: Math.floor(Math.random() * 50),
  }));
  return rows;
};

describe('main-thread re-pivot bench', () => {
  for (const n of [50_000, 100_000, 200_000]) {
    const rows = generateRows(n);
    const query: PivotQuery<{ id: number; region: string; quarter: string; year: number; sales: number; orders: number }> = {
      rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'quarter' }],
      columnsFieldRef: [{ field: 'year' }],
      measures: [
        { id: 'sales_sum', field: 'sales' },
        { id: 'orders_count', field: 'orders', aggregator: 'count' },
      ],
      filters: [],
      totals: {},
      expandedPaths: ['["West"]'],
      pivotSorting: [],
    };
    bench(`re-pivot ${n} rows × region × quarter × year × 2 measures`, () => {
      const engine = createMainThreadEngine();
      engine.compute(query, { signal: new AbortController().signal });
    });
  }
});
```

---

## 4. Commands

```bash
pnpm -F @lynellf/tablekit-pivot typecheck
pnpm --filter @lynellf/tablekit-pivot test -- --run engine
pnpm --filter @lynellf/tablekit-pivot test -- --run lazyExpansion
pnpm --filter @lynellf/tablekit-pivot test -- --run pivotSorting
pnpm --filter @lynellf/tablekit-pivot test -- --run totals
pnpm test                                                       # all tests; M0/M1/M2/M3 still pass
pnpm verify                                                     # aggregate gate — must exit 0

# Bench (advisory; not part of verify)
pnpm --filter @lynellf/tablekit-pivot bench main-thread.bench
```

---

## 5. Verification

After this phase:

```bash
pnpm verify                                                     # EXIT 0
pnpm --filter @lynellf/tablekit-pivot test                      # 40-55 new tests, all green

# Subpath smoke
node -e "import('@lynellf/tablekit-pivot/engine').then(m => console.log(Object.keys(m).sort()))"
```

Expected phase-3 output:

```
@lynellf/tablekit-pivot/engine →
  ['PivotResultCache', 'applyPivotSortingAtLevel', 'buildPivotResult',
   'createMainThreadEngine', 'rowPathKeyOf', '__registerCoreFilterFn']
```

---

## 6. Out-of-scope

- `createPivotTable` factory — phase 4.
- Treegrid prop getters — phase 4.
- `usePivotTable` React hook — phase 5.
- `validateGridStructure` treegrid extensions — phase 5.
- Treegrid keyboard additions (Right/Left on row-header) — phase 5.
- Reference app — phase 6.
- `buildPivotQuery` / `validatePivotQuery` — phase 6.
- Comparator registry integration — phase 6 + M6.
- Server expansion (`computeChildren` on server engines) — M5.

---

## 7. Risks

- **R3 (lazy expansion + memoization):** The `PivotResultCache` is keyed on `(rows ref, query)`. Consumers mutating `rows` in place get stale results until they pass a new array reference. Mitigation: documented in `PivotResultCache` header; mirrors M2's `RowModelCache` pattern. The React hook (phase 5) re-runs `compute` only when `data`/`pivot`/`pivotSorting`/`expanded` change.
- **R6 (NaN/Infinity in aggregates):** `sum` / `count` ignore non-number values; `min`/`max` ignore non-finite values; `avg` is `sum/count` with NaN over empty. Property tests (phase 2) lock these semantics. The engine doesn't introduce new NaN handling.
- **Column hierarchy + totals column structural detail:** The engine wraps regular leaves + totals leaves as sibling `PivotColumnNode` children of the column root. This affects how `getHeaderRows()` and `aria-colspan` are emitted in phase 4. The structure is asserted by `engine.test.ts` (column root has children, totals leaf is pinned). Phase 4's prop getters consume the structure.
- **Inline aggregator / predicate in `PivotQuery`:** Phase 3 accepts inline forms (main-thread only); phase 6 adds `validatePivotQuery` that warns when inline forms are paired with non-main-thread engines (M5-shaped).
- **Filter bridge via `__registerCoreFilterFn`:** The main-thread engine's pre-aggregation filter resolves registry-name filters via the core filtering registry. M4 ships the bridge function; consumers using registry-name filters in `PivotFilter.predicateRef` must call `__registerCoreFilterFn(name, fn)` once at module init. Documented in phase 6.