/**
 * Phase 1 runtime smoke for the Aggregator interface — no built-ins yet (phase 2).
 *
 * Verifies the interface can be implemented by inline aggregator objects.
 */

import { describe, expect, it } from 'vitest';
import type { Aggregator } from '../aggregators/types';

describe('Aggregator (inline, phase 1 smoke)', () => {
  it('inline aggregator on main-thread engine compiles and runs', () => {
    const inlineSum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v,
      merge: (a, b) => a + b,
      finalize: (acc) => acc,
    };
    expect(inlineSum.init()).toBe(0);
    expect(inlineSum.accumulate(5, 3)).toBe(8);
    expect(inlineSum.merge(2, 4)).toBe(6);
  });
});
