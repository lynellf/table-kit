<!-- Historical: true -->
# Split-Pane Recipe — Scroll Sync with Three Viewports

> Recipe — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Problem

Your surrounding layout imposes a CSS `transform` on the table container (e.g., a dashboard panel that slides in, a parent with `transform: translateX`, a perspective transform for 3D effects). A transformed ancestor silently breaks `position: sticky`, which breaks pinned columns and sticky headers.

The workaround: split the table into three independent viewports (left, center, right) that share a single `scrollLeft` value. Each viewport scrolls its rows independently on the vertical axis but shares horizontal scroll position.

**When to use this recipe**: your grid lives inside a transformed container and you can't remove the transform. If there's no transform in the surrounding layout, use `docs/recipes/layout.md` instead — it's simpler and faster.

## Implementation

```tsx
import { useDataTable } from '@lynellf/tablekit-react';
import { useCallback, useRef, useState } from 'react';

interface Row { id: string; name: string; email: string; status: string; }

const COLUMNS = [
  { id: 'name', accessor: 'name' },
  { id: 'email', accessor: 'email' },
  { id: 'status', accessor: 'status' },
];

/** Hook that synchronizes scrollLeft across multiple ref elements. */
const useScrollSync = () => {
  const scrollLeftRef = useRef(0);
  const listenersRef = useRef<Set<(scrollLeft: number) => void>>(new Set());

  const subscribe = useCallback((cb: (scrollLeft: number) => void) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  const broadcast = useCallback((scrollLeft: number) => {
    scrollLeftRef.current = scrollLeft;
    listenersRef.current.forEach((cb) => cb(scrollLeft));
  }, []);

  return { subscribe, broadcast, scrollLeftRef };
};

/**
 * Split-pane grid. Three viewports share horizontal scroll position.
 * Vertical scroll is per-pane.
 */
const SplitPaneGrid = ({ rows }: { rows: Row[] }) => {
  const { table, gridRef, Announcer } = useDataTable<Row>({
    data: rows,
    columns: COLUMNS.map((c) => ({
      ...c,
      pinned: c.id === 'name' ? 'left' : c.id === 'status' ? 'right' : false,
    })),
  });

  const { subscribe, broadcast } = useScrollSync();

  const leftRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  // Sync scrollLeft when any pane scrolls.
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    // Use requestAnimationFrame to throttle updates to one per frame.
    requestAnimationFrame(() => broadcast(scrollLeft));
  }, [broadcast]);

  // Apply synced scrollLeft to non-triggering panes.
  const applyScrollLeft = useCallback((scrollLeft: number, source: HTMLDivElement | null) => {
    [leftRef.current, centerRef.current, rightRef.current].forEach((pane) => {
      if (pane && pane !== source) {
        pane.scrollLeft = scrollLeft;
      }
    });
  }, []);

  return (
    <>
      <Announcer />
      {/* Outer container with transform — this is what would break sticky pinning. */}
      <div style={{ transform: 'translateX(100px)', position: 'relative' }}>
        <div style={{ display: 'flex', overflow: 'hidden' }}>
          {/* Left pane — pinned name column */}
          <div
            ref={leftRef}
            onScroll={handleScroll}
            style={{ overflow: 'auto', height: '400px', flexShrink: 0 }}
            {...table.getGridProps()}
          >
            {/* Only render pinned columns */}
            {table.getHeaderGroups().map((hg) => (
              <div key={hg.id}>
                {hg.headers
                  .filter((h) => h.column.getIsPinned() === 'left')
                  .map((h) => (
                    <div key={h.id} {...h.getHeaderProps()}>
                      {String(h.column.id)}
                    </div>
                  ))}
              </div>
            ))}
            {table.getRowModel().map((row) => (
              <div key={row.id}>
                {row.getVisibleCells()
                  .filter((c) => c.column.getIsPinned() === 'left')
                  .map((cell) => (
                    <div key={cell.id} {...cell.getCellProps()}>
                      {String(cell.getValue())}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          {/* Center pane — unpinned columns */}
          <div
            ref={centerRef}
            onScroll={handleScroll}
            style={{ overflow: 'auto', height: '400px', flex: 1 }}
          >
            {table.getHeaderGroups().map((hg) => (
              <div key={hg.id}>
                {hg.headers
                  .filter((h) => !h.column.getIsPinned())
                  .map((h) => (
                    <div key={h.id} {...h.getHeaderProps()}>
                      {String(h.column.id)}
                    </div>
                  ))}
              </div>
            ))}
            {table.getRowModel().map((row) => (
              <div key={row.id}>
                {row.getVisibleCells()
                  .filter((c) => !c.column.getIsPinned())
                  .map((cell) => (
                    <div key={cell.id} {...cell.getCellProps()}>
                      {String(cell.getValue())}
                    </div>
                  ))}
              </div>
            ))}
          </div>

          {/* Right pane — pinned status column */}
          <div
            ref={rightRef}
            onScroll={handleScroll}
            style={{ overflow: 'auto', height: '400px', flexShrink: 0 }}
          >
            {table.getHeaderGroups().map((hg) => (
              <div key={hg.id}>
                {hg.headers
                  .filter((h) => h.column.getIsPinned() === 'right')
                  .map((h) => (
                    <div key={h.id} {...h.getHeaderProps()}>
                      {String(h.column.id)}
                    </div>
                  ))}
              </div>
            ))}
            {table.getRowModel().map((row) => (
              <div key={row.id}>
                {row.getVisibleCells()
                  .filter((c) => c.column.getIsPinned() === 'right')
                  .map((cell) => (
                    <div key={cell.id} {...cell.getCellProps()}>
                      {String(cell.getValue())}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
```

## How it works

### Scroll sync via shared state

Each pane's `onScroll` fires `handleScroll`, which calls `broadcast(scrollLeft)`. The broadcaster notifies all subscribed panes, which set their `scrollLeft` to the broadcast value. The triggering pane's own scroll is not modified.

### `requestAnimationFrame` throttle

Without throttling, each scroll event would trigger multiple `setState` calls, causing jank. Wrapping `broadcast` in `requestAnimationFrame` ensures at most one update per animation frame.

### Pinned columns per pane

Each pane renders only the columns in its pin region:
- **Left pane**: columns with `pinned: 'left'`
- **Center pane**: columns with `pinned: false`
- **Right pane**: columns with `pinned: 'right'`

This avoids the sticky positioning problem — each pane scrolls independently and shows only its subset of columns.

## Pitfalls

1. **Scroll sync overhead**. Each scroll event on any pane triggers `setState` (via `broadcast`). Throttle to `requestAnimationFrame` as shown. Without throttling, fast scroll gestures will cause jank.

2. **Horizontal scroll synchronization**. All three viewports share `scrollLeft`. Vertical scroll is per-viewport — each pane has its own vertical scroll state. This matches the use case where all panes show the same rows (same data, different column subsets).

3. **No library code changes required**. Spec §6.3: "the library supports it because pinned/unpinned column sets and offsets are exposed as data, not markup." The recipe is purely consumer-side CSS + scroll sync. The library provides `column.getIsPinned()`, `column.getPinnedOffset()`, and `table.getHeaderGroups()`.

4. **Use `layout.md` when transforms aren't in the surrounding layout**. The split-pane pattern adds complexity (three scroll containers, scroll sync). If your layout doesn't use transforms, the single-container sticky pattern from `layout.md` is simpler and more performant.

## See also

- Spec §6.3 (layout and scroll container)
- `docs/recipes/layout.md` (default recipe — single scroll container with sticky pinning)
- API freeze: `docs/m6-hardening/api-freeze.md`

## Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
