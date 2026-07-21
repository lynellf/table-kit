<!-- Historical: true -->
# DnD Column Reorder Recipe — dnd-kit

> Recipe — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Problem

You need pointer-based (mouse/touch) column reordering in your table. When the user drags a column header to a new position, the columns rearrange. This requires:
- A drag-and-drop library (this recipe uses `dnd-kit/core`).
- The library's `moveColumn(id, toIndex)` method to drive the state change.
- Announcer messages so screen readers know the column moved.

This recipe shows how to wire dnd-kit to `useDataTable`. Any DnD library works — the key integration point is `table.moveColumn(id, newIndex)`.

## Implementation

```tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useDataTable } from '@lynellf/tablekit-react';
import { useState } from 'react';

interface Row { id: string; name: string; email: string; age: number; }

const DndColumnGrid = ({ rows }: { rows: Row[] }) => {
  const [columnOrder, setColumnOrder] = useState(['name', 'email', 'age']);
  const { table, gridRef, Announcer } = useDataTable<Row>({
    data: rows,
    columns: columnOrder.map((id) => ({ id, accessor: id as keyof Row })),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: { active: { id: string }; over: { id: string } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columnOrder.indexOf(String(active.id));
    const newIndex = columnOrder.indexOf(String(over.id));
    const newOrder = arrayMove(columnOrder, oldIndex, newIndex);

    setColumnOrder(newOrder);
    table.moveColumn(String(active.id), newIndex);
  };

  return (
    <>
      <Announcer />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {/* Your DndContext children — SortableContext around headers */}
        <div {...table.getGridProps()} ref={gridRef}>
          {table.getHeaderGroups().map((hg) => (
            <div key={hg.id}>
              {hg.headers.map((h) => {
                // Attach dnd-kit props to the header cell.
                // h.getSortableProps() is the dnd-kit hook — replace with your library's hook.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { attributes, listeners, setNodeRef } = (h as any).getSortableProps?.() ?? {};
                return (
                  <div
                    key={h.id}
                    ref={setNodeRef}
                    {...h.getHeaderProps()}
                    {...attributes}
                    {...listeners}
                  >
                    {String(h.column.id)}
                  </div>
                );
              })}
            </div>
          ))}
          {/* Body rows — same as your existing rendering */}
        </div>
      </DndContext>
    </>
  );
};
```

## How it works

### `table.moveColumn(id, newIndex)`

The library exposes `moveColumn(columnId: string, newIndex: number)`. This is the only integration point needed from the table side. The rest is library-specific wiring.

- Use the **column id** (not index) as the drag item id — the prop getters expose stable column ids (spec §6.1).
- After calling `moveColumn`, the table re-derives its visible columns in the new order.

### Announcer messages

When the user drops a column, `moveColumn` triggers the announcer through the messages map. The default message is "Column {id} moved from position {from} to {to}". Override this via the `messages` option:

```tsx
const { table, Announcer } = useDataTable({
  data: rows,
  columns,
  messages: {
    columnMoved: (id, from, to) => `Column ${id} moved`,
  },
});
```

## Pitfalls

1. **Pin-region crossings**. Spec §8.3: reordering across pinning boundaries (left-pinned → unpinned → right-pinned) re-pins to the target region. The recipe shows a single pin region; for cross-region reorder, show a visual drop-zone indicator for each region.

2. **Keyboard parity**. Mouse-only drag is inaccessible. Cross-reference with `docs/recipes/kbd-column-reorder.md` to add keyboard-accessible column reorder alongside the pointer path.

3. **Stable column ids**. Always use `column.id` as the drag item id, not the render index. Column ids are stable across reorders; indices are not.

4. **Announcer from the messages map**. The `moveColumn` call triggers an announcer message that comes from the M6 phase 1 `messages` map. Consumers must override `columnMoved` (not a custom key) for non-English locales.

## See also

- Spec §8.3 (column reordering — DnD and keyboard)
- Spec §6.1 (stable column ids via prop getters)
- `docs/recipes/kbd-column-reorder.md` (keyboard column reorder — Space → Arrows → Space)
- M6 phase 1 announcer i18n: `docs/m6-hardening/api-freeze.md` §3
- API freeze: `docs/m6-hardening/api-freeze.md`

## Verified against

- `@lynellf/tablekit-core@1.0.0`
- `@lynellf/tablekit-react@1.0.0`
- `dnd-kit/core@latest`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
