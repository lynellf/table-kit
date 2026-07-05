/**
 * @lynellf/tablekit-react — useKeyboardNav hook.
 *
 * Spec §7.5: roving tabindex + APG keyboard navigation. The library
 * handler is emitted via `getGridProps`. This hook is exported for
 * consumers who need direct access to keyboard navigation utilities.
 *
 * For most consumers, `useDataTable`'s result already wires `onKeyDown`
 * via `getGridProps`. The hook is exported for completeness.
 */

import type { DataTableInstance } from '@lynellf/tablekit-core';

export const useKeyboardNav = <TRow>(_instance: DataTableInstance<TRow>) => {
  // The library keyboard handler is emitted via getGridProps.
  // This hook is exported for completeness; future M6 polish may add
  // global keyboard shortcuts here.
};
