/**
 * @lynellf/tablekit-worker/serialization — query serialization helpers.
 *
 * Strips rows and inlineAccessors from a PivotQuery to produce a WirePivotQuery.
 */

import type { PivotQuery } from '@lynellf/tablekit-pivot';
import type { WirePivotQuery } from '../protocol';

/**
 * Serialize a PivotQuery for the worker boundary.
 * Strips `rows` (sent separately via setRows) and `inlineAccessors`
 * (not supported across the worker boundary).
 */
export const serializeQuery = <TRow>(q: PivotQuery<TRow>): WirePivotQuery => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rows: _rows, inlineAccessors: _ia, ...wire } = q;
  return wire as unknown as WirePivotQuery;
};
