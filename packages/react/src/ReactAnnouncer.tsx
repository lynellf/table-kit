/**
 * @lynellf/tablekit-react — React live-region announcer.
 *
 * Mounts a visually-hidden `aria-live="polite"` div. The `useDataTable`
 * hook exposes this via `getReactAnnouncer()`.
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
 * Singleton announcer. Uses a module-level variable to avoid React context
 * for a single-purpose component.
 */
let singletonAnnouncer: Announcer | null = null;

export const getReactAnnouncer = (): Announcer => {
  if (!singletonAnnouncer) {
    singletonAnnouncer = { announce: () => {} };
  }
  return singletonAnnouncer;
};

export const ReactAnnouncer = ({
  politeness = 'polite',
}: {
  politeness?: 'polite' | 'assertive';
}) => {
  const [message, setMessage] = useState('');
  const lastAnnounceRef = useRef<{ message: string; ts: number }>({
    message: '',
    ts: 0,
  });

  useEffect(() => {
    const announcer: Announcer = {
      announce: (msg: string) => {
        const now = Date.now();
        if (
          msg === lastAnnounceRef.current.message &&
          now - lastAnnounceRef.current.ts < POLITENESS_INTERVAL_MS
        ) {
          return;
        }
        lastAnnounceRef.current = { message: msg, ts: now };
        setMessage('');
        requestAnimationFrame(() => setMessage(msg));
      },
    };
    singletonAnnouncer = announcer;
    return () => {
      singletonAnnouncer = { announce: () => {} };
    };
  }, []);

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
