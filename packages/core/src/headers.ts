/**
 * @lynellf/tablekit-core — header structure.
 *
 * Spec §6.1: `getHeaderGroups()` returns header groups; each group has rows;
 * each row has headers; each header exposes `getHeaderProps()`,
 * `getSortToggleProps()`, and a `column` reference.
 *
 * For M1: single header row (no column groups / no multi-row hierarchy).
 * M2 may extend for nested headers.
 */

import type { Column } from './columns';
import { mergeProps } from './propGetters';
import { DEFAULT_RESIZE_STEP_PX } from './resize';

export interface Header<TRow, TValue = unknown> {
  readonly id: string;
  readonly column: Column<TRow, TValue>;
  readonly index: number;
  readonly isPlaceholder?: boolean;
  /** Sub-headers (always empty in M1; reserved for M2 nested headers). */
  readonly subHeaders: Header<TRow, TValue>[];
  getHeaderProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getSortToggleProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getResizeHandleProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

export interface HeaderGroup<TRow> {
  readonly id: string;
  readonly headers: Header<TRow>[];
  /** Depth in the header hierarchy; M1 is always 0. */
  readonly depth: number;
  getRowProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
  getHeaderGroupProps(consumerProps?: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Context passed to header prop getters. Includes the instance so handlers
 * can dispatch state changes.
 */
export interface HeaderContext<_TRow> {
  instance: {
    toggleSorting: (id: string, append?: boolean) => void;
    getColumnCount: () => number;
    getRowCount: () => number;
    announce: (message: string) => void;
    // ─── Resize interaction (M2 Phase 3) ──────────────────────────────────
    startResize?: (columnId: string, startSize: number, clientX: number) => void;
    adjustResize?: (columnId: string, deltaPx: number) => void;
    commitResize?: (columnId: string) => void;
    cancelResize?: (columnId: string) => void;
  };
}

/**
 * Build the header groups for the given columns and instance.
 *
 * For M1: returns a single group containing headers for each visible column.
 */
export const buildHeaderGroups = <TRow>(
  visibleColumns: Array<Column<TRow, unknown>>,
  ctx: HeaderContext<TRow>,
): HeaderGroup<TRow>[] => {
  const headers: Header<TRow>[] = visibleColumns.map((col, index) => ({
    id: col.id,
    column: col as Column<TRow>,
    index,
    isPlaceholder: false,
    subHeaders: [],
    getHeaderProps: (consumerProps?: Record<string, unknown>) =>
      defaultHeaderProps<TRow>(col, index, ctx, consumerProps),
    getSortToggleProps: (consumerProps?: Record<string, unknown>) =>
      defaultSortToggleProps<TRow>(col, ctx, consumerProps),
    getResizeHandleProps: (consumerProps?: Record<string, unknown>) =>
      defaultResizeHandleProps<TRow>(col, ctx, consumerProps),
  }));

  return [
    {
      id: 'header',
      headers,
      depth: 0,
      getRowProps: (consumerProps?: Record<string, unknown>) =>
        mergeProps(
          {
            role: 'row',
            'aria-rowindex': 1,
          },
          consumerProps,
        ),
      getHeaderGroupProps: (consumerProps?: Record<string, unknown>) =>
        mergeProps(
          {
            role: 'rowgroup',
          },
          consumerProps,
        ),
    },
  ];
};

const defaultHeaderProps = <TRow>(
  col: Column<TRow, unknown>,
  colIndex: number,
  _ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const isSorted = col.getIsSorted();
  const isPinned = col.getIsPinned();
  const props: Record<string, unknown> = {
    role: 'columnheader',
    'aria-colindex': colIndex + 1,
    key: col.id,
  };
  if (isSorted !== false) {
    props['aria-sort'] = isSorted === 'desc' ? 'descending' : 'ascending';
  }
  if (isPinned) {
    props['data-pinned'] = isPinned;
  }
  return mergeProps(props, consumerProps);
};

const defaultSortToggleProps = <TRow>(
  col: Column<TRow, unknown>,
  ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const canSort = col.getCanSort();
  if (!canSort) {
    return mergeProps(
      {
        'aria-hidden': true,
        tabIndex: -1,
      },
      consumerProps,
    );
  }
  const onClick = (...args: unknown[]) => {
    const event = args[0] as { defaultPrevented?: boolean } | undefined;
    if (event?.defaultPrevented) return;
    ctx.instance.toggleSorting(col.id, false);
    const sort = col.getIsSorted();
    ctx.instance.announce(
      sort === false
        ? `Sorted by ${col.id} ascending`
        : sort === 'asc'
          ? `Sorted by ${col.id} descending`
          : `Sorted by ${col.id} removed`,
    );
  };
  return mergeProps(
    {
      role: 'button',
      tabIndex: -1,
      onClick,
    },
    consumerProps,
  );
};

const defaultResizeHandleProps = <TRow>(
  col: Column<TRow, unknown>,
  ctx: HeaderContext<TRow>,
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  const minSize = col.getMinSize();
  const maxSize = col.getMaxSize();
  const currentSize = col.getSize();

  const onPointerDown = (...args: unknown[]) => {
    const event = args[0] as { clientX?: number; defaultPrevented?: boolean } | undefined;
    if (event?.defaultPrevented) return;
    ctx.instance.startResize?.(col.id, currentSize, event?.clientX ?? 0);
  };

  const onKeyDown = (...args: unknown[]) => {
    const event = args[0] as
      | { key?: string; shiftKey?: boolean; defaultPrevented?: boolean }
      | undefined;
    if (event?.defaultPrevented) return;
    const step = event?.shiftKey ? 1 : DEFAULT_RESIZE_STEP_PX;
    if (event?.key === 'ArrowLeft') {
      ctx.instance.adjustResize?.(col.id, -step);
    } else if (event?.key === 'ArrowRight') {
      ctx.instance.adjustResize?.(col.id, step);
    } else if (event?.key === 'Enter') {
      ctx.instance.commitResize?.(col.id);
    } else if (event?.key === 'Escape') {
      ctx.instance.cancelResize?.(col.id);
    }
  };

  return mergeProps(
    {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': currentSize,
      'aria-valuemin': minSize,
      'aria-valuemax': maxSize,
      'aria-controls': col.id,
      'aria-label': `Resize column ${col.id}`,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    },
    consumerProps,
  );
};
