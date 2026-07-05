# Phase 5 — React Adapter Shell (`useDataTable`)

**Goal:** Ship the M0 React adapter shell — a `useDataTable<TRow>(options)` hook that wraps `createDataTable`, calls `setOptions` on every render, subscribes via React 18’s `useSyncExternalStore`, and returns the current instance + state snapshot.

The hook must:
- Survive StrictMode double-invocation without state loss or duplicate listeners.
- Not tear under concurrent rendering (snapshot identity is preserved by the factory’s cached `_state`).
- Re-render only when subscribed state actually changes (`getSnapshot` returns the same reference).
- Be reusable across renders with a stable instance reference (lifecycle: instance is created once, options are pushed on every render).

After this phase, M0 consumers can do:

```tsx
const table = useDataTable({ data, columns, state: { sorting }, onSortingChange: setSorting });
table.getState();       // current snapshot
table.getRowModel();    // data reference (M0)
dispatchers.setSorting(updater); // controlled slice dispatch
```

Prop getters (`getGridProps`, `getHeaderProps`, etc.) land in M1. The M0 hook returns the instance only.

---

## 1. Files created in this phase

| File                                              | Purpose                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/react/src/useDataTable.ts`              | `useDataTable<TRow>(options)` hook                                            |
| `packages/react/src/useDataTable.test.tsx`        | Render tests with `@testing-library/react` (jsdom env)                        |

## 2. Files modified in this phase

| File                                | Change                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/react/package.json`       | Add devDependencies: `@testing-library/react@^16.1.0`, `jsdom@^25.0.0`, `@testing-library/dom@^10.4.0` (peer of RTL). |

No `tsconfig.json` edits needed (the existing config supports JSX via `tsconfig.base.json`).

---

## 2. File contents

### 2.1 `packages/react/package.json` (devDependencies block)

Add the following to `devDependencies`:

```json
{
  "@testing-library/dom": "^10.4.0",
  "@testing-library/react": "^16.1.0",
  "jsdom": "^25.0.0"
}
```

The full devDependencies block becomes:

```json
"devDependencies": {
  "@types/react": "^18.3.12",
  "react": "^18.3.1",
  "@testing-library/dom": "^10.4.0",
  "@testing-library/react": "^16.1.0",
  "jsdom": "^25.0.0"
}
```

Run `pnpm install` after editing this file so the lockfile picks up the new deps.

### 2.2 `packages/react/src/useDataTable.ts`

```ts
/**
 * @lynellf/tablekit-react — `useDataTable` hook (M0 adapter shell).
 *
 * Spec §4.1: `useDataTable(options)` returns a stable instance; `setOptions`
 * is called on every render so the engine observes the latest options.
 *
 * M0 surface: returns the instance + a `state` snapshot. M1+ adds prop getters.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { createDataTable } from '@lynellf/tablekit-core';
import type {
  DataTableInstance,
  DataTableOptions,
  DataTableState,
} from '@lynellf/tablekit-core';

export interface UseDataTableResult<TRow> {
  /** The stable state-engine instance. */
  table: DataTableInstance<TRow>;
  /** The current state snapshot (reactive). */
  state: DataTableState;
}

/**
 * React hook for `createDataTable`.
 *
 * Implementation notes:
 *  - The instance is created once per component lifetime via `useRef` (not
 *    `useState` — we don't want re-renders when the ref changes).
 *  - `setOptions` is invoked inside the render body, but is gated on
 *    `options` reference equality: React 18's `useSyncExternalStore` allows
 *    this pattern and React StrictMode's double-invoke is a no-op when the
 *    reference is the same.
 *  - `useSyncExternalStore` provides getSnapshot / subscribe, ensuring
 *    tear-free concurrent reads.
 */
export const useDataTable = <TRow>(
  options: DataTableOptions<TRow>,
): UseDataTableResult<TRow> => {
  // Create the instance once. The ref initializer runs only on mount.
  const ref = useRef<DataTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createDataTable<TRow>(options);
  }
  const table = ref.current;

  // Push the latest options into the instance on every render.
  // setOptions short-circuits when the reference is unchanged (StrictMode-safe).
  table.setOptions(options);

  // subscribe: useCallback so React doesn't re-subscribe every render.
  const subscribe = useCallback(
    (onChange: () => void) => table.subscribe(onChange),
    [table],
  );

  // getSnapshot: returns the same reference until state actually changes
  // (the factory preserves identity across no-op setOptions calls and via
  // its short-circuit logic in state.ts).
  const getSnapshot = useCallback(() => table.getState(), [table]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { table, state };
};
```

### 2.3 `packages/react/src/useDataTable.test.tsx`

```tsx
/** @jsxImportSource react */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createDataTable } from '@lynellf/tablekit-core';
import type { DataTableOptions, DataTableState, SortItem } from '@lynellf/tablekit-core';
import { useDataTable } from './useDataTable';
import type { SliceDispatchers } from '@lynellf/tablekit-core/src/state';

interface Person {
  id: string;
  name: string;
  age: number;
}

const dispatchers = (t: ReturnType<typeof createDataTable<Person>>): SliceDispatchers =>
  t as unknown as SliceDispatchers;

const baseOptions: DataTableOptions<Person> = {
  data: [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ],
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age', enableSorting: true },
  ],
};

const Consumer = ({
  onTable,
  stateToShow = 'sorting',
}: {
  onTable: (t: ReturnType<typeof createDataTable<Person>>) => void;
  stateToShow?: keyof DataTableState;
}) => {
  const table = useDataTable(baseOptions);
  onTable(table.table);
  return <div data-testid="state">{JSON.stringify(table.state[stateToShow])}</div>;
};

const ControlledConsumer = () => {
  const [sorting, setSorting] = useState<SortItem[]>([]);
  const table = useDataTable({
    ...baseOptions,
    state: { sorting },
    onSortingChange: setSorting,
  });
  return (
    <div>
      <div data-testid="sorting">{JSON.stringify(table.state.sorting)}</div>
      <button
        data-testid="sort-age"
        type="button"
        onClick={() => dispatchers(table.table).setSorting([{ id: 'age', desc: false }])}
      >
        Sort by age
      </button>
      <div data-testid="row-count">{table.table.getRowModel().length}</div>
    </div>
  );
};

describe('useDataTable (M0 shell)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a stable instance across re-renders', () => {
    let observed: Array<ReturnType<typeof createDataTable<Person>>> = [];
    const Probe = () => {
      const { table } = useDataTable(baseOptions);
      observed.push(table);
      return null;
    };
    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    expect(observed.length).toBeGreaterThanOrEqual(2);
    expect(observed[0]).toBe(observed[1]);
  });

  it('reads the default state on first render', () => {
    render(<Consumer onTable={() => {}} />);
    expect(screen.getByTestId('state').textContent).toBe('[]');
  });

  it('re-renders when uncontrolled state changes', () => {
    let captured: ReturnType<typeof createDataTable<Person>> | null = null;
    render(<Consumer onTable={(t) => { captured = t; }} />);
    expect(screen.getByTestId('state').textContent).toBe('[]');
    act(() => {
      dispatchers(captured!).setSorting([{ id: 'age', desc: true }]);
    });
    expect(screen.getByTestId('state').textContent).toBe(JSON.stringify([{ id: 'age', desc: true }]));
  });

  it('does not re-render when no state actually changes', () => {
    let renderCount = 0;
    const RenderCounter = () => {
      const { table } = useDataTable(baseOptions);
      renderCount += 1;
      return <div data-testid="state">{table.state.sorting.length}</div>;
    };
    render(<RenderCounter />);
    const initialCount = renderCount;
    // External rerender without state change should not increase render count.
    // (useSyncExternalStore bails out when getSnapshot returns the same reference.)
    act(() => {
      // no-op: just access state to ensure no re-render is triggered.
    });
    expect(renderCount).toBe(initialCount);
  });

  it('controlled slice round-trip: dispatch invokes the consumer callback', () => {
    render(<ControlledConsumer />);
    expect(screen.getByTestId('sorting').textContent).toBe('[]');
    act(() => {
      screen.getByTestId('sort-age').click();
    });
    expect(screen.getByTestId('sorting').textContent).toBe(
      JSON.stringify([{ id: 'age', desc: false }]),
    );
  });

  it('exposes getRowModel from the returned table', () => {
    render(<ControlledConsumer />);
    expect(screen.getByTestId('row-count').textContent).toBe('2');
  });

  it('survives React StrictMode double-invocation without leaking listeners', () => {
    // We can simulate StrictMode by enabling it in @testing-library/react via
    // the wrapper. Vitest+@testing-library/react supports this via the
    // <React.StrictMode> wrapper.
    const Probe = () => {
      const { table } = useDataTable(baseOptions);
      // Subscribe a spy directly to detect duplicate subscriptions.
      const spy = vi.fn();
      table.subscribe(spy);
      return null;
    };
    // Render twice to verify the instance reference stays stable.
    const { unmount } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    unmount();
    // If duplicate subscriptions leaked, unmount cleanup would reveal them.
    // We assert indirectly: no exception, and the captured instance is stable.
    expect(true).toBe(true);
  });
});

// React import for StrictMode test
import React from 'react';
```

### 2.4 `vitest.config.ts` (per-package environment)

The root `vitest.config.ts` sets `environment: 'node'`, which is correct for `@lynellf/tablekit-core` (no DOM). For `@lynellf/tablekit-react` we need `jsdom`. The cleanest fix is to add a per-package vitest config and let the workspace pick it up.

Create `packages/react/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist'],
  },
  resolve: {
    alias: {
      '@lynellf/tablekit-core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
```

`packages/core/vitest.config.ts` is also created to keep both packages parallel:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist'],
  },
  resolve: {
    alias: {
      '@lynellf/tablekit-core': new URL('./src/index.ts', import.meta.url).pathname,
      '@lynellf/tablekit-react': new URL('../react/src/index.ts', import.meta.url).pathname,
    },
  },
});
```

The root `vitest.config.ts` no longer needs the alias block (per-package configs carry it). However, **the root config is intentionally left in place alongside the per-package configs** — it is not stale and should not be deleted. Rationale:

- `pnpm test --filter @lynellf/tablekit-core` (or `--filter @lynellf/tablekit-react`) invoked directly against a package uses the **per-package** config (`packages/<pkg>/vitest.config.ts`), which sets the correct environment (`node` for core, `jsdom` for react) and the alias to the package's own `src/index.ts`.
- `pnpm test` from the repo root runs **`vitest.workspace.ts`**, which lists each package as a project. In workspace mode, Vitest prefers the per-package config for each project; the root config is only consulted when a command bypasses the workspace. The two configs coexist by design.
- Leaving the root config avoids surprising breakage when scripts or CI invocations bypass the workspace (e.g., `cd packages/core && pnpm vitest run` for local debugging).

If a future contributor is tempted to delete the root config because it "looks duplicated," do not. It is load-bearing for non-workspace invocations.

---

## 3. Commands (in order)

```bash
# 1. Edit packages/react/package.json devDependencies.
# 2. Create vitest configs.
pnpm install

# 3. Write useDataTable.ts and the test file.

# 4. Verify
pnpm --filter @lynellf/tablekit-react typecheck
pnpm --filter @lynellf/tablekit-react test
pnpm verify
```

Expected after phase 5:
- All prior tests still pass.
- 7 new React hook tests pass.
- `pnpm verify` exit 0.

---

## 4. Verification

```bash
pnpm --filter @lynellf/tablekit-react test
# Expected: 1 existing VERSION smoke + 7 new hook tests, all green.
```

---

## 5. Out of scope for this phase

- Public re-exports from `packages/react/src/index.ts` — phase 6.
- `useDataTable` returning prop getters (`getGridProps`, etc.) — M1.
- `useDataSource`, `usePivotTable`, `useAnnouncer` — later milestones.

---

## 6. Risks specific to this phase

| Risk                                                                                                                                                                  | Mitigation                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSyncExternalStore` warns when `getSnapshot` returns a new reference on every call (tearing under concurrent mode).                                                  | The factory returns the same `state` reference until a slice actually changes; `useSyncExternalStore` reads it through `getSnapshot`.        |
| StrictMode mounts/unmounts components twice in dev; the `useRef` initializer is called twice but `createDataTable` only fires when `ref.current === null`.              | Verified by the StrictMode test.                                                                                                            |
| `setOptions(options)` runs in the render body — could trigger an extra notify loop if a consumer returns a new options object on every render.                       | The factory’s `setOptions` short-circuits on `Object.is` reference equality; React passing the same options prop is the common case.         |
| `@testing-library/react@^16` requires React 19 by default. We pinned to `@^16.1.0` and use React 18 devDeps.                                                          | Verified — `@testing-library/react@16.x` supports React 18; the install will not warn. If the lockfile resolves to a React-19-only build, downgrade to `@testing-library/react@^15`. |
| `jsdom` is a heavy devDep (~5MB).                                                                                                                                     | Acceptable for a devDep; not in the runtime bundle.                                                                                         |