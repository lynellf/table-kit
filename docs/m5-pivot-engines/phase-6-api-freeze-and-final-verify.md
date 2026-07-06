# Phase 6 — API freeze + final verify + dev-mode docs

**Goal:** Ship `docs/m5-pivot-engines/api-freeze.md` documenting all M5 additions; reaffirm M0–M4 surface (no removals, no renames, no signature changes); run the full `pnpm verify` aggregate gate; assert the §14 exit criteria are satisfied; update the README at the repo root (if it exists) to mention the new package and example.

**Exit criteria:** `pnpm verify` exits 0 from a fresh clone; `docs/m5-pivot-engines/api-freeze.md` lists all new exports with types and example signatures; the M5 reference app boots and demonstrates both engines; the 1M-row bench runs and logs numbers.

---

## 1. Files to create

### 1.1 `docs/m5-pivot-engines/api-freeze.md`

Mirrors the structure of `docs/m4-pivot-main-thread/api-freeze.md`. Sections:

- **M5 additions (additive; no M0–M4 changes)**
  - New package: `@lynellf/tablekit-worker`
    - Root export (`@lynellf/tablekit-worker`)
    - Subpath: `/protocol`
    - Subpath: `/server`
  - `@lynellf/tablekit-pivot` (additive only): `WirePivotQuery` re-export from `@lynellf/tablekit-worker/protocol` (type-only re-export; pivot does not depend on worker at runtime).
  - `@lynellf/tablekit-react` (additive only): no changes — `usePivotTable` already accepts an `engine` option (M4); the consumer passes `createWorkerEngine(...)` or `createServerEngine(...)` as the value.
- **M0–M4 surface reaffirmed**: list every M0–M4 export category, with "no change".
- **Behavior changes (additive only)**: list the new behaviors introduced by M5 (worker termination semantics, server expansion lazy semantics, etc.).
- **Tests**: ~105-160 new tests on top of M0–M4's ~530.
- **Exit criteria (spec §14)**: 1M-row worker budget + server-expansion reference app.

Example snippet:

```markdown
## M5 additions (additive; no M0–M4 changes)

### New package: `@lynellf/tablekit-worker`

#### Root export (`@lynellf/tablekit-worker`)

- `createWorkerEngine<TRow>(opts): AggregationEngine<TRow>`
- `WorkerEngineOptions` (type)
- `createWorkerEntry(): WorkerEntryHandle`
- `WorkerEntryHandle` (type)
- `validateAggregatorRegistrations(regs: AggregatorRegistration[]): void`
- `validateFilterRegistrations(regs: FilterRegistration[]): void`
- `AggregatorRegistration` (type)
- `FilterRegistration` (type)
- `VERSION = '0.1.0'`

#### Subpath: `@lynellf/tablekit-worker/protocol`

- `WorkerRequest` (type — discriminated union)
- `WorkerResponse` (type — discriminated union)
- `WirePivotQuery` (type — `Omit<PivotQuery, 'rows' | 'inlineAccessors'>`)
- `RequestId` (type — `number`)
- `SerializedError` (type)

#### Subpath: `@lynellf/tablekit-worker/server`

- `createServerEngine<TRow>(opts): AggregationEngine<TRow>`
- `ServerEngineOptions<TRow>` (type)
- `ServerEngineComputeFn<TRow>` (type)
- `ServerEngineComputeChildrenFn<TRow>` (type)
- `createRefetchOrchestrator(opts): RefetchOrchestrator`
- `retryChildren<TRow>(engine, path, q, ctx): Promise<PivotRowNode<TRow>[]>`
- `RefetchOrchestrator` (type — internal; exported for advanced consumers)

### `@lynellf/tablekit-pivot` (additive changes only)

- Type-only re-export: `WirePivotQuery` from `@lynellf/tablekit-worker/protocol` (so consumers building custom engines can import from either package).
- `PivotTableInstance.retryChildren(path: FieldValue[]): Promise<void>` (additive method).

### `@lynellf/tablekit-react` (additive changes only)

- No changes. `usePivotTable` already accepts `engine: AggregationEngine<TRow>` (M4).
```

### 1.2 `README.md` (root, if it exists)

Add a section for M5:

```markdown
## Pivot engines (M5)

`@lynellf/tablekit-worker` provides the worker pivot engine + message protocol
+ tiny in-worker data store, plus a server engine reference factory. See
[`docs/m5-pivot-engines/api-freeze.md`](./api-freeze.md)
for the full surface.

Example app: `examples/m5-pivot-engines/` (Vite + React 19) demonstrates
both the worker engine against a 1M-row synthetic dataset and the server
engine against a mock async API.

```bash
pnpm --filter m5-pivot-engines-example dev  # http://localhost:5175
```
```

If the root README doesn't exist, skip this step. If it exists but doesn't have a similar section for M0–M4, add M5 only (don't backfill).

---

## 2. Files to change

- `README.md` (root): additive M5 section (if README exists).

No file in `packages/` is modified in this phase.

---

## 3. Commands

```bash
# Fresh-clone verification
pnpm install
pnpm verify                                                       # EXIT 0 (the §14 aggregate gate)

# M5-specific verification
pnpm -F @lynellf/tablekit-worker test                             # ~105-160 tests, all green
pnpm -F @lynellf/tablekit-pivot test                              # M4 tests still green
pnpm -F @lynellf/tablekit-react test -- --run pivot               # M4 integration tests still green
pnpm --filter m5-pivot-engines-example build                      # EXIT 0

# Smoke tests for the public surface
node -e "import('@lynellf/tablekit-worker').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-worker/protocol').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-worker/server').then(m => console.log(Object.keys(m).sort()))"

# React pivot hook still works with the worker engine
node -e "import('@lynellf/tablekit-react').then(m => console.log('usePivotTable:', typeof m.usePivotTable))"

# Reference app boot (manual verification)
pnpm --filter m5-pivot-engines-example dev                        # http://localhost:5175

# Perf bench (advisory)
pnpm --filter @lynellf/tablekit-worker bench worker.bench.ts      # Logs numbers
```

---

## 4. Verification

The §14 exit criteria must be satisfied:

| Criterion | Verification |
| --- | --- |
| **1M-row worker budget** | `pnpm --filter @lynellf/tablekit-worker bench` logs numbers; manual smoke in the reference app's "Worker" tab shows a perf badge. |
| **Server-expansion reference app** | `pnpm --filter m5-pivot-engines-example dev` boots the app; manual smoke shows server engine loading → loaded transitions + retry. |
| **Worker engine contract (§9.3)** | `packages/worker/src/__tests__/engine.test.ts` — worker engine produces correct `AggregationEngine<TRow>`. |
| **Server engine contract (§9.5)** | `packages/worker/src/server/__tests__/server.test.ts` — server engine produces correct `AggregationEngine<TRow>` with lazy expansion. |
| **§16 #8 worker DX risk** | `createWorkerEntry()` factory exists; reference app demonstrates the Vite `?worker` recipe. |
| **§13 P3 registry-name enforcement** | `validatePivotQuery` (M4) wired into `createWorkerEngine` and `createServerEngine`; dev warning fires on non-serialized queries. |

---

## 5. Out-of-scope (deferred to M6+)

- Subtletals (`perLevel`) → v1.5.
- Full announcer `messages` map + i18n → M6.
- Screen-reader manual matrix → M6.
- `validateGridStructure` CLI → M6.
- `tabBehavior` option → M6.
- Split-pane recipe → M6.
- `rowSelection`, state persistence helper, global quick filter, column auto-fit → v1.5/v2.
- Hard gate behind `allowWithinPageOperations` → v2.
- Columnar / `Arrow` transfer for `setRows` → v2+.
- Tachometer/mitata CI bench integration → M6.
- Written bundler-recipes doc (Vite/webpack/Rollup/esbuild snippets) → M6 docs.

---

## 6. Risks

- **`pnpm verify` exit on a fresh clone**: the package-lock or pnpm cache must contain all four packages + two examples. Mitigation: `pnpm install` is part of the verification step; if a dep is missing, `pnpm verify` will fail loudly.
- **API freeze drift**: future M6 work may want to add to `WirePivotQuery` (e.g., a `version` field for protocol versioning). Mitigation: the api-freeze document lists `WirePivotQuery` as `Omit<PivotQuery, 'rows' | 'inlineAccessors'>`; any additive change to `PivotQuery` is reflected automatically. A breaking change requires a major version bump.
- **Bench numbers vary across machines**: the bench is advisory; the reference app's perf badge is also advisory. No CI gate.
- **Lefthook pre-push hook**: the new package is picked up automatically by glob filtering; verify by running `pnpm exec lefthook run pre-push` once after phase 6 lands.