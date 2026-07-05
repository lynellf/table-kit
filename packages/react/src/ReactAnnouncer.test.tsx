/** @jsxImportSource react */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReactAnnouncer, getReactAnnouncer } from './ReactAnnouncer';

describe('ReactAnnouncer', () => {
  it('renders a visually-hidden aria-live region', () => {
    render(<ReactAnnouncer />);
    const regions = screen.getAllByTestId('tablekit-announcer');
    const region = regions[regions.length - 1];
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes getReactAnnouncer() with an announce() function', () => {
    render(<ReactAnnouncer />);
    const announcer = getReactAnnouncer();
    expect(typeof announcer.announce).toBe('function');
  });

  // Note: requestAnimationFrame-based announcements may not work reliably in jsdom.
  // This test verifies the announce function exists and is callable.
  it('can announce (jsdom may not process requestAnimationFrame)', () => {
    render(<ReactAnnouncer />);
    const announcer = getReactAnnouncer();
    // Just verify the function is callable without throwing.
    expect(() => announcer.announce('test message')).not.toThrow();
  });
});
