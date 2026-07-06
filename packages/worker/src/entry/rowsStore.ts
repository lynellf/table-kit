/**
 * @lynellf/tablekit-worker/entry — in-worker rows store.
 *
 * Stores the dataset in worker memory. Rows are sent once via setRows
 * and cached for subsequent compute calls.
 */

export interface RowsStore<TRow = unknown> {
  set(rows: TRow[]): void;
  get(): TRow[] | null;
  clear(): void;
}

export const createRowsStore = <TRow = unknown>(): RowsStore<TRow> => {
  let rows: TRow[] | null = null;
  return {
    set(next) {
      rows = next;
    },
    get() {
      return rows;
    },
    clear() {
      rows = null;
    },
  };
};
