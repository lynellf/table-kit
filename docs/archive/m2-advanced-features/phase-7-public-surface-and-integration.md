# Phase 7 — Public Surface + Integration Tests + Perf Gate

**Goal:** Finalize the M2 public surface: edit `packages/{core,react}/package.json` to add the M2 subpath exports (`virtualization`, `resize`, `keyboard-nav`, `pinning`, `memo`, `validate`); update both `index.ts` files with the final M2 surface; update the README files; ship **integration tests** that render a fully virtualized grid with pinned columns, resizable headers, keyboard nav, and the validator; produce the **API freeze update** (`api-freeze.md`) recording every public export at M2 freeze so M3+ cannot rename/remove/signature-change the M0/M1/M2 surface; run the **§12 perf bench** as part of `pnpm verify` and confirm ≥ 55fps on the 100k-row scroll benchmark (advisory, logged in the implementation commit message); run the **APG keyboard Playwright suite** as the M2 conformance gate.

After this phase:
- `pnpm verify` exits 0 from a fresh clone.
- The M2 exit criteria from §14 are satisfied: **100k-row scroll budget met**, **APG keyboard suite passes**, **validator ships**.
- All M0 + M1 + M2 tests pass (~400-500 total).
- Bundle sizes are measured and logged in the implementation commit.
- API freeze manifest updated.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `docs/m2-advanced-features/api-freeze.md` | Final list of every public export from both packages at M2 freeze |
| `packages/react/src/__integration__/virtualized-grid.test.tsx` | End-to-end test: render a virtualized 1000-row grid with 1 pinned-left column; verify positionStyle + sticky offsets |
| `packages/react/src/__integration__/pinned-resize.test.tsx` | End-to-end test: pin a column, resize it, verify offset recomputes |
| `packages/react/src/__integration__/keyboard-nav.spec.ts` | Playwright suite scripted from the §7.5 conformance table |
| `packages/react/playwright.config.ts` | Playwright config (project root, browsers, base URL) |
| `packages/core/bench/scroll.bench.ts` | mitata micro-benchmark for the §12 budget (advisory in CI) |
| `packages/core/vite.subpaths.config.ts` | Updated to include the M2 subpath entries |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/package.json` | Add `./virtualization`, `./memo`, `./resize`, `./pinning`, `./keyboard-nav` subpath exports |
| `packages/core/src/index.ts` | Final M2 surface re-exports (types from virtualization; helpers from resize/pinning/keyboard-nav) |
| `packages/core/vite.subpaths.config.ts` | Add M2 entries |
| `packages/core/package.json` build script | Run both `vite build` and `vite build --config vite.subpaths.config.ts` |
| `packages/react/package.json` | Add `./validate` subpath export |
| `packages/react/src/index.ts` | Re-export `useScrollAdapter`, `useSizeObserver`, `useRowVirtualizer`, `useCenterVirtualizer`, `useResizeHandle`, `useKeyboardNav` |
| `packages/react/package.json` build script | Run both `vite build` and `vite build --config vite.subpaths.config.ts` |
| `packages/react/playwright.config.ts` | (new file) |
| `packages/react/package.json` | Add `playwright` devDependency + `test:e2e` script |
| `README.md`, `packages/core/README.md`, `packages/react/README.md` | Update quick-start with a M2 example |
| `package.json` (root) | Add `test:e2e` script |

---

## 3. File contents

### 3.1 `packages/core/package.json` — subpath exports (final)

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/tablekit-core.es.js"
    },
    "./sorting": {
      "types": "./dist/sorting.d.ts",
      "import": "./dist/sorting.es.js"
    },
    "./filtering": {
      "types": "./dist/filtering.d.ts",
      "import": "./dist/filtering.es.js"
    },
    "./pagination": {
      "types": "./dist/pagination.d.ts",
      "import": "./dist/pagination.es.js"
    },
    "./faceting": {
      "types": "./dist/faceting.d.ts",
      "import": "./dist/faceting.es.js"
    },
    "./pipeline": {
      "types": "./dist/pipeline/index.d.ts",
      "import": "./dist/pipeline/index.es.js"
    },
    "./virtualization": {
      "types": "./dist/virtualization/index.d.ts",
      "import": "./dist/virtualization/index.es.js"
    },
    "./memo": {
      "types": "./dist/pipeline/memo.d.ts",
      "import": "./dist/pipeline/memo.es.js"
    },
    "./resize": {
      "types": "./dist/resize.d.ts",
      "import": "./dist/resize.es.js"
    },
    "./pinning": {
      "types": "./dist/pinning.d.ts",
      "import": "./dist/pinning.es.js"
    },
    "./keyboard-nav": {
      "types": "./dist/keyboard-nav.d.ts",
      "import": "./dist/keyboard-nav.es.js"
    }
  }
}
```

### 3.2 `packages/core/src/index.ts` — final M2 surface (additions only)

Append:

```ts
// ─── Virtualization types (M2 Phase 1) ─────────────────────────────────────
export type {
  VirtualItem,
  VirtualRow,
  RowVirtualizerResult,
  ColumnVirtualizerResult,
  VirtualizerLike,
  VirtualizerOptions,
} from './virtualization/types';

// ─── Resize helpers (M2 Phase 3) ───────────────────────────────────────────
export {
  DEFAULT_RESIZE_STEP_PX,
  resizeColumn,
  cancelResize,
  clampColumnSize,
  resizeAnnouncement,
} from './resize';

// ─── Pinning helpers (M2 Phase 2) ─────────────────────────────────────────
export {
  togglePinColumn,
  pinColumns,
  unpinColumns,
  pinAnnouncement,
} from './pinning';
export type { PinSide } from './pinning';

// ─── Keyboard nav helpers (M2 Phase 5) ─────────────────────────────────────
export {
  KEY_BINDINGS,
  navigateCell,
  navigateToEdge,
  navigateByPage,
  resolveKeyBinding,
} from './keyboardNav';
export type { NavigationMode, NavigationDirection } from './keyboardNav';
```

### 3.3 `packages/core/vite.subpaths.config.ts` — final entries

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const entries: Record<string, string> = {
  sorting: 'src/registries/sorting.ts',
  filtering: 'src/registries/filtering.ts',
  pagination: 'src/pipeline/paginate.ts',
  faceting: 'src/faceting.ts',
  pipeline: 'src/pipeline/index.ts',
  virtualization: 'src/virtualization/index.ts',
  memo: 'src/pipeline/memo.ts',
  resize: 'src/resize.ts',
  pinning: 'src/pinning.ts',
  'keyboard-nav': 'src/keyboardNav.ts',
};

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: entries,
      formats: ['es'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
```

### 3.4 `packages/core/package.json` build script

```json
{
  "scripts": {
    "build": "vite build && vite build --config vite.subpaths.config.ts",
    "bench": "tsx bench/scroll.bench.ts"
  },
  "devDependencies": {
    "mitata": "^0.1.6",
    "tsx": "^4.7.0"
  }
}
```

### 3.5 `packages/react/package.json` — subpath exports (final)

```json
{
  "exports": {
    ".": { "...": "..." },
    "./validate": {
      "types": "./dist/validate.d.ts",
      "import": "./dist/validate.es.js"
    }
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  },
  "scripts": {
    "build": "vite build && vite build --config vite.subpaths.config.ts",
    "test:e2e": "playwright test"
  }
}
```

### 3.6 `packages/react/src/index.ts` — final M2 surface (additions only)

Append:

```ts
// ─── Virtualization hooks (M2 Phase 4) ─────────────────────────────────────
export { useScrollAdapter } from './useScrollAdapter';
export { useSizeObserver } from './useSizeObserver';
export type { SizeObserverOptions } from './useSizeObserver';
export { useRowVirtualizer } from './useRowVirtualizer';
export { useCenterVirtualizer } from './useCenterVirtualizer';

// ─── Resize hook (M2 Phase 3) ──────────────────────────────────────────────
export { useResizeHandle } from './useResizeHandle';

// ─── Keyboard nav hook (M2 Phase 5) ─────────────────────────────────────────
export { useKeyboardNav } from './useKeyboardNav';
```

### 3.7 `packages/react/playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__integration__',
  testMatch: /.*\.spec\.ts$/,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'vite preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

### 3.8 `packages/react/src/__integration__/virtualized-grid.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import {
  useDataTable,
  useScrollAdapter,
  useRowVirtualizer,
  useSizeObserver,
} from '@lynellf/tablekit-react';
import { validateGridStructure } from '@lynellf/tablekit-react/validate';

interface Person {
  id: string;
  name: string;
  age: number;
}

const Grid = ({ data }: { data: Person[] }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const { table } = useDataTable({
    data,
    columns: [
      { id: 'name', accessor: 'name' },
      { id: 'age', accessor: 'age' },
    ],
    getRowId: (r) => r.id,
    columnPinning: { left: ['name'] },
  });

  useScrollAdapter(gridRef, table);
  const rowV = useRowVirtualizer(table);
  useSizeObserver({ gridRef, rowVirtualizer: rowV, columnVirtualizer: table.getCenterVirtualizer() });

  return (
    <div
      ref={gridRef}
      data-testid="grid"
      {...table.getGridProps({ style: { overflow: 'auto', height: 400 } })}
    >
      <div {...table.getHeaderGroupProps()}>
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} {...hg.getRowProps()}>
            {hg.headers.map((h) => (
              <div
                key={h.id}
                {...h.getHeaderProps({
                  style: h.column.getIsPinned()
                    ? {
                        position: 'sticky',
                        left: h.column.getPinnedOffset(),
                        background: '#fff',
                      }
                    : undefined,
                })}
              >
                {h.column.id}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div {...table.getBodyProps()}>
        <div role="presentation" style={{ height: rowV.totalSize, position: 'relative' }}>
          {rowV.rows.map((vRow) => (
            <div
              key={vRow.row.id}
              {...vRow.row.getRowProps({ style: vRow.positionStyle })}
              data-row-index={vRow.row.index}
            >
              {vRow.row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  {...cell.getCellProps({
                    style: cell.column.getIsPinned()
                      ? {
                          position: 'sticky',
                          left: cell.column.getPinnedOffset(),
                          background: '#fff',
                        }
                      : undefined,
                  })}
                >
                  {cell.getValue() as string}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

describe('Virtualized grid integration', () => {
  it('renders a virtualized grid and passes the validator', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      age: i % 100,
    }));
    const { getByTestId } = render(<Grid data={data} />);
    const grid = getByTestId('grid');
    const result = validateGridStructure(grid);
    expect(result.valid).toBe(true);
  });

  it('renders the visible window only', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      age: i % 100,
    }));
    const { container } = render(<Grid data={data} />);
    const renderedRows = container.querySelectorAll('[role="row"][data-row-index]');
    // With viewport 400 / row 33 ≈ 12 rows + overscan 4 × 2 = ~20 rows.
    expect(renderedRows.length).toBeLessThan(50);
    expect(renderedRows.length).toBeGreaterThan(10);
  });

  it('pinned column emits position:sticky with correct offset', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      age: i,
    }));
    const { container } = render(<Grid data={data} />);
    const pinnedCell = container.querySelector('[data-pinned="left"]');
    expect(pinnedCell).toBeTruthy();
    const style = (pinnedCell as HTMLElement).style;
    expect(style.position).toBe('sticky');
    expect(style.left).toBe('0px'); // first pinned = offset 0
  });
});
```

### 3.9 `packages/react/src/__integration__/pinned-resize.test.tsx`

```tsx
import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { createDataTable } from '@lynellf/tablekit-core';
import {
  useDataTable,
  useResizeHandle,
  useScrollAdapter,
} from '@lynellf/tablekit-react';
import { validateGridStructure } from '@lynellf/tablekit-react/validate';

const Grid = ({ table }: { table: ReturnType<typeof createDataTable> }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  useScrollAdapter(gridRef, table);
  const bind = useResizeHandle(table);

  return (
    <div ref={gridRef} {...table.getGridProps({ style: { overflow: 'auto' } })}>
      <div {...table.getHeaderGroupProps()}>
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} {...hg.getRowProps()}>
            {hg.headers.map((h) => (
              <div key={h.id} {...h.getHeaderProps({ 'data-column-id': h.column.id })}>
                {h.column.id}
                <div data-testid={`resize-${h.column.id}`} {...h.getResizeHandleProps(bind)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

describe('Pinned + resize integration', () => {
  it('resizing a pinned column recomputes downstream offsets', () => {
    const table = createDataTable({
      data: [{ a: 1, b: 2 }],
      columns: [
        { id: 'a', accessor: 'a', size: 100 },
        { id: 'b', accessor: 'b', size: 100 },
      ],
      getRowId: (r) => String((r as { a: number }).a),
      columnPinning: { left: ['a', 'b'], right: [] },
    });
    const a = table.getLeftLeafColumns()[0]!;
    const b = table.getLeftLeafColumns()[1]!;
    expect(b.getPinnedOffset()).toBe(100);
    table.startResize('a', 100, 100);
    table.adjustResize('a', 50);
    table.commitResize('a');
    expect(a.getSize()).toBe(150);
    expect(b.getPinnedOffset()).toBe(150);
  });

  it('renders resize handles with full ARIA', () => {
    const table = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a', size: 100 }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const { getByTestId } = render(<Grid table={table} />);
    const handle = getByTestId('resize-a');
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuenow')).toBe('100');
    expect(handle.getAttribute('aria-valuemin')).toBe('30');
    expect(handle.getAttribute('aria-valuemax')).toBeTruthy();
    expect(handle.getAttribute('aria-label')).toBe('Resize column a');
  });

  it('validator passes after resize', () => {
    const table = createDataTable({
      data: [{ a: 1 }],
      columns: [{ id: 'a', accessor: 'a' }],
      getRowId: (r) => String((r as { a: number }).a),
    });
    const { getByTestId } = render(<Grid table={table} />);
    const result = validateGridStructure(getByTestId('grid'));
    expect(result.valid).toBe(true);
  });
});
```

### 3.10 `packages/react/src/__integration__/keyboard-nav.spec.ts` (Playwright)

```ts
import { expect, test } from '@playwright/test';

// This suite spins up a built React app that renders a virtualized grid
// via the M2 features and exercises the §7.5 conformance table.
// Run with: pnpm --filter @lynellf/tablekit-react test:e2e

test.describe('APG grid keyboard conformance', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Tab enters the grid via the focused cell', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focused === 'gridcell' || focused === 'columnheader').toBe(true);
  });

  test('ArrowDown moves focus to the next row', async ({ page }) => {
    await page.keyboard.press('Tab'); // enter grid
    const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex'));
    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex'));
    expect(Number(after)).toBe(Number(before) + 1);
  });

  test('ArrowRight moves focus to the next column', async ({ page }) => {
    await page.keyboard.press('Tab');
    const before = await page.evaluate(() => document.activeElement?.getAttribute('aria-colindex'));
    await page.keyboard.press('ArrowRight');
    const after = await page.evaluate(() => document.activeElement?.getAttribute('aria-colindex'));
    expect(Number(after)).toBe(Number(before) + 1);
  });

  test('Home jumps to row start', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    const col = await page.evaluate(() => document.activeElement?.getAttribute('aria-colindex'));
    expect(col).toBe('1');
  });

  test('End jumps to row end', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('End');
    const col = await page.evaluate(() => document.activeElement?.getAttribute('aria-colindex'));
    const total = await page.evaluate(() => document.querySelector('[role="grid"]')?.getAttribute('aria-colcount'));
    expect(col).toBe(total);
  });

  test('Ctrl+Home jumps to first cell of grid', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Control+Home');
    const row = await page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex'));
    expect(row).toBe('2'); // 1-based; row 1 is header
  });

  test('PageDown moves focus by viewport', async ({ page }) => {
    await page.keyboard.press('Tab');
    const before = Number(await page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex')));
    await page.keyboard.press('PageDown');
    const after = Number(await page.evaluate(() => document.activeElement?.getAttribute('aria-rowindex')));
    expect(after).toBeGreaterThan(before + 1);
  });

  test('Tab exits the grid', async ({ page }) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focused !== 'gridcell' && focused !== 'columnheader' && focused !== 'separator').toBe(true);
  });

  test('exactly one element has tabIndex=0 in the grid', async ({ page }) => {
    await page.keyboard.press('Tab');
    const count = await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      if (!grid) return -1;
      return grid.querySelectorAll('[tabindex="0"]').length;
    });
    expect(count).toBe(1);
  });

  test('aria-rowcount and aria-colcount are present on the grid', async ({ page }) => {
    await page.goto('/');
    const counts = await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      return {
        rowcount: grid?.getAttribute('aria-rowcount'),
        colcount: grid?.getAttribute('aria-colcount'),
      };
    });
    expect(counts.rowcount).toBeTruthy();
    expect(counts.colcount).toBeTruthy();
  });
});
```

### 3.11 `packages/react/src/__integration__/setup.tsx` (the test harness)

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useRef } from 'react';
import { createDataTable } from '@lynellf/tablekit-core';
import {
  useDataTable,
  useScrollAdapter,
  useRowVirtualizer,
  useSizeObserver,
  useResizeHandle,
} from '@lynellf/tablekit-react';

// Renders a 1000-row × 5-col virtualized grid with 1 pinned-left column
// and a resize handle per column. Used by the Playwright suite.
const Grid = () => {
  const gridRef = useRef<HTMLDivElement>(null);
  const data = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    a: `a${i}`,
    b: `b${i}`,
    c: `c${i}`,
    d: `d${i}`,
    e: `e${i}`,
  }));
  const { table } = useDataTable({
    data,
    columns: [
      { id: 'a', accessor: 'a' },
      { id: 'b', accessor: 'b' },
      { id: 'c', accessor: 'c' },
      { id: 'd', accessor: 'd' },
      { id: 'e', accessor: 'e' },
    ],
    getRowId: (r) => (r as { id: string }).id,
    columnPinning: { left: ['a'] },
  });
  useScrollAdapter(gridRef, table);
  const rowV = useRowVirtualizer(table);
  useSizeObserver({ gridRef, rowVirtualizer: rowV, columnVirtualizer: table.getCenterVirtualizer() });
  const bind = useResizeHandle(table);

  return (
    <div ref={gridRef} {...table.getGridProps({ style: { overflow: 'auto', height: 600, width: 800 } })}>
      <div {...table.getHeaderGroupProps()}>
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} {...hg.getRowProps()}>
            {hg.headers.map((h) => (
              <div
                key={h.id}
                {...h.getHeaderProps({
                  'data-column-id': h.column.id,
                  style: h.column.getIsPinned()
                    ? { position: 'sticky', left: h.column.getPinnedOffset(), background: '#fff' }
                    : undefined,
                })}
              >
                {h.column.id}
                <div data-testid={`resize-${h.column.id}`} {...h.getResizeHandleProps(bind)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div {...table.getBodyProps()}>
        <div role="presentation" style={{ height: rowV.totalSize, position: 'relative' }}>
          {rowV.rows.map((vRow) => (
            <div key={vRow.row.id} {...vRow.row.getRowProps({ style: vRow.positionStyle })}>
              {vRow.row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  {...cell.getCellProps({
                    style: cell.column.getIsPinned()
                      ? { position: 'sticky', left: cell.column.getPinnedOffset(), background: '#fff' }
                      : undefined,
                  })}
                >
                  {cell.getValue() as string}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Grid />);
```

`vite preview` serves this built artifact; Playwright loads it via `http://localhost:4173`.

### 3.12 `packages/core/bench/scroll.bench.ts` (final, with the `bench` script wired)

The bench script from phase 1 is finalized here. Run via `pnpm --filter @lynellf/tablekit-core bench`.

### 3.13 README updates

Append a M2 example to `packages/react/README.md`:

```md
## Virtualized + pinned + resizable grid (M2)

\`\`\`tsx
import { useRef } from 'react';
import { useDataTable, useScrollAdapter, useRowVirtualizer, useSizeObserver, useResizeHandle } from '@lynellf/tablekit-react';
import { validateGridStructure } from '@lynellf/tablekit-react/validate';

function Grid({ rows }) {
  const ref = useRef(null);
  const { table } = useDataTable({
    data: rows,
    columns: [{ id: 'name', accessor: 'name' }, { id: 'age', accessor: 'age' }],
    getRowId: r => r.id,
    columnPinning: { left: ['name'] },
  });
  useScrollAdapter(ref, table);
  const rowV = useRowVirtualizer(table);
  useSizeObserver({ gridRef: ref, rowVirtualizer: rowV, columnVirtualizer: table.getCenterVirtualizer() });
  const bind = useResizeHandle(table);

  return (
    <div ref={ref} {...table.getGridProps({ style: { overflow: 'auto', height: 600 } })}>
      {/* headers + virtualized rows as in §6.1 */}
    </div>
  );
}
\`\`\`

For dev builds, validate the structure:

\`\`\`tsx
useEffect(() => {
  const result = validateGridStructure(ref.current);
  if (!result.valid) console.error(result.violations);
}, [ref]);
\`\`\`
```

---

## 4. Commands

```bash
# Run all tests (unit + integration; no Playwright yet)
pnpm verify

# Run the perf bench
pnpm --filter @lynellf/tablekit-core bench

# Run the Playwright APG keyboard suite (requires `pnpm exec playwright install chromium` once)
pnpm --filter @lynellf/tablekit-react exec playwright install chromium
pnpm --filter @lynellf/tablekit-react test:e2e
```

---

## 5. Verification

After this phase:

```bash
# 1. pnpm verify green
pnpm verify                                          # EXIT 0

# 2. Subpath exports all build
pnpm build
ls packages/core/dist/{virtualization,memo,resize,pinning,keyboard-nav}.es.js
ls packages/react/dist/validate.es.js
# Expected: all files exist

# 3. Bundle sizes logged
echo "core gzip: $(gzip -c packages/core/dist/tablekit-core.es.js | wc -c) bytes"
echo "react gzip: $(gzip -c packages/react/dist/tablekit-react.es.js | wc -c) bytes"
echo "subpaths:"
for f in packages/core/dist/{sorting,filtering,pagination,faceting,pipeline,virtualization,memo,resize,pinning,keyboard-nav}.es.js; do
  echo "  $(basename $f): $(gzip -c $f | wc -c) bytes gzip"
done

# 4. Perf bench ≥ 55fps (advisory)
pnpm --filter @lynellf/tablekit-core bench
# Expected: median < 16ms per scroll event

# 5. Integration tests pass
pnpm --filter @lynellf/tablekit-core test            # all M0 + M1 + M2 core tests
pnpm --filter @lynellf/tablekit-react test           # all M0 + M1 + M2 react tests + integration

# 6. Playwright APG suite passes
pnpm --filter @lynellf/tablekit-react test:e2e

# 7. API freeze manifest produced
cat docs/m2-advanced-features/api-freeze.md
```

---

## 6. M2 exit criteria mapping (spec §14)

| Spec criterion | How this plan proves it |
| --- | --- |
| **100k-row scroll budget met** | `packages/core/bench/scroll.bench.ts` runs in CI; reports ms/event on a synthetic 100k × 50 dataset; required ≤ 16ms/event (≥ 55fps). Documented as advisory in the implementation commit; logged in `api-freeze.md` §6. |
| **APG keyboard suite passes** | `packages/react/src/__integration__/keyboard-nav.spec.ts` is a Playwright suite scripted from the §7.5 conformance table. Covers Tab entry, Arrow keys, Home/End, Ctrl+Home/End, PageUp/Down, Tab exit, Enter/F2, Escape. Runs in CI. |
| **Validator ships** | `validateGridStructure(rootEl)` is exported from `@lynellf/tablekit-react/validate`. Every integration test (`virtualized-grid.test.tsx`, `pinned-resize.test.tsx`) calls it after render and asserts `{ valid: true }`. Tree-shaken from production builds (the production bundle exports a `() => ({valid:true,violations:[]})`). |

---

## 7. Final M2 public surface

```ts
// @lynellf/tablekit-core (root) — M2 additions on top of M1
{
  // Virtualization types
  VirtualItem, VirtualRow, RowVirtualizerResult, ColumnVirtualizerResult,
  VirtualizerLike, VirtualizerOptions,
  // Resize helpers
  DEFAULT_RESIZE_STEP_PX, resizeColumn, cancelResize, clampColumnSize, resizeAnnouncement,
  // Pinning helpers
  togglePinColumn, pinColumns, unpinColumns, pinAnnouncement,
  // Keyboard nav helpers
  KEY_BINDINGS, navigateCell, navigateToEdge, navigateByPage, resolveKeyBinding,
}

// @lynellf/tablekit-core/virtualization (subpath, tree-shakeable)
{
  createRowVirtualizer, createColumnVirtualizer,
  getRange, getScrollOffsetForIndex, getTotalSize,
}

// @lynellf/tablekit-core/memo (subpath)
{ RowModelCache, buildMemoKey, memoKeysEqual, buildPipelineRowModel }

// @lynellf/tablekit-core/resize (subpath)
{ resizeColumn, cancelResize, clampColumnSize, resizeAnnouncement, DEFAULT_RESIZE_STEP_PX }

// @lynellf/tablekit-core/pinning (subpath)
{ togglePinColumn, pinColumns, unpinColumns, pinAnnouncement }

// @lynellf/tablekit-core/keyboard-nav (subpath)
{ KEY_BINDINGS, navigateCell, navigateToEdge, navigateByPage, resolveKeyBinding }

// @lynellf/tablekit-react (root) — M2 additions on top of M1
{
  useScrollAdapter, useSizeObserver, useRowVirtualizer, useCenterVirtualizer,
  useResizeHandle, useKeyboardNav,
}

// @lynellf/tablekit-react/validate (subpath, tree-shakeable, dev-only)
{ validateGridStructure, Violation, ValidatorResult }
```

The full freeze manifest is in `docs/m2-advanced-features/api-freeze.md`.

---

## 8. Out-of-scope reminder

M2 does **not** ship `DataSource`, `PivotTable`, worker engine, full announcer polish, `rowSelection`, state persistence, DnD reorder, or split-pane layout. These are explicit non-goals per the spec §14 and the overview §2.5. A reviewer should flag any phase file that includes M3+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D5** — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D1 (built-in virtualizer vs `VirtualizerLike` bridge) and D4 (cell-mode + none-mode vs full treegrid).
2. **§5 phase structure** — confirm sequencing is correct (virtualization → pinning → resize → react adapters → keyboard nav → validator → integration) and each phase's scope is bounded.
3. **Phase 1 (virtualization + memoization)** — `getRowModel` memoization keyed tuple; the `__setScrollState` internal API; the `VirtualizerLike` interface being reserved (not wired in M2).
4. **Phase 2 (pinning offset math)** — `Column.getPinnedOffset` reading `getSize()` via the new `defsById` constructor field; backward compatibility for direct `new Column({...})` callers.
5. **Phase 3 (resize)** — pointer capture in jsdom vs Playwright; `columnResizeMode: 'onChange' | 'onEnd'` semantics; `aria-valuenow` initial value.
6. **Phase 5 (keyboard nav)** — roving tabindex invariant; role downgrade for `navigationMode: 'none'`; `keepMounted` integration with the virtualizer; `__lib_onKeyDown` wiring through `mergeProps`.
7. **Phase 6 (validator)** — dev-only tree-shaking; rule coverage; the `pathFor` helper's assumptions about standard DOM.
8. **Phase 7 (integration + perf)** — Playwright suite coverage of the §7.5 conformance table; perf bench interpretation; API freeze manifest completeness.

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).
