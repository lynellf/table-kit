/**
 * @lynellf/tablekit-core/dataSource — mode configuration validator.
 *
 * Spec §5.3: "the dev build warns on the `paginate: 'server'` +
 * `sort/filter: 'client'` combination unless `allowWithinPageOperations: true`
 * is set."
 *
 * One-shot per process (mirroring `defaultGetRowId`). Production strips the
 * warning entirely (`process.env.NODE_ENV === 'production'`). The warning
 * names the trap and points at the opt-in flag.
 */

import type { DataTableOptions } from '../types';

let _warned = false;

/**
 * Validate the mode configuration of a `DataTableOptions`. Fires a one-shot
 * dev `console.warn` when the mixed-mode trap is detected.
 *
 * Detection: `manualPagination === true` AND (`manualSorting === false` OR
 * `manualFiltering === false`) AND `allowWithinPageOperations !== true`.
 *
 * When the consumer uses `DataSource` directly (not `useDataTable`), the
 * `capabilities` field on `DataSource` is the equivalent of `manual*`. The
 * `useDataSource` hook translates capabilities → `manual*` and re-runs this
 * check via the resulting options.
 */
export const validateModeConfiguration = <TRow>(options: DataTableOptions<TRow>): void => {
  if (process.env.NODE_ENV === 'production') return;
  if (_warned) return;
  if (options.allowWithinPageOperations === true) return;
  if (options.manualPagination !== true) return;

  const clientSort = options.manualSorting !== true;
  const clientFilter = options.manualFiltering !== true;

  if (!clientSort && !clientFilter) return; // not mixed

  _warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[tablekit] Server pagination with client-side sort/filter applies within the ' +
      'current page only — the server controls the page boundary. Set ' +
      '`allowWithinPageOperations: true` to confirm this intent, or set ' +
      '`manualSorting: true` / `manualFiltering: true` to push the concern to the server.',
  );
};

/** Test-only: reset the one-shot flag. */
export const __resetMixedModeWarningForTests = (): void => {
  _warned = false;
};
