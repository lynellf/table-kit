import { describe, expect, it, vi } from 'vitest';
import { chainHandlers, mergeProps, shouldRunLibraryHandler } from './propGetters';

describe('mergeProps', () => {
  it('returns defaults when no consumer props', () => {
    const out = mergeProps({ role: 'grid', 'aria-rowcount': 5 }, undefined);
    expect(out).toEqual({ role: 'grid', 'aria-rowcount': 5 });
  });

  it('overrides scalar values from consumer', () => {
    const out = mergeProps({ role: 'grid', 'aria-rowcount': 5 }, { 'aria-rowcount': 10 });
    expect(out).toEqual({ role: 'grid', 'aria-rowcount': 10 });
  });

  it('chains event handlers (consumer runs first)', () => {
    const consumer = vi.fn();
    const library = vi.fn();
    const out = mergeProps({ onClick: library }, { onClick: consumer });
    const handler = out.onClick as (...args: unknown[]) => void;
    handler({});
    expect(consumer).toHaveBeenCalledTimes(1);
    // Library is stashed under __lib_onClick (the adapter invokes it).
    expect((out as Record<string, unknown>).__lib_onClick).toBe(library);
  });

  it('does not mutate inputs', () => {
    const defaults = { role: 'grid' };
    const consumer = { 'aria-rowcount': 10 };
    mergeProps(defaults, consumer);
    expect(defaults).toEqual({ role: 'grid' });
    expect(consumer).toEqual({ 'aria-rowcount': 10 });
  });
});

describe('chainHandlers', () => {
  it('runs handlers in order', () => {
    const calls: string[] = [];
    const handler = chainHandlers(
      () => calls.push('a'),
      () => calls.push('b'),
      undefined,
      () => calls.push('c'),
    );
    handler({});
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('skips undefined handlers', () => {
    const calls: string[] = [];
    const handler = chainHandlers(undefined, () => calls.push('b'));
    handler({});
    expect(calls).toEqual(['b']);
  });
});

describe('shouldRunLibraryHandler', () => {
  it('returns true when defaultPrevented is false', () => {
    expect(shouldRunLibraryHandler({ defaultPrevented: false })).toBe(true);
  });

  it('returns false when defaultPrevented is true', () => {
    expect(shouldRunLibraryHandler({ defaultPrevented: true })).toBe(false);
  });

  it('returns true when defaultPrevented is undefined', () => {
    expect(shouldRunLibraryHandler({})).toBe(true);
  });
});
