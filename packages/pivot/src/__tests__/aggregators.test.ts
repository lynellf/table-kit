/**
 * Phase 2 — built-in aggregator behavior tests.
 *
 * Covers: sum / count / min / max / avg over small inputs, empty inputs, single
 * values, NaN/Infinity (where applicable), and finalize behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_AGGREGATORS,
  avgAggregator,
  countAggregator,
  maxAggregator,
  minAggregator,
  sumAggregator,
} from '../aggregators/builtins';

describe('sumAggregator', () => {
  it('init returns 0', () => {
    expect(sumAggregator.init()).toBe(0);
  });

  it('accumulate folds values', () => {
    let acc = sumAggregator.init();
    acc = sumAggregator.accumulate(acc, 1);
    acc = sumAggregator.accumulate(acc, 2);
    acc = sumAggregator.accumulate(acc, 3);
    expect(acc).toBe(6);
  });

  it('accumulate ignores non-number values', () => {
    let acc = sumAggregator.init();
    // @ts-expect-error — intentionally passing invalid value
    acc = sumAggregator.accumulate(acc, 'foo');
    // @ts-expect-error
    acc = sumAggregator.accumulate(acc, undefined);
    acc = sumAggregator.accumulate(acc, 5);
    expect(acc).toBe(5);
  });

  it('merge sums two accumulators', () => {
    expect(sumAggregator.merge(2, 3)).toBe(5);
  });

  it('NaN propagates', () => {
    let acc = sumAggregator.init();
    acc = sumAggregator.accumulate(acc, Number.NaN);
    expect(Number.isNaN(acc)).toBe(true);
  });
});

describe('countAggregator', () => {
  it('counts non-undefined values', () => {
    let acc = countAggregator.init();
    acc = countAggregator.accumulate(acc, 1);
    acc = countAggregator.accumulate(acc, undefined);
    acc = countAggregator.accumulate(acc, 'foo');
    acc = countAggregator.accumulate(acc, null);
    expect(acc).toBe(3);
  });

  it('merge sums counts', () => {
    expect(countAggregator.merge(5, 3)).toBe(8);
  });
});

describe('minAggregator', () => {
  it('init is +Infinity', () => {
    expect(minAggregator.init()).toBe(Number.POSITIVE_INFINITY);
  });

  it('tracks minimum', () => {
    let acc = minAggregator.init();
    acc = minAggregator.accumulate(acc, 5);
    acc = minAggregator.accumulate(acc, 3);
    acc = minAggregator.accumulate(acc, 7);
    expect(acc).toBe(3);
  });

  it('ignores non-finite numbers', () => {
    let acc = minAggregator.init();
    acc = minAggregator.accumulate(acc, Number.POSITIVE_INFINITY);
    expect(acc).toBe(Number.POSITIVE_INFINITY);
  });

  it('merge returns smaller', () => {
    expect(minAggregator.merge(3, 7)).toBe(3);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(minAggregator.finalize!(minAggregator.init()))).toBe(true);
  });
});

describe('maxAggregator', () => {
  it('init is -Infinity', () => {
    expect(maxAggregator.init()).toBe(Number.NEGATIVE_INFINITY);
  });

  it('tracks maximum', () => {
    let acc = maxAggregator.init();
    acc = maxAggregator.accumulate(acc, 1);
    acc = maxAggregator.accumulate(acc, 5);
    expect(acc).toBe(5);
  });

  it('merge returns larger', () => {
    expect(maxAggregator.merge(2, 9)).toBe(9);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(maxAggregator.finalize!(maxAggregator.init()))).toBe(true);
  });
});

describe('avgAggregator', () => {
  it('init is {sum: 0, count: 0}', () => {
    expect(avgAggregator.init()).toEqual({ sum: 0, count: 0 });
  });

  it('tracks sum and count', () => {
    let acc = avgAggregator.init();
    acc = avgAggregator.accumulate(acc, 10);
    acc = avgAggregator.accumulate(acc, 20);
    acc = avgAggregator.accumulate(acc, 30);
    expect(acc).toEqual({ sum: 60, count: 3 });
  });

  it('merge combines {sum, count}', () => {
    const a = { sum: 10, count: 2 };
    const b = { sum: 20, count: 3 };
    expect(avgAggregator.merge(a, b)).toEqual({ sum: 30, count: 5 });
  });

  it('finalize: sum / count', () => {
    expect(avgAggregator.finalize!({ sum: 60, count: 3 })).toBe(20);
  });

  it('finalize: empty input → NaN', () => {
    expect(Number.isNaN(avgAggregator.finalize!(avgAggregator.init()))).toBe(true);
  });
});

describe('BUILT_IN_AGGREGATORS', () => {
  it('contains sum, count, min, max, avg', () => {
    expect(Object.keys(BUILT_IN_AGGREGATORS).sort()).toEqual(['avg', 'count', 'max', 'min', 'sum']);
  });

  it('every entry has init/accumulate/merge', () => {
    for (const name of Object.keys(BUILT_IN_AGGREGATORS) as (keyof typeof BUILT_IN_AGGREGATORS)[]) {
      const a = BUILT_IN_AGGREGATORS[name]!;
      expect(typeof a.init).toBe('function');
      expect(typeof a.accumulate).toBe('function');
      expect(typeof a.merge).toBe('function');
    }
  });
});
