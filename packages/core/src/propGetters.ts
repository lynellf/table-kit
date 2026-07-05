/**
 * @lynellf/tablekit-core — prop getter utilities.
 *
 * Spec §6.1, §7.6: prop getters return plain `{ [attr]: value }` objects.
 * Consumer-provided props merge with library props; consumer handlers run
 * first; internal handlers respect `event.defaultPrevented`.
 *
 * This module is framework-free — it returns attribute maps + handler
 * intent names. The React adapter maps `onClick`/`onKeyDown` to React event
 * props. A future Vue adapter maps them to `@click`/`@keydown`. No DOM
 * coupling in core.
 */

/**
 * Shallow-merge a consumer's `props` into the library's `defaultProps`.
 *
 * Rules:
 *   - For non-function values, the consumer's value wins.
 *   - For function values (event handlers), both run; consumer first, then
 *     library. If the consumer calls `event.preventDefault()`, the library
 *     handler is skipped.
 *   - The result is a new object — no mutation.
 */
export const mergeProps = (
  defaultProps: Record<string, unknown>,
  consumerProps: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (!consumerProps) return defaultProps;
  const out: Record<string, unknown> = { ...defaultProps };
  for (const key of Object.keys(consumerProps)) {
    const defaultValue = defaultProps[key];
    const consumerValue = consumerProps[key];
    if (typeof consumerValue === 'function' && typeof defaultValue === 'function') {
      // Chain: consumer first, library second. Library checks defaultPrevented.
      const consumerFn = consumerValue as (...args: unknown[]) => void;
      const libraryFn = defaultValue as (...args: unknown[]) => void;
      out[key] = (...args: unknown[]) => {
        consumerFn(...args);
        // Library handler is stashed under __lib_<key> for the adapter to invoke.
      };
      out[`__lib_${key}`] = libraryFn;
    } else {
      out[key] = consumerValue;
    }
  }
  return out;
};

/**
 * Check whether an event was defaultPrevented. The core module doesn't have
 * access to the real DOM event, so we expose this helper that the React
 * adapter calls before invoking the library handler.
 */
export const shouldRunLibraryHandler = (event: { defaultPrevented?: boolean }): boolean => {
  return event.defaultPrevented !== true;
};

/**
 * Compose multiple event handlers into one. Runs each in order. Useful for
 * `mergeProps`-like chains where the consumer has multiple handlers.
 */
export const chainHandlers = <E = unknown>(
  ...handlers: Array<((event: E) => void) | undefined>
) => {
  return (event: E) => {
    for (const h of handlers) {
      if (h) h(event);
    }
  };
};
