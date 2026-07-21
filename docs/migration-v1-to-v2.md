# Migration Guide: v1.x to v2.0.0

This guide covers the breaking changes between `@lynellf/tablekit-core`, `@lynellf/tablekit-react`, `@lynellf/tablekit-pivot`, and `@lynellf/tablekit-worker` v1.x and v2.0.0.

## Overview

Version 2.0.0 is a **contract correction release** that addresses fundamental issues discovered during production use of v1.x. The primary focus is on:

1. **State reconciliation** — Partial state updates no longer reset unrelated slices
2. **Data source lifecycle** — Nullable source support with proper request token tracking
3. **Pagination contracts** — Explicit offset/cursor wire types
4. **Pivot state** — All shared slices have controlled callback support
5. **Announcers** — Instance-owned, not module-global
6. **Data identity** — Explicit version escape hatch for mutable data

## Breaking Changes

### 1. State Reconciliation Behavior

#### Before (v1.x)

```typescript
const table = createDataTable({
  data,
  columns,
  initialState: { sorting: [{ id: 'name', desc: false }] }
});

// After calling setOptions without state, sorting was reset to DEFAULT_STATE
table.setOptions({ data, columns }); // sorting: [] — UNEXPECTED
```

#### After (v2.0.0)

```typescript
const table = createDataTable({
  data,
  columns,
  initialState: { sorting: [{ id: 'name', desc: false }] }
});

// State is preserved across setOptions calls
table.setOptions({ data, columns }); // sorting: [{ id: 'name', desc: false }] — CORRECT
```

**Action required:** If your application relied on the previous reset behavior, use `resetState()` or `resetSlice()` explicitly.

### 2. Controlled-to-Uncontrolled Transition

#### Before (v1.x)

```typescript
// Start with controlled sorting
const [sorting, setSorting] = useState([{ id: 'name', desc: false }]);
const table = useDataTable({
  data, columns,
  state: { sorting },
  onSortingChange: setSorting
});

// Remove controlled state — value resets to default
table.setOptions({ data, columns }); // sorting: [] — RESET
```

#### After (v2.0.0)

```typescript
// Start with controlled sorting
const [sorting, setSorting] = useState([{ id: 'name', desc: false }]);
const table = useDataTable({
  data, columns,
  state: { sorting },
  onSortingChange: setSorting
});

// Remove controlled state — last effective value is retained
table.setOptions({ data, columns }); // sorting: [{ id: 'name', desc: false }] — PRESERVED
```

**Action required:** If you want to reset state when removing control, call `resetState()` before removing the `state` prop.

### 3. Nullable DataSource

#### Before (v1.x)

```typescript
// dataSource was required
const result = useDataSource(table, source);
```

#### After (v2.0.0)

```typescript
// dataSource can be null/undefined
const result = useDataSource(table, dataSource ?? null);
// Returns { status: 'idle', data: null, refetch: () => {} }
```

**Action required:** If you conditionally pass a source, this now works correctly without additional guards.

### 4. Pagination Types

#### Before (v1.x)

```typescript
// Only PaginationState (pageIndex/pageSize)
const pagination: PaginationState = { pageIndex: 0, pageSize: 25 };
```

#### After (v2.0.0)

```typescript
// New discriminated union for wire types
type PaginationWire = OffsetPagination | CursorPagination;

interface OffsetPagination {
  type: 'offset';
  offset: number;  // pageIndex * pageSize
  limit: number;   // pageSize
}

interface CursorPagination {
  type: 'cursor';
  cursor: string | null;
  direction?: 'next' | 'previous';
  limit: number;
}

// DataSourceCapabilities has new pagination strategy
interface DataSourceCapabilities {
  sort: Capability;
  filter: Capability;
  paginate: Capability;
  pagination?: 'offset' | 'cursor'; // Default: 'offset'
}
```

**Action required:** If you implement a custom `DataSource`, update your `RowsQuery.pagination` handling to support both shapes. The existing `PaginationState` remains for internal table state.

### 5. Pivot Shared Slices

#### Before (v1.x)

```typescript
// Shared slices (columnPinning, columnSizing, etc.) had no controlled callbacks
const pivot = usePivotTable({
  pivot: { rows, columns, measures },
  // No onColumnPinningChange, onColumnSizingChange, etc.
});
```

#### After (v2.0.0)

```typescript
// All shared slices now have OnChangeFn callbacks
const pivot = usePivotTable({
  pivot: { rows, columns, measures },
  state: {
    columnPinning: { left: [], right: [] },
    columnSizing: {},
    columnSizingInfo: null,
    focusedCell: null,
  },
  onStateChange: (updater) => {
    // Full pivot state updates
  },
  // Or per-slice callbacks:
  onPivotChange: onChangeFn<PivotConfig>,
  onExpandedChange: onChangeFn<PivotExpansionState>,
  onPivotSortingChange: onChangeFn<PivotSortingState>,
  onColumnPinningChange: onChangeFn<ColumnPinningState>,      // NEW
  onColumnSizingChange: onChangeFn<ColumnSizingState>,        // NEW
  onColumnSizingInfoChange: onChangeFn<ColumnResizeSession | null>, // NEW
  onFocusedCellChange: onChangeFn<CellPosition | null>,       // NEW
});
```

**Action required:** If you previously controlled pivot state via `onStateChange`, you can now use the dedicated per-slice callbacks for more granular control.

### 6. Announcer Instance Ownership

#### Before (v1.x)

```typescript
// Module-level "current" announcer — last mount wins
<ReactAnnouncer /> // Global routing
```

#### After (v2.0.0)

```typescript
// Each hook-created instance has its own channel
const table = useDataTable({ data, columns });

// Render the matching announcer — each table has its own
<table.Announcer /> // Instance-owned, not global

// getReactAnnouncer() is now documented as legacy fallback for direct core usage
import { getReactAnnouncer } from '@lynellf/tablekit-react'; // Legacy
```

**Action required:** If you were relying on the global announcer behavior, update to use the instance-owned announcer via `<table.Announcer />` or `<pivot.Announcer />`.

### 7. Data Identity Escape Hatch

#### Before (v1.x)

```typescript
// Data identity was reference-based only
// Mutating data in-place with same reference = no update
data.push(newRow);
table.setOptions({ data }); // No update — same reference
```

#### After (v2.0.0)

```typescript
// New DataVersion escape hatch
interface DataVersion<TRow> {
  version?: string | number;        // Static version token
  getVersion?: (data: TRow[]) => string | number; // Derived version
}

// Use static version
const table = useDataTable({
  data,
  dataVersion: { version: dataVersion }
});

// Or derive from data
const table = useDataTable({
  data,
  dataVersion: { getVersion: (data) => data.length }
});

// DataSource also supports dataVersion
const source = createServerDataSource({
  dataVersion: { version: serverDataVersion }
});
```

**Action required:** If you mutate data in-place, add a `dataVersion` to signal changes. This is optional for immutable data patterns.

## New Features in v2.0.0

### Constructor Baseline for Reset

```typescript
// resetState() and resetSlice() now restore constructor baseline
const table = createDataTable({
  data, columns,
  initialState: { sorting: [{ id: 'name', desc: false }] }
});

table.setSorting([{ id: 'age', desc: true }]);
table.resetSlice('sorting'); // Returns to [{ id: 'name', desc: false }]
```

### Column Pruning

```typescript
// When columns change, invalid IDs are pruned from state slices
const table = createDataTable({
  data, columns: [
    { id: 'name', accessor: 'name' },
    { id: 'age', accessor: 'age' },
  ],
  initialState: {
    sorting: [{ id: 'name', desc: false }],
    columnFilters: [{ id: 'city', value: 'NYC' }], // 'city' not in columns
  }
});

// Update columns (remove 'city', add 'country')
table.setOptions({
  data,
  columns: [
    { id: 'name', accessor: 'name' },
    { id: 'country', accessor: 'country' },
  ]
});

// Result: 'city' filter is pruned, 'name' sort is preserved
// sorting: [{ id: 'name', desc: false }]
// columnFilters: [] // 'city' removed
```

### Request Token Race Protection

```typescript
// useDataSource now tracks request tokens internally
// Responses from superseded requests are ignored
const [source, setSource] = useState(serverA);

useEffect(() => {
  setSource(serverB); // Aborts serverA requests
  // Server A response arriving after serverB started is ignored
}, []);
```

## Recommended Migration Steps

1. **Update package versions**
   ```bash
   pnpm up @lynellf/tablekit-core @lynellf/tablekit-react @lynellf/tablekit-pivot @lynellf/tablekit-worker@2.0.0
   ```

2. **Test state behavior**
   - Verify that partial `setOptions` calls preserve unrelated state
   - Check that `resetState()` behaves as expected

3. **Update controlled state patterns**
   - If you relied on uncontrolled-to-controlled transitions resetting values, test explicitly
   - Add explicit `resetState()` calls if the new behavior differs from expectations

4. **Add announcer components**
   - Add `<table.Announcer />` to your component tree for each DataTable
   - Add `<pivot.Announcer />` for each PivotTable
   - Remove any usage of `getReactAnnouncer()` for routing

5. **Test data source patterns**
   - If using conditional data sources, verify idle state handling
   - If mutating data in-place, consider adding `dataVersion`

6. **Update custom DataSource implementations**
   - Handle `PaginationWire` discriminated union in your query serialization
   - Implement cursor-based pagination if needed

## Deprecation Notices

The following APIs are now deprecated and will be removed in v3.0.0:

| Deprecated API | Replacement |
|----------------|-------------|
| `getReactAnnouncer()` for routing | Instance-owned announcers via `<table.Announcer />` |
| Module-level global announcer | Instance-owned announcers |

## Support

For questions or issues during migration:
- Open an issue at https://github.com/lynellf/table-kit/issues
- Include your current version and a minimal reproduction
