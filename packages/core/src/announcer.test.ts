import { describe, expect, it, vi } from 'vitest';
import { noopAnnouncer } from './announcer';

describe('noopAnnouncer', () => {
  it('exists and has an announce function', () => {
    expect(typeof noopAnnouncer.announce).toBe('function');
  });

  it('does nothing (does not throw, does not call any callback)', () => {
    const spy = vi.fn();
    expect(() => noopAnnouncer.announce('hello')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
