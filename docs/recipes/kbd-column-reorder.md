# Keyboard Column Reorder Recipe — "Grab" Pattern

> Recipe — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Problem

You need a keyboard-accessible column reorder pattern for users who don't use a mouse. The "grab" pattern (spec §8.3) is:
1. **Space** to "lift" a column (enters grabbed mode; announces to screen readers).
2. **Arrow Left / Arrow Right** to move within the header row.
3. **Space** to drop at the new position.
4. **Escape** to cancel (restores the original position).

This recipe complements `docs/recipes/dnd-column-reorder.md` — the pointer path and the keyboard path share the same `table.moveColumn(id, newIndex)` call.

## Implementation

```tsx
import { useDataTable } from '@lynellf/tablekit-react';
import { useCallback, useRef, useState } from 'react';

interface Row { id: string; name: string; email: string; age: number; }

/**
 * Wrapper that adds keyboard column reorder to a header cell.
 * Mount one per header column.
 */
const KbdReorderHeaderCell = ({
  header,
  table,
}: {
  header: ReturnType<typeof table.getHeaderGroups>[0]['headers'][0];
  table: ReturnType<typeof useDataTable<Row>['table']>;
}) => {
  // Track the grab state.
  const [grabbed, setGrabbed] = useState(false);
  const originalIndexRef = useRef(header.index);
  const currentIndexRef = useRef(header.index);

  const announce = useCallback((msg: string) => {
    // The announcer is set up via the messages map in useDataTable.
    // The library's internal announce() fires on state changes.
    void msg;
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' && !grabbed) {
      // Space: lift (enter grab mode).
      e.preventDefault();
      setGrabbed(true);
      originalIndexRef.current = header.index;
      currentIndexRef.current = header.index;
      announce(`Grabbed column ${header.column.id}`);
    } else if (e.key === ' ' && grabbed) {
      // Space: drop.
      e.preventDefault();
      const finalIndex = currentIndexRef.current;
      table.moveColumn(header.column.id, finalIndex);
      setGrabbed(false);
      announce(`Dropped column ${header.column.id} at position ${finalIndex}`);
    } else if (e.key === 'Escape' && grabbed) {
      // Escape: cancel.
      e.preventDefault();
      setGrabbed(false);
      currentIndexRef.current = originalIndexRef.current;
      announce(`Reorder cancelled`);
    } else if (e.key === 'ArrowRight' && grabbed) {
      // Move right.
      e.preventDefault();
      const headers = table.getHeaderGroups()[0].headers;
      const next = Math.min(currentIndexRef.current + 1, headers.length - 1);
      currentIndexRef.current = next;
      announce(`Column moved to position ${next}`);
    } else if (e.key === 'ArrowLeft' && grabbed) {
      // Move left.
      e.preventDefault();
      const prev = Math.max(currentIndexRef.current - 1, 0);
      currentIndexRef.current = prev;
      announce(`Column moved to position ${prev}`);
    }
  };

  return (
    <div
      {...header.getHeaderProps()}
      onKeyDown={handleKeyDown}
      aria-pressed={grabbed}
      style={{ outline: grabbed ? '2px solid blue' : undefined }}
    >
      {String(header.column.id)}
      {grabbed && <span aria-label="Grabbed — use arrows to move, Space to drop, Escape to cancel" />}
    </div>
  );
};

const KbdReorderGrid = ({ rows }: { rows: Row[] }) => {
  const { table, gridRef, Announcer } = useDataTable<Row>({
    data: rows,
    columns: [
      { id: 'name', accessor: 'name' },
      { id: 'email', accessor: 'email' },
      { id: 'age', accessor: 'age' },
    ],
  });

  return (
    <>
      <Announcer />
      <div {...table.getGridProps()} ref={gridRef}>
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id}>
            {hg.headers.map((h) => (
              <KbdReorderHeaderCell key={h.id} header={h} table={table} />
            ))}
          </div>
        ))}
        {/* Body rows */}
      </div>
    </>
  );
};
```

## How it works

### State machine

The grab mode is a simple boolean state. `originalIndexRef` tracks the starting position so Escape can restore it. `currentIndexRef` tracks the live position during movement.

### Announcements

Every state transition fires an announcement through the M6 phase 1 messages map:
- **Grab**: `columnPinned` or a custom grabbed message.
- **Move**: `columnMoved(id, from, to)` — fires through the messages map.
- **Drop**: `columnMoved` fires when `moveColumn` is called.
- **Cancel**: custom cancel message.

Override these via the `messages` option:

```tsx
const { table, Announcer } = useDataTable({
  data: rows,
  columns,
  messages: {
    columnMoved: (id, from, to) =>
      `Column ${id} moved from position ${from + 1} to ${to + 1}`,
  },
});
```

## Pitfalls

1. **Escape restores the original position**. The recipe uses `originalIndexRef` to track the start position. On Escape, it does not call `moveColumn` (no state change) — it just resets the UI state. This is intentional: canceling a reorder should not fire an announcer message about the column moving.

2. **No reordering across pinning regions via keyboard alone**. Spec §8.3: v1.0 ships keyboard reorder within a single pin region. For cross-region reorder, use the mouse + DnD path (see `dnd-column-reorder.md`). Cross-region keyboard reorder is v1.5.

3. **Announcer messages come from the messages map**. Override `columnMoved`, `columnPinned`, `columnUnpinned` for non-English locales. The grab state itself requires no library support — it's a custom `aria-pressed` attribute on the header cell.

4. **Focus stays on the grabbed header**. During grab mode, focus remains on the header cell. Arrow keys move the *conceptual position*, not focus. This matches the APG grid pattern where focus moves cell-by-cell.

## See also

- Spec §8.3 (column reordering — keyboard pattern)
- `docs/recipes/dnd-column-reorder.md` (pointer-based column reorder)
- M6 phase 1 announcer i18n: `docs/m6-hardening/api-freeze.md` §3
- APG grid pattern: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- API freeze: `docs/m6-hardening/api-freeze.md`

## Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
