/**
 * @lynellf/tablekit-react — React adapter: hooks, prop getters, announcer,
 * dev-mode a11y validator.
 *
 * M0 stub. Real surface lands in milestone M0 of the spec.
 */
// biome-ignore lint/correctness/noUnusedImports: required to declare React peer dependency
import * as React from 'react';

export const VERSION = '0.1.0' as const;

// Re-export ReactElement to prove the React peer dep is consumed
export type { ReactElement } from 'react';
