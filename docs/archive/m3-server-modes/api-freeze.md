# API Freeze — M3 (Server Modes)

## M3 additions (additive; no M0/M1/M2 changes)

### `@lynellf/tablekit-core/dataSource` (new subpath)

- `MaybePromise<T>` (type)
- `Capability` (type: 'client' | 'server')
- `DataSourceCapabilities` (type)
- `SerializedFilter` (type: { id, value, filterFn? })
- `RowsQuery` (type: { sorting, filters, pagination? })
- `DataSourceStatus` (type: 'idle' | 'loading' | 'success' | 'error')
- `DataSourceState<TRow>` (type)
- `DataSource<TRow>` (interface)
- `BuildRowsQueryOptions` (type)
- `CreateClientDataSourceOptions<TRow>` (type)
- `buildRowsQuery(state, columns, opts)` (function)
- `createClientDataSource(rows, columns, opts?)` (function)
- `validateModeConfiguration(options)` (function — dev-only warning)
- `synthesizePlaceholderRows(n)` (function)
- `nameOfSortingFn(fn)` (function — reverse registry lookup)
- `nameOfFilterFn(fn)` (function — reverse registry lookup)
- `__resetMixedModeWarningForTests()` (function — test-only)

### `@lynellf/tablekit-core` (type-only exports from dataSource)

- All type-only exports from above (for consumers using the main entry)

### `DataTableOptions` (new field)

- `allowWithinPageOperations?: boolean`
- `placeholderRows?: number`

### `@lynellf/tablekit-react` (new exports)

- `useDataSource(table, source)` (hook)
- `UseDataSourceResult<TRow>` (type)
- `useDataTable` (extended): `dataSource?: DataSource<TRow>` option; `dataSourceState?: DataSourceState<TRow>` on the return

### Behavior changes (additive only)

- `createDataTable` calls `validateModeConfiguration` on construction and on `setOptions` (dev-only).
- `getGridProps()` emits `aria-busy="true"` when `dataSourceState.status === 'loading'`; `aria-invalid="true"` on error.
- `getBodyProps()` mirrors `aria-busy` on the body rowgroup.
- `getRowModel()` returns placeholder rows when the data source is loading and no fresh data is available.
- `setOptions` accepts the `dataSource`-driven `manual*` overrides without breaking controlled-slice semantics.

## M0/M1/M2 surface reaffirmed

- All M0/M1/M2 exports remain. No renames, no removals, no signature changes.
- The `manualSorting` / `manualFiltering` / `manualPagination` / `rowCount` options remain on `DataTableOptions`; M3 layers `DataSource` on top.
- The `Announcer` interface is unchanged; M3 routes "Loaded N rows" through it.

## Tests

- ~110-160 new tests added on top of M0/M1/M2's 302.
- Serialization golden fixtures (5 files) committed under `packages/core/src/dataSource/__tests__/fixtures/rowsQuery/`.
- Reference app demonstrates the four M3 patterns and the mixed-mode trap.

## Exit criteria (spec §14)

- Mixed-mode warnings: ✓ `validateModeConfiguration` fires once per instance in dev.
- Server pagination/sort/filter reference app: ✓ `examples/m3-server-modes/` runs and demonstrates all patterns.
