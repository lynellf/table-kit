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

import { getAggregator } from '../aggregators';
import type {
  Aggregator,
  FieldRef,
  FieldValue,
  LeafColumnId,
  MeasureDef,
  MeasureId,
  PivotColumnNode,
  PivotConfig,
  PivotLeafColumn,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  RowPathKey,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Field resolution
// ─────────────────────────────────────────────────────────────────────────────

const resolveFieldAccessor = <TRow>(
  ref: FieldRef<TRow>,
  _inlineAccessor: ((row: TRow) => FieldValue) | undefined,
): ((row: TRow) => FieldValue) => {
  if (typeof ref === 'string') {
    return (row: TRow) => (row as Record<string, unknown>)[ref] as FieldValue;
  }
  if (ref.accessor) return ref.accessor;
  return (row: TRow) => (row as Record<string, unknown>)[ref.field] as FieldValue;
};

const resolveMeasureAccessor = <TRow>(
  def: MeasureDef<TRow>,
  _inlineAccessor: ((row: TRow) => unknown) | undefined,
): ((row: TRow) => unknown) => {
  if (def.accessor) return def.accessor;
  if (def.field !== undefined)
    return (row: TRow) => (row as Record<string, unknown>)[def.field as string];
  // Count aggregator needs a value to count; return the row itself as a sentinel
  // (counting non-null values). When no field is provided, count all rows.
  return () => 1;
};

const resolveMeasureAggregator = (
  def: MeasureDef,
  inlineAggregator: Aggregator | undefined,
): Aggregator => {
  if (inlineAggregator) return inlineAggregator;
  const name = typeof def.aggregator === 'string' ? def.aggregator : 'sum';
  const registered = getAggregator(name);
  if (!registered) {
    throw new Error(
      `[tablekit-pivot] MeasureDef "${def.id}" references unknown aggregator "${String(name)}". Register it via registerAggregator() before constructing the engine.`,
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
): { columnRoot: PivotColumnNode; leafColumns: PivotLeafColumn<TRow>[] } => {
  const leafColumns: PivotLeafColumn<TRow>[] = [];
  const columnFieldRefs = query.columnsFieldRef;

  const buildLeaves = (path: FieldValue[]): PivotLeafColumn<TRow>[] =>
    query.measures.map((m) => ({
      id: `${JSON.stringify(path)}::${m.id}`,
      path: [...path],
      measureId: m.id,
      isTotal: false,
      size: 100,
      header: m.label ?? m.id,
    }));

  const buildLevel = (fieldRefs: Array<{ field: string }>, path: FieldValue[]): PivotColumnNode => {
    if (fieldRefs.length === 0) {
      // Leaf level: one leaf per measure.
      const leaves = buildLeaves(path);
      leafColumns.push(...leaves);
      return {
        id: JSON.stringify(path),
        path: [...path],
        label: undefined,
        colSpan: leaves.length,
        leaves,
      };
    }

    // Branch level: enumerate unique field values.
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
      let child: PivotColumnNode;
      if (tail.length > 0) {
        child = buildLevel(tail, childPath);
      } else {
        // Last field: build leaves under this branch.
        const leaves = buildLeaves(childPath);
        leafColumns.push(...leaves);
        child = {
          id: JSON.stringify(childPath),
          path: childPath,
          label: value,
          colSpan: leaves.length,
          leaves,
        };
      }
      totalSpan += child.colSpan;
      children.push(child);
    }
    const self: PivotColumnNode = {
      id: JSON.stringify(path),
      path: [...path],
      label: undefined,
      colSpan: totalSpan,
      children,
    };
    return self;
  };

  const columnRoot = buildLevel(columnFieldRefs, []);

  // Append the grand-total column if enabled.
  if (query.totals?.grandTotalColumn !== false) {
    const position = query.totals?.grandTotalColumnPosition ?? 'end';
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
      // Attach totals leaves as a sibling of regular leaves at the root.
      // Only create wrapper nodes if existing children are intermediate levels (have children themselves).
      // For leaf-level hierarchies (children have leaves but no children), add totals directly.
      const existingChildren = columnRoot.children ?? [];
      const regularLeaves = columnRoot.leaves ?? [];
      // Check if existing children are intermediate (have their own children) or leaf (have leaves only)
      const hasIntermediateChildren = existingChildren.some(
        (c) => c.children && c.children.length > 0,
      );
      if (hasIntermediateChildren) {
        // Multi-level: add __totals__ as a sibling with undefined label (like __regular__)
        columnRoot.children = [
          ...existingChildren,
          {
            id: '__totals__',
            path: ['__total__'],
            label: undefined,
            colSpan: totalsLeaves.length,
            leaves: totalsLeaves,
          },
        ];
      } else {
        // Leaf-level: append totals as a child directly with '__total__' label
        columnRoot.children = [
          ...existingChildren,
          {
            id: '__totals__',
            path: ['__total__'],
            label: '__total__',
            colSpan: totalsLeaves.length,
            leaves: totalsLeaves,
          },
        ];
      }
      columnRoot.colSpan = regularLeaves.length + totalsLeaves.length;
    } else {
      // 'start': prepend totals leaves.
      leafColumns.unshift(...totalsLeaves);
      const existingChildren = columnRoot.children ?? [];
      const regularLeaves = columnRoot.leaves ?? [];
      // Check if existing children are intermediate (have their own children) or leaf (have leaves only)
      const hasIntermediateChildren = existingChildren.some(
        (c) => c.children && c.children.length > 0,
      );
      if (hasIntermediateChildren) {
        // Multi-level: add __totals__ as a sibling with undefined label
        columnRoot.children = [
          {
            id: '__totals__',
            path: ['__total__'],
            label: undefined,
            colSpan: totalsLeaves.length,
            leaves: totalsLeaves,
          },
          ...existingChildren,
        ];
      } else {
        // Leaf-level: prepend totals as a child directly with '__total__' label
        columnRoot.children = [
          {
            id: '__totals__',
            path: ['__total__'],
            label: '__total__',
            colSpan: totalsLeaves.length,
            leaves: totalsLeaves,
          },
          ...existingChildren,
        ];
      }
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
  for (const [measureId, agg] of aggregators.entries()) {
    accums[measureId] = agg.init();
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
      const aggregated = aggregateRows(
        group.rows,
        ctx.aggregators,
        ctx.measureAccessors,
        ctx.leafColumns,
      );

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
    // comparator registry lookup is not yet implemented (M6); pass no-op.
    const noOpLookup = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    applyPivotSortingAtLevel<TRow>(
      children,
      level,
      ctx.query.pivotSorting,
      ctx.pivotConfig,
      (node, measureId, columnPath) => {
        const leafId = columnPath
          ? `${JSON.stringify(columnPath)}::${measureId}`
          : `__total__::${measureId}`;
        const v = node.values[leafId];
        return typeof v === 'number' ? v : Number.NaN;
      },
      noOpLookup,
    );

    parent.children = children;
    // Aggregate this level's children into the parent's values.
    const parentAggregated = aggregateRows(
      rows,
      ctx.aggregators,
      ctx.measureAccessors,
      ctx.leafColumns,
    );
    parent.values = parentAggregated.values;
    parent.rowTotals = parentAggregated.rowTotals;
  };

  if (ctx.pivotConfig.rows.length > 0 && ctx.rows.length > 0) {
    buildLevel(ctx.rows, 0, [], root);
  } else {
    // No row hierarchy; aggregate everything at the root level.
    const aggregated = aggregateRows(
      ctx.rows,
      ctx.aggregators,
      ctx.measureAccessors,
      ctx.leafColumns,
    );
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
  const { columnRoot, leafColumns } = buildColumnRoot(query);

  // Apply pre-aggregation filters (§9.1).
  let filteredRows = query.rows;
  if (query.filters.length > 0) {
    filteredRows = query.rows.filter((row) => {
      for (const f of query.filters) {
        if (!('predicateRef' in f) && 'predicate' in f) {
          // Inline predicate (main-thread only).
          if (!(f as { predicate: (row: TRow) => boolean }).predicate(row)) return false;
        }
        // Registry-name and declarative filters are server/worker-only —
        // main-thread engine skips them (documented limitation).
      }
      return true;
    });
  }

  // Build row tree with lazy expansion.
  const pivotConfig: PivotConfig<TRow> = {
    rows: query.rowsFieldRef.map((r) => r.field as FieldRef<TRow>),
    columns: query.columnsFieldRef.map((c) => c.field as FieldRef<TRow>),
    measures: query.measures as MeasureDef<TRow>[],
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
// Filter registry bridge (main-thread engine — inline predicates only)
// ─────────────────────────────────────────────────────────────────────────────

/** No-op for the filter registry bridge in M4. Server/worker filter wiring is M5. */
export const __registerCoreFilterFn = (
  _name: string,
  _fn: (row: unknown, args?: unknown) => boolean,
): void => {
  // Filter registry bridge: not wired in M4 (main-thread engine uses inline predicates only).
};

// ─────────────────────────────────────────────────────────────────────────────
// Re-export sorting helper so treeBuilder can use it
// ─────────────────────────────────────────────────────────────────────────────

import { applyPivotSortingAtLevel } from './pivotSorting';
