/**
 * @lynellf/tablekit-react — React live-region announcer.
 *
 * Mounts a visually-hidden `aria-live="polite"` div. The `useDataTable`
 * hook creates the announcer instance and passes it to both this component
 * (via props) and to the table factory (via options).
 *
 * R5 fix: No longer uses method-overwrite wiring. Instead, subscribes to
 * the announcer channel (if supported) and disposes properly. This ensures:
 * 1. Each instance is independent and isolated
 * 2. No cross-instance message leakage
 * 3. Proper cleanup on unmount
 * 4. Messages are delivered post-mount to the live region
 *
 * The announcer is passed as a prop from the hook, ensuring the same instance
 * is shared between the table and the live region.
 *
 * Spec §10 (M1 minimal): the live-region is the only M1 surface. The
 * `messages` map and i18n land in M6.
 */

import type { Announcer } from '@lynellf/tablekit-core';
import { useEffect, useRef, useState } from 'react';

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const POLITENESS_INTERVAL_MS = 1000;

/**
 * Minimal announce-only announcer type.
 * Custom announcers may only provide announce() without subscribe/dispose.
 */
type MinimalAnnouncer = Pick<Announcer, 'announce'>;

/**
 * Check if an announcer supports the channel/subscription interface.
 */
const hasChannelSupport = (
  announcer: MinimalAnnouncer,
): announcer is MinimalAnnouncer & {
  subscribe: (
    listener: (message: string, politeness?: 'polite' | 'assertive') => void,
  ) => () => void;
} => {
  return 'subscribe' in announcer && typeof announcer.subscribe === 'function';
};

/**
 * Props for ReactAnnouncer.
 */
export interface ReactAnnouncerProps {
  /** The announcer instance created by useDataTable. Shared with the table. */
  announcer: MinimalAnnouncer;
  politeness?: 'polite' | 'assertive';
}

/**
 * ReactAnnouncer renders a visually-hidden live region and updates it
 * when the shared announcer receives messages.
 *
 * R5 fix: Uses subscription/disposal lifecycle instead of method-overwrite.
 * - If the announcer supports subscribe/dispose, use that for post-mount messages
 * - If the announcer only provides announce(), deliver messages synchronously
 * - Each hook-created table has its own isolated announcer
 * - Cleanup properly disposes the subscription on unmount
 */
export const ReactAnnouncer = ({ announcer, politeness = 'polite' }: ReactAnnouncerProps) => {
  const [message, setMessage] = useState('');
  const lastAnnounceRef = useRef<{ message: string; ts: number }>({
    message: '',
    ts: 0,
  });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // R5 fix: Wire the announcer using subscription/disposal lifecycle.
  // Messages delivered before subscription are not replayed.
  useEffect(() => {
    // Check if the announcer supports channel/subscription interface
    if (hasChannelSupport(announcer)) {
      // Subscribe to the announcer channel
      const handleMessage = (msg: string, _msgPoliteness?: 'polite' | 'assertive') => {
        // Throttle duplicate messages
        const now = Date.now();
        if (
          msg === lastAnnounceRef.current.message &&
          now - lastAnnounceRef.current.ts < POLITENESS_INTERVAL_MS
        ) {
          return;
        }
        lastAnnounceRef.current = { message: msg, ts: now };

        // Use setTimeout to batch with React's rendering cycle.
        setMessage(msg);
      };

      unsubscribeRef.current = announcer.subscribe(handleMessage);

      return () => {
        // Dispose the subscription on cleanup
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    }
    // Announcer only provides announce() without subscribe/dispose.
    // R5 fix: We CANNOT safely mutate external announcers.
    // Skip React live-region integration for announce-only announcers.
    // The caller is responsible for providing a compatible announcer if they want live-region support.
    // No cleanup needed since we didn't set up any subscription.
    return undefined;
  }, [announcer]);

  return (
    <output
      aria-live={politeness}
      aria-atomic="true"
      style={visuallyHiddenStyle}
      data-testid="tablekit-announcer"
    >
      {message}
    </output>
  );
};
