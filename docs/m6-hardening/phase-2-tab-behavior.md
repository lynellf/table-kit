# M6 Phase 2 — `tabBehavior: 'exit' | 'cells'`

**Goal:** Resolve spec §16 #4 open question by shipping a `tabBehavior` option on `useDataTable` and `usePivotTable`. Default `'exit'` (APG-conformant). `'cells'` opt-in for products needing Tab-through-cells.

**Files added:**
- `packages/react/src/useTabBehavior.ts` — small hook that owns Tab key handling
- `packages/react/src/__integration__/tab-behavior.test.tsx`

**Files modified:**
- `packages/react/src/useDataTable.ts` — accept `tabBehavior?` option (default `'exit'`)
- `packages/react/src/usePivotTable.ts` — accept `tabBehavior?` option
- `packages/react/src/useKeyboardNav.ts` — call into `useTabBehavior` when Tab pressed
- `packages/react/src/usePivotKeyboardNav.ts` — same for pivot
- `packages/core/src/types.ts` (or wherever DataTableOptions lives) — add `tabBehavior?: 'exit' | 'cells'`

**Tests added:** ~6-10 in `__integration__/tab-behavior.test.tsx` (default `'exit'` reaches a button outside the grid; `'cells'` reaches the first cell; pivot matches; `navigationMode: 'none'` ignores the option).

---

## 1. What this phase owns

- The `tabBehavior` option on both hooks.
- The interaction with the existing roving-tabindex keyboard suite (`useKeyboardNav`, `usePivotKeyboardNav`).
- The interaction with the `role="table"` downgrade (`navigationMode: 'none'`).
- Default behavior is byte-identical to M0–M5.

---

## 2. Implementation

### 2.1 Type surface

```ts
// packages/core/src/types.ts (DataTableOptions)
export type TabBehavior = 'exit' | 'cells';

export interface DataTableOptions<TRow> {
  // ...existing...
  /**
   * How Tab behaves inside the grid.
   * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
   * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
   */
  tabBehavior?: TabBehavior;
}
```

Same option on `PivotTableOptions`.

### 2.2 `useTabBehavior.ts`

```ts
import { useEffect } from 'react';
import type { TabBehavior } from '@lynellf/tablekit-core';

interface UseTabBehaviorOptions {
  /** Root grid element (where the keydown listener attaches). */
  gridRef: React.RefObject<HTMLElement>;
  /** Behavior selection (default 'exit'). */
  tabBehavior: TabBehavior;
}

/**
 * Owns the Tab key press handler.
 *
 * - 'exit': blur the active descendant; browser continues natural tab order.
 * - 'cells': keep focus in the grid; update roving tabindex to the next cell.
 *
 * Skips entirely when behavior is 'exit' AND navigationMode is 'none' (read-only).
 */
export function useTabBehavior({ gridRef, tabBehavior }: UseTabBehaviorOptions): void {
  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (tabBehavior === 'exit') {
        // Defer to the browser's natural tab order: blur whatever has focus.
        // The consumer's surrounding <button> / <a> takes focus next.
        const active = document.activeElement;
        if (active && root.contains(active)) {
          (active as HTMLElement).blur();
          // Don't preventDefault — let the browser move focus naturally.
        }
      } else {
        // 'cells': move roving tabindex to the first focusable cell in
        // document order. Per-row tab order.
        const firstCell = root.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]');
        if (firstCell) {
          e.preventDefault();
          firstCell.focus();
        }
      }
    };

    root.addEventListener('keydown', handleTab);
    return () => root.removeEventListener('keydown', handleTab);
  }, [gridRef, tabBehavior]);
}
```

The `'cells'` path is a smoke implementation: focuses the first cell and lets Arrow keys move within the row. The full Tab-through-every-cell sequence (cycling per row) is v1.5+; M6 ships the option.

### 2.3 Wiring into keyboard nav

```ts
// packages/react/src/useDataTable.ts (sketch)
export function useDataTable<TRow>(opts: DataTableOptions<TRow>): DataTableInstance<TRow> {
  // ...existing setup...
  const tabBehavior = opts.tabBehavior ?? 'exit';
  const gridRef = useRef<HTMLDivElement>(null);
  useTabBehavior({ gridRef, tabBehavior });
  // ...existing roving tabindex keyboard nav...
  return { /* ...existing returns... */, tabBehavior };
}
```

For pivot:

```ts
// packages/react/src/usePivotTable.ts (sketch)
const tabBehavior = opts.tabBehavior ?? 'exit';
const gridRef = useRef<HTMLDivElement>(null);
useTabBehavior({ gridRef, tabBehavior });
```

### 2.4 Interaction with `navigationMode: 'none'`

When `navigationMode: 'none'`, the role is downgraded to `role="table"`, the roving tabindex logic is skipped, and Tab behavior is the browser's natural flow (Tab moves through the document). The `useTabBehavior` hook's `'cells'` path looks for `[role="gridcell"]` (which doesn't exist in `'none'` mode — only `role="cell"`), so it's effectively a no-op in `'none'` mode.

A unit test asserts `useTabBehavior` does nothing in `'none'` mode.

---

## 3. Commands

```bash
pnpm typecheck
pnpm lint
pnpm test --filter @lynellf/tablekit-react
pnpm build --filter @lynellf/tablekit-react
```

---

## 4. Verification

- `pnpm test` exits 0.
- The existing M0–M5 keyboard suite still passes (default `'exit'` matches the M0–M5 implicit behavior).
- `__integration__/tab-behavior.test.tsx` covers:
  - Default `'exit'`: Tab from inside the grid blurs the active descendant; the next focusable element outside the grid receives focus.
  - Opt-in `'cells'`: Tab from the grid root focuses the first cell.
  - Pivot matches: `'exit'` and `'cells'` work for `usePivotTable` too.
  - `navigationMode: 'none'` ignores `tabBehavior` (Tab behavior is the browser's default; the hook is a no-op).
  - `'exit'` is the type-level default (omitting the option matches the explicit `'exit'`).

---

## 5. Out-of-scope

- **Full Tab-through-every-cell conformance suite.** M6 ships a smoke test for `'cells'`; the full suite is v1.5+ if a consumer requests it.
- **`tabBehavior` for `role="treegrid"` pivot in tree mode.** The hook handles `'cells'` and `'exit'` identically for both DataTable and PivotTable; tree-mode-specific Tab (collapse-to-summary, arrow-down-to-skip-children) is v1.5+.
- **`'focus-wrap'` or `'focus-trap'` modes.** Not in the spec; v1.5+ if requested.

---

## 6. Risks

- **R2A: `'exit'` differs from a "natural" Tab implementation.** Some users may prefer no blur step. APG says exit is correct; this is what `'exit'` does. The smoke test confirms the next focusable element receives focus.
- **R2B: `'cells'` looks too thin.** v1.0 ships the option as opt-in; the smoke test confirms Tab works; the full per-row Tab sequence is out of v1.0. Consumers wanting full conformance opt in and live with the smoke coverage until v1.5+.
- **R2C: Interaction with `useKeyboardNav`'s existing Tab handling.** The existing keyboard nav has Enter/Esc/Arrow/Space/PageUp/PageDown/Home/End. The new `useTabBehavior` hook runs *after* (or alongside) the existing one; the two don't conflict because `useTabBehavior`'s handler exits early on non-Tab keys.
