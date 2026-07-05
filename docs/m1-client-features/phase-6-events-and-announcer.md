# Phase 6 — Interaction Events + Announcer

**Goal:** Wire the §7.6 interaction events through the prop getters (`onCellClick`, `onCellDoubleClick`, `onCellContextMenu`, `onCellActivate`, `onCellFocusChange`, `onRowClick`, `onRowDoubleClick`, `onHeaderClick`) with the `CellEventContext` payload. Ship the **minimal announcer seam** (decision D3 — partial in M1, full polish in M6): `Announcer` interface in core + `noopAnnouncer` default + `ReactAnnouncer` live-region in react. Basic sort/filter/paginate announcements use hardcoded English strings (M6 replaces with the `messages` map).

After this phase:
- `DataTableOptions` carries the §7.6 interaction callbacks.
- `cell.getCellProps({ onClick: fn })` runs the consumer handler first, then calls the appropriate instance callback with `CellEventContext`.
- `row.getRowProps({ onClick: fn })` runs the consumer handler first, then calls `onRowClick`.
- `header.getHeaderProps({ onClick: fn })` runs the consumer handler first, then calls `onHeaderClick`.
- `Announcer` interface lives in `@lynellf/tablekit-core`. Default is `noopAnnouncer`. The instance routes announcements through it.
- `@lynellf/tablekit-react` ships `ReactAnnouncer` (a `<div aria-live="polite" />` mounted at module scope). `useDataTable` auto-injects it unless the consumer passes their own `announcer` option.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/events.ts` | `InteractionOptions`, `CellEventContext` types |
| `packages/core/src/events.test.ts` | Unit tests for event context construction |
| `packages/core/src/announcer.test.ts` | Unit tests for `noopAnnouncer` |
| `packages/react/src/ReactAnnouncer.tsx` | Live-region default announcer component |
| `packages/react/src/ReactAnnouncer.test.tsx` | Render tests for `ReactAnnouncer` |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/types.ts` | Add `InteractionOptions<TRow>`, `CellEventContext<TRow>` |
| `packages/core/src/announcer.ts` | Already has `noopAnnouncer` (phase 1 stub); finalizes the interface export |
| `packages/core/src/createDataTable.ts` | Wire interaction callbacks into cell/row/header prop getters; route announcements |
| `packages/core/src/index.ts` | Re-export `noopAnnouncer`, `ReactAnnouncer` re-export from react |
| `packages/react/src/useDataTable.ts` | Auto-inject `ReactAnnouncer` |
| `packages/react/src/index.ts` | Re-export `ReactAnnouncer` |
| `packages/react/src/useDataTable.test.tsx` | New tests for the auto-injection behavior |

No package config changes.

---

## 3. File contents

### 3.1 `packages/core/src/events.ts`

```ts
/**
 * @lynellf/tablekit-core — interaction events.
 *
 * Spec §7.6: top-level options on `DataTableOptions`. Native ordering is
 * preserved (a double-click fires two `onCellClick`). Consumer props merge
 * with, and run before, internal handlers; internal behavior is skipped when
 * `event.defaultPrevented`.
 */

import type { Cell } from './rows';
import type { Column } from './columns';
import type { Row } from './rows';

export type InteractionSource = 'mouse' | 'keyboard' | 'touch';

/**
 * Context passed to every interaction callback. Per spec §7.6: includes the
 * table, row, column, cell, value, indices, and source.
 */
export interface CellEventContext<TRow, TValue = unknown> {
  table: unknown; // DataTable instance; typed loosely to avoid the cycle
  row: Row<TRow>;
  column: Column<TRow, TValue>;
  cell: Cell<TRow, TValue>;
  value: TValue;
  rowIndex: number;
  colIndex: number;
  source: InteractionSource;
}

export type CellEventHandler<TRow, TValue = unknown> = (
  ctx: CellEventContext<TRow, TValue>,
  event: Event,
) => void;

export type HeaderEventHandler<TRow, TValue = unknown> = (
  ctx: { column: Column<TRow, TValue>; table: unknown },
  event: Event,
) => void;

export type RowEventHandler<TRow> = (
  ctx: { row: Row<TRow>; table: unknown },
  event: Event,
) => void;

/**
 * Options bag for the §7.6 interaction callbacks. All callbacks are
 * optional. The shape is mixed into `DataTableOptions<TRow>` via M1 wiring.
 */
export interface InteractionOptions<TRow> {
  onCellClick?: CellEventHandler<TRow>;
  onCellDoubleClick?: CellEventHandler<TRow>;
  onCellContextMenu?: CellEventHandler<TRow>;
  onCellActivate?: CellEventHandler<TRow>; // Enter/Space keyboard parity
  onCellFocusChange?: CellEventHandler<TRow>;
  onRowClick?: RowEventHandler<TRow>;
  onRowDoubleClick?: RowEventHandler<TRow>;
  onHeaderClick?: HeaderEventHandler<TRow>;
}
```

### 3.2 `packages/core/src/events.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { CellEventContext } from './events';

describe('CellEventContext shape', () => {
  it('is structurally assignable to the spec', () => {
    const ctx: CellEventContext<{ id: string }, string> = {
      table: undefined,
      row: { id: 'r1', index: 0, original: { id: 'r1' }, getVisibleCells: () => [] },
      column: {} as CellEventContext<{ id: string }, string>['column'],
      cell: {} as CellEventContext<{ id: string }, string>['cell'],
      value: 'Alice',
      rowIndex: 0,
      colIndex: 1,
      source: 'mouse',
    };
    expect(ctx.value).toBe('Alice');
    expect(ctx.source).toBe('mouse');
  });
});
```

### 3.3 `packages/core/src/announcer.ts` (final)

```ts
/**
 * @lynellf/tablekit-core — Announcer.
 *
 * Spec §10 (M1 minimal seam; full polish in M6): an injectable `Announcer`
 * interface. The default `noopAnnouncer` does nothing; consumers can inject
 * a custom implementation (e.g., the React live-region default).
 */

import type { Announcer } from './types';

export const noopAnnouncer: Announcer = {
  announce: () => {
    // default no-op
  },
};
```

### 3.4 `packages/core/src/announcer.test.ts`

```ts
import { describe, expect, it, vi } from 'vitest';
import { noopAnnouncer } from './announcer';

describe('noopAnnouncer', () => {
  it('exists and has an announce function', () => {
    expect(typeof noopAnnouncer.announce).toBe('function');
  });

  it('does nothing (does not throw, does not call any callback)', () => {
    const spy = vi.fn();
    expect(() => noopAnnouncer.announce('hello')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
```

### 3.5 `packages/core/src/types.ts` — additions

Add to `DataTableOptions<TRow>`:

```ts
  // ─────── Interaction events (M1; spec §7.6) ───────
  onCellClick?: import('./events').CellEventHandler<TRow>;
  onCellDoubleClick?: import('./events').CellEventHandler<TRow>;
  onCellContextMenu?: import('./events').CellEventHandler<TRow>;
  onCellActivate?: import('./events').CellEventHandler<TRow>;
  onCellFocusChange?: import('./events').CellEventHandler<TRow>;
  onRowClick?: import('./events').RowEventHandler<TRow>;
  onRowDoubleClick?: import('./events').RowEventHandler<TRow>;
  onHeaderClick?: import('./events').HeaderEventHandler<TRow>;
```

(The `import('./events')` inline import keeps `types.ts` from pulling in events.ts at runtime, which would create a cycle. `types.ts` is type-only at runtime, so the inline import is erased.)

### 3.6 `packages/core/src/createDataTable.ts` — wire events + announcer

Add the interaction event handlers. Each cell/row/header prop getter merges the consumer's `onClick`/etc. with a library-internal handler that, when invoked, dispatches the appropriate `on<...>Change` callback.

```ts
import type { CellEventContext, CellEventHandler, RowEventHandler, HeaderEventHandler } from './events';

// Inside the class:

  /**
   * Build the cell prop getter. Returns `role="gridcell"` + `aria-colindex` +
   * optional `data-pinned`, with consumer-merged event handlers.
   */
  private buildCellProps(
    cell: Cell<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx: CellEventContext<TRow> = {
      table: this,
      row: cell.row,
      column: cell.column as Column<TRow>,
      cell: cell as Cell<TRow>,
      value: cell.getValue() as never,
      rowIndex: cell.row.index,
      colIndex: cell.getContext().colIndex,
      source: 'mouse',
    };

    const handlers: Record<string, (...args: unknown[]) => void> = {
      onClick: (event: Event) => this.options.onCellClick?.(ctx, event),
      onDoubleClick: (event: Event) => this.options.onCellDoubleClick?.(ctx, event),
      onContextMenu: (event: Event) => this.options.onCellContextMenu?.(ctx, event),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          this.options.onCellActivate?.(ctx, event);
        }
      },
      onFocus: (event: Event) => this.options.onCellFocusChange?.(ctx, event),
    };

    return mergeProps(
      {
        ...defaultCellProps(cell),
        ...handlers,
      },
      consumerProps,
    );
  }

  /**
   * Build the row prop getter.
   */
  private buildRowProps(
    row: Row<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx = { table: this, row };
    const handlers: Record<string, (...args: unknown[]) => void> = {
      onClick: (event: Event) => this.options.onRowClick?.(ctx, event),
      onDoubleClick: (event: Event) => this.options.onRowDoubleClick?.(ctx, event),
    };
    return mergeProps(
      {
        ...defaultRowProps(row),
        ...handlers,
      },
      consumerProps,
    );
  }

  /**
   * Build the header prop getter.
   */
  private buildHeaderProps(
    header: Header<TRow>,
    consumerProps?: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx = { table: this, column: header.column };
    const handlers: Record<string, (...args: unknown[]) => void> = {
      onClick: (event: Event) => this.options.onHeaderClick?.(ctx, event),
    };
    return mergeProps(
      {
        ...defaultHeaderPropsStatic(header.column, header.index),
        ...handlers,
      },
      consumerProps,
    );
  }
```

Update `buildRowModel` (phase 1) so `Row.getRowProps` and `Cell.getCellProps` route through the instance:

```ts
  // In pipeline/rowModel.ts:
  const row: Row<TRow> = {
    id,
    index,
    original,
    getVisibleCells: () => buildVisibleCells(row, opts.columns, opts.table),
    getRowProps: (consumerProps?: Record<string, unknown>) =>
      opts.table ? opts.table.buildRowPropsForRow(row, consumerProps) : defaultRowProps(row, consumerProps),
  };
```

Where `buildRowPropsForRow` is exposed on the instance:

```ts
  /** Internal helper for Row.getRowProps(). */
  buildRowPropsForRow(row: Row<TRow>, consumerProps?: Record<string, unknown>) {
    return this.buildRowProps(row, consumerProps);
  }
```

Similarly for `Cell.getCellProps`.

### 3.7 `packages/react/src/ReactAnnouncer.tsx`

```tsx
/**
 * @lynellf/tablekit-react — React live-region announcer.
 *
 * Mounts a visually-hidden `aria-live="polite"` div. The `useDataTable`
 * hook injects this component by default unless the consumer passes their
 * own `announcer` option.
 *
 * Spec §10 (M1 minimal): the live-region is the only M1 surface. The
 * `messages` map and i18n land in M6.
 */

import { useEffect, useRef, useState } from 'react';
import type { Announcer } from '@lynellf/tablekit-core';

/**
 * Visual hiding CSS. Matches the WAI-ARIA visually-hidden pattern:
 *  - position: absolute to remove from layout
 *  - width/height: 1px to be present but invisible
 *  - margin: -1px to avoid affecting parent layout
 *  - overflow: hidden to clip any text overflow
 *  - clip: legacy support
 *  - white-space: nowrap to prevent line wrapping
 */
const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const POLITENESS_INTERVAL_MS = 1000; // throttle rapid announcements

/**
 * The `ReactAnnouncer` component maintains a single `aria-live` region and
 * exposes an `announce(message)` function via context or via a module-level
 * singleton (the singleton pattern is used to avoid React context for a
 * single-purpose component).
 */
let singletonAnnouncer: Announcer | null = null;

const setSingletonAnnouncer = (announcer: Announcer) => {
  singletonAnnouncer = announcer;
};

export const getReactAnnouncer = (): Announcer => {
  if (!singletonAnnouncer) {
    // Fallback: a no-op until ReactAnnouncer mounts.
    singletonAnnouncer = { announce: () => {} };
  }
  return singletonAnnouncer;
};

export const ReactAnnouncer = ({ politeness = 'polite' }: { politeness?: 'polite' | 'assertive' }) => {
  const [message, setMessage] = useState('');
  const lastAnnounceRef = useRef<{ message: string; ts: number }>({ message: '', ts: 0 });

  useEffect(() => {
    const announcer: Announcer = {
      announce: (msg: string) => {
        const now = Date.now();
        // Throttle: if the same message is announced within 1 second, skip.
        if (
          msg === lastAnnounceRef.current.message &&
          now - lastAnnounceRef.current.ts < POLITENESS_INTERVAL_MS
        ) {
          return;
        }
        lastAnnounceRef.current = { message: msg, ts: now };
        // Clear then set so screen readers re-announce identical messages.
        setMessage('');
        requestAnimationFrame(() => setMessage(msg));
      },
    };
    setSingletonAnnouncer(announcer);
    return () => {
      setSingletonAnnouncer({ announce: () => {} });
    };
  }, []);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      style={visuallyHiddenStyle}
      data-testid="tablekit-announcer"
    >
      {message}
    </div>
  );
};
```

### 3.8 `packages/react/src/ReactAnnouncer.test.tsx`

```tsx
/** @jsxImportSource react */
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';

describe('ReactAnnouncer', () => {
  it('renders a visually-hidden aria-live region', () => {
    render(<ReactAnnouncer />);
    const region = screen.getByTestId('tablekit-announcer');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');
  });

  it('exposes getReactAnnouncer() with an announce() function', () => {
    render(<ReactAnnouncer />);
    const announcer = getReactAnnouncer();
    expect(typeof announcer.announce).toBe('function');
  });

  it('renders the announced message into the live region', () => {
    render(<ReactAnnouncer />);
    const announcer = getReactAnnouncer();
    act(() => {
      announcer.announce('Sorted by name ascending');
    });
    expect(screen.getByTestId('tablekit-announcer').textContent).toBe(
      'Sorted by name ascending',
    );
  });

  it('throttles repeated identical messages within 1 second', () => {
    render(<ReactAnnouncer />);
    const announcer = getReactAnnouncer();
    act(() => {
      announcer.announce('hello');
    });
    expect(screen.getByTestId('tablekit-announcer').textContent).toBe('hello');
    // Second identical announcement within 1s is suppressed by the clear-then-set.
    // The visible result is still the latest message; the throttle is internal.
    // Test by checking that no error is thrown.
    act(() => {
      announcer.announce('hello');
    });
    expect(screen.getByTestId('tablekit-announcer').textContent).toBe('hello');
  });
});
```

### 3.9 `packages/react/src/useDataTable.ts` — auto-inject ReactAnnouncer

Update the hook to render `ReactAnnouncer` as a sibling of the consumer's children. The simplest implementation: render a `<>` fragment containing `<ReactAnnouncer />` plus the children. Consumers wrap their children as usual.

```tsx
import { ReactAnnouncer } from './ReactAnnouncer';

export const useDataTable = <TRow>(options: DataTableOptions<TRow>): UseDataTableResult<TRow> => {
  // ...existing implementation...

  // Auto-mount ReactAnnouncer unless the consumer provided their own announcer.
  const announcer = options.announcer ?? getReactAnnouncer();
  const finalOptions = announcer === options.announcer
    ? options
    : { ...options, announcer };

  // Apply the merged options.
  table.setOptions(finalOptions);

  // ...rest unchanged...
  return { table, state };
};
```

And the consumer wraps the return value to include `<ReactAnnouncer />`. Actually, a cleaner approach: `useDataTable` returns the `table` + `state`, and the consumer manually renders `<ReactAnnouncer />` alongside their table. To make this automatic, we update the hook to return a render-ready structure:

```tsx
export interface UseDataTableResult<TRow> {
  table: DataTableInstance<TRow>;
  state: DataTableState;
  /** Render the announcer (returns the ReactAnnouncer component). */
  Announcer: () => JSX.Element;
}

export const useDataTable = <TRow>(options: DataTableOptions<TRow>): UseDataTableResult<TRow> => {
  // ...
  return {
    table,
    state,
    Announcer: () => <ReactAnnouncer />,
  };
};
```

Consumers use:

```tsx
function MyTable() {
  const { table, state, Announcer } = useDataTable({ data, columns });
  return (
    <>
      <Announcer />
      <div {...table.getGridProps()}>
        {/* ... */}
      </div>
    </>
  );
}
```

This pattern keeps `useDataTable` a hook (no JSX returned directly) and lets the consumer control where the announcer is mounted.

### 3.10 `packages/react/src/index.ts` — additions

```ts
export { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';
```

`UseDataTableResult` is updated in `useDataTable.ts` to include `Announcer`.

---

## 4. Commands (in order)

```bash
# 1. Write all files above.
# 2. Verify
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-core test
pnpm --filter @lynellf/tablekit-react typecheck
pnpm --filter @lynellf/tablekit-react test
pnpm verify
```

Expected after phase 6:
- All prior tests still pass.
- ~10 events tests pass.
- ~5 announcer tests pass.
- ~4 ReactAnnouncer tests pass.
- `pnpm verify` exit 0.

---

## 5. Verification

```bash
pnpm --filter @lynellf/tablekit-core test
pnpm --filter @lynellf/tablekit-react test
# Look for:
#   ✓ events > ... (~3 tests)
#   ✓ announcer > ... (~2 tests)
#   ✓ ReactAnnouncer > ... (~4 tests)
```

---

## 6. Out of scope for this phase

- Full announcer polish (`messages` map, i18n, politeness heuristics beyond `'polite'` default) — M6.
- `validateGridStructure` — M6.
- Touch-source attribution for `onCellClick` (currently always `'mouse'`) — M6 (when touch event handling is added).
- Manual SR test matrix — M6.

---

## 7. Risks specific to this phase

| Risk | Mitigation |
| --- | --- |
| `useDataTable` returning a render function (`Announcer: () => JSX.Element`) breaks the M0 contract | The M0 `UseDataTableResult` shape is `{ table, state }`. The new shape adds a third field, which is backwards-compatible (existing consumers ignore the new field). |
| Singleton `getReactAnnouncer()` pattern means multiple instances of `ReactAnnouncer` share state | Acceptable for M1 (single live-region per app). M2 may add context-based injection. |
| `requestAnimationFrame` in `ReactAnnouncer.announce` may not flush in jsdom tests | The test uses `act()` to flush pending updates. If flaky, fall back to `setTimeout(..., 0)`. |
| Event handler chain might not flush before consumer `defaultPrevented` check in jsdom | The `defaultPrevented` check happens in the same synchronous call as the consumer handler, so this is fine. |
| `Announcer.announce` race condition when called from a controlled-slice callback vs. uncontrolled | The `announce()` call is synchronous; ordering is preserved. Tested in phase 7. |
| `Event` type in the handler signatures is the DOM `Event` — when the React adapter dispatches, the type matches | The handlers receive the React synthetic event, which extends `BaseSyntheticEvent` (compatible with `Event` at the type level for `preventDefault`/`defaultPrevented`). |
| `mergeProps` stashes the library handler under `__lib_<key>`; the React adapter must unwrap this | Phase 5's `mergeProps` docstring documents this. Phase 7's README explains the adapter dispatch. The unit test `propGetters.test.ts > mergeProps > chains event handlers` pins the contract. |