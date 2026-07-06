# Phase 4 — Server engine reference factory + `retryChildren` helper + server expansion integration

**Goal:** Ship `createServerEngine({ compute, computeChildren, debounceMs? })` (thin adapter that wraps an async consumer API to satisfy `AggregationEngine<TRow>`); ship `PivotTableInstance.retryChildren(path)` (additive helper on the M4 factory); integrate server expansion into the existing treegrid a11y surface (`aria-busy`, error retry, loading state); integration test that demonstrates `childState: 'notLoaded' → 'loading' → 'loaded'` transitions.

**Exit criteria:** A `createServerEngine` instance produces correct lazy-expansion semantics against a mock async API; `retryChildren(path)` re-invokes `engine.computeChildren(path, currentQuery, ctx)`; the integration test asserts the `aria-busy` and `aria-expanded` attributes appear in the expected states.

---

## 1. Files to create

### 1.1 `packages/worker/src/server/refetchOrchestrator.ts`

Tracks `currentQuery` + `currentExpandedPaths` per engine instance; diffs and dispatches.

```ts
import type { FieldValue, PivotQuery, PivotRowNode } from '@lynellf/tablekit-pivot';

export interface RefetchOrchestratorOptions {
  computeChildren: (path: FieldValue[], q: PivotQuery, ctx: { signal: AbortSignal }) => Promise<PivotRowNode[]>;
  debounceMs?: number;
}

export interface RefetchState {
  /** Path → in-flight or resolved children. */
  cache: Map<string, Promise<PivotRowNode[]>>;
  /** Previous query's expanded paths. */
  prevExpandedPaths: string[];
  /** Previous query signature (used to invalidate paths on query change). */
  prevQueryKey: string;
}

export const createRefetchOrchestrator = (opts: RefetchOrchestratorOptions) => {
  const state: RefetchState = {
    cache: new Map(),
    prevExpandedPaths: [],
    prevQueryKey: '',
  };

  /**
   * Diff the new expanded paths against the previous set; for each path that
   * is newly expanded (or whose query context changed), schedule
   * computeChildren(path, q, ctx).
   */
  const schedule = (q: PivotQuery, ctx: { signal: AbortSignal }) => {
    const queryKey = serializeQueryKey(q);
    const invalidateAll = queryKey !== state.prevQueryKey;
    if (invalidateAll) {
      state.cache.clear();
      state.prevQueryKey = queryKey;
    }

    const current = new Set(q.expandedPaths);
    const prev = new Set(state.prevExpandedPaths);
    state.prevExpandedPaths = q.expandedPaths;

    const toFetch: string[] = [];
    for (const path of current) {
      if (invalidateAll || !prev.has(path) || !state.cache.has(path)) {
        toFetch.push(path);
      }
    }

    const debounce = opts.debounceMs ?? 0;

    for (const path of toFetch) {
      const pathValues = parsePathKey(path);
      const promise = debounce === 0
        ? opts.computeChildren(pathValues, q, ctx)
        : debounced(opts.computeChildren, debounce)(pathValues, q, ctx);
      state.cache.set(path, promise);
    }
  };

  const getChildren = (path: string): PivotRowNode[] | 'loading' | 'notLoaded' | 'error' => {
    const promise = state.cache.get(path);
    if (!promise) return 'notLoaded';
    // Synchronous read of a Promise state is not possible; the consumer reads via `await getChildrenAsync(path)`.
    return 'loading';
  };

  const getChildrenAsync = async (path: string): Promise<PivotRowNode[]> => {
    const promise = state.cache.get(path);
    if (!promise) throw new Error(`Path "${path}" not in expansion set; cannot fetch children.`);
    return promise;
  };

  return { schedule, getChildren, getChildrenAsync, __state: state };
};
```

`serializeQueryKey(q)` produces a stable string from the query's serialized parts (excluding `rows` which is server-known and `expandedPaths` which is handled separately).

### 1.2 `packages/worker/src/server/createServerEngine.ts`

```ts
import type {
  AggregationEngine,
  FieldValue,
  PivotQuery,
  PivotResult,
  PivotRowNode,
} from '@lynellf/tablekit-pivot';
import { validatePivotQuery } from '@lynellf/tablekit-pivot/serialize';
import { createRefetchOrchestrator } from './refetchOrchestrator';

export interface ServerEngineComputeFn<TRow = unknown> {
  (q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>>;
}

export interface ServerEngineComputeChildrenFn<TRow = unknown> {
  (path: Array<FieldValue>, q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotRowNode<TRow>[]>;
}

export interface ServerEngineOptions<TRow = unknown> {
  /** Returns the collapsed top level (plus grand totals). */
  compute: ServerEngineComputeFn<TRow>;
  /** Resolves children of a path for lazy expansion. */
  computeChildren: ServerEngineComputeChildrenFn<TRow>;
  /** Debounce per-path fetches (ms). Default 0 = no debounce. */
  debounceMs?: number;
}

export const createServerEngine = <TRow = unknown>(
  opts: ServerEngineOptions<TRow>,
): AggregationEngine<TRow> => {
  const orchestrator = createRefetchOrchestrator({
    computeChildren: opts.computeChildren,
    debounceMs: opts.debounceMs,
  });

  return {
    async compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): Promise<PivotResult<TRow>> {
      validatePivotQuery(q as PivotQuery); // M4 dev warning
      const topLevel = await opts.compute(q, ctx);
      orchestrator.schedule(q, ctx);
      // Merge loaded children into the tree.
      const merged = await mergeChildren(topLevel, orchestrator);
      return merged;
    },

    async computeChildren(
      path: Array<FieldValue>,
      q: PivotQuery<TRow>,
      ctx: { signal: AbortSignal },
    ): Promise<PivotRowNode<TRow>[]> {
      return opts.computeChildren(path, q, ctx);
    },

    dispose() {
      orchestrator.__state.cache.clear();
    },
  };
};

/**
 * Walk the tree; for each node whose path is in the orchestrator's cache,
 * await its children and merge them into the tree. Nodes whose path is
 * loading or not present get `childState: 'notLoaded'` (default from server).
 */
const mergeChildren = async <TRow>(
  result: PivotResult<TRow>,
  orchestrator: ReturnType<typeof createRefetchOrchestrator>,
): Promise<PivotResult<TRow>> => {
  const walk = async (node: PivotRowNode<TRow>): Promise<PivotRowNode<TRow>> => {
    const pathKey = node.key;
    const promise = orchestrator.__state.cache.get(pathKey);
    if (!promise) return node;
    try {
      const children = await promise;
      return { ...node, childState: 'loaded', children: await Promise.all(children.map(walk)) };
    } catch (err) {
      return { ...node, childState: 'error', error: err as Error };
    }
  };
  return {
    ...result,
    rowRoot: await walk(result.rowRoot),
  };
};
```

### 1.3 `packages/worker/src/server/retry.ts`

```ts
import type { AggregationEngine, FieldValue, PivotQuery, PivotRowNode } from '@lynellf/tablekit-pivot';

/**
 * Re-invoke `computeChildren` for a path that previously errored.
 * Used by `PivotTableInstance.retryChildren(path)` (M5 additive API).
 */
export const retryChildren = async <TRow>(
  engine: AggregationEngine<TRow>,
  path: Array<FieldValue>,
  q: PivotQuery<TRow>,
  ctx: { signal: AbortSignal },
): Promise<PivotRowNode<TRow>[]> => {
  if (!engine.computeChildren) {
    throw new Error('Engine does not implement computeChildren; retryChildren is a no-op.');
  }
  return engine.computeChildren(path, q, ctx);
};
```

### 1.4 `packages/worker/src/server/index.ts`

```ts
export { createServerEngine } from './createServerEngine';
export type { ServerEngineOptions, ServerEngineComputeFn, ServerEngineComputeChildrenFn } from './createServerEngine';
export { retryChildren } from './retry';
export { createRefetchOrchestrator } from './refetchOrchestrator';
```

### 1.5 `packages/worker/src/server/__tests__/server.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { createServerEngine } from '../createServerEngine';
import type { PivotQuery, PivotResult, PivotRowNode } from '@lynellf/tablekit-pivot';

describe('createServerEngine', () => {
  it('returns collapsed top-level result', async () => {
    const topLevel: PivotResult = { /* fixture */ };
    const engine = createServerEngine({
      compute: vi.fn().mockResolvedValue(topLevel),
      computeChildren: vi.fn(),
    });
    const result = await engine.compute(query, { signal: new AbortController().signal });
    expect(result).toBe(topLevel); // no children loaded
  });

  it('schedules computeChildren for expanded paths', async () => {
    const computeChildren = vi.fn().mockResolvedValue([/* children */]);
    const engine = createServerEngine({
      compute: vi.fn().mockResolvedValue({ /* topLevel with 1 rowRoot child */ }),
      computeChildren,
    });
    await engine.compute({ ...query, expandedPaths: ['["West"]'] }, { signal: new AbortController().signal });
    expect(computeChildren).toHaveBeenCalledWith(['West'], expect.any(Object), expect.any(Object));
  });

  it('refetches on query change (sort/filter/measure)', async () => {
    const computeChildren = vi.fn().mockResolvedValue([]);
    const engine = createServerEngine({ compute: vi.fn().mockResolvedValue({ /* ... */ }), computeChildren });
    await engine.compute({ ...query, expandedPaths: ['["West"]'], pivotSorting: [{ level: 0, by: 'label', desc: true }] }, { signal: new AbortController().signal });
    const callCount1 = computeChildren.mock.calls.length;
    await engine.compute({ ...query, expandedPaths: ['["West"]'], pivotSorting: [{ level: 0, by: 'label', desc: false }] }, { signal: new AbortController().signal });
    expect(computeChildren.mock.calls.length).toBeGreaterThan(callCount1);
  });

  it('error path produces childState: "error" on the node', async () => {
    const computeChildren = vi.fn().mockRejectedValue(new Error('Network error'));
    const engine = createServerEngine({ compute: vi.fn().mockResolvedValue(/* topLevel with 1 node */), computeChildren });
    const result = await engine.compute({ ...query, expandedPaths: ['["West"]'] }, { signal: new AbortController().signal });
    expect(result.rowRoot.children![0].childState).toBe('error');
  });

  it('aborts in-flight compute on signal', async () => {
    const compute = vi.fn().mockImplementation((_q, ctx) => new Promise((_, reject) => {
      ctx.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const engine = createServerEngine({ compute, computeChildren: vi.fn() });
    const controller = new AbortController();
    const promise = engine.compute(query, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});
```

### 1.6 `packages/worker/src/server/__tests__/retry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { retryChildren } from '../retry';

describe('retryChildren', () => {
  it('re-invokes computeChildren', async () => {
    const engine = { computeChildren: vi.fn().mockResolvedValue([]) };
    await retryChildren(engine, ['West'], query, { signal: new AbortController().signal });
    expect(engine.computeChildren).toHaveBeenCalledWith(['West'], query, expect.any(Object));
  });

  it('throws on engine without computeChildren', async () => {
    const engine = {};
    await expect(retryChildren(engine, ['West'], query, { signal: new AbortController().signal })).rejects.toThrow();
  });
});
```

### 1.7 `packages/pivot/src/pivotTable/factory.ts` (additive)

Add `retryChildren(path)` method to `PivotTableInstance`:

```ts
// In createPivotTable's returned object:
retryChildren(path: Array<FieldValue>): Promise<void> {
  const currentQuery = buildPivotQuery(/* current state */);
  return retryChildren(this.engine, path, currentQuery, { signal: new AbortController().signal })
    .then((children) => {
      // Merge into the tree; trigger a state change.
      this.__mergeChildren(path, children);
    });
}
```

This is an additive change. The M4 factory file grows by ~30 lines.

### 1.8 `packages/react/src/__integration__/pivot-server-expansion.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePivotTable } from '@lynellf/tablekit-react';
import { createServerEngine } from '@lynellf/tablekit-worker/server';
import { validateGridStructure } from '@lynellf/tablekit-react/validate';

describe('pivot server expansion integration', () => {
  it('renders collapsed top level with aria-expanded on rows with children', async () => {
    const engine = createServerEngine({ compute, computeChildren: vi.fn() });
    const Pivot = () => {
      const { pivot, getGridProps, getRowProps, getToggleExpandedProps } = usePivotTable({ data, config: { rows: ['region'], columns: [], measures: [{ id: 'rev', field: 'revenue' }] }, engine });
      return /* JSX */;
    };
    render(<Pivot />);
    await waitFor(() => expect(screen.getByRole('treegrid')).toBeInTheDocument());
    const treegrid = screen.getByRole('treegrid');
    expect(validateGridStructure(treegrid, { valid: true }).valid).toBe(true);
    const expandedRows = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-expanded') !== null);
    expect(expandedRows.length).toBeGreaterThan(0);
  });

  it('clicking expander triggers loading then loaded state', async () => {
    const computeChildren = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve([/* children */]), 50)));
    const engine = createServerEngine({ compute, computeChildren });
    const Pivot = () => { /* ... */ };
    render(<Pivot />);
    const expander = screen.getByLabelText(/expand West/i);
    await userEvent.click(expander);
    expect(screen.getByRole('row', { name: /West/ }).getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(screen.getByRole('row', { name: /West/ }).getAttribute('aria-busy')).toBe('false'));
  });

  it('error retry via retryChildren button', async () => {
    let attempt = 0;
    const computeChildren = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve([]);
    });
    const engine = createServerEngine({ compute, computeChildren });
    // ... render, click expander, expect error state, click retry, expect loaded ...
  });
});
```

The integration test file is a new addition to `packages/react/` and is the second server-expansion test in the project (the first is M4's treegrid test which doesn't exercise the server expansion path).

---

## 2. Files to change

- `packages/pivot/src/pivotTable/factory.ts`: additive `retryChildren` method (~30 lines).
- `packages/pivot/src/pivotTable/index.ts`: export `retryChildren` if it's exposed from the factory.
- `packages/react/src/__integration__/pivot-server-expansion.test.tsx`: new file.

---

## 3. Commands

```bash
pnpm -F @lynellf/tablekit-worker typecheck                         # EXIT 0
pnpm -F @lynellf/tablekit-worker test -- --run server              # ~5-7 tests, all green
pnpm -F @lynellf/tablekit-worker test -- --run retry               # ~2 tests, all green
pnpm -F @lynellf/tablekit-pivot test                               # M4 tests still green
pnpm -F @lynellf/tablekit-react test -- --run pivot-server-expansion  # ~3 tests, all green
pnpm verify                                                       # EXIT 0
```

---

## 4. Verification

```bash
# Server engine smoke
node -e "import('@lynellf/tablekit-worker/server').then(m => console.log(Object.keys(m).sort()))"
# Expected: ['createRefetchOrchestrator', 'createServerEngine', 'retryChildren']

# React integration test (server expansion)
pnpm -F @lynellf/tablekit-react test -- --run pivot-server-expansion
```

---

## 5. Out-of-scope (deferred to later phases)

- Reference app with mock async API → phase 5.
- 1M-row perf bench (worker) → phase 5.
- `tabBehavior` option → M6.
- Split-pane recipe → M6.

---

## 6. Risks

- **Refetch storm on rapid config change**: a consumer dragging a "sort by" slider could fire N `computeChildren` requests in a second. Mitigation: `debounceMs` (default 0) lets the consumer tune; reference impl uses 0 and is documented as "tune if your consumer fires many query changes".
- **Server expansion memory**: the orchestrator cache grows unboundedly if the consumer expands every path. Mitigation: dispose is exposed; the consumer can call `engine.dispose()` on unmount. The reference app demonstrates this pattern.
- **`retryChildren` API surface**: added to `PivotTableInstance`; existing consumers don't see it (additive). TypeScript widening: `PivotTableInstance<TRow>` gets a new optional method. No breaking change.
- **`mergeChildren` is async-walked**: the current impl walks the tree depth-first, awaiting each branch. For very deep trees this could be slow. Mitigation: phase 5's bench measures; if needed, M6+ explores parallel walk via `Promise.all`.