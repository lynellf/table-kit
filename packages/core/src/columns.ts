/**
 * @lynellf/tablekit-core — column model.
 *
 * Resolves ColumnDef[] into derived Column views (spec §4.4).
 *
 * M0 scope:
 *   - Stable `id`-keyed identity.
 *   - Accessor resolution (keyof TRow | function).
 *   - Derived shape getters that read slice state.
 *
 * Out of M0 scope (later milestones):
 *   - Resize behavior (M2).
 *   - Pinning offset math (M2).
 *   - Header group + cell rendering (M1).
 */

import type {
  AccessorFn,
  ColumnDef,
  ColumnPinningState,
  DataTableState,
  RowIdAccessor,
  SortItem,
} from './types';

/**
 * Derived column view. Public-facing object exposed by the factory.
 * Methods are frozen-getter and stable across calls as long as the
 * underlying `Column` instance is the same.
 */
export class Column<TRow, TValue = unknown> {
  readonly id: string;
  readonly def: ColumnDef<TRow, TValue>;
  /** Resolved accessor as a function (always a function, even when def.accessor is a key). */
  private readonly accessorFn: AccessorFn<TRow, TValue>;
  private readonly state: DataTableState;
  /** Linear index in the resolved leaf-column order (0-based). */
  readonly index: number;
  /**
   * True when this column participates in the `columnOrder` slice or is
   * implicitly listed in the original `columns` def. False when explicitly
   * hidden via `columnVisibility[id] = false`.
   */
  readonly isVisible: boolean;
  /** Pinned side derived from `columnPinning`. */
  readonly pinnedSide: 'left' | 'right' | false;

  constructor(args: {
    def: ColumnDef<TRow, TValue>;
    state: DataTableState;
    index: number;
    resolveAccessor: (def: ColumnDef<TRow, TValue>) => AccessorFn<TRow, TValue>;
  }) {
    this.id = args.def.id;
    this.def = args.def;
    this.state = args.state;
    this.index = args.index;
    this.accessorFn = args.resolveAccessor(args.def);

    const visibility = args.state.columnVisibility[args.def.id];
    this.isVisible = visibility === undefined ? true : visibility;

    const left = args.state.columnPinning.left.includes(args.def.id);
    const right = !left && args.state.columnPinning.right.includes(args.def.id);
    this.pinnedSide = left ? 'left' : right ? 'right' : false;
  }

  /** Read the column's value from a row. Equivalent to `accessorFn(row, index)`. */
  getValue(row: TRow, rowIndex: number): TValue {
    return this.accessorFn(row, rowIndex);
  }

  /** Resolved width in px. Falls back to def.size, then to 150. */
  getSize(): number {
    const fromState = this.state.columnSizing[this.id];
    if (typeof fromState === 'number') return fromState;
    if (typeof this.def.size === 'number') return this.def.size;
    return 150;
  }

  /** Minimum allowed width during resize. Defaults to 30. */
  getMinSize(): number {
    return typeof this.def.minSize === 'number' ? this.def.minSize : 30;
  }

  /** Maximum allowed width during resize. Defaults to Infinity. */
  getMaxSize(): number {
    return typeof this.def.maxSize === 'number' ? this.def.maxSize : Number.POSITIVE_INFINITY;
  }

  getIsPinned(): 'left' | 'right' | false {
    return this.pinnedSide;
  }

  /**
   * Cumulative width of preceding pinned columns on this column's side.
   * Returns 0 when unpinned.
   */
  getPinnedOffset(): number {
    if (this.pinnedSide === false) return 0;
    const side: keyof ColumnPinningState = this.pinnedSide;
    const ordered = this.state.columnPinning[side];
    const idx = ordered.indexOf(this.id);
    if (idx <= 0) return 0;
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      const precedingId = ordered[i];
      if (precedingId === undefined) continue;
      const fromState = this.state.columnSizing[precedingId];
      if (typeof fromState === 'number') {
        offset += fromState;
      } else {
        offset += 150; // default; M2 will plumb real defs to compute this exactly
      }
    }
    return offset;
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  getCanSort(): boolean {
    return this.def.enableSorting === true;
  }

  getCanFilter(): boolean {
    return this.def.enableFiltering === true;
  }

  /** True if this column is the primary sorted column. `aria-sort` source. */
  getIsSorted(): false | 'asc' | 'desc' {
    const primary = this.state.sorting[0];
    if (!primary || primary.id !== this.id) return false;
    return primary.desc ? 'desc' : 'asc';
  }

  /** Sort rank: 0 = primary, 1 = secondary, … -1 = not sorted. */
  getSortIndex(): number {
    return this.state.sorting.findIndex((s: SortItem) => s.id === this.id);
  }

  getMeta(): Record<string, unknown> | undefined {
    return this.def.meta;
  }
}

/**
 * Build an accessor function from a `ColumnDef`. When the def declares a
 * string accessor (`keyof TRow`), look it up on the row; when it declares
 * a function, return it as-is. When neither is provided, return a function
 * that returns `undefined`.
 */
export const resolveAccessor = <TRow, TValue>(
  def: ColumnDef<TRow, TValue>,
): AccessorFn<TRow, TValue> => {
  const accessor = def.accessor;
  if (typeof accessor === 'function') {
    return accessor as AccessorFn<TRow, TValue>;
  }
  if (typeof accessor === 'string') {
    return (row: TRow) => row[accessor as keyof TRow] as unknown as TValue;
  }
  return () => undefined as unknown as TValue;
};

/**
 * Resolve column defs → derived Column array using the supplied state.
 *
 * Ordering rules:
 *   1. If `state.columnOrder` is non-empty, use it (filtering out unknown ids).
 *   2. Otherwise, use the order of the `defs` argument.
 *   3. New columns appended at the end (defs not in columnOrder).
 *
 * Visibility is applied AFTER ordering: a column listed in `columnOrder` but
 * hidden via `columnVisibility` is still part of the array but `isVisible=false`.
 */
export const createColumns = <TRow>(
  defs: Array<ColumnDef<TRow, unknown>>,
  state: DataTableState,
): Array<Column<TRow, unknown>> => {
  const defsById = new Map<string, ColumnDef<TRow, unknown>>();
  for (const def of defs) defsById.set(def.id, def);

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  if (state.columnOrder.length > 0) {
    for (const id of state.columnOrder) {
      if (defsById.has(id) && !seen.has(id)) {
        orderedIds.push(id);
        seen.add(id);
      }
    }
  }
  // Append any defs not in columnOrder in their original order.
  for (const def of defs) {
    if (!seen.has(def.id)) {
      orderedIds.push(def.id);
      seen.add(def.id);
    }
  }

  const result: Array<Column<TRow, unknown>> = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === undefined) continue;
    const def = defsById.get(id);
    if (def === undefined) continue;
    result.push(
      new Column<TRow, unknown>({
        def,
        state,
        index: i,
        resolveAccessor,
      }),
    );
  }
  return result;
};

/** Flag to suppress the warning after first use. */
let _defaultGetRowIdWarned = false;

/** Convenience: read `getRowId` with a dev-only fallback to JSON.stringify. */
export const defaultGetRowId: RowIdAccessor<unknown> = (row, index) => {
  // Warn on first use per process — but suppress in production and in the
  // Vitest test environment, where the warning is pure noise. Vitest sets
  // `process.env.NODE_ENV === 'test'` by default; the additional check
  // keeps dev-time output clean for the existing smoke + column test
  // suites that exercise this helper indirectly.
  const env = process.env.NODE_ENV;
  if (env !== 'production' && env !== 'test' && !_defaultGetRowIdWarned) {
    // eslint-disable-next-line no-console
    console.warn(
      '[tablekit] No `getRowId` provided; falling back to JSON.stringify. ' +
        'Provide a stable getRowId for server modes (M3) and pivot (M4).',
    );
    _defaultGetRowIdWarned = true;
  }
  return `row-${index}-${JSON.stringify(row).length}`;
};
