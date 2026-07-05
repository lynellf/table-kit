# Phase 6 — Public Surface + Final Verification

**Goal:** Wire the public surface re-exports from both `index.ts` files, fix the README `createTable` mismatch, and confirm that `pnpm verify` is green from a clean tree, satisfying the M0 exit criteria.

After this phase:
- `packages/core/src/index.ts` exports the full M0 surface: `createDataTable`, type re-exports, registry helpers, `VERSION`.
- `packages/react/src/index.ts` exports `useDataTable`, re-exports core types, `VERSION`.
- Both `README.md` files reference `createDataTable` (not the non-existent `createTable`).
- `pnpm verify` exits 0.
- M0 exit criteria satisfied: **controlled + uncontrolled state round-trips green** + **type tests green**.

---

## 1. Files modified in this phase

| File                                          | Change                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core/src/index.ts`                  | Replace VERSION-only stub with full public surface re-exports.                                      |
| `packages/react/src/index.ts`                | Replace stub with full public surface: `useDataTable`, core re-exports, `VERSION`.                   |
| `packages/core/src/index.test.ts`             | Update VERSION smoke to also assert `createDataTable` is exported.                                  |
| `packages/react/src/index.test.ts`            | Update VERSION smoke to also assert `useDataTable` is exported.                                     |
| `README.md` (root)                            | Replace `createTable` reference with `createDataTable`.                                              |
| `packages/core/README.md`                     | Replace `createTable` reference with `createDataTable`.                                             |

No new files in this phase.

---

## 2. File contents

### 2.1 `packages/core/src/index.ts`

```ts
/**
 * @lynellf/tablekit-core — framework-free headless table state engine.
 *
 * M0 public surface:
 *   - createDataTable factory
 *   - Public type re-exports (state, options, instance, columns, registries)
 *   - Registry helpers (sorting + filtering built-ins + extension API)
 *   - VERSION constant
 *
 * Not yet exported (later milestones):
 *   - getRowModel with filter/sort/paginate pipeline (M1)
 *   - Prop getters (M1)
 *   - Virtualizer (M2)
 *   - PivotTable (M4)
 *   - Aggregator registry (M4)
 */

export const VERSION = '0.1.0' as const;

// ─── Factory ────────────────────────────────────────────────────────────────
export { createDataTable, defaultGetRowId } from './createDataTable';

// ─── Column model ───────────────────────────────────────────────────────────
export { Column, createColumns, resolveAccessor } from './columns';

// ─── Registries (sorting + filtering) ───────────────────────────────────────
export {
  BUILT_IN_SORTING_FNS,
  BUILT_IN_FILTER_FNS,
  builtInSortingFns,
  builtInFilterFns,
  getSortingFn,
  getFilterFn,
  registerSortingFn,
  registerFilterFn,
  type BuiltInSortingFn,
  type BuiltInFilterFn,
} from './registries';

// ─── State engine helpers ──────────────────────────────────────────────────
export {
  resolveUpdater,
  applySliceChange,
  isSliceControlled,
  mergeInitialState,
  controlledSliceKeys,
  stateChangedOnSlices,
  type StateSliceKey,
  type SliceCallbacks,
  type SliceDispatchers,
} from './state';

// ─── Utils ──────────────────────────────────────────────────────────────────
export { identity, shallowEqual, assertNever } from './utils';

// ─── Public types ──────────────────────────────────────────────────────────
export type {
  Updater,
  SortItem,
  ColumnFilterItem,
  PaginationState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnResizeSession,
  CellPosition,
  DataTableState,
  SortingFn,
  FilterFn,
  RegisteredSortingFn,
  RegisteredFilterFn,
  ColumnAccessor,
  ColumnDef,
  AccessorFn,
  RowIdAccessor,
  SliceChange,
  DataTableOptions,
  Unsubscribe,
  DataTableInstance,
} from './types';

export { DEFAULT_STATE } from './types';
```

### 2.2 `packages/core/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { VERSION, createDataTable } from './index';

describe('@lynellf/tablekit-core', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports createDataTable', () => {
    expect(typeof createDataTable).toBe('function');
  });

  it('createDataTable returns a usable instance with the default state', () => {
    const table = createDataTable({
      data: [],
      columns: [{ id: 'x', accessor: 'x' }],
    });
    expect(typeof table.getState).toBe('function');
    expect(typeof table.setOptions).toBe('function');
    expect(typeof table.subscribe).toBe('function');
    expect(typeof table.getRowModel).toBe('function');
    expect(table.getState().sorting).toEqual([]);
  });
});
```

### 2.3 `packages/react/src/index.ts`

```ts
/**
 * @lynellf/tablekit-react — React adapter.
 *
 * M0 public surface:
 *   - useDataTable hook
 *   - Core type/value re-exports (so consumers can `import { createDataTable, useDataTable } from '@lynellf/tablekit-react'` if desired)
 *   - VERSION
 *
 * Not yet exported (later milestones):
 *   - Prop getters (`getGridProps`, `getHeaderProps`, …) — M1
 *   - Announcer / a11y validator — M6
 *   - useDataSource — M3
 *   - usePivotTable — M4
 */

// biome-ignore lint/correctness/noUnusedImports: required to declare React peer dependency
import * as React from 'react';

export const VERSION = '0.1.0' as const;

export type { ReactElement } from 'react';

// ─── Hook ───────────────────────────────────────────────────────────────────
export { useDataTable } from './useDataTable';
export type { UseDataTableResult } from './useDataTable';

// ─── Re-export core surface for consumer convenience ─────────────────────────
export {
  VERSION as CORE_VERSION,
  createDataTable,
  Column,
  createColumns,
  resolveAccessor,
  BUILT_IN_SORTING_FNS,
  BUILT_IN_FILTER_FNS,
  builtInSortingFns,
  builtInFilterFns,
  getSortingFn,
  getFilterFn,
  registerSortingFn,
  registerFilterFn,
  identity,
  shallowEqual,
  assertNever,
  resolveUpdater,
  applySliceChange,
  isSliceControlled,
  mergeInitialState,
  controlledSliceKeys,
  stateChangedOnSlices,
  DEFAULT_STATE,
} from '@lynellf/tablekit-core';

export type {
  Updater,
  SortItem,
  ColumnFilterItem,
  PaginationState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnResizeSession,
  CellPosition,
  DataTableState,
  SortingFn,
  FilterFn,
  RegisteredSortingFn,
  RegisteredFilterFn,
  ColumnAccessor,
  ColumnDef,
  AccessorFn,
  RowIdAccessor,
  SliceChange,
  DataTableOptions,
  Unsubscribe,
  DataTableInstance,
  StateSliceKey,
  SliceCallbacks,
  SliceDispatchers,
  BuiltInSortingFn,
  BuiltInFilterFn,
} from '@lynellf/tablekit-core';
```

### 2.4 `packages/react/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { VERSION, useDataTable } from './index';

describe('@lynellf/tablekit-react', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports useDataTable', () => {
    expect(typeof useDataTable).toBe('function');
  });
});
```

### 2.5 Root `README.md` (snippet update)

The current root README has:

```md
```ts
import { createTable } from '@lynellf/tablekit-core';

const table = createTable({ columns: [...], rows: [...] });
```

Replace with:

```md
```ts
import { createDataTable } from '@lynellf/tablekit-core';

const table = createDataTable({ data, columns });
table.getState(); // current state snapshot
table.subscribe(() => { /* re-render */ });
```

Diff:

```diff
-```ts
-import { createTable } from '@lynellf/tablekit-core';
-
-const table = createTable({ columns: [...], rows: [...] });
-```
+```ts
+import { createDataTable } from '@lynellf/tablekit-core';
+
+const table = createDataTable({ data, columns });
+table.getState();       // current state snapshot
+table.subscribe(() => { /* re-render */ });
+```
```

### 2.6 `packages/core/README.md` (snippet update)

Same edit, scoped to the core package README:

```diff
-```ts
-import { createTable } from '@lynellf/tablekit-core';
-
-const table = createTable({ columns: [...], rows: [...] });
-```
+```ts
+import { createDataTable } from '@lynellf/tablekit-core';
+
+const table = createDataTable({ data, columns });
+```
```

(Keep the install/status blocks unchanged.)

---

## 3. Commands (in order)

```bash
# 1. Replace both index.ts files.
# 2. Replace both index.test.ts files.
# 3. Edit root README.md and packages/core/README.md (small text fix).
# 4. Run full verification.
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify
```

Expected after phase 6:
- `pnpm typecheck` passes (Biome + TS strict).
- `pnpm lint` passes.
- `pnpm test` reports: 1 (core VERSION) + 2 (core createDataTable + VERSION) + 6 (utils) + 12 (sorting) + 12 (filtering) + 17 (columns) + 12 (state) + 16 (createDataTable) + 1 (react VERSION) + 2 (react useDataTable + VERSION) + 7 (useDataTable hook) = 88 tests green.
- `pnpm build` produces `packages/core/dist/tablekit-core.es.js` and `packages/react/dist/tablekit-react.es.js`.
- `pnpm verify` exit 0.

---

## 4. M0 exit-criteria verification (spec §14)

| Criterion                                  | Where it’s verified                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Controlled + uncontrolled state round-trips** | `packages/core/src/createDataTable.test.ts` — uncontrolled (5 tests), controlled (4 tests), mixed (1 test), subscribe (2 tests), setOptions (3 tests), short-circuit (1 test). Total: 16 round-trip tests. |
| **Type tests green**                        | `packages/core/src/types.test-d.ts` — Updater, SortItem, ColumnFilterItem, PaginationState, ColumnPinningState, ColumnResizeSession, CellPosition, ColumnAccessor, ColumnDef, AccessorFn, SortingFn, RowIdAccessor, DataTableOptions, DataTableInstance. Compiled by `tsc -b`; build failure on regression. |

Run from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify
node -e "import('@lynellf/tablekit-core').then(m => console.log(Object.keys(m).sort()))"
# Expected (sorted):
# [
#   'BUILT_IN_FILTER_FNS', 'BUILT_IN_SORTING_FNS',
#   'Column', 'DEFAULT_STATE', 'VERSION',
#   'applySliceChange', 'assertNever', 'builtInFilterFns',
#   'builtInSortingFns', 'controlledSliceKeys', 'createColumns',
#   'createDataTable', 'defaultGetRowId', 'getFilterFn', 'getSortingFn',
#   'identity', 'isSliceControlled', 'mergeInitialState',
#   'registerFilterFn', 'registerSortingFn', 'resolveAccessor',
#   'resolveUpdater', 'shallowEqual', 'stateChangedOnSlices',
# ]
```

```bash
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"
# Expected (sorted, abbreviated):
# [
#   'BUILT_IN_FILTER_FNS', 'BUILT_IN_SORTING_FNS', 'CORE_VERSION', 'Column',
#   'DEFAULT_STATE', 'VERSION', 'applySliceChange', 'assertNever',
#   'builtInFilterFns', 'builtInSortingFns', 'controlledSliceKeys',
#   'createColumns', 'createDataTable', 'defaultGetRowId',
#   'getFilterFn', 'getSortingFn', 'identity', 'isSliceControlled',
#   'mergeInitialState', 'registerFilterFn', 'registerSortingFn',
#   'resolveAccessor', 'resolveUpdater', 'shallowEqual',
#   'stateChangedOnSlices', 'useDataTable',
# ]
```

---

## 5. Out of scope for this plan (deferred)

- `getRowModel()` with the row pipeline — M1.
- Prop getters — M1.
- Virtualizer + resizing + pinning layout math — M2.
- `DataSource`/Level 1 — M3.
- PivotTable + aggregator registry — M4.
- Worker engine — M5.
- Announcer + i18n messages + a11y validator — M6.
- State persistence helper (`serializeState`/`hydrateState`) — v1.5 per spec §15.
- `rowSelection` slice — v1.5 per spec §15.

---

## 6. Risks specific to this phase

| Risk                                                                                                                                          | Mitigation                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The deep re-export chain (`@lynellf/tablekit-react` re-exports from `@lynellf/tablekit-core`) creates a long type-graph in `.d.ts`.          | Acceptable for M0. Vite’s `external` config already externalizes the core from the react bundle; types are erased at runtime.            |
| The `biome-ignore` comment for the React import in `packages/react/src/index.ts` may need re-justification once the hook actually uses React. | The hook imports `React` (via `useRef`, `useCallback`, `useSyncExternalStore`) in a separate file, so the index.ts stub no longer needs the biome-ignore. Remove the comment in this phase. |
| Bundle size guardrail (§12, ≤ ~15kB min+gzip) may be breached by M0 surface.                                                                  | Verify after `pnpm build`: `gzip -c packages/core/dist/tablekit-core.es.js | wc -c` should be ≤ ~5kB; react bundle adds ~10kB. Log results in the implementation commit message. |

---

## 7. Final checklist before commit

- [ ] `pnpm verify` exit 0
- [ ] All 88 tests pass
- [ ] No `biome-ignore` comments remain in `packages/react/src/index.ts`
- [ ] `dist/` rebuilt (build was already part of verify)
- [ ] README files updated
- [ ] No new runtime deps added to either package
- [ ] `pnpm-lock.yaml` updated for the new react devDeps (`@testing-library/react`, `jsdom`, `@testing-library/dom`)
- [ ] Phase file in `docs/core-engine/` references this plan and links to the per-phase docs