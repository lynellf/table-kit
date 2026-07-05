# Phase 4 — Loading / `aria-busy` Contract

**Goal:** Land the spec §10 async UX contract: `aria-busy` on the grid root during Level 1 loading, placeholder rows exposed so loading is perceivable, "Loaded N rows" announcer message on success, and `aria-invalid="true"` on error. The placeholder rows are synthesized by the instance when the data source is loading and no fresh data is available.

After this phase:

- `getGridProps()` emits `aria-busy="true"` when `dataSourceState.status === 'loading'` and `aria-invalid="true"` when `dataSourceState.status === 'error'`.
- `getBodyProps()` emits `aria-busy="true"` when loading.
- `getRowModel()` synthesizes N placeholder `Row<TRow>` objects (configurable via `placeholderRows` option, default = `state.pagination.pageSize`) when the data source is loading and `dataSourceState.data` is null.
- The "Loaded N rows" message routes through the existing `ReactAnnouncer`.
- Integration tests cover server pagination, sort, filter, mixed-mode warning, abort-stale, loading-announcer.
- `pnpm verify` exits 0; new tests pass (~25-35).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/core/src/dataSource/placeholderRows.ts` | `synthesizePlaceholderRows(n)` — N synthetic row objects |
| `packages/core/src/dataSource/__tests__/placeholder.test.ts` | Placeholder row shape + id uniqueness |
| `packages/react/src/__integration__/server-pagination.test.tsx` | End-to-end: server pagination + aria-busy + placeholder rows |
| `packages/react/src/__integration__/server-sort.test.tsx` | End-to-end: server sort (RowsQuery carries sort) |
| `packages/react/src/__integration__/server-filter.test.tsx` | End-to-end: server filter (RowsQuery carries filter + filterFn name) |
| `packages/react/src/__integration__/mixed-mode-warning.test.tsx` | console.warn captured; `allowWithinPageOperations` suppresses |
| `packages/react/src/__integration__/loading-announcer.test.tsx` | "Loaded N rows" announces via the live region |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/dataSource/index.ts` | Re-export `synthesizePlaceholderRows` |
| `packages/core/src/createDataTable.ts` | `getGridProps()` reads `dataSourceState` and emits `aria-busy` / `aria-invalid`; `getRowModel()` synthesizes placeholders; `getBodyProps()` mirrors `aria-busy` |
| `packages/core/src/types.ts` | Add `placeholderRows?: number` to `DataTableOptions` |
| `packages/react/src/useDataTable.ts` | Read `dataSourceState.status` and emit aria attributes via prop getters (automatic — the core layer reads `dataSourceState` directly) |

No new packages; no new subpath exports.

---

## 3. File contents

### 3.1 `packages/core/src/dataSource/placeholderRows.ts`

```ts
/**
 * @lynellf/tablekit-core/dataSource — placeholder row synthesis.
 *
 * Spec §10: "skeleton/placeholder rows are exposed so loading states are
 * perceivable." When the data source is loading and no fresh data is
 * available, the instance renders N placeholder rows so the consumer's
 * skeleton UI has a target to render against.
 *
 * Placeholder rows carry:
 *   - `id`: `__placeholder_<index>` (synthetic; prefix prevents collision
 *     with real consumer row ids).
 *   - `original`: `{} as TRow` (consumer renders a skeleton against this).
 *   - `index`: 0..n-1 (pipeline-output index; matches the post-pipeline
 *     ordering used by the rest of the engine).
 */

import type { Row } from '../types';

export interface PlaceholderRow<TRow> extends Row<TRow> {
  readonly id: string;
  readonly index: number;
  readonly original: TRow;
  readonly isPlaceholder: true;
}

/**
 * Build N placeholder rows. `getRowId` is NOT consulted (placeholder ids
 * are deterministic and prefixed to avoid collision with real ids).
 */
export const synthesizePlaceholderRows = <TRow>(count: number): PlaceholderRow<TRow>[] => {
  if (count <= 0) return [];
  const rows: PlaceholderRow<TRow>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `__placeholder_${i}`,
      index: i,
      // biome-ignore lint/suspicious/noExplicitAny: empty placeholder; renderer is consumer's skeleton
      original: {} as any,
      isPlaceholder: true,
      getVisibleCells: () => [],
      getRowProps: () => ({ 'data-placeholder': 'true', role: 'row' }),
    });
  }
  return rows;
};
```

### 3.2 `packages/core/src/dataSource/index.ts` — addition

```ts
export { synthesizePlaceholderRows } from './placeholderRows';
export type { PlaceholderRow } from './placeholderRows';
```

### 3.3 `packages/core/src/createDataTable.ts` — patches

**`getRowModel` patch:** When `dataSourceState.status === 'loading'` and `dataSourceState.data === null`, return placeholder rows instead of `options.data`.

```ts
getRowModel(): Row<TRow>[] {
  // M3 phase 4: render placeholders while loading and no fresh data is available.
  if (this.dataSourceState.status === 'loading' && this.dataSourceState.data === null) {
    const count = this.options.placeholderRows ?? this.state.pagination.pageSize;
    return synthesizePlaceholderRows<TRow>(count) as unknown as Row<TRow>[];
  }
  // ... existing pipeline logic ...
}
```

**`getGridProps` patch:** Emit `aria-busy` / `aria-invalid` / `data-loading` when the data source is wired. `data-loading="true"` is the spec §6.4 styling hook for consumer CSS.

```ts
getGridProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
  const baseProps: Record<string, unknown> = {
    'aria-rowcount': this.getRowCount() + 1, // +1 for header row
    'aria-colcount': this.getVisibleColumns().length,
  };
  // ... existing role + tabIndex logic ...

  // M3 phase 4: aria-busy + aria-invalid + data-loading when a data source is wired.
  if (this.dataSourceState.status === 'loading') {
    baseProps['aria-busy'] = 'true';
    baseProps['data-loading'] = 'true';
  }
  if (this.dataSourceState.status === 'error') {
    baseProps['aria-invalid'] = 'true';
  }

  // ... existing onKeyDown + mergeProps ...
}
```

**`getBodyProps` patch:** Mirror `aria-busy` + `data-loading` on the body rowgroup.

```ts
getBodyProps(consumerProps?: Record<string, unknown>): Record<string, unknown> {
  const baseProps: Record<string, unknown> = { role: 'rowgroup' };
  if (this.dataSourceState.status === 'loading') {
    baseProps['aria-busy'] = 'true';
    baseProps['data-loading'] = 'true';
  }
  return mergeProps(baseProps, consumerProps);
}
```

### 3.4 `packages/core/src/types.ts` — addition

Append to `DataTableOptions<TRow>`:

```ts
/**
 * M3 phase 4: number of placeholder rows to render while the data source
 * is loading and no fresh data is available. Defaults to
 * `state.pagination.pageSize`. Set to 0 to disable placeholder rows.
 */
placeholderRows?: number;
```

### 3.5 Integration tests (sketches)

`server-pagination.test.tsx`:

```tsx
/** @jsxImportSource react */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';
import type { DataSource, RowsQuery } from '@lynellf/tablekit-core/dataSource';

interface Row { id: string; name: string; }

const makeSource = (delayMs: number, totalRows: number): DataSource<Row> => ({
  capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
  getRows: async (q: RowsQuery, { signal }) => {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    const start = (q.pagination?.pageIndex ?? 0) * (q.pagination?.pageSize ?? 25);
    const end = start + (q.pagination?.pageSize ?? 25);
    return { rows: Array.from({ length: Math.min(end - start, totalRows - start) }, (_, i) => ({
      id: String(start + i), name: `Row ${start + i}`,
    })), totalRowCount: totalRows };
  },
});

describe('server pagination', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders aria-busy + placeholders while loading; renders data after success', async () => {
    const source = makeSource(50, 100);
    function App() {
      const { table, dataSourceState } = useDataTable({
        data: [],
        columns: [{ id: 'name', accessor: 'name' }],
        dataSource: source,
      });
      return (
        <div>
          <div data-testid="status">{dataSourceState?.status}</div>
          <div {...table.getGridProps()} data-testid="grid">
            {table.getRowModel().map((r) => (
              <div key={r.id} {...r.getRowProps()}>
                {(r.original as Row).name ?? 'placeholder'}
              </div>
            ))}
          </div>
        </div>
      );
    }
    render(<App />);
    expect(screen.getByTestId('status').textContent).toBe('loading');
    expect(screen.getByTestId('grid').getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('success'));
    expect(screen.getByTestId('grid').getAttribute('aria-busy')).toBeNull();
  });
});
```

`mixed-mode-warning.test.tsx` (sketch):

```tsx
it('warns on mixed mode without allowWithinPageOperations', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const source: DataSource<Row> = {
    capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
    getRows: async () => ({ rows: [], totalRowCount: 0 }),
  };
  function App() { useDataTable({ data: [], columns: [], dataSource: source }); return null; }
  render(<App />);
  await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowWithinPageOperations')));
  warn.mockRestore();
});

it('does not warn when allowWithinPageOperations is set', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const source: DataSource<Row> = {
    capabilities: { sort: 'client', filter: 'client', paginate: 'server' },
    getRows: async () => ({ rows: [], totalRowCount: 0 }),
  };
  function App() {
    useDataTable({
      data: [], columns: [], dataSource: source, allowWithinPageOperations: true,
    });
    return null;
  }
  render(<App />);
  await new Promise((r) => setTimeout(r, 10));
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('allowWithinPageOperations'));
  warn.mockRestore();
});
```

`loading-announcer.test.tsx` (sketch):

```tsx
it('announces "Loaded N rows" on success', async () => {
  const source: DataSource<Row> = {
    capabilities: { sort: 'client', filter: 'client', paginate: 'client' },
    getRows: async () => ({ rows: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }], totalRowCount: 2 }),
  };
  function App() {
    const { Announcer } = useDataTable({ data: [], columns: [{ id: 'name', accessor: 'name' }], dataSource: source });
    return <Announcer />;
  }
  render(<App />);
  await waitFor(() =>
    expect(screen.getByTestId('tablekit-announcer').textContent).toContain('Loaded 2 rows'),
  );
});
```

---

## 4. Commands + Verification

```bash
# 1. Typecheck
pnpm --filter @lynellf/tablekit-core typecheck
pnpm --filter @lynellf/tablekit-react typecheck

# 2. Run new tests
pnpm --filter @lynellf/tablekit-core test -- --run placeholder
pnpm --filter @lynellf/tablekit-react test -- --run __integration__

# 3. Run full suite
pnpm --filter @lynellf/tablekit-core test -- --run
pnpm --filter @lynellf/tablekit-react test -- --run

# 4. Aggregate gate
pnpm verify                                                # EXIT 0

# 5. A11y check (axe)
pnpm --filter @lynellf/tablekit-react exec vitest run __integration__ --reporter=verbose
# Confirms: grid root has aria-busy when loading; aria-busy removed when success; aria-invalid on error; placeholder rows render as data-placeholder; announcer receives "Loaded N rows".
```

### Acceptance criteria

- `aria-busy="true"` on the grid root when `dataSourceState.status === 'loading'`; absent otherwise.
- `aria-busy="true"` on the body rowgroup when loading.
- `aria-invalid="true"` on the grid root when `dataSourceState.status === 'error'`; absent otherwise.
- Placeholder rows render with `data-placeholder="true"` (verifiable via the integration tests).
- "Loaded N rows" message routes through `ReactAnnouncer` on success.
- Placeholder row count defaults to `pageSize`; override via `placeholderRows: n`.
- M0/M1/M2 behavior preserved: when no `dataSource` is wired, `getGridProps` emits no `aria-busy` / `aria-invalid` (existing tests still pass).
- Mixed-mode warning fires once when the consumer wires a server-paginated source with client sort/filter and no `allowWithinPageOperations`.
- Abort-stale: state changes during loading abort the in-flight fetch; the stale fetch does not overwrite the new state.
- `pnpm verify` exits 0.

---

## 5. Out-of-scope (deferred to phase 5)

- Reference app demonstrating the patterns visually.
- Serialization golden fixtures (commit + test against committed JSON).
- `api-freeze.md` update.
- §12 perf badge in the reference app.

---

## 6. Risks (phase 4 specific)

1. **`placeholderRows` race with `setPageSize`.** If `pageSize` changes during loading, the placeholder count changes too. The default derivation (`placeholderRows ?? pageSize`) handles this correctly: the consumer's `setPageSize` call updates `state.pagination.pageSize`, which `getRowModel()` reads on the next call. Consumers wanting a fixed placeholder count override `placeholderRows` explicitly.
2. **`aria-busy` and `aria-invalid` collision.** The grid can be both loading AND error (rare — only if the error didn't replace the prior data). The implementation sets `aria-busy` for loading and `aria-invalid` for error; they coexist on the root. This matches spec §10.
3. **Announcer deduplication.** `ReactAnnouncer` deduplicates identical messages within `POLITENESS_INTERVAL_MS` (1000ms) per the M1 implementation. Rapid state changes that produce "Loaded 25 rows" repeatedly are deduped correctly. Different counts ("Loaded 24 rows" → "Loaded 25 rows") are not deduped (the messages differ).
4. **Placeholder rows vs `getRowId` warning.** The `defaultGetRowId` dev warning does not fire for placeholder rows (they bypass the helper entirely). Real consumer rows still trigger the warning if `getRowId` is missing.
5. **Multiple `useDataSource` calls per instance.** The hook is designed for a single data source per instance; consumers wiring multiple sources (e.g., one for sort/filter, one for pagination) is not supported in M3. Spec §5.2 implies a single `DataSource` per instance.