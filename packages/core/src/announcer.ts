/**
 * @lynellf/tablekit-core — default no-op announcer (M1 stub; phase 6 wires it).
 */

import type { Announcer } from './types';

export const noopAnnouncer: Announcer = {
  announce: () => {
    // default no-op
  },
};
