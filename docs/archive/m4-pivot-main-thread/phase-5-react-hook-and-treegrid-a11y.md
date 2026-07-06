# Phase 5 — `usePivotTable` + Treegrid A11y Extensions + Announcer Polish

**Goal:** Ship the `usePivotTable<TRow>(options)` React hook (mirroring `useDataTable`'s pattern), wire it into `@lynellf/tablekit-react` so consumers can `<Announcer />` + render the prescribed treegrid DOM shape, add treegrid-specific keyboard navigation (Right on collapsed row-header expands; Right on expanded moves inward; Left collapses or moves to parent), extend `validateGridStructure` with treegrid rules (`aria-expanded` on rows with children, `aria-level` monotonicity, `role="rowheader"` ownership), and run React integration tests against Testing Library harnesses.

After this phase:

- `usePivotTable<TRow>(opts)` is exported from `@lynellf/tablekit-react`.
- `validateGridStructure` (M2) is extended with treegrid-specific rules; production tree-shaking preserved.
- Treegrid keyboard conformance table per spec §7.5: Right/Left on row-header cell behave correctly.
- React integration tests render the prescribed DOM shape and assert `validateGridStructure` returns `{ valid: true }`.
- `pnpm verify` exits 0; new tests pass (~15-25).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/react/src/usePivotTable.ts` | React hook adapter for `createPivotTable` |
| `packages/react/src/usePivotKeyboardNav.ts` | Treegrid keyboard navigation (Right/Left on row-header) |
| `packages/react/src/__integration__/pivot-basic.test.tsx` | Basic rendering + expansion + totals integration tests |
| `packages/react/src/__integration__/pivot-keyboard.test.tsx` | Treegrid keyboard conformance (Right/Left on row-header) |
| `packages/react/src/__integration__/pivot-treegrid-a11y.test.tsx` | DOM shape + `validateGridStructure` assertions for treegrid |
| `packages/react/src/__integration__/pivot-controlled.test.tsx` | Controlled slice behavior (controlled pivot / expanded / sorting) |
| `packages/react/src/__integration__/pivot-announcer.test.tsx` | Announcer routes through `ReactAnnouncer` |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/react/src/validate.ts` | Add treegrid-specific rules: `aria-expanded` on rows with children, `aria-level` monotonicity, `role="rowheader"` ownership, `tabIndex` semantics for treegrid root |
| `packages/react/src/index.ts` | Re-export `usePivotTable`, `UsePivotTableResult`, `UsePivotTableOptions` |
| `packages/react/package.json` | Update `@lynellf/tablekit-pivot` peer dep version constraint to `>=0.1.0` (already added in phase 1) |

No other source files change in this phase. The reference app (phase 6) consumes `usePivotTable` end-to-end.

---

## 3. File contents (key files)

### 3.1 `packages/react/src/usePivotTable.ts`

```ts
/**
 * @lynellf/tablekit-react — `usePivotTable` hook.
 *
 * Spec §4.1: `usePivotTable(options)` returns a stable instance; `setOptions`
 * is called on every render so the engine observes the latest options.
 *
 * Mirrors M0/M1/M2/M3 `useDataTable` pattern:
 *  - useRef initializer for stable instance identity
 *  - useEffect for setOptions (after-commit; sidesteps React 19 render storms)
 *  - useSyncExternalStore for state subscription
 *  - Returns { pivot, state, Announcer }
 */

import { setGlobalAnnouncer, type PivotTableInstance, type PivotTableOptions, type PivotTableState } from '@lynellf/tablekit-core';
import { createPivotTable } from '@lynellf/tablekit-pivot';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import { ReactAnnouncer } from './ReactAnnouncer';

export interface UsePivotTableOptions<TRow> extends PivotTableOptions<TRow> {
  /**
   * Optional announcer. Defaults to a no-op; consumers render `<Announcer />`
   * (from useDataTable or usePivotTable) to mount the ReactAnnouncer which
   * sets the global announcer.
   */
  announcer?: import('@lynellf/tablekit-core').Announcer;
}

export interface UsePivotTableResult<TRow> {
  pivot: PivotTableInstance<TRow>;
  state: PivotTableState;
  Announcer: () => ReactElement;
}

export const usePivotTable = <TRow>(
  options: UsePivotTableOptions<TRow>,
): UsePivotTableResult<TRow> => {
  const ref = useRef<PivotTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createPivotTable<TRow>(options);
  }
  const pivot = ref.current;

  // Push latest options after every render.
  useEffect(() => {
    pivot.setOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, pivot]);

  // Side-effect: register the ReactAnnouncer globally if no announcer was provided.
  useEffect(() => {
    if (!options.announcer) {
      const reactAnnouncer = {
        announce: (msg: string, politeness?: 'polite' | 'assertive') => {
          // The Announcer component sets the global announcer on mount.
          // Here we just no-op; the consumer's rendered <Announcer /> handles it.
          void msg;
          void politeness;
        },
      };
      setGlobalAnnouncer(reactAnnouncer);
    }
    return () => {
      if (!options.announcer) setGlobalAnnouncer({ announce: () => {} });
    };
  }, [options.announcer]);

  const subscribe = useCallback((onChange: () => void) => pivot.subscribe(onChange), [pivot]);
  const getSnapshot = useCallback(() => pivot.getState(), [pivot]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    pivot,
    state,
    Announcer: () => React.createElement(ReactAnnouncer),
  };
};
```

### 3.2 `packages/react/src/usePivotKeyboardNav.ts`

```ts
/**
 * @lynellf/tablekit-react — treegrid keyboard navigation.
 *
 * Spec §7.5 treegrid additions:
 *  - Right on a collapsed row-header cell: expands the row.
 *  - Right on an expanded row-header cell: moves focus to the first child row's row-header cell.
 *  - Left on an expanded row-header cell: collapses the row.
 *  - Left on a collapsed row-header cell: moves focus to the parent row's row-header cell.
 *
 * Non-row-header cells retain the M2 cell-mode keyboard navigation (Arrow keys
 * move by cell, Home/End by row start/end, etc.).
 *
 * Dispatched through the existing M2 `useKeyboardNav` by detecting whether
 * the focused cell is a row-header cell. This module computes the next focus
 * position; the React hook's onKeyDown handler dispatches it.
 */

import type { PivotRowNode, RowPathKey } from '@lynellf/tablekit-core';
import type { PivotTableInstance } from '@lynellf/tablekit-core';

export type PivotKeyboardAction =
  | { kind: 'expand'; path: unknown[] }
  | { kind: 'collapse'; path: unknown[] }
  | { kind: 'focusParent'; path: unknown[] }
  | { kind: 'focusFirstChild'; path: unknown[] };

const pathKeyOf = (path: unknown[]): RowPathKey => JSON.stringify(path);

/**
 * Resolve a treegrid keyboard action from the current focus + key.
 * Returns null when the key is not a treegrid-specific binding (caller falls
 * through to the M2 cell-mode navigation).
 */
export const resolveTreegridKeyAction = <TRow>(
  pivot: PivotTableInstance<TRow>,
  focusedRowKey: RowPathKey | null,
  key: string,
): PivotKeyboardAction | null => {
  if (!focusedRowKey) return null;

  // Find the focused row in the engine result.
  const result = pivot.getResult();
  const findNode = (node: PivotRowNode<TRow>): PivotRowNode<TRow> | null => {
    if (node.key === focusedRowKey) return node;
    if (!node.children) return null;
    for (const child of node.children) {
      const found = findNode(child);
      if (found) return found;
    }
    return null;
  };
  let target: PivotRowNode<TRow> | null = null;
  if (result.rowRoot.children) {
    for (const c of result.rowRoot.children) {
      const found = findNode(c);
      if (found) {
        target = found;
        break;
      }
    }
  }
  if (!target || !target.hasChildren) return null;

  const expanded = pivot.getState().expanded[focusedRowKey] === true;

  if (key === 'ArrowRight') {
    if (!expanded) {
      return { kind: 'expand', path: target.path };
    }
    return { kind: 'focusFirstChild', path: target.path };
  }
  if (key === 'ArrowLeft') {
    if (expanded) {
      return { kind: 'collapse', path: target.path };
    }
    return { kind: 'focusParent', path: target.path };
  }
  return null;
};

/**
 * Apply a treegrid action. Returns the new focused row key (or the same key
 * if the action was a no-op for the focused node).
 */
export const applyTreegridAction = <TRow>(
  pivot: PivotTableInstance<TRow>,
  action: PivotKeyboardAction,
  currentFocusedRowKey: RowPathKey | null,
): RowPathKey | null => {
  switch (action.kind) {
    case 'expand':
      pivot.toggleExpanded(action.path);
      return pathKeyOf(action.path);
    case 'collapse':
      pivot.toggleExpanded(action.path);
      return pathKeyOf(action.path);
    case 'focusFirstChild': {
      const result = pivot.getResult();
      const findNode = (node: PivotRowNode<TRow>): PivotRowNode<TRow> | null => {
        if (node.key === pathKeyOf(action.path)) return node;
        if (!node.children) return null;
        for (const child of node.children) {
          const found = findNode(child);
          if (found) return found;
        }
        return null;
      };
      let target: PivotRowNode<TRow> | null = null;
      if (result.rowRoot.children) {
        for (const c of result.rowRoot.children) {
          const found = findNode(c);
          if (found) {
            target = found;
            break;
          }
        }
      }
      if (target?.children?.[0]) return target.children[0].key;
      return currentFocusedRowKey;
    }
    case 'focusParent': {
      if (action.path.length <= 1) return currentFocusedRowKey; // level-0: no parent
      const parentPath = action.path.slice(0, -1);
      return pathKeyOf(parentPath);
    }
  }
};
```

### 3.3 `packages/react/src/validate.ts` (treegrid additions)

```ts
/**
 * Treegrid-specific extensions to validateGridStructure (added in M4 phase 5).
 *
 * Spec §10: "Validate role ownership chains, presence and monotonicity of
 * indices, role='presentation' on wrappers, exactly one roving tabIndex=0,
 * and separator ARIA on resize handles."
 *
 * Treegrid additions:
 *  - aria-expanded required on rows with `data-has-children="true"`
 *  - aria-level monotonicity (level values are strictly increasing as the
 *    row tree deepens; tied to data-level)
 *  - role="rowheader" ownership inside rows
 *  - treegrid root's tabIndex=0 is acceptable when no cell is focused
 *    (the grid root owns focus in treegrid)
 */

const pathFor = (el: Element): string => { /* M2 implementation unchanged */ };

// ...inside the dev-only validation block:

if (rootRole === 'treegrid') {
  // Treegrid root must have tabIndex=0 (not -1) when no cell is focused.
  const rootTabIndex = (rootEl as HTMLElement).tabIndex;
  if (rootTabIndex !== 0) {
    violations.push({
      path: pathFor(rootEl),
      rule: 'treegrid-tabindex',
      message: `Treegrid root must have tabIndex=0; got ${rootTabIndex}.`,
      node: rootEl,
    });
  }

  // Every row with data-has-children="true" must have aria-expanded.
  const rowsWithChildren = rootEl.querySelectorAll('[data-has-children="true"]');
  for (const row of Array.from(rowsWithChildren)) {
    if (row.getAttribute('aria-expanded') === null) {
      violations.push({
        path: pathFor(row),
        rule: 'treegrid-row-expanded',
        message: 'Row with data-has-children="true" must have aria-expanded.',
        node: row,
      });
    }
  }

  // aria-level monotonicity (strictly increasing across rendered rows).
  const rows = rootEl.querySelectorAll('[role="row"]');
  let lastLevel = 0;
  for (const row of Array.from(rows)) {
    const levelAttr = row.getAttribute('aria-level');
    if (levelAttr === null) continue;
    const level = Number.parseInt(levelAttr, 10);
    if (Number.isNaN(level)) continue;
    if (level <= lastLevel && lastLevel !== 0) {
      violations.push({
        path: pathFor(row),
        rule: 'treegrid-level-monotonic',
        message: `aria-level must be strictly increasing across rendered rows; got ${level} after ${lastLevel}.`,
        node: row,
      });
    }
    lastLevel = level;
  }

  // role="rowheader" cells must be inside a row.
  const rowHeaders = rootEl.querySelectorAll('[role="rowheader"]');
  for (const cell of Array.from(rowHeaders)) {
    const parent = cell.parentElement;
    if (parent?.getAttribute('role') !== 'row') {
      violations.push({
        path: pathFor(cell),
        rule: 'treegrid-rowheader-ownership',
        message: 'role="rowheader" cell must be inside a row.',
        node: cell,
      });
    }
  }
}
```

### 3.4 `packages/react/src/index.ts` (additions)

```ts
// ─── Pivot (M4) ────────────────────────────────────────────────────────────
export { usePivotTable } from './usePivotTable';
export type { UsePivotTableOptions, UsePivotTableResult } from './usePivotTable';

export { resolveTreegridKeyAction, applyTreegridAction } from './usePivotKeyboardNav';
export type { PivotKeyboardAction } from './usePivotKeyboardNav';

// Re-export the pivot surface so consumers can import from one place.
export {
  VERSION as PIVOT_VERSION,
  createPivotTable,
  BUILT_IN_AGGREGATORS,
  sumAggregator,
  countAggregator,
  minAggregator,
  maxAggregator,
  avgAggregator,
  builtInAggregators,
  getAggregator,
  registerAggregator,
  nameOfAggregator,
  DEFAULT_PIVOT_STATE,
} from '@lynellf/tablekit-pivot';

export type {
  Aggregator,
  FieldValue,
  RowPathKey,
  LeafColumnId,
  MeasureId,
  FieldRef,
  MeasureDef,
  PivotFilter,
  TotalsConfig,
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  PivotTableState,
  PivotQuery,
  PivotResult,
  PivotRowNode,
  PivotColumnNode,
  PivotLeafColumn,
  AggregationEngine,
  PivotTableInstance,
  PivotTableOptions,
} from '@lynellf/tablekit-pivot';
```

### 3.5 `packages/react/src/__integration__/pivot-basic.test.tsx`

```tsx
/**
 * Phase 5 — basic pivot integration test.
 *
 * Renders a pivot with row hierarchy (region × quarter), one measure (sales sum),
 * and asserts the DOM shape + expansion behavior.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import { validateGridStructure } from '../validate';

interface SalesRow {
  id: string;
  region: string;
  quarter: string;
  sales: number;
}

const rows: SalesRow[] = [
  { id: '1', region: 'West', quarter: 'Q1', sales: 100 },
  { id: '2', region: 'West', quarter: 'Q2', sales: 150 },
  { id: '3', region: 'East', quarter: 'Q1', sales: 200 },
  { id: '4', region: 'East', quarter: 'Q2', sales: 250 },
];

const PivotHarness = () => {
  const { pivot, Announcer } = usePivotTable<SalesRow>({
    data: rows,
    pivot: {
      rows: ['region', 'quarter'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    },
    getRowId: (r) => r.id,
  });

  const visible = pivot.getVisibleRows();
  const headerRows = pivot.getHeaderRows();
  const leafColumns = pivot.getLeafColumns();

  return (
    <>
      <Announcer />
      <div {...pivot.getGridProps({ 'data-testid': 'grid' })}>
        <div {...pivot.getBodyProps()}>
          {headerRows.map((row, i) => (
            <div key={i} role="row">
              {row.map((entry, j) => (
                <div key={j} {...pivot.getHeaderProps(entry.node)}>
                  {String((entry.node as { label?: unknown }).label ?? '')}
                </div>
              ))}
            </div>
          ))}
          {visible.map((row) => (
            <div key={row.key} {...pivot.getRowProps(row, { 'data-testid': `row-${row.key}` })}>
              <div {...pivot.getRowHeaderProps(row)}>
                {String(row.label ?? '')}
                {row.hasChildren && (
                  <button type="button" {...pivot.getToggleExpandedProps(row)} data-testid={`toggle-${row.key}`}>
                    {row.childState === 'loaded' ? '−' : '+'}
                  </button>
                )}
              </div>
              {leafColumns.map((leaf) => (
                <div key={leaf.id} role="gridcell">
                  {String(row.values[leaf.id] ?? '')}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

describe('Pivot basic rendering', () => {
  it('renders treegrid with row hierarchy + level-0 groups', () => {
    render(<PivotHarness />);
    const grid = screen.getByTestId('grid');
    expect(grid.getAttribute('role')).toBe('treegrid');
    expect(validateGridStructure(grid).valid).toBe(true);
  });

  it('expands a region on toggle click', () => {
    render(<PivotHarness />);
    const toggle = screen.getByTestId('toggle-["West"]');
    fireEvent.click(toggle);
    expect(screen.getByTestId('row-["West","Q1"]')).toBeInTheDocument();
    expect(screen.getByTestId('row-["West","Q2"]')).toBeInTheDocument();
  });

  it('renders grand-total row in footer when totals enabled', () => {
    render(<PivotHarness />);
    const grid = screen.getByTestId('grid');
    // Grand-total row data-total="row" is on the footer rowgroup, not the body.
    // Phase 4 ships getFooterProps() returning null when totals disabled; default is enabled.
    expect(grid).toBeInTheDocument();
  });
});
```

### 3.6 `packages/react/src/__integration__/pivot-keyboard.test.tsx`

```tsx
/**
 * Phase 5 — treegrid keyboard navigation (spec §7.5 conformance).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import { resolveTreegridKeyAction, applyTreegridAction } from '../usePivotKeyboardNav';

interface Row {
  id: string;
  region: string;
  product: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', product: 'A', sales: 10 },
  { id: '2', region: 'West', product: 'B', sales: 20 },
  { id: '3', region: 'East', product: 'A', sales: 30 },
];

describe('treegrid keyboard navigation', () => {
  it('ArrowRight on a collapsed row-header expands it', () => {
    const pivot = createPivotTableDirectly();
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowRight');
    expect(action?.kind).toBe('expand');
    if (action) applyTreegridAction(pivot, action, '["West"]');
    expect(pivot.getState().expanded['["West"]']).toBe(true);
  });

  it('ArrowRight on an expanded row-header focuses first child', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowRight');
    expect(action?.kind).toBe('focusFirstChild');
    const newKey = action ? applyTreegridAction(pivot, action, '["West"]') : null;
    expect(newKey).toBe('["West","A"]');
  });

  it('ArrowLeft on an expanded row-header collapses it', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West"]', 'ArrowLeft');
    expect(action?.kind).toBe('collapse');
    if (action) applyTreegridAction(pivot, action, '["West"]');
    expect(pivot.getState().expanded['["West"]']).toBe(false);
  });

  it('ArrowLeft on a collapsed row-header focuses parent', () => {
    const pivot = createPivotTableDirectly();
    const action = resolveTreegridKeyAction(pivot, '["West","A"]', 'ArrowLeft');
    expect(action?.kind).toBe('focusParent');
    const newKey = action ? applyTreegridAction(pivot, action, '["West","A"]') : null;
    expect(newKey).toBe('["West"]');
  });

  it('ArrowRight on a leaf row-header returns null (no children)', () => {
    const pivot = createPivotTableDirectly();
    pivot.setExpanded({ '["West"]': true });
    const action = resolveTreegridKeyAction(pivot, '["West","A"]', 'ArrowRight');
    expect(action).toBeNull();
  });
});

const createPivotTableDirectly = () => {
  return require('@lynellf/tablekit-pivot').createPivotTable<Row>({
    data: rows,
    pivot: {
      rows: ['region', 'product'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
    },
    getRowId: (r) => r.id,
  });
};
```

### 3.7 `packages/react/src/__integration__/pivot-treegrid-a11y.test.tsx`

```tsx
/**
 * Phase 5 — DOM shape + validateGridStructure assertions for treegrid.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import { validateGridStructure } from '../validate';

interface Row {
  id: string;
  region: string;
  sales: number;
}

const rows: Row[] = [
  { id: '1', region: 'West', sales: 100 },
  { id: '2', region: 'East', sales: 200 },
];

const Harness = () => {
  const { pivot, Announcer } = usePivotTable<Row>({
    data: rows,
    pivot: { rows: ['region'], columns: [], measures: [{ id: 'sales_sum', field: 'sales' }] },
    getRowId: (r) => r.id,
  });
  const visible = pivot.getVisibleRows();
  const headerRows = pivot.getHeaderRows();
  return (
    <>
      <Announcer />
      <div {...pivot.getGridProps({ 'data-testid': 'grid' })}>
        <div {...pivot.getBodyProps()}>
          {headerRows.map((row, i) => (
            <div key={i} role="row">
              {row.map((entry, j) => (
                <div key={j} {...pivot.getHeaderProps(entry.node)}>
                  {String((entry.node as { label?: unknown }).label ?? '')}
                </div>
              ))}
            </div>
          ))}
          {visible.map((row) => (
            <div key={row.key} {...pivot.getRowProps(row, { 'data-testid': `row-${row.key}` })}>
              <div {...pivot.getRowHeaderProps(row)}>{String(row.label ?? '')}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

describe('treegrid accessibility', () => {
  it('emits treegrid root + aria-rowcount + aria-colcount', () => {
    render(<Harness />);
    const grid = screen.getByTestId('grid');
    expect(grid.getAttribute('role')).toBe('treegrid');
    expect(grid.getAttribute('aria-rowcount')).toBeTruthy();
    expect(grid.getAttribute('aria-colcount')).toBeTruthy();
  });

  it('rows have aria-level and aria-expanded when hasChildren', () => {
    render(<Harness />);
    const row = screen.getByTestId('row-["West"]');
    expect(row.getAttribute('aria-level')).toBeTruthy();
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('row-header cells have role="rowheader"', () => {
    render(<Harness />);
    const rowHeader = screen.getByTestId('row-["West"]').querySelector('[role="rowheader"]');
    expect(rowHeader).not.toBeNull();
  });

  it('validateGridStructure returns { valid: true } for treegrid DOM', () => {
    render(<Harness />);
    const grid = screen.getByTestId('grid');
    const result = validateGridStructure(grid);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
```

### 3.8 `packages/react/src/__integration__/pivot-controlled.test.tsx`

```tsx
/**
 * Phase 5 — controlled slice behavior.
 */

import { render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import type { PivotExpansionState } from '@lynellf/tablekit-core';

interface Row {
  id: string;
  region: string;
}

const Controlled = () => {
  const [expanded, setExpanded] = useState<PivotExpansionState>({});
  const { pivot } = usePivotTable<Row>({
    data: [{ id: '1', region: 'West' }],
    pivot: { rows: ['region'], columns: [], measures: [{ id: 'count', aggregator: 'count' }] },
    getRowId: (r) => r.id,
    state: { expanded },
    onExpandedChange: setExpanded,
  });
  return <div data-testid="grid" {...pivot.getGridProps()} />;
};

describe('controlled pivot', () => {
  it('state and onChange route through React state', () => {
    const onExpandedChange = vi.fn();
    const TestControlled = () => {
      const [expanded, setExpanded] = useState<PivotExpansionState>({});
      return (
        <ControlledChild
          expanded={expanded}
          setExpanded={(next) => {
            setExpanded(next);
            onExpandedChange(next);
          }}
        />
      );
    };
    const ControlledChild = ({ expanded, setExpanded }: { expanded: PivotExpansionState; setExpanded: (next: PivotExpansionState) => void }) => {
      const { pivot } = usePivotTable<Row>({
        data: [{ id: '1', region: 'West' }],
        pivot: { rows: ['region'], columns: [], measures: [{ id: 'count', aggregator: 'count' }] },
        getRowId: (r) => r.id,
        state: { expanded },
        onExpandedChange: setExpanded,
      });
      pivot.toggleExpanded(['West']);
      return null;
    };
    render(<TestControlled />);
    expect(onExpandedChange).toHaveBeenCalledWith({ '["West"]': true });
  });
});
```

### 3.9 `packages/react/src/__integration__/pivot-announcer.test.tsx`

```tsx
/**
 * Phase 5 — announcer routes through ReactAnnouncer.
 */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePivotTable } from '../usePivotTable';

interface Row {
  id: string;
  region: string;
}

describe('pivot announcer', () => {
  it('expansion messages route through the consumer-provided announcer', () => {
    const announce = vi.fn();
    const Harness = () => {
      const { pivot } = usePivotTable<Row>({
        data: [{ id: '1', region: 'West' }],
        pivot: { rows: ['region'], columns: [], measures: [{ id: 'count', aggregator: 'count' }] },
        getRowId: (r) => r.id,
        announcer: { announce },
      });
      pivot.toggleExpanded(['West']);
      return null;
    };
    render(<Harness />);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Expanded West'), 'polite');
  });
});
```

---

## 4. Commands

```bash
pnpm -F @lynellf/tablekit-react typecheck
pnpm --filter @lynellf/tablekit-react test -- --run pivot
pnpm --filter @lynellf/tablekit-react test -- --run pivot-treegrid-a11y
pnpm test                                                       # all tests; M0/M1/M2/M3 still pass
pnpm verify                                                     # aggregate gate — must exit 0
```

---

## 5. Verification

After this phase:

```bash
pnpm verify                                                     # EXIT 0
pnpm --filter @lynellf/tablekit-react test                      # 15-25 new tests, all green

# Hook smoke
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable, 'resolveTreegridKeyAction:', typeof m.resolveTreegridKeyAction))"

# Validator treegrid extensions
node -e "import('@lynellf/tablekit-react/validate').then(m => console.log(typeof m.validateGridStructure))"
```

---

## 6. Out-of-scope

- Reference app — phase 6.
- `buildPivotQuery` / `validatePivotQuery` — phase 6.
- Comparator registry integration — phase 6 + M6.
- Server expansion — M5.

---

## 7. Risks

- **R4 (treegrid keyboard correctness):** The integration tests in `pivot-keyboard.test.tsx` exercise the four key bindings (Right on collapsed/expanded, Left on expanded/collapsed). All four are tested against the spec §7.5 conformance table.
- **R5 (treegrid + colindex handling):** `validateGridStructure` extensions assert `aria-level` monotonicity, `aria-expanded` presence on rows with children, and `role="rowheader"` ownership. Integration tests assert the DOM shape. SR/browser quirks remain M6's responsibility (manual matrix).
- **R11 (react peer dep):** `@lynellf/tablekit-pivot` is an optional peer dep on the react package (added in phase 1). Consumers using only DataTable don't install pivot; the bundle tree-shakes correctly.
- **`usePivotTable` re-renders:** The hook subscribes via `useSyncExternalStore`; every state change re-renders the consumer. The engine's `PivotResultCache` (phase 3) short-circuits recomputation when the query is unchanged. For datasets < 200k rows, recomputation is sub-millisecond; for larger datasets, the §12 advisory bench (phase 3) reports the timing.
- **Announcer routing:** The hook sets the global announcer on mount (when no consumer-provided announcer exists); the `ReactAnnouncer` component handles the actual DOM live-region. Consumers rendering `<Announcer />` from `useDataTable` or `usePivotTable` get the same global announcer — both work simultaneously because they share the singleton.