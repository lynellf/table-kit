# M2 API Freeze — Public Surface

**Date:** 2024-07-05
**Milestone:** M2 Advanced Client Features
**Status:** Frozen for M2; subject to deprecation only (no removal without major version bump)

---

## @lynellf/tablekit-core

### Root export (`@lynellf/tablekit-core`)

#### Factory
```ts
createDataTable<TRow>(options: DataTableOptions<TRow>): DataTableInstance<TRow>
defaultGetRowId: RowIdAccessor<unknown>
```

#### Types
```ts
Updater<T>
SortItem
ColumnFilterItem
PaginationState
ColumnPinningState
ColumnSizingState
ColumnResizeSession
CellPosition
DataTableState
DataTableOptions<TRow>
DataTableInstance<TRow>
SortingFn<TRow>
FilterFn<TRow>
RegisteredSortingFn<TRow>
RegisteredFilterFn<TRow>
ColumnDef<TRow, TValue>
CellContext<TRow, TValue>
Row<TRow>
Cell<TRow, TValue>
Header<TRow, TValue>
HeaderGroup<TRow>
HeaderContext<TRow>
CellEventContext<TRow>
CellEventHandler<TRow>
HeaderEventHandler<TRow>
RowEventHandler<TRow>
InteractionOptions<TRow>
InteractionSource
Announcer
Unsubscribe
```

#### Registry
```ts
BUILT_IN_SORTING_FNS
BUILT_IN_FILTER_FNS
builtInSortingFns: Record<string, SortingFn<unknown>>
builtInFilterFns: Record<string, FilterFn<unknown>>
getSortingFn<TRow>(id: string): SortingFn<TRow> | undefined
getFilterFn<TRow>(id: string): FilterFn<TRow> | undefined
registerSortingFn<TRow>(id: string, fn: SortingFn<TRow>): void
registerFilterFn<TRow>(id: string, fn: FilterFn<TRow>): void
```

#### Pipeline
```ts
filterRows<TRow>(opts: FilterRowsOptions<TRow>): TRow[]
sortRows<TRow>(opts: SortRowsOptions<TRow>): TRow[]
toggleSortItem(sorting: SortItem[], id: string, opts?: ToggleSortOptions): SortItem[]
paginateRows<TRow>(opts: PaginateRowsOptions<TRow>): TRow[]
computePageCount(total: number, pageSize: number): number
buildRowModel<TRow>(opts: BuildRowModelOptions<TRow>): BuiltRow<TRow>[]
columnsForRowModel<TRow>(defs: Array<{id: string}>, state: DataTableState): Array<Column<TRow, unknown>>
```

#### Ordering
```ts
moveColumn(opts: MoveColumnOptions): MoveColumnResult
```

#### Visibility
```ts
toggleColumnVisibility(visibility: Record<string, boolean>, columnId: string): Record<string, boolean>
toggleAllColumnsVisibility(visibility: Record<string, boolean>, allIds: string[], next?: boolean): Record<string, boolean>
```

#### Faceting
```ts
getFacetedUniqueValues<TRow>(opts: FacetedUniqueValuesOptions<TRow>): Map<string, unknown>
getFacetedMinMax<TRow>(opts: FacetedMinMaxOptions<TRow>): { min: number; max: number } | undefined
```

#### State helpers
```ts
resolveUpdater<T>(updater: Updater<T>, current: T): T
applySliceChange<T>(state: T, slice: keyof T, updater: Updater<T[keyof T]): T
isSliceControlled(state: Partial<DataTableState>, slice: keyof DataTableState): boolean
mergeInitialState(initial: Partial<DataTableState>, controlled: Partial<DataTableState>): DataTableState
controlledSliceKeys(state: Partial<DataTableState>): Array<keyof DataTableState>
stateChangedOnSlices(prev: DataTableState, next: DataTableState, slices: Array<keyof DataTableState>): boolean
```

#### Prop getters
```ts
mergeProps(...props: (Record<string, unknown> | undefined)[]): Record<string, unknown>
chainHandlers<T extends Record<string, Function>>(...handlers: (T | undefined)[]): T
shouldRunLibraryHandler(event: Event): boolean
```

#### Announcer
```ts
noopAnnouncer: Announcer
```

#### Utils
```ts
identity<T>(x: T): T
shallowEqual(a: unknown, b: unknown): boolean
assertNever(x: never): never
```

#### Virtualization (M2 Phase 1)
```ts
// Types
VirtualItem
VirtualRow<TRow>
RowVirtualizerResult<TRow>
ColumnVirtualizerResult
```

#### Resize (M2 Phase 3)
```ts
DEFAULT_RESIZE_STEP_PX: 10
resizeColumn(input: ResizeColumnInput): ResizeColumnOutput
cancelResize(columnSizing: ColumnSizingState, session: ColumnResizeSession | null): ColumnSizingState
clampColumnSize(size: number, minSize: number, maxSize: number): number
resizeAnnouncement(columnId: string, newWidth: number, columnName?: string): string
```

#### Pinning (M2 Phase 2)
```ts
togglePinColumn(state: ColumnPinningState, columnId: string, side: PinSide): ColumnPinningState | null
pinColumns(state: ColumnPinningState, columnIds: string[], side: 'left' | 'right'): ColumnPinningState | null
unpinColumns(state: ColumnPinningState, columnIds: string[]): ColumnPinningState | null
pinAnnouncement(columnId: string, next: PinSide, previous: PinSide): string
PinSide: 'left' | 'right' | false
```

#### Keyboard Navigation (M2 Phase 5)
```ts
KEY_BINDINGS: Readonly<Record<string, KeyBindingAction>>
navigateCell<TRow>(ctx: KeyboardNavContext<TRow>, current: CellPosition | null, direction: NavigationDirection): CellPosition | null
navigateToEdge<TRow>(ctx: KeyboardNavContext<TRow>, current: CellPosition | null, edge: 'row-start' | 'row-end' | 'grid-start' | 'grid-end'): CellPosition | null
navigateByPage<TRow>(ctx: KeyboardNavContext<TRow>, current: CellPosition | null, delta: -1 | 1, viewportRowCount: number): CellPosition | null
resolveKeyBinding(key: string, ctrlKey: boolean, shiftKey: boolean): KeyBindingAction | null
NavigationMode: 'cell' | 'row' | 'none'
NavigationDirection: 'up' | 'down' | 'left' | 'right'
```

### Subpath exports

#### `@lynellf/tablekit-core/virtualization`
```ts
createRowVirtualizer<TRow>(opts: RowVirtualizerFactoryOptions<TRow>): RowVirtualizerResult<TRow>
createColumnVirtualizer<TRow>(opts: ColumnVirtualizerFactoryOptions<TRow>): ColumnVirtualizerResult
getRange(scrollOffset: number, viewportSize: number, sizes: number[], overscan: number): { startIndex: number; endIndex: number }
getScrollOffsetForIndex(index: number, sizes: number[], viewportSize: number, align: 'auto' | 'start' | 'center' | 'end'): number
getTotalSize(sizes: number[]): number
```

#### `@lynellf/tablekit-core/resize`
```ts
// Re-exports from root
```

#### `@lynellf/tablekit-core/pinning`
```ts
// Re-exports from root
```

#### `@lynellf/tablekit-core/keyboard-nav`
```ts
// Re-exports from root
```

#### `@lynellf/tablekit-core/memo`
```ts
RowModelCache<TRow>
buildMemoKey<TRow>(opts: MemoBuildOptions<TRow>): MemoKey
memoKeysEqual(a: MemoKey | null, b: MemoKey): boolean
```

---

## @lynellf/tablekit-react

### Root export (`@lynellf/tablekit-react`)

```ts
// Hooks
useDataTable<TRow>(options: DataTableOptions<TRow>): UseDataTableResult<TRow>
useScrollAdapter<TRow>(gridRef: React.RefObject<HTMLElement | null>, table: DataTableInstance<TRow>): void
useSizeObserver<TRow>(options: SizeObserverOptions<TRow>): void
useRowVirtualizer<TRow>(table: DataTableInstance<TRow>): RowVirtualizerResult<TRow>
useCenterVirtualizer<TRow>(table: DataTableInstance<TRow>): ColumnVirtualizerResult
useResizeHandle<TRow>(instance: DataTableInstance<TRow>): ResizeHandleProps
useKeyboardNav<TRow>(instance: DataTableInstance<TRow>): void

// Announcer
ReactAnnouncer: React.ComponentType<ReactAnnouncerProps>
getReactAnnouncer(): { announce: (message: string, politeness?: 'polite' | 'assertive') => void }

// Types
SizeObserverOptions<TRow>
UseDataTableResult<TRow>

// Plus all core types re-exported
```

### Subpath exports

#### `@lynellf/tablekit-react/validate`
```ts
validateGridStructure(rootEl: Element | null): ValidatorResult
Violation
ValidatorResult
```

---

## Notes

- All types are TypeScript-erased at runtime; no runtime type checks.
- The `DataTableInstance` interface includes internal methods (`__setScrollState`, `__setColumnScrollState`, `startResize`, `adjustResize`, `commitResize`, `cancelResize`, `navigateCell`, `navigateToEdge`, `navigateByPage`, `setResizeMode`, `getResizeMode`, `setNavigationMode`, `getNavigationMode`, `togglePin`, `pinColumns`, `unpinColumns`, `__setViewportRowCount`) that are not part of the public API but may be used by adapter implementations.
- Subpath exports are tree-shakeable; consumers importing only specific subpaths pay only for that code.

## M3 Cross-reference

M3 adds the `dataSource` subpath and `useDataSource` hook. M0/M1/M2 surface is unchanged. See [`docs/m3-server-modes/api-freeze.md`](../m3-server-modes/api-freeze.md) for the M3 additions.
