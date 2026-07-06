/**
 * Phase 2 — registry behavior tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_AGGREGATORS,
  __resetAggregatorRegistryForTests,
  builtInAggregators,
  getAggregator,
  nameOfAggregator,
  registerAggregator,
  sumAggregator,
} from '../aggregators';
import type { Aggregator } from '../types';

afterEach(() => {
  __resetAggregatorRegistryForTests();
});

describe('builtInAggregators', () => {
  it('exposes the frozen BUILT_IN_AGGREGATORS record', () => {
    expect(builtInAggregators).toBe(BUILT_IN_AGGREGATORS);
  });
});

describe('getAggregator', () => {
  it('looks up built-in aggregator by name', () => {
    expect(getAggregator('sum')).toBe(sumAggregator);
    expect(getAggregator('avg')).toBeDefined();
  });

  it('returns undefined for unknown name', () => {
    expect(getAggregator('nope')).toBeUndefined();
  });

  it('custom registration shadows built-in lookup', () => {
    const customSum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v * 2, // double
      merge: (a, b) => a + b,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerAggregator('sum', customSum);
    expect(warn).toHaveBeenCalled();
    expect(getAggregator('sum')).toBe(customSum);
    warn.mockRestore();
  });
});

describe('registerAggregator', () => {
  it('stores under custom name', () => {
    const median: Aggregator<number, number[], number> = {
      init: () => [],
      accumulate: (acc: number[], v: number) => {
        acc.push(v);
        return acc;
      },
      merge: (a: number[], b: number[]) => a.concat(b),
      finalize: (acc: number[]) => {
        const sorted = [...acc].sort((x: number, y: number) => x - y);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
      },
    };
    registerAggregator('median', median);
    expect(getAggregator('median')).toBe(median);
  });
});

describe('nameOfAggregator', () => {
  it('returns name for built-in aggregator', () => {
    expect(nameOfAggregator(sumAggregator)).toBe('sum');
    expect(nameOfAggregator(BUILT_IN_AGGREGATORS.avg)).toBe('avg');
  });

  it('returns name for custom aggregator', () => {
    const custom: Aggregator<number, number, number> = { init: () => 0, accumulate: (a: number) => a, merge: (a: number, b: number) => a + b };
    registerAggregator('custom', custom);
    expect(nameOfAggregator(custom)).toBe('custom');
  });

  it('returns undefined for unregistered / inline aggregator', () => {
    const inline: Aggregator<number, number, number> = { init: () => 0, accumulate: (a: number) => a, merge: (a: number, b: number) => a + b };
    expect(nameOfAggregator(inline)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(nameOfAggregator(undefined)).toBeUndefined();
  });
});
