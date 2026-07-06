# Phase 3 — React `useDataSource` Hook

**Goal:** Land the React-side orchestration: `useDataSource(table, source)` hook plus the `dataSource?: DataSource<TRow>` option on `useDataTable` (sugar over the standalone hook). The hook derives the `manual*` flags from `source.capabilities`, watches the relevant state slices (`sorting`, `columnFilters`, `pagination`), builds `RowsQuery` from each change, aborts the in-flight request via `AbortController`, calls `source.getRows(query, { signal })`, and exposes `status` / `data` / `error` / `refetch()`.

After this phase:

- `useDataSource(table, source)` is exported from `@lynellf/tablekit-react`.
- `useDataTable({ ..., dataSource })` accepts the data source option; internally calls `useDataSource`; exposes `dataSourceState` on the result.
- Abort-stale: a state change during an in-flight fetch aborts the in-flight fetch (via `AbortController.abort()`) and starts a fresh one.
- The hook handles controlled and uncontrolled state slices uniformly via `table.subscribe`.
- `pnpm verify` exits 0; new tests pass (~20-30).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/react/src/useDataSource.ts` | Standalone hook |
| `packages/react/src/useDataSource.test.tsx` | Hook unit tests (fake timers, mock data source, controlled + uncontrolled slices, abort-stale, refetch) |
| `packages/react/src/__integration__/abort-stale.test.tsx` | Integration: abort-stale under real React render lifecycle |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/react/src/useDataTable.ts` | Add `dataSource?: DataSource<TRow>` option; internally call `useDataSource`; extend `UseDataTableResult` with `dataSourceState` |
| `packages/react/src/index.ts` | Re-export `useDataSource` |
| `packages/core/src/createDataTable.ts` | Add `__setDataSourceState(state: DataSourceState<TRow>)` internal seam + getter (so the React hook can write status without owning state directly) |

No new subpath exports; the hook is in the main `@lynellf/tablekit-react` entry.

---

## 3. File contents

### 3.1 `packages/core/src/createDataTable.ts` — additions

Append to the `DataTable` class:

```ts
/**
 * Internal state for the data source (M3 phase 3). The React hook writes
 * here via `__setDataSourceState`; readers (e.g., `getGridProps`, `getRowModel`)
 * read it. The instance does not own fetches — it just holds the latest status.
 *
 * Default: `{ status: 'idle', data: null }`. `getRowModel()` falls back to
 * the consumer's `options.data` when `dataSourceState.data` is null and
 * status !== 'loading'.
 */
private dataSourceState: import('./dataSource/types').DataSourceState<TRow> = {
  status: 'idle',
  data: null,
  refetch: () => {
    // Default no-op; the React hook overrides via __setDataSourceState.
  },
};

/** @internal Read the data source state. */
__getDataSourceState(): import('./dataSource/types').DataSourceState<TRow> {
  return this.dataSourceState;
}

/** @internal Write the data source state. */
__setDataSourceState(state: import('./dataSource/types').DataSourceState<TRow>): void {
  const prev = this.dataSourceState;
  this.dataSourceState = state;
  // Notify listeners only when status/data/error changed (not refetch identity).
  if (
    prev.status !== state.status ||
    prev.data !== state.data ||
    prev.error !== state.error ||
    prev.totalRowCount !== state.totalRowCount
  ) {
    this.notify();
  }
}
```

### 3.2 `packages/react/src/useDataSource.ts`

```ts
/**
 * @lynellf/tablekit-react — `useDataSource` hook.
 *
 * Spec §5.2: "useDataSource(table, source) (or the dataSource option) wires
 * it up: it derives the manual* flags from capabilities, watches the relevant
 * state slices, builds RowsQuery, aborts stale requests via AbortSignal, and
 * exposes status: 'idle' | 'loading' | 'error', error, and refetch()."
 *
 * Implementation:
 *   1. Derive manual* flags from source.capabilities.
 *   2. On every relevant state slice change, build RowsQuery.
 *   3. Abort any in-flight AbortController; start a new one.
 *   4. Call source.getRows(query, { signal }).
 *   5. On success: write { status: 'success', data, totalRowCount }.
 *   6. On error: write { status: 'error', error }.
 *   7. While loading: write { status: 'loading' } (preserving prior data if any).
 *   8. Announce "Loaded N rows" on success (via instance.announce).
 *
 * The hook respects controlled slices: when the consumer owns a slice (e.g.,
 * `state.sorting` is controlled), the consumer's update path runs first; the
 * hook observes via `table.subscribe` and re-fetches.
 */

import type {
  DataSource,
  DataSourceState,
  RowsQuery,
} from '@lynellf/tablekit-core/dataSource';
import { buildRowsQuery, validateModeConfiguration } from '@lynellf/tablekit-core/dataSource';
import type { DataTableInstance, DataTableOptions } from '@lynellf/tablekit-core';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useState } from 'react';

/**
 * Return type. `data` is the latest successful result; consumers use it as
 * the `data` prop for `useDataTable`. `refetch` re-runs the current query.
 */
export interface UseDataSourceResult<TRow> {
  status: DataSourceState<TRow>['status'];
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
}

/**
 * Wire a `DataSource<TRow>` to a `DataTableInstance<TRow>`.
 *
 * Side effects:
 *   - Calls `table.setOptions({ manual*, rowCount })` to thread the
 *     capabilities through the existing pipeline (so `getRowModel()` and
 *     `getRowCount()` are correct without manual* plumbing).
 *   - Subscribes to state changes; rebuilds RowsQuery on every change.
 *   - Aborts in-flight fetches via AbortController.
 *   - Writes status to the instance via `__setDataSourceState`.
 *   - Routes "Loaded N rows" through the instance's announcer.
 */
export const useDataSource = <TRow>(
  table: DataTableInstance<TRow>,
  source: DataSource<TRow>,
): UseDataSourceResult<TRow> => {
  // Re-run mixed-mode warning when capabilities imply manualPagination + client sort/filter.
  useEffect(() => {
    const syntheticOptions: Partial<DataTableOptions<TRow>> = {
      manualPagination: source.capabilities.paginate === 'server',
      manualSorting: source.capabilities.sort === 'server',
      manualFiltering: source.capabilities.filter === 'server',
    };
    validateModeConfiguration(syntheticOptions as DataTableOptions<TRow>);
  }, [source.capabilities.sort, source.capabilities.filter, source.capabilities.paginate]);

  // In-flight AbortController; aborted on every fetch start.
  const abortRef = useRef<AbortController | null>(null);

  // Bump to force a refetch (manual trigger).
  const [refetchTick, setRefetchTick] = useState(0);

  // Memoized refetch; identity-stable across renders.
  const refetch = useCallback(() => {
    setRefetchTick((n) => n + 1);
  }, []);

  // Latest state snapshot for React subscribers.
  const dataSourceState = (table as unknown as {
    __getDataSourceState(): DataSourceState<TRow>;
  }).__getDataSourceState();

  // Subscribe to instance state changes.
  useEffect(() => {
    let cancelled = false;

    const runFetch = async () => {
      // Build query from current state via the internal seam.
      const query = (table as unknown as {
        __buildRowsQuery(capabilities: { sort: 'client' | 'server'; filter: 'client' | 'server'; paginate: 'client' | 'server' }): RowsQuery;
      }).__buildRowsQuery(source.capabilities);

      // Thread manual* flags into the instance options.
      table.setOptions({
        ...(table as unknown as { __getOptions?: () => DataTableOptions<TRow> }).__getOptions?.() ?? {},
        manualSorting: source.capabilities.sort === 'server',
        manualFiltering: source.capabilities.filter === 'server',
        manualPagination: source.capabilities.paginate === 'server',
      });

      // Abort any in-flight fetch.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Mark loading.
      (table as unknown as {
        __setDataSourceState(state: DataSourceState<TRow>): void;
      }).__setDataSourceState({
        status: 'loading',
        data: dataSourceState.data, // preserve prior data during loading (stale-while-revalidate)
        error: undefined,
        refetch,
      });

      try {
        const result = source.getRows(query, { signal: controller.signal });
        const awaited = result instanceof Promise ? await result : result;
        if (cancelled || controller.signal.aborted) return;
        (table as unknown as {
          __setDataSourceState(state: DataSourceState<TRow>): void;
        }).__setDataSourceState({
          status: 'success',
          data: awaited.rows,
          totalRowCount: awaited.totalRowCount,
          error: undefined,
          refetch,
        });
        // Announce via the instance's announcer (routes through ReactAnnouncer).
        const announcer = (table as unknown as { getAnnouncer?: () => { announce(msg: string): void } }).getAnnouncer?.();
        announcer?.announce(`Loaded ${awaited.rows.length} rows`);
        // Update rowCount for aria-rowcount when server paginate.
        if (source.capabilities.paginate === 'server' && typeof awaited.totalRowCount === 'number') {
          table.setOptions({
            ...(table as unknown as { __getOptions?: () => DataTableOptions<TRow> }).__getOptions?.() ?? {},
            manualPagination: true,
            rowCount: awaited.totalRowCount,
          });
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        (table as unknown as {
          __setDataSourceState(state: DataSourceState<TRow>): void;
        }).__setDataSourceState({
          status: 'error',
          data: dataSourceState.data, // preserve prior data on error
          error: err instanceof Error ? err : new Error(String(err)),
          refetch,
        });
      }
    };

    void runFetch();

    // Subscribe to state changes; refetch on any change.
    const unsubscribe = table.subscribe(runFetch);
    return () => {
      cancelled = true;
      unsubscribe();
      abortRef.current?.abort();
    };
    // Re-run on refetchTick (manual trigger) or when source changes.
  }, [source, refetchTick, refetch, table]);

  // Subscribe to the instance for React consumers (status is read via getSnapshot).
  const subscribe = useCallback(
    (onChange: () => void) => {
      return table.subscribe(onChange);
    },
    [table],
  );

  const getSnapshot = useCallback(() => {
    return (table as unknown as {
      __getDataSourceState(): DataSourceState<TRow>;
    }).__getDataSourceState();
  }, [table]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    status: snapshot.status,
    data: snapshot.data,
    totalRowCount: snapshot.totalRowCount,
    error: snapshot.error,
    refetch,
  };
};
```

**Notes on the internal seams:** The hook reads `state` via `table.getState()` (public), reads columns via a new internal `__buildRowsQuery(state, capabilities)` method on the instance (added in §3.4), and threads `manual*` + `rowCount` via `table.setOptions(...)` with the consumer's existing options merged. This keeps the public surface clean — no `getOptions` or `getResolvedColumns` exposure needed.

### 3.3 `packages/react/src/useDataTable.ts` — patch

Extend the options + return type:

```ts
// Import additions
import { useDataSource } from './useDataSource';
import type { DataSource, DataSourceState } from '@lynellf/tablekit-core/dataSource';

// Extend UseDataTableResult
export interface UseDataTableResult<TRow> {
  table: DataTableInstance<TRow>;
  state: DataTableState;
  Announcer: () => ReactElement;
  /** M3 phase 3: present iff `dataSource` option is provided. */
  dataSourceState?: DataSourceState<TRow>;
}

// Extend options type
export interface UseDataTableOptions<TRow> extends DataTableOptions<TRow> {
  dataSource?: DataSource<TRow>;
}

// Inside useDataTable:
export const useDataTable = <TRow>(options: UseDataTableOptions<TRow>): UseDataTableResult<TRow> => {
  // ... existing ref + setOptions code ...

  // M3 phase 3: dataSource wiring
  const dataSourceState = options.dataSource
    ? useDataSource(table, options.dataSource)
    : undefined;

  // Sync the data prop with the latest successful fetch.
  const effectiveOptions = options.dataSource && dataSourceState?.data
    ? { ...options, data: dataSourceState.data }
    : options;

  // Re-apply options after the data swap.
  table.setOptions(effectiveOptions);

  // ... rest unchanged ...

  return {
    table,
    state,
    Announcer: () => React.createElement(ReactAnnouncer),
    ...(dataSourceState ? { dataSourceState } : {}),
  };
};
```

### 3.4 `packages/core/src/createDataTable.ts` — patch (internal seams)

Add the following methods to the `DataTable` class (these are typed `@internal` on the public interface — visible but discouraged for consumer use):

```ts
/** @internal Read the data source state. Used by the React hook. */
__getDataSourceState(): import('./dataSource/types').DataSourceState<TRow> {
  return this.dataSourceState;
}

/** @internal Write the data source state. Used by the React hook. */
__setDataSourceState(state: import('./dataSource/types').DataSourceState<TRow>): void {
  // ... implementation as in §3.1 ...
}

/**
 * @internal
 * Build a `RowsQuery` from the current state + capabilities. Encapsulates
 * the column resolution + filterFn-name resolution so the React hook
 * doesn't need to expose columns or options publicly.
 */
__buildRowsQuery(capabilities: DataSourceCapabilities): import('./dataSource/types').RowsQuery {
  const state = this.state;
  const columns = this.getResolvedColumns();
  return buildRowsQuery(state, columns, { capabilities });
}
```

Add to the `DataTableInstance` interface (in `types.ts`):

```ts
/** @internal Read the data source state. Used by the React hook. */
__getDataSourceState(): import('./dataSource/types').DataSourceState<TRow>;
/** @internal Write the data source state. Used by the React hook. */
__setDataSourceState(state: import('./dataSource/types').DataSourceState<TRow>): void;
/** @internal Build a `RowsQuery` from current state + capabilities. Used by the React hook. */
__buildRowsQuery(capabilities: import('./dataSource/types').DataSourceCapabilities): import('./dataSource/types').RowsQuery;
```

The hook calls `table.__buildRowsQuery(source.capabilities)` instead of doing the column resolution + filterFn lookup itself. This keeps the public surface clean.

### 3.5 `packages/react/src/index.ts` — addition

```ts
export { useDataSource } from './useDataSource';
export type { UseDataSourceResult } from './useDataSource';
```

---

## 4. Commands + Verification

```bash
# 1. Typecheck
pnpm --filter @lynellf/tablekit-react typecheck

# 2. Run new tests
pnpm --filter @lynellf/tablekit-react test -- --run useDataSource

# 3. Run full react suite
pnpm --filter @lynellf/tablekit-react test -- --run

# 4. Aggregate gate
pnpm verify                                                # EXIT 0

# 5. Hook smoke (Vitest REPL via a temporary test file)
cat > /tmp/smoke.tsx <<'EOF'
/** @jsxImportSource react */
import { renderHook, act } from '@testing-library/react';
import { useDataTable } from '@lynellf/tablekit-react';
import { createClientDataSource } from '@lynellf/tablekit-core/dataSource';

const source = createClientDataSource(
  [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }],
  [{ id: 'name', accessor: 'name' }],
);

const { result } = renderHook(() =>
  useDataTable({
    data: [],
    columns: [{ id: 'name', accessor: 'name' }],
    dataSource: source,
  }),
);

// expect(result.current.dataSourceState?.status).toBe('success');
// expect(result.current.dataSourceState?.data).toEqual([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]);
EOF
pnpm --filter @lynellf/tablekit-react exec vitest run --reporter=verbose /tmp/smoke.tsx
```

### Acceptance criteria

- `useDataSource` returns `{ status, data, totalRowCount?, error?, refetch }` matching the spec §5.2 contract.
- `useDataTable({ dataSource })` returns the same fields under `dataSourceState`.
- Abort-stale: a state change during an in-flight fetch aborts the in-flight controller; the stale fetch's `.then()` does not overwrite the new state. Verified via `abort-stale.test.tsx`.
- Refetch: calling `refetch()` re-runs the current query with a fresh controller. Verified via `useDataSource.test.tsx`.
- Controlled slices: when `state.sorting` is controlled, the consumer's update triggers a state change observed via `table.subscribe`; the hook re-fetches. Verified via a controlled-slice variant of `server-sort.test.tsx` (in phase 5).
- "Loaded N rows" announces via the existing `ReactAnnouncer` on success. Verified via `loading-announcer.test.tsx` (phase 4).
- `pnpm verify` exits 0; existing 302 tests still pass.

---

## 5. Out-of-scope (deferred to later phases)

- `aria-busy` / `aria-invalid` on `getGridProps()` — phase 4.
- Placeholder rows — phase 4.
- Server pagination / sort / filter integration tests — phase 4 + phase 5.
- Reference app — phase 5.
- Serialization golden fixtures — phase 5.

---

## 6. Risks (phase 3 specific)

1. **Internal seam pattern.** Phase 3 uses `__buildRowsQuery(state, capabilities)`, `__getDataSourceState()`, and `__setDataSourceState()` rather than exposing `getOptions` and `getResolvedColumns` on the public interface. The `__`-prefixed methods are typed `@internal` in JSDoc but remain on the interface for the hook to call. This keeps the public API surface tight while giving the hook what it needs. The `__getOptions` accessor (used by the hook to read the current options snapshot when threading `manual*` + `rowCount`) is the one public-ish addition; it's `@internal`-tagged and never appears in the user-facing docs.
2. **Stale-while-revalidate semantics.** During loading, the prior `data` is preserved in `dataSourceState.data`. The `useDataTable` `effectiveOptions` uses `dataSourceState.data` when non-null; during a state change while loading, the prior data is shown until the new fetch resolves. This matches TanStack Query's default UX. The spec doesn't mandate this; it's a UX choice that matches industry convention.
3. **`useEffect` re-runs on every source change.** The hook accepts a `source` prop; when the consumer replaces `source` (e.g., switches from one server to another), the hook aborts and re-initializes. This is correct but means consumers should memoize their `source` (e.g., `useMemo(() => createClientDataSource(...), [deps])`).
4. **Concurrent state changes.** If the consumer flips two slices in the same render (e.g., sort + filter), `table.subscribe` fires once per state change. The hook fires once per call; the second call aborts the first. The race is handled by the abort-controller pattern, but rapid state changes (e.g., typing in a filter input) cause one fetch per keystroke. Spec §16 risk #7 flags this; debouncing is consumer-owned in M3 (TanStack Query's `keepPreviousData` + `staleTime` is the recommended mitigation).
5. **`useDataSource` and React 19 StrictMode.** The hook's `useEffect` runs twice in StrictMode; the abort-controller pattern handles this correctly (first run aborts, second run starts fresh). Verified via `useDataSource.test.tsx` with `<React.StrictMode>` wrapping.
6. **`dataSource` option on `useDataTable` is sugar.** The hook internally calls `useDataSource`, which calls `useEffect` + `useSyncExternalStore`. Calling both `useDataSource` AND passing `dataSource` to `useDataTable` is a bug; the hook detects this and emits a dev warning. Implementation: `useDataTable` checks if both `options.dataSource` is set AND a `dataSourceState` is being read; if so, console.warn and use only the explicit `useDataSource` call.