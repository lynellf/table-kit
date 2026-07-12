<!-- Historical: true -->
# Layout Recipe — Virtualization + Sticky Pinning

> Recipe — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Problem

You need a headless table that renders a large dataset (thousands of rows) with smooth horizontal scroll and pinned columns (sticky left/right). The table must handle:
- **Row virtualization**: only render visible rows for performance.
- **Column pinning**: some columns stick to the left or right edge while the body scrolls horizontally.
- **Sticky header**: the header row stays fixed at the top during vertical scroll.

The challenge: virtualization and sticky pinning interact in subtle ways. The wrong CSS layout breaks sticky columns or creates scroll jitter.

## Implementation

```tsx
import { useDataTable } from '@lynellf/tablekit-react';
import { useRef } from 'react';

interface Row { id: string; name: string; email: string; status: string; }

const VirtualizedGrid = ({ rows, columns }: { rows: Row[]; columns: typeof COLS }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { table, gridRef } = useDataTable<Row>({
    data: rows,
    columns,
  });

  const visibleRows = table.getRowModel(); // apply your row virtualizer here

  return (
    <div
      ref={containerRef}
      style={{
        height: '100vh',           // Full viewport height
        overflow: 'auto',         // Single scroll container (horizontal + vertical)
        position: 'relative',     // Containing block for sticky children
      }}
    >
      <div
        {...table.getGridProps()}
        ref={gridRef}
        style={{ position: 'relative' }}
      >
        {/* Header — sticky on top */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,             // Above body rows
            background: 'white',
          }}
        >
          {table.getHeaderGroups().map((hg) => (
            <div key={hg.id} style={{ display: 'flex' }}>
              {hg.headers.map((h) => {
                const isPinned = h.column.getIsPinned();
                return (
                  <div
                    key={h.id}
                    {...h.getHeaderProps()}
                    style={{
                      position: isPinned ? 'sticky' : 'relative',
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      left: isPinned === 'left' ? `${h.column.getPinnedOffset()}px` : undefined,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      right: isPinned === 'right' ? `${h.column.getPinnedOffset()}px` : undefined,
                      zIndex: isPinned ? 1 : 0,
                    }}
                  >
                    {String(h.column.id)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Body rows — position: absolute with top offset */}
        <div style={{ position: 'relative' }}>
          {visibleRows.map((row, i) => (
            <div
              key={row.id}
              {...row.getRowProps()}
              style={{
                position: 'absolute',
                top: `${i * ROW_HEIGHT}px`,   // Each row is ROW_HEIGHT px tall
                width: 'max-content',
              }}
            >
              {row.getVisibleCells().map((cell) => {
                const isPinned = cell.column.getIsPinned();
                return (
                  <div
                    key={cell.id}
                    {...cell.getCellProps()}
                    style={{
                      position: isPinned ? 'sticky' : 'static',
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      left: isPinned === 'left' ? `${cell.column.getPinnedOffset()}px` : undefined,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      right: isPinned === 'right' ? `${cell.column.getPinnedOffset()}px` : undefined,
                    }}
                  >
                    {String(cell.getValue())}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ROW_HEIGHT = 40; // Must match your virtualizer's row height
const COLS = [
  { id: 'name', accessor: 'name', pinned: 'left' as const },
  { id: 'email', accessor: 'email' },
  { id: 'status', accessor: 'status', pinned: 'right' as const },
];
```

## How it works

### The `top` offset pattern

Each body row uses `position: absolute; top: Npx`. The virtualizer controls the `N` (row index × row height). This is what makes the rows "float" over a tall container div.

**Why not `transform: translateY(Npx)`?** A transformed ancestor becomes the containing block for `position: sticky`, which silently breaks pinned columns. Always use `top`, never `transform`, when sticky columns are present.

### One scroll container

Horizontal and vertical scroll live on the **same parent element**. This is what makes `position: sticky` on pinned columns work — the sticky element's nearest scrolling ancestor is the grid container itself.

If you split horizontal and vertical scroll into separate containers (e.g., a fixed header + scrollable body), sticky columns will not stick to the viewport edge.

### Sticky header

The header is `position: sticky; top: 0` inside the scroll container. It scrolls horizontally with the body (same container) but stays at the top during vertical scroll.

### Z-index ladder

| Layer | z-index | What |
| --- | --- | --- |
| Sticky header | 2 | Always above everything |
| Body rows | 1 | Default |
| Pinned cells | 1 | Same as body rows but sticky |

Do not override z-index without understanding the scroll container hierarchy — it will break sticky behavior.

## Pitfalls

1. **`top`, not `transform`**. Spec §6.3: "A transformed ancestor becomes the containing block for `position: sticky`". If your virtualizer uses transforms internally, either disable transforms or use a different virtualization approach for pinned columns.

2. **One scroll container**. Splitting horizontal and vertical scroll into separate elements breaks sticky pinning. The header must share the same scroll container as the body.

3. **Row height must be consistent**. The `top` offset pattern requires a fixed row height. If rows have variable heights, use the virtualizer's `measure` callback to update offsets.

4. **Pinned columns are excluded from column virtualization**. Spec §7.3: pinned columns are always rendered (never virtualized away) to keep the sticky element present in the DOM. Budget for this in your initial render cost estimate.

5. **`getPinnedOffset()` returns pixels**. The prop getters expose `getPinnedOffset()` which returns the cumulative offset for the pinned column. Use this for `left`/`right` positioning — do not hardcode pixel values.

## See also

- Spec §6.3 (layout and scroll container)
- Spec §7.3 (column virtualization and pinned columns)
- `docs/recipes/split-pane.md` (alternative when transforms are unavoidable)
- API freeze: `docs/m6-hardening/api-freeze.md`

## Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
