/**
 * @lynellf/tablekit-react — React live-region announcer.
 *
 * Mounts a visually-hidden `aria-live="polite"` div. The `useDataTable`
 * hook creates the announcer channel and passes it to this component (via props).
 * The channel is also shared with the table factory (via options).
 *
 * R5 fix: Uses subscription/disposal lifecycle via the AnnouncerChannel.
 * This ensures:
 * 1. Each instance is independent and isolated
 * 2. No cross-instance message leakage
 * 3. Proper cleanup on unmount
 * 4. Messages are delivered post-mount to the live region
 *
 * Spec §10 (M1 minimal): the live-region is the only M1 surface. The
 * `messages` map and i18n land in M6.
 */

import { useEffect, useRef, useState } from 'react';
import type { AnnouncerChannel } from './createAnnouncerChannel';

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
 * Props for ReactAnnouncer.
 */
export interface ReactAnnouncerProps {
  /** The announcer channel created by useDataTable/usePivotTable. Shared with the table/pivot. */
  channel: AnnouncerChannel;
  politeness?: 'polite' | 'assertive';
}

/**
 * ReactAnnouncer renders a visually-hidden live region and updates it
 * when the announcer channel receives messages.
 *
 * R5 fix: Uses the AnnouncerChannel subscription/disposal lifecycle.
 * - Each hook-created table/pivot has its own isolated channel
 * - Cleanup properly disposes the subscription on unmount
 * - Messages are delivered post-mount to the live region
 */
export const ReactAnnouncer = ({ channel, politeness = 'polite' }: ReactAnnouncerProps) => {
  const [message, setMessage] = useState('');
  const lastAnnounceRef = useRef<{ message: string; ts: number }>({
    message: '',
    ts: 0,
  });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // R5 fix: Wire the announcer channel using subscription/disposal lifecycle.
  // Messages delivered before subscription are not replayed.
  useEffect(() => {
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

      // Use setMessage to batch with React's rendering cycle.
      setMessage(msg);
    };

    unsubscribeRef.current = channel.subscribe(handleMessage);

    return () => {
      // Dispose the subscription on cleanup
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [channel]);

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
