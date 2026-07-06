/**
 * @lynellf/tablekit-worker/filters — bulk filter function registration helpers.
 */

export type WorkerFilterFn = (value: unknown, args: unknown) => boolean;

export interface FilterRegistration {
  name: string;
  fn: WorkerFilterFn;
}

/**
 * Validate that filter function names are registered (warns in dev if not).
 */
export const validateFilterRegistrations = (regs: FilterRegistration[]): void => {
  if (process.env.NODE_ENV === 'production') return;
  for (const { name } of regs) {
    // eslint-disable-next-line no-console
    console.warn(
      `[tablekit-worker] filter function "${name}" cannot be pre-validated on the main thread. ` +
        `Register it via createWorkerEntry().registerFilterFns({ ${name}: ... }) in your worker entry.`,
    );
  }
};
