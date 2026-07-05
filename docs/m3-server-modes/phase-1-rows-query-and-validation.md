# Phase 1 — RowsQuery Serialization + Mode Validation

**Goal:** Land the `RowsQuery` serialization contract (spec §5.1), the registry-name reverse lookups (`nameOfSortingFn` / `nameOfFilterFn` per spec §13 P3), and the mixed-mode trap warning (spec §5.3). This is the load-bearing seam for all of M3 — phases 2, 3, 4, 5 all depend on `buildRowsQuery` and `validateModeConfiguration` existing and being correct.

After this phase:

- `@lynellf/tablekit-core/dataSource` subpath exports `buildRowsQuery`, `validateModeConfiguration`, `nameOfSortingFn`, `nameOfFilterFn`, and the new types (`RowsQuery`, `SerializedFilter`, `Capability`, `DataSourceCapabilities`).
- `createDataTable` calls `validateModeConfiguration(opts)` on construction and on `setOptions` (one-shot dev warning).
- The registry reverse-lookup helpers exist and unit-tested.
- `buildRowsQuery(state, opts)` returns a deterministic JSON-serializable `RowsQuery` for the golden tests in phase 5.
- `pnpm verify` exits 0; new tests are added (~25-35).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/dataSource/types.ts` | `MaybePromise<T>`, `Capability`, `DataSourceCapabilities`, `SerializedFilter`, `RowsQuery`, `DataSourceState<TRow>` |
| `packages/core/src/dataSource/query.ts` | `buildRowsQuery(state, opts)` — pure serializer from `DataTableState + columns + capabilities` → `RowsQuery` |
| `packages/core/src/dataSource/warnings.ts` | `validateModeConfiguration(opts)` — one-shot dev warning on mixed-mode trap |
| `packages/core/src/dataSource/index.ts` | Barrel re-export |
| `packages/core/src/dataSource/__tests__/query.test.ts` | Unit tests for `buildRowsQuery` (empty, sort, multi-sort, filter, paginate, all combined) |
| `packages/core/src/dataSource/__tests__/query.golden.test.ts` | Snapshot tests against committed fixtures (spec §13 golden files) |
| `packages/core/src/dataSource/__tests__/warnings.test.ts` | Mixed-mode trap detection; `allowWithinPageOperations` suppression; one-shot; production suppression |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/registries/sorting.ts` | Export `nameOfSortingFn<TRow>(fn): string \| undefined` |
| `packages/core/src/registries/filtering.ts` | Export `nameOfFilterFn<TRow>(fn): string \| undefined` |
| `packages/core/src/registries/index.ts` | Re-export the new helpers |
| `packages/core/src/registries/sorting.test.ts` | Add tests for `nameOfSortingFn` |
| `packages/core/src/registries/filtering.test.ts` | Add tests for `nameOfFilterFn` |
| `packages/core/src/createDataTable.ts` | Call `validateModeConfiguration(this.options)` on construction; re-run on `setOptions` when option set changes |
| `packages/core/src/index.ts` | Re-export `dataSource` subpath (types only — runtime via subpath) |
| `packages/core/package.json` | Add `./dataSource` subpath export |
| `packages/core/vite.subpaths.config.ts` | Add `dataSource` entry |

No React package changes in this phase. The hook arrives in phase 3.

---

## 3. File contents

### 3.1 `packages/core/src/dataSource/types.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — public types for Level 1 server orchestration.
 *
 * Spec §5.1 (RowsQuery shape), §5.2 (DataSource interface), §5.3 (mixed-mode trap).
 * Mirrors the spec verbatim where the spec gives a shape; introduces `MaybePromise<T>`
 * as a shared utility used by `createClientDataSource` and the React hook.
 */

/** A value that may be a promise of T or T directly. */
export type MaybePromise<T> = T | Promise<T>;

/** Per-concern capability: 'client' (resolved locally) or 'server' (resolved remotely). */
export type Capability = 'client' | 'server';

/** Capabilities per concern. Spec §5.2: every concern is independently configurable. */
export interface DataSourceCapabilities {
  sort: Capability;
  filter: Capability;
  paginate: Capability;
}

/**
 * A filter item as it travels in `RowsQuery` (spec §5.1). The `filterFn` field carries
 * the registry **name** of the filter predicate; the consumer's server looks the name
 * up in their own registry. Inline functions MUST NOT cross the wire.
 */
export interface SerializedFilter {
  /** Column id this filter applies to. */
  id: string;
  /** Filter value (opaque to core; the consumer/server contract interprets it). */
  value: unknown;
  /** Registry name of the predicate. Omitted when the column's filterFn is the default. */
  filterFn?: string;
}

/**
 * The outbound query spec (spec §5.1). Fully JSON-serializable.
 * - `sorting` is included regardless of capability (the server may apply it OR not).
 * - `filters` is included regardless of capability (the server may apply it OR not).
 * - `pagination` is included only when `capabilities.paginate === 'server'` (or
 *   `manualPagination === true`).
 *
 * Server-side consumers resolve only the concerns marked `'server'`; client-side
 * consumers resolve the rest locally. The wire shape is identical.
 */
export interface RowsQuery {
  sorting: import('../types').SortItem[];
  filters: SerializedFilter[];
  pagination?: import('../types').PaginationState;
}

/**
 * Status state machine for `useDataSource`. Spec §5.2 lists three states
 * (`idle | loading | error`); the four-state model adds `success` to
 * distinguish "no fetch in flight, no data" (`idle`) from "previous fetch
 * completed, data is fresh" (`success`). `getRowModel()` reads this to
 * decide between `data` and placeholder rows.
 */
export type DataSourceStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * The state exposed by `useDataSource` (spec §5.2). `data` is non-null iff
 * `status === 'success'` (or `'loading'` with a stale-but-fresh prior result);
 * `error` is non-null iff `status === 'error'`. `refetch()` re-runs the
 * current query with a fresh AbortController.
 */
export interface DataSourceState<TRow> {
  status: DataSourceStatus;
  data: TRow[] | null;
  totalRowCount?: number;
  error?: Error;
  refetch: () => void;
}

/**
 * The Level 1 data source interface (spec §5.2). The consumer implements
 * `getRows` against their API; the library handles abort, refetch, and
 * `RowsQuery` serialization.
 */
export interface DataSource<TRow> {
  capabilities: DataSourceCapabilities;
  getRows(
    q: RowsQuery,
    ctx: { signal: AbortSignal },
  ): MaybePromise<{ rows: TRow[]; totalRowCount?: number }>;
}

/**
 * Options passed to `buildRowsQuery`. `capabilities` is the source of truth for
 * which concerns are in scope; `defaultFilterFn` is the registry name stripped
 * from outbound filters when the column's `filterFn` resolves to it (saves bytes).
 */
export interface BuildRowsQueryOptions {
  capabilities: DataSourceCapabilities;
  /** The default filter fn name to strip from outbound filters. Defaults to 'equals'. */
  defaultFilterFn?: string;
  /**
   * If true, the consumer has confirmed they understand the mixed-mode trap
   * (`paginate: 'server'` with client-side sort/filter applies within the page).
   * Surfaces in the outbound query by including only the server-side concerns.
   */
  allowWithinPageOperations?: boolean;
}
```

### 3.2 `packages/core/src/dataSource/query.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — `RowsQuery` serializer.
 *
 * Pure function: state + columns + capabilities → `RowsQuery`. Deterministic;
 * same input always produces byte-equal JSON (used by the §13 golden tests).
 *
 * `filterFn` name resolution: each `Column<TRow>.filterFn` may be a string
 * (registry name) or an inline function. The serializer emits the **name**
 * only; inline functions emit a one-shot dev warning AND fall back to the
 * column's `filterFn` as the default registry name (e.g., 'equals').
 */

import type { Column } from '../columns';
import { resolveAccessor } from '../columns';
import type {
  DataSourceCapabilities,
  RowsQuery,
  SerializedFilter,
  BuildRowsQueryOptions,
} from './types';
import type { DataTableState } from '../types';
import type { ColumnDef } from '../types';
import { nameOfFilterFn } from '../registries/filtering';
import { nameOfSortingFn } from '../registries/sorting';

/**
 * Resolve a column's filterFn to its registry name, or undefined if unknown.
 * Dev warning fires when the column has an inline filterFn and the filter
 * capability is 'server' (the name cannot cross the wire).
 */
const resolveFilterFnName = <TRow>(
  col: Column<TRow, unknown>,
  warn: () => void,
): string | undefined => {
  const fn = col.def.filterFn;
  if (typeof fn === 'string') return fn;
  if (typeof fn === 'function') {
    const name = nameOfFilterFn(fn);
    if (name === undefined) {
      // Inline function with no registered name: warn once, fall back to 'equals'.
      warn();
      return 'equals';
    }
    return name;
  }
  // No filterFn set on the def: column doesn't participate in filtering.
  return undefined;
};

/**
 * Build the outbound `RowsQuery` from the current state, columns, and capabilities.
 *
 * Concerns marked 'client' are still included in the outbound query but the
 * server is expected to ignore them; concerns marked 'server' must be honored.
 * `pagination` is included only when `manualPagination` is in effect (i.e.,
 * `capabilities.paginate === 'server'`).
 */
export const buildRowsQuery = <TRow>(
  state: DataTableState,
  columns: Array<Column<TRow, unknown>>,
  opts: BuildRowsQueryOptions,
): RowsQuery => {
  const { capabilities } = opts;
  const defaultFilterFn = opts.defaultFilterFn ?? 'equals';

  // Sorting: emit as-is. Spec §7.4: function names only; `SortItem = { id, desc }` is already name-only.
  const sorting = state.sorting;

  // Filters: resolve each filter's filterFn name. Omit `filterFn` when it
  // equals the default (saves bytes; semantics unchanged).
  const inlineFnWarned = new Set<string>();
  const filters: SerializedFilter[] = state.columnFilters.flatMap((f) => {
    const col = columns.find((c) => c.id === f.id);
    if (!col) return []; // unknown column id; drop
    const filterFnName = resolveFilterFnName(col, () => {
      if (!inlineFnWarned.has(col.id)) {
        inlineFnWarned.add(col.id);
        warnInlineFilterFn(col.id);
      }
    });
    const item: SerializedFilter = { id: f.id, value: f.value };
    if (filterFnName !== undefined && filterFnName !== defaultFilterFn) {
      item.filterFn = filterFnName;
    }
    return [item];
  });

  // Pagination: include only when paginate is 'server'.
  const pagination =
    capabilities.paginate === 'server' ? state.pagination : undefined;

  return { sorting, filters, pagination };
};

/**
 * Dev warning: inline `filterFn` cannot cross the wire. One-shot per column id.
 * Production strips via `process.env.NODE_ENV === 'production'` check.
 */
const warnInlineFilterFn = (columnId: string): void => {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.warn(
    `[tablekit] Column "${columnId}" has an inline filterFn paired with capabilities.filter === 'server'. ` +
      `Register the filter with registerFilterFn(name, fn) and pass filterFn: name on the column def.`,
  );
};

// `resolveAccessor` and `ColumnDef` are re-imported for type inference only;
// `nameOfSortingFn` is exported but not used in v1 (sortingFn inline warn
// is a phase 1 extension if we need it; currently the SortItem shape is
// already name-only, so no warning is required for sorting).
export { nameOfSortingFn, nameOfFilterFn };
export type { ColumnDef };
```

### 3.3 `packages/core/src/dataSource/warnings.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — mode configuration validator.
 *
 * Spec §5.3: "the dev build warns on the `paginate: 'server'` +
 * `sort/filter: 'client'` combination unless `allowWithinPageOperations: true`
 * is set."
 *
 * One-shot per process (mirroring `defaultGetRowId`). Production strips the
 * warning entirely (`process.env.NODE_ENV === 'production'`). The warning
 * names the trap and points at the opt-in flag.
 */

import type { DataTableOptions } from '../types';

let _warned = false;

/**
 * Validate the mode configuration of a `DataTableOptions`. Fires a one-shot
 * dev `console.warn` when the mixed-mode trap is detected.
 *
 * Detection: `manualPagination === true` AND (`manualSorting === false` OR
 * `manualFiltering === false`) AND `allowWithinPageOperations !== true`.
 *
 * When the consumer uses `DataSource` directly (not `useDataTable`), the
 * `capabilities` field on `DataSource` is the equivalent of `manual*`. The
 * `useDataSource` hook translates capabilities → `manual*` and re-runs this
 * check via the resulting options.
 */
export const validateModeConfiguration = <TRow>(
  options: DataTableOptions<TRow>,
): void => {
  if (process.env.NODE_ENV === 'production') return;
  if (_warned) return;
  if (options.allowWithinPageOperations === true) return;
  if (options.manualPagination !== true) return;

  const clientSort = options.manualSorting !== true;
  const clientFilter = options.manualFiltering !== true;

  if (!clientSort && !clientFilter) return; // not mixed

  _warned = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[tablekit] Server pagination with client-side sort/filter applies within the ' +
      'current page only — the server controls the page boundary. Set ' +
      '`allowWithinPageOperations: true` to confirm this intent, or set ' +
      '`manualSorting: true` / `manualFiltering: true` to push the concern to the server.',
  );
};

/** Test-only: reset the one-shot flag. */
export const __resetMixedModeWarningForTests = (): void => {
  _warned = false;
};
```

### 3.4 `packages/core/src/registries/sorting.ts` — addition

Append to the existing file:

```ts
/**
 * Reverse lookup: find the registry name of a sorting function. Searches the
 * custom map first (more specific), then the built-in map. Returns undefined
 * when the function is not registered (i.e., an inline closure that should
 * not cross the serialization boundary).
 */
export const nameOfSortingFn = <TRow>(fn: unknown): string | undefined => {
  if (typeof fn !== 'function') return undefined;
  // Custom first (consumer may have registered a built-in override).
  for (const name of Object.keys(customSortingFns)) {
    if (customSortingFns[name] === fn) return name;
  }
  for (const name of Object.keys(builtInSortingFns)) {
    if (builtInSortingFns[name] === fn) return name;
  }
  return undefined;
};
```

### 3.5 `packages/core/src/registries/filtering.ts` — addition

Append:

```ts
/**
 * Reverse lookup: find the registry name of a filter function. Searches the
 * custom map first, then the built-in map. Returns undefined when the function
 * is not registered (i.e., an inline closure that should not cross the wire).
 */
export const nameOfFilterFn = <TRow>(fn: unknown): string | undefined => {
  if (typeof fn !== 'function') return undefined;
  for (const name of Object.keys(customFilterFns)) {
    if (customFilterFns[name] === fn) return name;
  }
  for (const name of Object.keys(builtInFilterFns)) {
    if (builtInFilterFns[name] === fn) return name;
  }
  return undefined;
};
```

### 3.6 `packages/core/src/dataSource/index.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — Level 1 server orchestration.
 *
 * Subpath barrel. Consumers import via:
 *   import { buildRowsQuery, createClientDataSource } from '@lynellf/tablekit-core/dataSource'
 *
 * Mirrors the M2 per-feature subpath pattern (virtualization, resize, pinning, etc.).
 */

// ─── Types ──────────────────────────────────────────────────────────────
export type {
  MaybePromise,
  Capability,
  DataSourceCapabilities,
  SerializedFilter,
  RowsQuery,
  DataSourceStatus,
  DataSourceState,
  DataSource,
  BuildRowsQueryOptions,
} from './types';

// ─── Serializer ─────────────────────────────────────────────────────────
export { buildRowsQuery } from './query';

// ─── Validation ─────────────────────────────────────────────────────────
export { validateModeConfiguration, __resetMixedModeWarningForTests } from './warnings';

// ─── Registry reverse lookups (re-exported from /registries) ──────────
export { nameOfSortingFn, nameOfFilterFn } from '../registries';
```

### 3.7 `packages/core/src/registries/index.ts` — addition

Add re-exports:

```ts
// Existing exports above this line.
export { nameOfSortingFn } from './sorting';
export { nameOfFilterFn } from './filtering';
```

### 3.8 `packages/core/src/createDataTable.ts` — patch

Add to the constructor (after `this.navigationMode = options.navigationMode ?? 'cell';`):

```ts
// M3 phase 1: mixed-mode trap warning. One-shot dev warning.
validateModeConfiguration(this.options);
```

Add to `setOptions` (after the early-return guard, before the state merge):

```ts
// M3 phase 1: re-validate when the option set changes (manual* flags flipped).
if (
  prevState !== this.state ||
  prev.manualSorting !== next.manualSorting ||
  prev.manualFiltering !== next.manualFiltering ||
  prev.manualPagination !== next.manualPagination ||
  prev.allowWithinPageOperations !== next.allowWithinPageOperations
) {
  validateModeConfiguration(next);
}
```

Import at top:

```ts
import { validateModeConfiguration } from './dataSource/warnings';
```

### 3.9 `packages/core/src/types.ts` — additions

Append:

```ts
// ─── DataSource + RowsQuery (M3 phase 1) ─────────────────────────────────
import type { MaybePromise, DataSourceCapabilities, DataSourceState, DataSource, RowsQuery, SerializedFilter } from './dataSource/types';
export type { MaybePromise, DataSourceCapabilities, DataSourceState, DataSource, RowsQuery, SerializedFilter };

/** When true, the consumer has confirmed the mixed-mode trap (server paginate + client sort/filter). */
declare module './types' {
  interface DataTableOptions<TRow> {
    allowWithinPageOperations?: boolean;
  }
}
```

(The `declare module` pattern keeps the option grouped with the existing `DataTableOptions` definition. If Biome flags the `declare module`, use the inline addition pattern instead — see command below.)

### 3.10 `packages/core/package.json` — `exports` map addition

```json
"./dataSource": {
  "types": "./dist/dataSource/index.d.ts",
  "import": "./dist/dataSource/index.es.js"
}
```

### 3.11 `packages/core/vite.subpaths.config.ts` — addition

Add `dataSource: 'src/dataSource/index.ts'` to the `entries` map.

### 3.12 `packages/core/src/index.ts` — type-only re-export

Append:

```ts
// ─── DataSource types (M3 phase 1) ─────────────────────────────────────
export type {
  MaybePromise,
  DataSourceCapabilities,
  DataSource,
  DataSourceState,
  RowsQuery,
  SerializedFilter,
} from './dataSource/types';
```

(Runtime helpers — `buildRowsQuery`, `validateModeConfiguration`, `createClientDataSource` — live under the subpath only, mirroring M2's `virtualization` / `resize` / etc. pattern.)

---

## 4. Commands + Verification

```bash
# 1. Typecheck the new files
pnpm --filter @lynellf/tablekit-core typecheck

# 2. Run the new tests
pnpm --filter @lynellf/tablekit-core test -- --run dataSource

# 3. Run the full core suite to confirm no regressions
pnpm --filter @lynellf/tablekit-core test -- --run

# 4. Smoke-test the subpath export
node -e "import('@lynellf/tablekit-core/dataSource').then(m => console.log(Object.keys(m).sort()))"
# Expected: [ 'DataSource', 'MaybePromise', 'RowsQuery', 'SerializedFilter', 'buildRowsQuery', 'createClientDataSource', 'nameOfFilterFn', 'nameOfSortingFn', 'validateModeConfiguration', '__resetMixedModeWarningForTests' ]
# (createClientDataSource is added in phase 2; before phase 2 it's absent.)

# 5. Aggregate gate
pnpm verify                                                # typecheck + lint + test + build — EXIT 0
```

### Acceptance criteria

- `pnpm verify` exits 0.
- All new tests pass; existing 302 tests still pass.
- `buildRowsQuery` produces byte-stable output for the unit + golden test inputs.
- `validateModeConfiguration` fires once per process in dev; not in production (verified by `process.env.NODE_ENV` stub in tests).
- `allowWithinPageOperations: true` suppresses the warning.
- The dev warning text names the trap and points at the opt-in flag.
- The subpath import works; the runtime helpers are tree-shakeable (verified by inspecting the build output in phase 2).

---

## 5. Out-of-scope (deferred to later phases)

- `createClientDataSource` factory — phase 2.
- `useDataSource` hook — phase 3.
- `placeholderRows` synthesis — phase 4.
- `aria-busy` / `aria-invalid` on `getGridProps()` — phase 4.
- Reference app — phase 5.
- Serialization golden fixture files — phase 5.

---

## 6. Risks (phase 1 specific)

1. **`declare module` syntax** — the patch in §3.9 uses `declare module './types'` which may trip Biome or TS strict-mode checks. Fallback: inline the `allowWithinPageOperations?: boolean` field directly into the `DataTableOptions<TRow>` interface definition in `types.ts` (no `declare module` needed).
2. **`nameOfSortingFn` reverse lookup** is not used in phase 1 (the `SortItem` shape is already name-only). Adding it as a registry helper keeps the API symmetric with `nameOfFilterFn` and reserves it for future use (e.g., a phase 2 serialization extension).
3. **One-shot warning pattern** mirrors `defaultGetRowId`. The flag is module-level; in test runs the per-process flag is reset via `__resetMixedModeWarningForTests` before each test that asserts the warning fires.
4. **Vitest env**: `process.env.NODE_ENV` is `'test'` by default; the warning fires (correct — tests assert it fires). Phase 5's golden tests pin env via `vi.stubEnv('NODE_ENV', 'production')` to verify production suppression.