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
 * Shallow-merge multiple prop objects into a single output. Consumer props
 * are always applied last and win ties.
 *
 * Rules:
 *   - For non-function values, the last value wins.
 *   - For function values (event handlers), both run in order; if any handler
 *     calls `event.preventDefault()`, subsequent handlers are skipped.
 *   - The library handler is stashed under `__lib_<key>` for the adapter to
 *     invoke after the consumer handler (via `shouldRunLibraryHandler`).
 *   - The result is a new object — no mutation.
 *
 * Variadic overloads:
 *   - 2 args: `mergeProps(defaults, consumerProps?)`
 *   - 3 args: `mergeProps(defaults, libraryProps, consumerProps?)`
 *     Used when a prop getter needs to inject a library handler (e.g. onKeyDown)
 *     alongside the base defaults without touching the consumer's own onKeyDown.
 */
export const mergeProps = (
  defaultProps: Record<string, unknown>,
  libraryProps: Record<string, unknown> = {},
  consumerProps?: Record<string, unknown>,
): Record<string, unknown> => {
  // Build the output by layering: defaults → library → consumer
  const out: Record<string, unknown> = { ...defaultProps };

  const apply = (source: Record<string, unknown>) => {
    for (const key of Object.keys(source)) {
      const prev = out[key];
      const next = source[key];
      if (typeof next === 'function' && typeof prev === 'function') {
        // Chain: previous runs first (e.g. library), next runs second (e.g. consumer).
        // We store the library handler so the adapter can invoke it explicitly.
        out[key] = next;
        out[`__lib_${key}`] = prev;
      } else {
        out[key] = next;
      }
    }
  };

  apply(libraryProps);
  if (consumerProps) apply(consumerProps);

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
