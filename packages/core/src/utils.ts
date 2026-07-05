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
