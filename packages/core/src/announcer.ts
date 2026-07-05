/**
 * @lynellf/tablekit-core — default no-op announcer (M1 stub; phase 6 wires it).
 */

import type { Announcer } from './types';

export const noopAnnouncer: Announcer = {
  announce: () => {
    // default no-op
  },
};

/**
 * Singleton announcer accessor. The React adapter sets this when ReactAnnouncer mounts.
 * This allows the core table to announce messages without knowing about React.
 */
let globalAnnouncer: Announcer = noopAnnouncer;

export const setGlobalAnnouncer = (announcer: Announcer): void => {
  globalAnnouncer = announcer;
};

export const getGlobalAnnouncer = (): Announcer => globalAnnouncer;
