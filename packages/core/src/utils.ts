/**
 * @lynellf/tablekit-core — pure helpers used across modules.
 * No side effects, no DOM, no React.
 */

/** Identity function. Used as default for `getRowId` and `id`-generation in dev. */
export const identity = <T>(value: T): T => value;

/**
 * Shallow-equal two objects by their own enumerable keys.
 * Returns true when both have identical keys with strictly-equal values.
 * Used by the state engine to short-circuit `onStateChange` when nothing changed.
 */
export const shallowEqual = <T extends object>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  const aKeys = Object.keys(a) as Array<keyof T>;
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const aVal = a[key];
    const bVal = b[key];
    if (Object.is(aVal, bVal)) continue;
    // For arrays, compare by index (stable ordering).
    // For plain objects, compare values shallowly.
    // This handles the spread-state case where { ...state, sorting: [] }
    // creates a new state with a new array at `sorting`.
    if (Array.isArray(aVal) && Array.isArray(bVal)) {
      if (aVal.length !== bVal.length) return false;
      for (let i = 0; i < aVal.length; i++) {
        if (!Object.is(aVal[i], bVal[i])) return false;
      }
      continue;
    }
    // Non-strict objects (e.g., { pageIndex: 0, pageSize: 25 }) must match by reference.
    return false;
  }
  return true;
};

/**
 * Equality helper for controlled-slice values used by `stateChangedOnSlices`.
 *
 * Built on top of `shallowEqual` but with one structural difference: non-array
 * plain objects are compared key-by-key with `Object.is`, instead of falling
 * back to reference equality. This is what fixes the M3 `abort-stale` render
 * loop: re-deriving a slice (e.g., `pagination = { pageIndex: 0, pageSize: 10 }`)
 * from options on a subsequent render produces a new object reference even
 * though the values are unchanged, and `shallowEqual`'s "objects must match by
 * reference" rule was reporting a false-positive state change.
 *
 * Constraints:
 *   - State slices are JSON-serializable per spec §4.2, so one-level equality
 *     is sufficient (no nested-object walk needed).
 *   - Arrays compare elements by value (structural equality) since state slices
 *     often contain new array references from spread operators.
 *   - Primitives, `null`, and `undefined` use `Object.is`.
 */
export const sliceValuesEqual = <T>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    // Exclude React/DOM-like objects with prototypes we don't want to enumerate;
    // state slices are plain records per spec §4.2.
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const aKeys = Object.keys(aRec);
    if (aKeys.length !== Object.keys(bRec).length) return false;
    for (const key of aKeys) {
      // Recurse for nested values within objects (e.g., arrays inside columnPinning)
      if (!sliceValuesEqual(aRec[key], bRec[key])) return false;
    }
    return true;
  }
  return false;
};

/**
 * Exhaustiveness helper. Causes a compile error if a discriminated union
 * is not handled in full.
 *
 * Usage:
 *   switch (mode) {
 *     case 'a': return ...;
 *     case 'b': return ...;
 *     default: return assertNever(mode);
 *   }
 */
export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
};
