# M5 Pivot Engines Reference App

This example demonstrates both the **Worker Engine** and **Server Engine** from the `@lynellf/tablekit-worker` package.

## Running

```bash
pnpm install
pnpm --filter m5-pivot-engines-example dev
```

Opens at http://localhost:5175

## Worker Engine Tab

Demonstrates off-main-thread pivot computation with a 1M-row synthetic dataset:

- Uses Vite's `?worker` import syntax to create a Web Worker
- Generates 1M rows of deterministic sales data (~80MB structured-clone transfer)
- Shows `setRows` transfer time and warm re-pivot performance

### Vite Worker Recipe

```tsx
import Worker from './worker/pivotWorker?worker';

const engine = createWorkerEngine({
  createWorker: () => new Worker(),
});
await engine.setRows(myRows);
```

The worker file uses `createWorkerEntry()` to set up the worker-side handler.

## Server Engine Tab

Demonstrates server-expansion lazy loading with a mock async API:

- Server is the source of truth (client `data` prop is ignored)
- `computeTopLevel` fetches collapsed row summaries
- `computeChildren` fetches children on demand when expanding rows
- Simulates 200ms top-level + 300ms per-level latency

### Server Engine Pattern

```tsx
import { createServerEngine } from '@lynellf/tablekit-worker/server';

const engine = createServerEngine({
  compute: (q, ctx) => serverApi.computeTopLevel(q, ctx),
  computeChildren: (path, q, ctx) => serverApi.computeChildren(path, q, ctx),
  debounceMs: 50,
});
```

## Performance Notes

- **Cold `setRows`**: ~2-4s for 1M rows on a mid-tier laptop
- **Warm re-pivot**: <1.5s (target per §12 perf budget)
- **Server expansion**: Loading state → loaded on expand click

## Key Files

- `src/worker/pivotWorker.ts` — Worker entry with custom aggregator registration
- `src/data/generateRows.ts` — Deterministic 1M-row data generator
- `src/data/mockServerApi.ts` — Mock async server API
- `src/views/WorkerView.tsx` — Worker engine demo
- `src/views/ServerView.tsx` — Server expansion demo
