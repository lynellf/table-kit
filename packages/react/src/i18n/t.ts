/**
 * @lynellf/tablekit-react — i18n translator helper.
 *
 * Spec §10: builds a `t(key, ...args)` function closed over the consumer's
 * messages override. The function is constructed once per hook and does a
 * single property lookup per call — no per-call allocation.
 */

import { defaultMessages } from '../messages';
import type { AnnouncerKey } from '../messages';

/**
 * Translator function. Given a messages map, returns a `t()` that
 * looks up the key in the map (consumer override) or falls back to English.
 *
 * Usage:
 *   const t = createT({ sortAsc: 'Tri croissant' });
 *   t('sortAsc');                   // → 'Tri croissant'
 *   t('filterApplied', 42);         // → '42 rows match the filter'
 */
export function createT(
  // Accept the concrete MessagesMap type so callers get full autocomplete.
  // biome-disable-next-line lint/suspicious/noExplicitAny -- Flexible message values require unknown type
  messages?: { [K in AnnouncerKey]?: unknown },
): (key: AnnouncerKey, ...args: unknown[]) => string {
  if (!messages) {
    return (key) => {
      // biome-disable-next-line lint/suspicious/noExplicitAny -- Type assertion required for dynamic message access
      const val = defaultMessages[key] as unknown;
      return typeof val === 'function'
        ? (val as (..._args: unknown[]) => string)()
        : (val as string);
    };
  }
  // Merge: consumer overrides win; fall back to English defaults.
  // biome-disable-next-line lint/suspicious/noExplicitAny -- Merging objects requires unknown for dynamic values
  const merged: Record<string, unknown> = { ...defaultMessages, ...messages };
  return (key, ...args) => {
    const val = merged[key];
    if (typeof val === 'function') {
      return val(...args);
    }
    return (val ?? defaultMessages[key] ?? key) as string;
  };
}
