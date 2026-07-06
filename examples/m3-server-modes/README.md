# M3 Server Modes Reference App

This example demonstrates the four M3 server mode patterns and the mixed-mode trap.

## Patterns

1. **Server pagination only**: The server controls pagination; client renders pages.
2. **Server pagination + server sort**: Both pagination and sorting are handled by the server.
3. **Server pagination + server filter**: Pagination with server-side filtering.
4. **Mixed-mode trap**: Server pagination with client-side sort/filter (without `allowWithinPageOperations`).

## Running

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 to see the example.

## Perf Badge

The "§12 perf budget" tab measures the time between consecutive successful fetches using `performance.now()`. A value under 16ms indicates the render is within the §12 budget ("render new page < 16ms after data arrives").

Note: This measurement captures the interval between fetches, not the exact render time after data arrives. A follow-up polish (M6) could use `performance.mark` + `performance.measure` for more accurate timing.
