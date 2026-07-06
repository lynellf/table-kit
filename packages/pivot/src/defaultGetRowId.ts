/**
 * @lynellf/tablekit-pivot — index-based row id fallback (dev warning).
 *
 * Mirrors `defaultGetRowId` from `@lynellf/tablekit-core/columns`. Emits a
 * one-shot dev warning in phase 4; phase 5 may promote to a stricter error.
 */

let _warned = false;

export const defaultGetRowId = <TRow>(_row: TRow, index: number): string => {
  if (process.env.NODE_ENV !== 'production' && !_warned) {
    _warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[tablekit-pivot] No getRowId provided. Using index-based fallback. ' +
        'For server modes or controlled state, provide getRowId to ensure stable identity.',
    );
  }
  return `__row_${index}`;
};

/** Test-only: reset the warning flag. */
export const __resetPivotDefaultGetRowIdWarningForTests = (): void => {
  _warned = false;
};
