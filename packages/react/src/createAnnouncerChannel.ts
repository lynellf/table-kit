/**
 * @lynellf/tablekit-react — announcer channel for instance-owned announcements.
 *
 * R5 fix: Provides a stable per-instance channel with subscribe/unsubscribe lifecycle.
 * This replaces the previous global/last-mounted routing and ensures:
 * 1. Each instance is independent and isolated
 * 2. No cross-instance message leakage
 * 3. Messages are delivered post-mount to the live region
 * 4. Minimal announce-only custom announcers still work
 *
 * The channel wraps any announcer object (including minimal announce-only ones)
 * and provides subscription support for ReactAnnouncer integration.
 */

export interface AnnouncerMessage {
  message: string;
  politeness?: 'polite' | 'assertive';
}

/**
 * Channel listener type.
 */
export type AnnouncerListener = (msg: string, politeness?: 'polite' | 'assertive') => void;

/**
 * Announcer channel interface.
 * Provides subscription support on top of the basic announce() contract.
 */
export interface AnnouncerChannel {
  /**
   * Announce a message with optional politeness.
   * All registered listeners receive this message.
   */
  announce(message: string, politeness?: 'polite' | 'assertive'): void;

  /**
   * Subscribe to announcements.
   * Returns an unsubscribe function.
   */
  subscribe(listener: AnnouncerListener): () => void;
}

/**
 * Create an announcer channel with subscription support.
 * Wraps any announcer object and adds channel functionality.
 *
 * @param announcer - The underlying announcer (may be minimal announce-only)
 * @returns An AnnouncerChannel that wraps the announcer
 */
export const createAnnouncerChannel = (announcer: {
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
}): AnnouncerChannel => {
  const listeners = new Set<AnnouncerListener>();

  return {
    announce: (message: string, politeness?: 'polite' | 'assertive') => {
      // Call the underlying announcer
      announcer.announce(message, politeness);
      // Notify all listeners (for live region integration)
      for (const listener of listeners) {
        listener(message, politeness);
      }
    },
    subscribe: (listener: AnnouncerListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
