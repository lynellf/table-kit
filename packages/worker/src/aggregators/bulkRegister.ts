/**
 * @lynellf/tablekit-worker/aggregators — bulk registration helpers.
 *
 * For main-thread consumers who want to pre-validate aggregator registrations
 * before the worker boots.
 */

import type { Aggregator } from '@lynellf/tablekit-pivot';
import { getAggregator } from '@lynellf/tablekit-pivot/aggregators';

export interface AggregatorRegistration {
  name: string;
  fn: Aggregator;
}

/**
 * Validate that aggregator names are registered (warns in dev if not).
 * Useful for fail-fast before worker initialization.
 */
export const validateAggregatorRegistrations = (regs: AggregatorRegistration[]): void => {
  if (process.env.NODE_ENV === 'production') return;
  for (const { name, fn } of regs) {
    // Warn if the name is not in the registry (unless the fn is passed as the value)
    if (!getAggregator(name)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[tablekit-worker] aggregator "${name}" is not registered in the main-thread registry. ` +
          `The worker will use its own built-in registry. If "${name}" is a custom aggregator, ` +
          `register it via createWorkerEntry().registerAggregators({ ${name}: ... }) in your worker entry.`,
      );
    }
    void fn; // Mark as used
  }
};
