/**
 * @lynellf/tablekit-react — useTabBehavior hook.
 *
 * Spec §16 #4 (M6 phase 2): owns the Tab key press handler.
 *
 * - 'exit' (default, APG-conformant): Tab moves focus out of the grid.
 *   Defer to the browser's natural tab order by blurring the active element.
 * - 'cells' (opt-in): Tab focuses the first cell; Arrow keys move within the row.
 *
 * When `navigationMode: 'none'` (role="table" downgrade), this hook is a no-op
 * because there are no interactive grid cells — the browser's natural Tab order
 * applies to the static content.
 */

import type { TabBehavior } from '@lynellf/tablekit-core';
import { useEffect, useRef } from 'react';

interface UseTabBehaviorOptions {
  /**
   * Root grid element. The keydown listener attaches to this element.
   * Must be a ref (not the element directly) so the effect re-runs if the
   * grid element changes.
   */
  gridRef: React.RefObject<HTMLElement | null>;
  /**
   * Selected tab behavior. Default is 'exit' (APG-conformant).
   */
  tabBehavior: TabBehavior;
}

/**
 * Owns the Tab key press handler.
 *
 * The hook attaches a `keydown` listener to the grid element and:
 * - `'exit'`: blurs the currently focused element so the browser moves focus
 *   to the next focusable element outside the grid (natural tab order).
 * - `'cells'`: finds the first cell with `tabindex="0"` and focuses it,
 *   keeping focus inside the grid. This supports Tab-through-cells products.
 *
 * When `tabBehavior === 'exit'`, the hook is a no-op for `navigationMode: 'none'`
 * because the grid has no interactive cells — Tab is already "exiting".
 */
export function useTabBehavior({ gridRef, tabBehavior }: UseTabBehaviorOptions): void {
  const tabBehaviorRef = useRef(tabBehavior);
  tabBehaviorRef.current = tabBehavior;

  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;

    // 'exit' mode is a no-op for read-only grids (no tabindex on cells).
    // For interactive grids, 'exit' still blurs on Tab so the next element
    // outside the grid receives focus — natural browser tab order.
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const behavior = tabBehaviorRef.current;
      if (behavior === 'cells') {
        // 'cells': focus the first cell in the grid (tabindex="0").
        // This is a smoke implementation. Full per-row Tab cycling is v1.5+.
        const firstCell = root.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]');
        if (firstCell) {
          e.preventDefault();
          firstCell.focus();
        }
      } else {
        // 'exit': blur whatever has focus inside the grid so the browser
        // continues its natural tab order. No preventDefault — let the browser
        // handle focus movement to the next element outside the grid.
        const active = document.activeElement;
        if (active && root.contains(active)) {
          (active as HTMLElement).blur();
        }
      }
    };

    root.addEventListener('keydown', handleTab);
    return () => root.removeEventListener('keydown', handleTab);
  }, [gridRef]);
}
