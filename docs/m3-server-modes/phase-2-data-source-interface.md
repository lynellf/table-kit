# Phase 2 — DataSource Interface + Client Implementation

**Goal:** Ship the `DataSource<TRow>` interface (spec §5.2) and the `createClientDataSource(rows, opts?)` factory that resolves everything synchronously in-memory. The factory is the reference implementation against which real server sources are written; it also doubles as the "Level 1 client mode" that consumers can use without writing any I/O code.

After this phase:

- `createClientDataSource(rows, opts?)` is exported from `@lynellf/tablekit-core/dataSource` (tree-shakeable subpath).
- The factory correctly threads `manual*` semantics through the existing M2 pipeline.
- `DataSource<TRow>` type is fully wired with `capabilities` and `getRows(q, { signal })`.
- Unit + integration tests pass; `pnpm verify` exits 0.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/dataSource/client.ts` | `createClientDataSource(rows, opts?)` — synchronous in-memory data source |
| `packages/core/src/dataSource/__tests__/client.test.ts` | Unit tests for the factory (filter, sort, paginate, mixed capabilities, signal abort, empty data, totalRowCount) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/dataSource/index.ts` | Re-export `createClientDataSource` |
| `packages/core/src/dataSource/types.ts` | Add `CreateClientDataSourceOptions` |
| `packages/core/src/index.ts` | Re-export `createClientDataSource` from the type-only subpath barrel (so consumers using the main entry get it without importing the subpath) |

No React package changes in this phase.

---

## 3. File contents

### 3.1 `packages/core/src/dataSource/client.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — synchronous client data source.
 *
 * Spec §5.2: "createClientDataSource(rows, opts?) // resolves everything
 * synchronously in-memory." The factory wires the M2 pipeline (`filterRows`,
 * `sortRows`, `paginateRows`) into the `DataSource<TRow>` interface, honoring
 * the `capabilities` field.
 *
 * Mixed capabilities are legal (spec §5.3): a `'server'` paginate capability
 * + `'client'` sort/filter is the mixed-mode trap. The factory applies client
 * sort/filter to the in-memory rows first, then returns the resulting slice;
 * consumers wiring a real server source are responsible for the warning check
 * (the `useDataSource` hook re-runs `validateModeConfiguration` in phase 3).
 */

import { createColumns } from '../columns';
import type { Column } from '../columns';
import { filterRows } from '../pipeline/filter';
import { sortRows } from '../pipeline/sort';
import { paginateRows } from '../pipeline/paginate';
import { defaultGetRowId } from '../columns';
import { validateModeConfiguration } from './warnings';
import type { DataSource, DataSourceCapabilities, RowsQuery } from './types';
import type { ColumnDef, DataTableOptions } from '../types';

export interface CreateClientDataSourceOptions<TRow> {
  /** Override `capabilities`. Default: all 'client'. */
  capabilities?: Partial<DataSourceCapabilities>;
  /** Required for server-paginated client sources: total row count when paginate === 'server'. */
  totalRowCount?: number;
  /** Override `getRowId`. Default: `defaultGetRowId` (dev fallback). */
  getRowId?: (row: TRow, index: number) => string;
}

/**
 * Build a synchronous client-side `DataSource<TRow>` from a static rows array.
 *
 * The factory honors `capabilities`:
 *   - `capabilities.sort === 'client'` (default): apply sortRows.
 *   - `capabilities.filter === 'client'` (default): apply filterRows.
 *   - `capabilities.paginate === 'client'` (default): apply paginateRows.
 *   - `capabilities.paginate === 'server'`: return the full filtered/sorted
 *     result set (no slice); consumer is expected to set `totalRowCount` via
 *     the `totalRowCount` option (otherwise defaults to `rows.length`).
 *
 * The `signal` argument is ignored for the synchronous path (no work to
 * abort). Real server sources respect it via `AbortController`.
 */
export const createClientDataSource = <TRow>(
  rows: TRow[],
  columns: Array<ColumnDef<TRow, unknown>>,
  opts: CreateClientDataSourceOptions<TRow> = {},
): DataSource<TRow> => {
  const capabilities: DataSourceCapabilities = {
    sort: opts.capabilities?.sort ?? 'client',
    filter: opts.capabilities?.filter ?? 'client',
    paginate: opts.capabilities?.paginate ?? 'client',
  };
  const totalRowCount = opts.totalRowCount ?? rows.length;
  const getRowId = opts.getRowId ?? (defaultGetRowId as (row: TRow, index: number) => string);

  // One-shot dev warning on the mixed-mode trap (when paginate='server').
  if (capabilities.paginate === 'server') {
    const syntheticOptions: DataTableOptions<TRow> = {
      data: rows,
      columns,
      manualPagination: true,
      manualSorting: capabilities.sort === 'server',
      manualFiltering: capabilities.filter === 'server',
      allowWithinPageOperations: undefined,
    };
    validateModeConfiguration(syntheticOptions);
  }

  return {
    capabilities,
    getRows: (q: RowsQuery): { rows: TRow[]; totalRowCount: number } => {
      // Build columns from defs (state is not part of RowsQuery; the columns
      // are stable across queries).
      const state = {
        sorting: q.sorting,
        columnFilters: q.filters.map((f) => ({ id: f.id, value: f.value })),
        pagination: q.pagination ?? { pageIndex: 0, pageSize: 25 },
        columnOrder: [],
        columnVisibility: {},
        columnPinning: { left: [], right: [] },
        columnSizing: {},
        columnSizingInfo: null,
        focusedCell: null,
      };
      let result: TRow[] = rows;
      const resolvedColumns: Array<Column<TRow, unknown>> = createColumns(columns, state);

      // Filter (when 'client')
      if (capabilities.filter === 'client') {
        result = filterRows({
          rows: result,
          filters: state.columnFilters,
          columns: resolvedColumns,
        });
      }

      // Sort (when 'client')
      if (capabilities.sort === 'client') {
        result = sortRows({
          rows: result,
          sorting: state.sorting,
          columns: resolvedColumns,
        });
      }

      // Paginate (when 'client') — otherwise return full slice + totalRowCount.
      if (capabilities.paginate === 'client' && q.pagination) {
        result = paginateRows({ rows: result, pagination: q.pagination });
      }

      return { rows: result, totalRowCount };
    },
  };
};
```

### 3.2 `packages/core/src/dataSource/index.ts` — addition

Add to the existing barrel:

```ts
export { createClientDataSource } from './client';
export type { CreateClientDataSourceOptions } from './client';
```

### 3.3 `packages/core/src/index.ts` — addition

Append (runtime export this time, not type-only — `createClientDataSource` is the canonical reference implementation):

```ts
// ─── DataSource runtime (M3 phase 2) ───────────────────────────────────
export { createClientDataSource } from './dataSource/client';
export type { CreateClientDataSourceOptions } from './dataSource/client';
```

### 3.4 `packages/core/src/dataSource/types.ts` — addition

Append to the existing file:

```ts
/** Options for `createClientDataSource`. */
export interface CreateClientDataSourceOptions<TRow> {
  capabilities?: Partial<DataSourceCapabilities>;
  totalRowCount?: number;
  getRowId?: (row: TRow, index: number) => string;
}
```

(Move the `CreateClientDataSourceOptions` interface to `types.ts` so it's importable from the barrel without pulling `client.ts` into the dep graph. `client.ts` imports the type and re-exports it for backwards compat — see §3.1.)

---

## 4. Commands + Verification

```bash
# 1. Typecheck
pnpm --filter @lynellf/tablekit-core typecheck

# 2. Run new tests
pnpm --filter @lynellf/tablekit-core test -- --run client

# 3. Run full core suite
pnpm --filter @lynellf/tablekit-core test -- --run

# 4. Smoke-test the subpath
node -e "import('@lynellf/tablekit-core/dataSource').then(m => console.log(Object.keys(m).sort()))"
# Expected includes: 'createClientDataSource', 'buildRowsQuery', 'validateModeConfiguration'

# 5. Aggregate gate
pnpm verify                                                # EXIT 0

# 6. End-to-end smoke (TypeScript REPL)
node --experimental-strip-types -e "
  import('@lynellf/tablekit-core/dataSource').then(async (m) => {
    const ds = m.createClientDataSource(
      [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }],
      [{ id: 'name', accessor: 'name' }],
      { capabilities: { sort: 'client', filter: 'client', paginate: 'client' } }
    );
    const result = ds.getRows(
      { sorting: [{ id: 'name', desc: false }], filters: [] },
      { signal: new AbortController().signal }
    );
    console.log(result.rows.map(r => r.name)); // [ 'Alice', 'Bob' ]
  });
"
```

### Acceptance criteria

- `pnpm verify` exits 0.
- `createClientDataSource` honors all four capability combinations:
  - all client (default): sort + filter + paginate applied locally.
  - paginate: server: returns full filtered/sorted set + `totalRowCount`; no slicing.
  - sort: server + paginate: server: returns full filtered set + `totalRowCount`; filter applied locally; no sort, no slice.
  - filter: server + paginate: server: returns full unsorted set + `totalRowCount`; no filter, no sort, no slice.
- Mixed-mode trap warning fires once per process when `paginate: 'server'` is paired with client sort/filter and `allowWithinPageOperations` is not set.
- `getRows` ignores the `signal` (no work to abort); the signature accepts it for symmetry with server sources.
- Subpath export tree-shakes: importing only `createClientDataSource` from `@lynellf/tablekit-core/dataSource` does not pull in `filterRows`/`sortRows`/`paginateRows` until they're actually invoked (Vite + Rollup verify this via the build output inspection).

---

## 5. Out-of-scope (deferred to later phases)

- `useDataSource` React hook — phase 3.
- `aria-busy` / `aria-invalid` on `getGridProps()` — phase 4.
- Placeholder rows — phase 4.
- Reference app — phase 5.

---

## 6. Risks (phase 2 specific)

1. **`createClientDataSource` re-runs the column resolution per `getRows` call.** This is O(n_columns) per fetch but is cheap; the in-memory case is not perf-sensitive. A future optimization (memoizing the columns by their defs' ids) is straightforward but not in scope for M3.
2. **`getRowId` default fallback.** The factory uses `defaultGetRowId` when no override is supplied; this emits a dev warning on first use (M1 hardened). For the client data source, this is acceptable — consumers using the factory in tests will see the warning once.
3. **Server-source `capabilities: { paginate: 'server' }` with no `totalRowCount`** falls back to `rows.length`. For real server sources this is wrong (the server knows the total); consumers implementing a server source must always provide `totalRowCount` via `instance.setOptions({ rowCount })` on success. The factory documents this in the type comment.
4. **Type-only vs runtime export.** Phase 1 added type-only exports from `packages/core/src/index.ts`; phase 2 adds a runtime export (`createClientDataSource`). The split mirrors the spec: types in the main entry, runtime helpers under the subpath. Consumers using the main entry get the runtime helper too (avoids forcing a subpath import for the most common case).