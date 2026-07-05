/**
 * @lynellf/tablekit-core — faceting helpers.
 *
 * Spec §15 (recommended addition for v1): helpers for building filter UIs
 * against client data. `getFacetedUniqueValues` returns a count map;
 * `getFacetedMinMax` returns the numeric range for sortable numeric columns.
 *
 * Source data: the helpers read from the **input `data`** (passed via the
 * `rows` parameter), not from the row model. This means they show all
 * available values even when the row model is currently filtered.
 */

/**
 * Compute a count map of unique values for the given column.
 *
 * `keyFn` extracts the value from each row (typically the column's accessor).
 * Returns `Map<unknown, number>` with insertion order matching first
 * occurrence in the input.
 */
export const getFacetedUniqueValues = <TRow>(
  rows: TRow[],
  _columnId: string,
  keyFn: (row: TRow, index: number) => unknown,
): Map<unknown, number> => {
  const out = new Map<unknown, number>();
  rows.forEach((row, i) => {
    const value = keyFn(row, i);
    out.set(value, (out.get(value) ?? 0) + 1);
  });
  return out;
};

/**
 * Compute the [min, max] for a numeric column.
 *
 * Returns `undefined` when:
 *   - The column has no numeric values.
 *   - The column has fewer than 1 numeric value.
 *
 * Otherwise returns `[min, max]`. If only one numeric value exists,
 * `[value, value]` is returned.
 */
export const getFacetedMinMax = <TRow>(
  rows: TRow[],
  _columnId: string,
  keyFn: (row: TRow, index: number) => unknown,
): [number, number] | undefined => {
  let min: number | undefined;
  let max: number | undefined;
  rows.forEach((row, i) => {
    const value = keyFn(row, i);
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (min === undefined || value < min) min = value;
    if (max === undefined || value > max) max = value;
  });
  if (min === undefined || max === undefined) return undefined;
  return [min, max];
};
