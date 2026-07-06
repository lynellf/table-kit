/**
 * @lynellf/tablekit-pivot/serialize — `validatePivotQuery` (spec §13 P3).
 *
 * Dev warning on inline aggregator / predicate leaks. M5 ships the worker +
 * server engines that REQUIRE registry-name aggregators + predicates; M4 ships
 * the warning so consumers wiring inline forms today get a forward-looking
 * notice. M4's main-thread engine accepts inline forms without warning.
 */

import type { PivotQuery } from '../types';

let _warned = false;

export const validatePivotQuery = <TRow>(q: PivotQuery<TRow>): void => {
  if (process.env.NODE_ENV === 'production') return;
  if (_warned) return;
  if (!q.inlineAccessors) return;

  const inlineRows = q.inlineAccessors.rows?.filter((r) => r.accessor !== undefined) ?? [];
  const inlineCols = q.inlineAccessors.columns?.filter((c) => c.accessor !== undefined) ?? [];
  const inlineMeas = q.inlineAccessors.measures?.filter((m) => m.accessor !== undefined) ?? [];
  const inlinePreds = q.filters.filter((f) => 'predicate' in f);

  if (
    inlineRows.length === 0 &&
    inlineCols.length === 0 &&
    inlineMeas.length === 0 &&
    inlinePreds.length === 0
  ) {
    return;
  }

  _warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[tablekit-pivot] PivotQuery contains inline accessors or predicates. Inline forms ' +
      'are legal on the main-thread engine but will be stripped when crossing to worker ' +
      '(M5) or server engines. Use registry-name FieldRef/MeasureDef/PivotFilter shapes ' +
      'when serializing across a boundary.',
  );
};

/** Test-only: reset the one-shot flag. */
export const __resetInlineLeakWarningForTests = (): void => {
  _warned = false;
};
