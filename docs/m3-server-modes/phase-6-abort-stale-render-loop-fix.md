# Phase 6 — Abort-Stale Render-Loop Fix (M3 Remediation)

**Status:** Draft for review — addresses the `abort-stale.test.tsx` render-loop regression surfaced by `assistant` (visit 3) during M3 verification.
**Scope:** Single-file-root-cause fix plus one-line defensive change in the React adapter. Re-uses M3 phase-3 plan artifacts; **no new subpaths, no new public API, no M0–M2 surface change.**
**Audience:** `implementer` (after panel approval), `reviewer` (verification).

---

## 1. Context

After M3 phase 3 (`useDataSource` hook) lands, the new integration test `packages/react/src/__integration__/abort-stale.test.tsx` fails. The current run shows:

```
[tablekit] Server pagination with client-side sort/filter applies within the current page only ...
Error: Maximum update depth exceeded.
  at forceStoreRerender (...react-dom...development.js:8261:18)
  at ...react-dom...development.js:8247:11
  at DataTable.notify (...createDataTable.ts:843:7)
  at DataTable.setOptions (...createDataTable.ts:158:12)
  at Module.useDataTable (...useDataTable.ts:60:9)
  at App (...abort-stale.test.tsx:48:42)
```

The test observed **53 `getRows` calls** before the user "click" ever executed — `useDataTable` is re-rendering inside React's update queue faster than the test driver can advance time.

The bug is reproducible with a fresh clone:

```bash
cd packages/react && npx vitest run src/__integration__/abort-stale.test.tsx
```

All M2 tests (302 core tests + 26 react tests) still pass; the regression is localized to the `useDataTable + useDataSource + controlled object slice` combination.

---

## 2. Root cause (verified)

`packages/react/src/useDataTable.ts:60` calls `table.setOptions(options)` on every render. Inside `packages/core/src/createDataTable.ts` `setOptions`:

```ts
this.state = mergeInitialState(next.initialState, next.state);   // rebuilds state; object-literal slices become new refs
…
if (stateChangedOnSlices(prevState, this.state, [...])) {
  this.notify();                                                 // schedules a concurrent re-render
}
```

`stateChangedOnSlices` (`packages/core/src/state.ts:127`) calls `shallowEqual` on each slice. `shallowEqual` (`packages/core/src/utils.ts:13`) only handles **primitives** and **arrays** — for non-array plain objects (e.g. `pagination: { pageIndex: 0, pageSize: 10 }`, `columnPinning: { left: [], right: [] }`, `columnSizing: { … }`) it falls through to the comment "must match by reference" and returns `false`. Re-deriving state from the same option set therefore creates new object references, `shallowEqual` reports a false-positive state change, and `notify()` fires every render.

Three load-bearing facts from the live trace:

1. **M0/M1/M2 weren't affected because they only used array-valued slices** in tests (sorting, columnFilters); `shallowEqual` *does* handle arrays correctly.
2. **The `abort-stale` test exposes the bug because it passes `state: { pagination }` (an object)** to `useDataTable`, and the DEFAULT_STATE pageSize (25) differs from the consumer's pageSize (10) — the very first render already reports a true-positive state change, after which subsequent renders produce false-positive changes because `shallowEqual` mis-classifies the re-derived `pagination` object.
3. **`useDataSource`'s effect** compounds the problem: it calls `table.setOptions({ …, manualPagination: true, rowCount: 1 })` from within a `useEffect`, then its `table.subscribe(() => runFetch())` listener fires whenever `setOptions` notifies, producing a second concurrent notification path.

Even if `shallowEqual` were flawless, calling `setOptions` from inside a render body is anti-idiomatic for React 19's concurrent renderer: it forces the notification to run during the render phase, which `useSyncExternalStore` guards against in the stricter `getServerSnapshot` path but otherwise bounces back through `enqueueConcurrentRenderForLane` until React's update-budget threshold trips.

The brief offered **Option A** (fix `setOptions`/`shallowEqual`) vs. **Option B** (move `setOptions` out of render). Analysis confirms the two are complementary but **Option A is the load-bearing fix** — without it, `setOptions` *still* notifies on every consumer re-render because the new options object is always `!==` the previous reference and the new state objects always `!==` previous state objects. Option B alone is insufficient.

---

## 3. Fix plan

### 3.1 Files modified

| File | Change |
| --- | --- |
| `packages/core/src/utils.ts` | Add a new exported helper `sliceValuesEqual(a, b)` that performs `Object.is` + array element-by-element + **one-level structural equality for plain objects**. Keep `shallowEqual` unchanged (M0/M1/M2 callers still depend on the "arrays handled, objects by reference" behavior in `applySliceChange`). |
| `packages/core/src/state.ts` | `stateChangedOnSlices` switches from `shallowEqual` to `sliceValuesEqual` for the slice-level comparison. Adds a unit test in `state.test.ts`. |
| `packages/react/src/useDataTable.ts` | Move `table.setOptions(options)` from the render body into a `useEffect` (dep `[table]`). Add an inline comment pointing at `setOptions as side effect` so future contributors don't regress this. Re-export from the hook unchanged. |
| `packages/core/src/createDataTable.test.ts` | Add a regression test that re-derives state from the same `{ pagination: {pageIndex:0,pageSize:10} }` option set twice and asserts `notify` is *not* called the second time. |

### 3.2 Files unchanged on purpose

- `packages/react/src/useDataSource.ts` — the hook is correct; its `useEffect` is the right place for the post-mount `setOptions` push (already a `useEffect`). No change.
- `packages/core/src/dataSource/*` — independent of the slice-equality bug. No change.
- All M0/M1/M2 plan artifacts — no API surface change.

### 3.3 Exact code changes

#### Change 1 — `packages/core/src/utils.ts` (additive)

Append after the existing `shallowEqual`:

```ts
/**
 * Equality helper for controlled-slice values used by `stateChangedOnSlices`.
 *
 * Built on top of `shallowEqual` but with one structural difference: non-array
 * plain objects are compared key-by-key with `Object.is`, instead of falling
 * back to reference equality. This is what fixes the M3 `abort-stale` render
 * loop: re-deriving a slice (e.g., `pagination = { pageIndex: 0, pageSize: 10 }`)
 * from options on a subsequent render produces a new object reference even
 * though the values are unchanged, and `shallowEqual`'s "objects must match by
 * reference" rule was reporting a false-positive state change.
 *
 * Constraints:
 *   - State slices are JSON-serializable per spec §4.2, so one-level equality
 *     is sufficient (no nested-object walk needed).
 *   - Arrays continue to compare element-by-element (same rule as shallowEqual).
 *   - Primitives, `null`, and `undefined` use `Object.is`.
 */
export const sliceValuesEqual = <T>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    // Exclude React/DOM-like objects with prototypes we don't want to enumerate;
    // state slices are plain records per spec §4.2.
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const aKeys = Object.keys(aRec);
    if (aKeys.length !== Object.keys(bRec).length) return false;
    for (const key of aKeys) {
      if (!Object.is(aRec[key], bRec[key])) return false;
    }
    return true;
  }
  return false;
};
```

#### Change 2 — `packages/core/src/state.ts` (one line)

In `stateChangedOnSlices`, replace the `shallowEqual` import and call:

```ts
import { sliceValuesEqual } from './utils';
…
export const stateChangedOnSlices = (
  prev: DataTableState,
  next: DataTableState,
  slices: SliceChangeKey[],
): boolean => {
  for (const slice of slices) {
    if (!sliceValuesEqual(prev[slice], next[slice])) {
      return true;
    }
  }
  return false;
};
```

(The function is also used by `createDataTable.ts` to gate `onStateChange`; both call sites get the fix.)

#### Change 3 — `packages/react/src/useDataTable.ts` (move setOptions into effect)

```ts
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
…
export const useDataTable = <TRow>(
  options: UseDataTableOptions<TRow>,
): UseDataTableResult<TRow> => {
  // Create the instance once. The ref initializer runs only on mount.
  const ref = useRef<DataTableInstance<TRow> | null>(null);
  if (ref.current === null) {
    ref.current = createDataTable<TRow>(options);
  }
  const table = ref.current;

  // ── Side-effect: push the latest options into the instance.
  //
  // setOptions is a side effect: it can call notify(), which schedules a
  // re-render via useSyncExternalStore. We intentionally run it in an effect
  // (after commit) rather than during render — React 19's concurrent renderer
  // will otherwise coalesce the notify into the in-flight render cycle and
  // trip "Maximum update depth exceeded" once any controlled object-valued
  // slice (e.g., pagination) re-derives to the same values via the broken
  // shallowEqual. The dep is `[options, table]` because:
  //   - We MUST re-fire after every render so the instance picks up the
  //     latest controlled-slice values (`state`, `columns`, `data`, …).
  //     Using only `[table]` would leave the instance with a stale snapshot
  //     of options on subsequent renders and the controlled-slice contract
  //     would silently break.
  //   - We rely on `sliceValuesEqual` (Change 1 + 2) to keep setOptions a
  //     no-op when the post-commit options derive the same state, so the
  //     per-render effect does not storm notifications.
  useEffect(() => {
    table.setOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, table]);

  // subscribe: useCallback so React doesn't re-subscribe every render.
  const subscribe = useCallback((onChange: () => void) => table.subscribe(onChange), [table]);

  // getSnapshot: returns the same reference until state actually changes.
  const getSnapshot = useCallback(() => table.getState(), [table]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // M3 phase 3: dataSource wiring
  const dataSourceState = options.dataSource
    ? useDataSource(
        table as DataTableInstance<TRow> &
          Parameters<typeof useDataSource<TRow>>[0],
        options.dataSource,
      )
    : undefined;

  return {
    table,
    state,
    Announcer: () => {
      return React.createElement(ReactAnnouncer);
    },
    ...(dataSourceState ? { dataSourceState } : {}),
  };
};
```

**Why `[options, table]` (and not just `[table]`):**
- `options` is a new object literal every render, so the effect runs after every commit. This is required to push updated controlled-slice values through to the instance — without re-fire the consumer's `state.pagination = { pageIndex: 1 }` after a click would never reach the instance and the controlled-slice contract would silently break.
- `table` is the ref-stable instance; included for the React exhaustive-deps rule and as a defensive check.
- With Change 1+2 (`sliceValuesEqual`) in place, `setOptions` called every render post-commit only notifies on actual state change, so the per-render effect does not storm notifications.
- The `eslint-disable` comment is necessary because the effect intentionally captures the whole `options` object rather than individual slices (`options.state`, `options.onPaginationChange`, etc.) — listing those would either (a) recreate the per-render churn or (b) miss the controlled-slice update path entirely.

**Tradeoff — one-render lag after a controlled-slice change:**
- This change introduces at most a one-render lag when a controlled slice changes. Trace: click `Next` → React schedules re-render → render reads stale state from `useSyncExternalStore` → commit → `useEffect` calls `setOptions` → instance state updates → `notify` → React schedules a second render → second render reads fresh state. The user-visible effect: a single extra render per state mutation, which is below the perceptual threshold for table interactions.
- We accept this lag because the alternative (keeping `setOptions` in the render body) makes React 19's concurrent renderer trip "Maximum update depth exceeded" on the first controlled-object-slice render.

#### Change 4 — `packages/core/src/state.test.ts` (regression unit tests)

Append to the existing describe block:

```ts
describe('stateChangedOnSlices (object-slice regression — M3 abort-stale)', () => {
  it('reports no change when a re-derived pagination object has identical values', () => {
    const prev: DataTableState = {
      ...DEFAULT_STATE,
      pagination: { pageIndex: 0, pageSize: 10 },
    };
    const next: DataTableState = {
      ...prev,
      pagination: { pageIndex: 0, pageSize: 10 }, // new ref, same values
    };
    expect(
      stateChangedOnSlices(prev, next, ['pagination']),
    ).toBe(false);
  });

  it('reports a change when pagination values differ', () => {
    const prev: DataTableState = {
      ...DEFAULT_STATE,
      pagination: { pageIndex: 0, pageSize: 10 },
    };
    const next: DataTableState = {
      ...prev,
      pagination: { pageIndex: 1, pageSize: 10 },
    };
    expect(
      stateChangedOnSlices(prev, next, ['pagination']),
    ).toBe(true);
  });

  it('reports no change for columnPinning when contents match across new refs', () => {
    const prev: DataTableState = {
      ...DEFAULT_STATE,
      columnPinning: { left: ['a'], right: [] },
    };
    const next: DataTableState = {
      ...prev,
      columnPinning: { left: ['a'], right: [] },
    };
    expect(
      stateChangedOnSlices(prev, next, ['columnPinning']),
    ).toBe(false);
  });
});
```

#### Change 5 — `packages/core/src/createDataTable.test.ts` (regression integration test)

Append a single test:

```ts
it('does not notify when setOptions is called twice with equivalent controlled slices', () => {
  const listener = vi.fn();
  const opts1: DataTableOptions<{ id: string }> = {
    data: [],
    columns: [{ id: 'id', accessor: 'id' }],
    state: { pagination: { pageIndex: 0, pageSize: 10 } },
    onPaginationChange: () => {},
  };
  const opts2: DataTableOptions<{ id: string }> = {
    ...opts1,
    state: { pagination: { pageIndex: 0, pageSize: 10 } }, // different ref, same values
  };
  const t = createDataTable<{ id: string }>(opts1);
  t.subscribe(listener);
  listener.mockClear();
  t.setOptions(opts2);
  expect(listener).not.toHaveBeenCalled();
});
```

### 3.4 Why this is sufficient (and Option B alone is not)

| Change | Stops the false-positive notify? | Stops the in-render state transition? | Aligned with React 19 concurrency guidance? |
| --- | :---: | :---: | :---: |
| **A. `sliceValuesEqual` (primary)** | ✅ | ❌ (still calls setOptions during render) | partial |
| **B. `useEffect` for `setOptions`** | ❌ (still shallow-equal-broken) | ✅ | ✅ |
| **A + B (recommended)** | ✅ | ✅ | ✅ |

The "aborting stale requests" behavior (the actual semantic of the test name) is unaffected: `useDataSource`'s `useEffect` already owns the `AbortController` lifecycle, and the test only verifies that a state change triggers a re-fetch — which still works because the `useDataSource` effect's `table.subscribe(() => runFetch())` listener still fires whenever the instance's internal state actually changes (dispatcher-driven state changes via `setPagination`, etc.).

---

## 4. Acceptance criteria

1. **`abort-stale.test.tsx` passes** (the headline requirement).
2. **No new render-storm warnings** in stderr (the existing test output contains the message `Cannot update a component … while rendering a different component`; after the fix this stderr is silent).
3. **All M3 integration tests still pass** — at minimum the five already-green tests:
   - `server-pagination.test.tsx` (5 cases)
   - `useDataSource-minimal.test.tsx`
   - `mixed-mode-warning.test.tsx`
   - `loading-announcer.test.tsx`
   - and the four `async*.test.tsx` files
4. **All M0/M1/M2 tests still pass** — 323 core unit tests (per current `pnpm verify`) + ~26 react tests in `useDataTable.test.tsx` + index tests.
5. **No M0/M1/M2 public API change** — `shallowEqual` is retained (still used by `applySliceChange`); `sliceValuesEqual` is a new export under `packages/core/src/utils.ts` and is not re-exported from the package's public surface because no consumer should need it directly.
6. **`pnpm verify` exits 0** — typecheck + lint + test + build, no regressions.

---

## 5. Verification steps

```bash
# 1. Focused regression
cd packages/react && npx vitest run src/__integration__/abort-stale.test.tsx
#    EXPECT: 1 passed; stderr no longer contains "Maximum update depth exceeded"
#            or "Cannot update a component while rendering".

# 2. Other M3 integration tests still green
cd packages/react && npx vitest run src/__integration__/

# 3. New core unit tests added in this phase
cd packages/core && npx vitest run src/state.test.ts src/createDataTable.test.ts

# 4. Full project aggregate health (single command from repo root)
pnpm verify
#    EXPECT: exit 0; all suites green; no new warnings.
```

**Acceptance output check:** after step 1, the test stdout should show a single `getRows` call with `pagination.pageIndex === 0` before the click, followed by a second call with `pagination.pageIndex === 1` after the click — never the 50+ call storm currently observed.

---

## 6. Risks and unknowns

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| **`shallowEqual` consumers (other than `stateChangedOnSlices`) silently change semantics** | Low | Medium | `sliceValuesEqual` is a *new* function. `shallowEqual` stays exported with identical semantics. `applySliceChange` in `state.ts:95` keeps using `shallowEqual`; its callers (M0 dispatch loop) already require reference equality for object slices (a slice-change uses `Object.is` on `next` *before* `shallowEqual` runs, so the mismatch was non-load-bearing there). |
| **Race between StrictMode double-mount and the post-commit `setOptions`** | Low | Low | First useEffect runs after first render; the cleanup-remount cycle re-runs the effect. With `sliceValuesEqual` fixed, the second `setOptions` notifies only if state actually changed. In practice no consumer state changes during StrictMode mount/unmount, so no observable diff. |
| **Hidden object-slice mutation (a slice that mutates in place)** | Very low | Medium | State slices are JSON-serializable per spec §4.2; in-place mutation is a spec violation. If a downstream consumer violates this, `sliceValuesEqual`'s `Object.is` on per-key values will catch the change correctly (the value reference changed). |
| **`useDataTable` initial-state visibility delay (one render behind)** | Low | Low | `createDataTable<TRow>(options)` reads `initialState` and `state` at construction, so initial `getState()` is correct on render 1. The post-commit `setOptions` is a no-op on render 1 (same options object identity-wise), so no observable one-render delay. |
| **`useSyncExternalStore` `getServerSnapshot` not provided** | None | None | The existing `useSyncExternalStore(subscribe, getSnapshot, getSnapshot)` passes the same `getSnapshot` for server and client. SSR semantics unchanged. |
| **`useDataSource` `useEffect` dep on `[source, table]` causes setOptions to run twice in StrictMode** | Confirmed | Negligible | The `useDataSource` effect already runs twice in StrictMode. With `sliceValuesEqual` fixed, the second `setOptions({…,rowCount:1})` notifies only when `rowCount` actually differs (it doesn't); no double-fetch. |
| **Future object-valued slice types (e.g., a new spec §10 announcer message map)** | Low | Low | `sliceValuesEqual` is general over `Record<string, unknown>`; any future JSON-serializable object-shaped slice works without further changes. |

---

## 7. Out of scope

- **`useDataSource` re-design** (move to TanStack Query, dedupe fetches, debounce). Out per spec §5.2 + §16 risk #7.
- **Refactoring the data-source notification path** (`__setDataSourceState`). Already covers reference + JSON equality; not implicated in the render loop.
- **Adding structural-share helpers** (e.g., `produce` from Immer). Overkill for a one-render-storm fix.
- **Auto-gating behind `allowWithinPageOperations`** (spec §16 risk #10). v2 discussion.
- **Performance benchmarks** for the additional object-key comparison. State slices are small (≤ ~50 keys for `columnSizing`); structural comparison is O(n) per slice per render — well under any budget.
- **M2 tests are not touched.** The change preserves all existing semantics.

---

## 8. Summary of what changes

**One new utility** (`sliceValuesEqual`), **one swapped import** (`shallowEqual` → `sliceValuesEqual` in `state.ts`), **one wrap-in-effect** in `useDataTable.ts`, **two new test files touching** `state.test.ts` and `createDataTable.test.ts`. Public API surface is unchanged. The render-loop regression in `abort-stale.test.tsx` resolves, M3 phase-3 implementation is unblocked, and the M2 baseline (302 + 26 tests) is preserved.
