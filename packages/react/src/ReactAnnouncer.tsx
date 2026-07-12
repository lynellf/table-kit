/**
 * @lynellf/tablekit-react — React live-region announcer.
 *
 * Mounts a visually-hidden `aria-live="polite"` div. The `useDataTable`
 * hook creates the announcer instance and passes it to both this component
 * (via props) and to the table factory (via options).
 *
 * R5 fix: No longer uses singleton/global announcer. Each instance is
 * independent and isolated. The announcer is passed as a prop from the
 * hook, ensuring the same instance is shared between the table and
 * the live region.
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
 * Props for ReactAnnouncer.
 * R5 fix: announcer is passed as a prop from useDataTable, not obtained from a singleton.
 */
export interface ReactAnnouncerProps {
  /** The announcer instance created by useDataTable. Shared with the table. */
  announcer: Announcer;
  politeness?: 'polite' | 'assertive';
}

/**
 * ReactAnnouncer renders a visually-hidden live region and updates it
 * when the shared announcer's announce() method is called.
 *
 * R5 fix: The announcer is passed as a prop, not stored in a singleton.
 * This ensures each hook-created table has its own isolated announcer.
 */
export const ReactAnnouncer = ({ announcer, politeness = 'polite' }: ReactAnnouncerProps) => {
  const [message, setMessage] = useState('');
  const lastAnnounceRef = useRef<{ message: string; ts: number }>({
    message: '',
    ts: 0,
  });

  // R5 fix: Wire the announcer prop to update React state.
  // No cleanup needed - the announcer is managed by the hook.
  useEffect(() => {
    // Store the original announce method
    const originalAnnounce = announcer.announce;

    announcer.announce = (msg: string, politenessArg?: 'polite' | 'assertive') => {
      const now = Date.now();
      if (
        msg === lastAnnounceRef.current.message &&
        now - lastAnnounceRef.current.ts < POLITENESS_INTERVAL_MS
      ) {
        return;
      }
      lastAnnounceRef.current = { message: msg, ts: now };
      // Use setTimeout to batch with React's rendering cycle.
      setTimeout(() => setMessage(msg), 0);

      // Also call original announce if it did something (for backward compat)
      if (originalAnnounce) {
        originalAnnounce.call(announcer, msg, politenessArg);
      }
    };

    return () => {
      // Restore original announce
      announcer.announce = originalAnnounce;
    };
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
