# Phase 1 — Pivot Package Scaffold + Types + State Helper Widening

**Goal:** Stand up the `@lynellf/tablekit-pivot` package (per spec §3 dependency direction `pivot → core`), define all spec §9.1 types (`PivotConfig`, `FieldRef`, `MeasureDef`, `PivotFilter`, `PivotQuery`, `PivotState`, `PivotTableState`), define the `Aggregator` interface, and widen M0's controlled-slice helpers (`applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices`) to a generic over `TState extends Record<string, unknown>` so `createPivotTable` can reuse them.

After this phase:

- `packages/pivot/` is a real workspace package with `package.json`, `tsconfig.json`, `vite.config.ts`, `vite.subpaths.config.mjs`, `src/index.ts`.
- The package peer-depends on `@lynellf/tablekit-core`; `@lynellf/tablekit-react` adds `@lynellf/tablekit-pivot` as an **optional** peer dep (per §6 risk #11).
- `pnpm verify` is green after this phase; `pnpm -F @lynellf/tablekit-pivot build` produces the root subpath build.
- All §9.1 types are exported and unit-tested.
- M0/M1/M2/M3 tests still pass (no behavioral change; only generic widening).

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/pivot/package.json` | Package manifest + subpath exports map |
| `packages/pivot/tsconfig.json` | TS config extending root `tsconfig.base.json`; project refs `core` + `react` |
| `packages/pivot/vite.config.ts` | Single ESM library build to `dist/tablekit-pivot.es.js` |
| `packages/pivot/vite.subpaths.config.mjs` | Multi-entry subpath build (mirrors core pattern) |
| `packages/pivot/src/index.ts` | Root barrel — re-exports types + factory stub (factory stub is a `throw` placeholder until phase 4) |
| `packages/pivot/src/types.ts` | All spec §9.1 types + helper type aliases |
| `packages/pivot/src/aggregators/types.ts` | `Aggregator<TIn, TAcc, TOut>` interface (the seam for built-ins, registry, engine) |
| `packages/pivot/src/aggregators/index.ts` | Aggregator barrel stub (registry impl lands in phase 2) |
| `packages/pivot/src/engine/index.ts` | Engine barrel stub (interface declared, main-thread impl in phase 3) |
| `packages/pivot/src/pivotTable/index.ts` | PivotTable barrel stub (factory impl in phase 4) |
| `packages/pivot/src/serialize/index.ts` | Serialize barrel stub (`buildPivotQuery` / `validatePivotQuery` in phase 6 + M5 plumbing) |
| `packages/pivot/src/__tests__/types.test.ts` | Type tests for §9.1 types (compilation + runtime shape) |
| `packages/pivot/src/__tests__/aggregatorInterface.test.ts` | Interface shape tests (type-only + runtime no-op) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/core/src/state.ts` | Widen `applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices` to a generic over `TState extends Record<string, unknown>`; existing callers infer `TState = DataTableState` unchanged |
| `packages/core/src/index.ts` | No change to exports; comments updated to mention M4 generic widening |
| `packages/react/package.json` | Add `@lynellf/tablekit-pivot` as **optional** peer dep (under `peerDependenciesMeta.pivot.optional: true`) |
| `package.json` (root) | Add `pnpm -F @lynellf/tablekit-pivot build` to the `build` script (after `pnpm -F @lynellf/tablekit-react build:subpaths`) |
| `packages/react/vite.subpaths.config.mjs` | No code change; verify the subpath build still succeeds after peer-dep addition |

No source code outside `state.ts` is touched in this phase. The aggregator registry impl (phase 2), engine impl (phase 3), factory impl (phase 4), and React hook impl (phase 5) land later.

---

## 3. File contents (key files)

### 3.1 `packages/pivot/package.json`

```json
{
  "name": "@lynellf/tablekit-pivot",
  "version": "0.1.0",
  "private": false,
  "description": "Framework-free PivotTable config, main-thread aggregation engine, and treegrid rendering primitives.",
  "type": "module",
  "main": "./dist/tablekit-pivot.es.js",
  "module": "./dist/tablekit-pivot.es.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/tablekit-pivot.es.js"
    },
    "./aggregators": {
      "types": "./dist/aggregators/index.d.ts",
      "import": "./dist/aggregators/index.es.js"
    },
    "./engine": {
      "types": "./dist/engine/index.d.ts",
      "import": "./dist/engine/index.es.js"
    },
    "./pivotTable": {
      "types": "./dist/pivotTable/index.d.ts",
      "import": "./dist/pivotTable/index.es.js"
    },
    "./serialize": {
      "types": "./dist/serialize/index.d.ts",
      "import": "./dist/serialize/index.es.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/lynellf/tablekit"
  },
  "bugs": {
    "url": "https://github.com/lynellf/tablekit/issues"
  },
  "homepage": "https://github.com/lynellf/tablekit",
  "keywords": ["table", "headless", "pivot", "data-grid", "aggregation"],
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "build": "vite build",
    "build:subpaths": "node vite.subpaths.config.mjs",
    "typecheck": "tsc -b"
  },
  "peerDependencies": {
    "@lynellf/tablekit-core": ">=0.2.0"
  },
  "devDependencies": {
    "@lynellf/tablekit-core": "workspace:*"
  }
}
```

### 3.2 `packages/pivot/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../core" }
  ]
}
```

### 3.3 `packages/pivot/vite.config.ts`

```ts
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { peerDependencies = {}, dependencies = {} } = require('./package.json');

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TableKitPivot',
      formats: ['es'],
      fileName: () => 'tablekit-pivot.es.js',
    },
    rollupOptions: {
      external: [...Object.keys(peerDependencies), ...Object.keys(dependencies)],
      output: { inlineDynamicImports: true },
    },
  },
});
```

### 3.4 `packages/pivot/vite.subpaths.config.mjs`

Mirrors `packages/core/vite.subpaths.config.mjs` structurally:

```js
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { peerDependencies = {}, dependencies = {} } = require('./package.json');

const src = resolve(__dirname, 'src');
const dist = resolve(__dirname, 'dist');

const subpaths = [
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-pivot.es.js' },
  { entry: resolve(src, 'aggregators/index.ts'), outFile: 'aggregators/index.es.js' },
  { entry: resolve(src, 'engine/index.ts'), outFile: 'engine/index.es.js' },
  { entry: resolve(src, 'pivotTable/index.ts'), outFile: 'pivotTable/index.es.js' },
  { entry: resolve(src, 'serialize/index.ts'), outFile: 'serialize/index.es.js' },
];

const baseConfig = {
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: [...Object.keys(peerDependencies), ...Object.keys(dependencies)],
      output: { inlineDynamicImports: true },
    },
  },
};

for (let i = 0; i < subpaths.length; i++) {
  const { entry, outFile } = subpaths[i];
  await build(
    defineConfig({
      ...baseConfig,
      build: {
        ...baseConfig.build,
        emptyOutDir: i === 0,
        lib: {
          entry,
          name: 'TableKitPivot',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`✓ Built ${subpaths.length} subpaths into ${dist}`);
```

### 3.5 `packages/pivot/src/types.ts`

```ts
/**
 * @lynellf/tablekit-pivot — public type surface.
 *
 * Spec §9.1: Pivot configuration (PivotConfig, FieldRef, MeasureDef, PivotFilter).
 * Spec §9.3: Aggregation engines (AggregationEngine).
 * Spec §9.4: Result model (PivotResult, PivotColumnNode, PivotRowNode, PivotLeafColumn).
 * Spec §9.6: Totals (TotalsConfig).
 * Spec §9.7: Pivot sorting (PivotSortingState).
 *
 * Source-of-truth mapping to docs/initial-spec.md §9.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive aliases
// ─────────────────────────────────────────────────────────────────────────────

/** The value of a field for a given row (opaque to the engine). */
export type FieldValue = string | number | boolean | null | undefined;

/**
 * Stable identity for a row in the pivot tree. Serialized path form: '["West","Q3"]'.
 * Engine MUST produce identical RowPathKey values for the same path on every
 * compute; consumers rely on this for server expansion / controlled state.
 */
export type RowPathKey = string;

/** Stable identity for a leaf column (column-path × measure). E.g. '["2024"]::sales_sum'. */
export type LeafColumnId = string;

/** Stable identity for a measure. Equal to MeasureDef.id. */
export type MeasureId = string;

// ─────────────────────────────────────────────────────────────────────────────
// Pivot configuration (§9.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reference to a field in the source dataset.
 *
 * String form: just the field name. Object form: name + optional accessor
 * (main-thread only) + label (opaque render slot) + sortComparator (registry
 * name for group-label ordering).
 *
 * Inline accessors are legal on the main-thread engine. Anything crossing a
 * boundary (worker / server) must use the string form (P3).
 */
export type FieldRef<TRow = unknown> =
  | string
  | {
      field: string;
      accessor?: (row: TRow) => FieldValue;
      label?: unknown;
      sortComparator?: string;
    };

/**
 * A measure definition. `aggregator` defaults to 'sum' (spec §9.2) — resolved
 * via the aggregator registry. Inline aggregator objects are legal on the
 * main-thread engine; registry names are required for worker/server (P3).
 */
export interface MeasureDef<TRow = unknown, TIn = unknown, TAcc = unknown, TOut = unknown> {
  id: MeasureId;
  field?: string;
  accessor?: (row: TRow) => TIn;
  aggregator?: string | Aggregator<TIn, TAcc, TOut>;
  label?: unknown;
  /** Opaque format hint passed through to render context (e.g., 'currency', 'percent'). */
  format?: string;
}

/**
 * Pre-aggregation filter on the source dataset. Three shapes:
 *  - `{ field, op, value }` — declarative; server/worker-capable.
 *  - `{ predicate }` — inline function; main-thread only.
 *  - `{ predicateRef, args? }` — registry name; worker/server-capable.
 *
 * Spec §9.1 P3: only registry-name shapes cross a boundary.
 */
export type PivotFilter<TRow = unknown> =
  | { field: string; op: 'equals' | 'in' | 'notIn' | 'range' | 'contains'; value: unknown }
  | { predicate: (row: TRow) => boolean }
  | { predicateRef: string; args?: unknown };

/** Totals configuration (§9.6). */
export interface TotalsConfig {
  /** Render the grand-total row in the footer rowgroup. Default: true. */
  grandTotalRow?: boolean;
  /** Render the grand-total column (one leaf per measure, right-pinned by default). Default: true. */
  grandTotalColumn?: boolean;
  /** Position of the grand-total column within the leafColumns array. Default: 'end'. */
  grandTotalColumnPosition?: 'start' | 'end';
  /** Subtotals per group level. M4 honors 'none' only; 'perLevel' is v1.5. Default: 'none'. */
  subtotals?: 'none' | 'perLevel';
}

/** Top-level pivot configuration (§9.1). */
export interface PivotConfig<TRow = unknown> {
  rows: Array<FieldRef<TRow>>;
  columns: Array<FieldRef<TRow>>;
  measures: Array<MeasureDef<TRow>>;
  filters?: Array<PivotFilter<TRow>>;
  totals?: TotalsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pivot state (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Expansion state: a map of RowPathKey → expanded boolean. */
export type PivotExpansionState = Record<RowPathKey, boolean>;

/**
 * Pivot sorting (§9.7). Per-level ordering within each parent.
 *
 * - `{ by: 'label' }` orders groups by their label (uses field's `sortComparator`).
 * - `{ by: 'measure', measureId, columnPath? }` orders groups by a measure value
 *   (optionally under a specific column path).
 */
export type PivotSortingState = Array<
  | {
      level: number;
      by: 'label';
      desc: boolean;
      comparator?: string;
    }
  | {
      level: number;
      by: 'measure';
      measureId: MeasureId;
      columnPath?: Array<FieldValue>;
      desc: boolean;
    }
>;

/**
 * Pivot state. Shares `columnPinning`, `columnSizing`, `columnSizingInfo`, and
 * `focusedCell` with DataTableState. The pivot-specific slices are:
 * - `pivot`: the PivotConfig (controlled/uncontrolled).
 * - `expanded`: Record<RowPathKey, boolean>.
 * - `pivotSorting`: Array<{ level, by, … }>.
 */
export interface PivotTableState {
  pivot: PivotConfig;
  expanded: PivotExpansionState;
  pivotSorting: PivotSortingState;
  columnPinning: import('@lynellf/tablekit-core').ColumnPinningState;
  columnSizing: import('@lynellf/tablekit-core').ColumnSizingState;
  columnSizingInfo: import('@lynellf/tablekit-core').ColumnResizeSession | null;
  focusedCell: import('@lynellf/tablekit-core').CellPosition | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator interface (§9.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reducer-shaped aggregator. `merge` is REQUIRED so that worker/server engines
 * can aggregate chunks in parallel and merge, and so that subtotals and grand
 * totals are merges of child accumulators rather than re-scans (spec §9.2).
 *
 * - `init()` returns the zero value for the accumulator.
 * - `accumulate(acc, value, row?)` folds one value into the accumulator.
 * - `merge(a, b)` combines two accumulators of the same shape.
 * - `finalize?(acc)` converts the accumulator to the output value (default: identity).
 *
 * Built-ins (phase 2): `sum`, `count`, `min`, `max`, `avg` (as a mergeable
 * `{sum, count}` pair).
 */
export interface Aggregator<TIn = unknown, TAcc = unknown, TOut = unknown> {
  init(): TAcc;
  accumulate(acc: TAcc, value: TIn, row?: unknown): TAcc;
  /** Required: combines two accumulators. */
  merge(a: TAcc, b: TAcc): TAcc;
  /** Optional: converts accumulator to output value. Default: identity. */
  finalize?(acc: TAcc): TOut;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation engine interface (§9.3)
// ─────────────────────────────────────────────────────────────────────────────

/** MaybePromise utility, mirror of dataSource's MaybePromise. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * The aggregation engine seam. M4 ships only the main-thread implementation;
 * worker and server engines are M5.
 *
 * - `compute(q, ctx)` returns the full PivotResult for the given query, with
 *   children materialized only for paths in `q.expandedPaths` (lazy expansion).
 * - `computeChildren?(path, q, ctx)` materializes children of an already-aggregated
 *   node. Required for server expansion (M5); main-thread engine provides it.
 * - `dispose?()` cleans up engine resources (e.g., worker termination). M4's
 *   main-thread engine has nothing to dispose.
 */
export interface AggregationEngine<TRow = unknown> {
  compute(q: PivotQuery<TRow>, ctx: { signal: AbortSignal }): MaybePromise<PivotResult<TRow>>;
  computeChildren?(
    path: Array<FieldValue>,
    q: PivotQuery<TRow>,
    ctx: { signal: AbortSignal },
  ): MaybePromise<PivotRowNode<TRow>[]>;
  dispose?(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialized query (worker/server boundary, §9.3 P3)
// ─────────────────────────────────────────────────────────────────────────────

/** Serialized FieldRef — registry names only, no inline functions. */
export interface SerializedFieldRef {
  field: string;
  label?: unknown;
  sortComparator?: string;
}

/** Serialized MeasureDef — aggregator is a registry name only. */
export interface SerializedMeasureDef {
  id: MeasureId;
  field?: string;
  aggregator: string; // REQUIRED name; 'sum' is the default
  label?: unknown;
  format?: string;
}

/** Serialized PivotFilter — only registry-name shapes cross the boundary. */
export type SerializedPivotFilter =
  | { field: string; op: 'equals' | 'in' | 'notIn' | 'range' | 'contains'; value: unknown }
  | { predicateRef: string; args?: unknown };

/**
 * The query that travels to the engine. Always serializable when crossing a
 * worker/server boundary; inline forms are accepted by the main-thread engine.
 *
 * `rows` is the source dataset (M5 workers cache it on the worker side; M4
 * always passes it through `PivotQuery`).
 */
export interface PivotQuery<TRow = unknown> {
  rows: TRow[];
  rowsFieldRef: Array<SerializedFieldRef>;
  columnsFieldRef: Array<SerializedFieldRef>;
  measures: Array<SerializedMeasureDef>;
  filters: Array<SerializedPivotFilter>;
  totals: TotalsConfig;
  expandedPaths: Array<RowPathKey>;
  pivotSorting: PivotSortingState;
  /** Inline form for main-thread engine only; stripped when crossing boundary. */
  inlineAccessors?: {
    rows?: Array<{ field: string; accessor?: (row: TRow) => FieldValue }>;
    columns?: Array<{ field: string; accessor?: (row: TRow) => FieldValue }>;
    measures?: Array<{ id: MeasureId; accessor?: (row: TRow) => unknown }>;
    filters?: Array<{ predicate?: (row: TRow) => boolean }>;
    aggregators?: Record<MeasureId, Aggregator>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Result model (§9.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A leaf column — column-path × measure. The flattened render order
 * (including the totals column) is `leafColumns`.
 */
export interface PivotLeafColumn<TRow = unknown> {
  id: LeafColumnId;
  /** Path of column-field values that lead to this leaf. Empty array when `columns` is empty. */
  path: Array<FieldValue>;
  measureId: MeasureId;
  /** True when this is a grand-total column leaf. */
  isTotal: boolean;
  /** Width in pixels (consumer-controlled; default 100). */
  size: number;
  /** Header text (render slot; opaque to core). */
  header: unknown;
  /** Optional pinned side (grand-total column defaults to 'right'). */
  pinned?: 'left' | 'right';
}

/**
 * A node in the column hierarchy. Leaves have `leafColumns` only; branches
 * have `children` and a computed `colSpan` for `aria-colspan` emission.
 */
export interface PivotColumnNode {
  /** Unique id (column-path + field). */
  id: string;
  /** Path of column-field values leading to this node. */
  path: Array<FieldValue>;
  /** Field value at this level (the label key). */
  label: FieldValue;
  /** Number of leaf columns under this node (for `aria-colspan`). */
  colSpan: number;
  /** When `children` is empty, this is a leaf (branches always have `leaves`). */
  leaves?: Array<PivotLeafColumn>;
  children?: Array<PivotColumnNode>;
}

/**
 * A node in the row tree. Children are populated lazily based on `expandedPaths`.
 *
 * `childState` semantics:
 *  - 'loaded': children materialized.
 *  - 'notLoaded': path NOT in `expandedPaths`; engine returned aggregated
 *    values but did not enumerate children.
 *  - 'loading' / 'error': reserved for M5 server expansion (main-thread engine
 *    never returns these states).
 */
export interface PivotRowNode<TRow = unknown> {
  key: RowPathKey;
  path: Array<FieldValue>;
  level: number;
  label: FieldValue;
  hasChildren: boolean;
  childState: 'loaded' | 'notLoaded' | 'loading' | 'error';
  /** Materialized children. Absent when `childState === 'notLoaded'`. */
  children?: Array<PivotRowNode<TRow>>;
  /** Per-leaf-column finalized values. */
  values: Record<LeafColumnId, unknown>;
  /** Per-measure row totals (feeds the grand-total column). */
  rowTotals: Record<MeasureId, unknown>;
  /** Engine-specific error when `childState === 'error'`. */
  error?: Error;
}

/**
 * Top-level engine result. `rowRoot` is a synthetic root; its children are
 * the level-0 groups. `grandTotals` feeds the footer row.
 */
export interface PivotResult<TRow = unknown> {
  columnRoot: PivotColumnNode;
  leafColumns: Array<PivotLeafColumn<TRow>>;
  rowRoot: PivotRowNode<TRow>;
  grandTotals: Record<LeafColumnId, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PivotTable instance interface (placeholder; full surface lands in phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/** Imperative facade. Full surface in phase 4. */
export interface PivotTableInstance<TRow = unknown> {
  getState(): PivotTableState;
  setOptions(options: PivotTableOptions<TRow>): void;
  subscribe(listener: () => void): () => void;
  getResult(): PivotResult<TRow>;
  getVisibleRows(): Array<PivotRowNode<TRow>>;
  getHeaderRows(): Array<Array<{ node: PivotColumnNode | PivotLeafColumn; colSpan: number }>>;
  getLeafColumns(): Array<PivotLeafColumn<TRow>>;
  setPivot(updater: import('@lynellf/tablekit-core').Updater<PivotConfig<TRow>>): void;
  setExpanded(updater: import('@lynellf/tablekit-core').Updater<PivotExpansionState>): void;
  toggleExpanded(path: Array<FieldValue>): void;
  setPivotSorting(updater: import('@lynellf/tablekit-core').Updater<PivotSortingState>): void;
  announce(message: string, politeness?: 'polite' | 'assertive'): void;
}

/** Options accepted by `createPivotTable`. Full surface in phase 4. */
export interface PivotTableOptions<TRow = unknown> {
  data: TRow[];
  pivot: PivotConfig<TRow> | ((opts: { data: TRow[] }) => PivotConfig<TRow>);
  initialState?: Partial<PivotTableState>;
  state?: Partial<PivotTableState>;
  onPivotChange?: import('@lynellf/tablekit-core').Updater<PivotConfig<TRow>>;
  onExpandedChange?: import('@lynellf/tablekit-core').Updater<PivotExpansionState>;
  onPivotSortingChange?: import('@lynellf/tablekit-core').Updater<PivotSortingState>;
  onStateChange?: import('@lynellf/tablekit-core').Updater<PivotTableState>;
  /** Aggregation engine. Default: `createMainThreadEngine()`. */
  engine?: AggregationEngine<TRow>;
  /** Announcer. Default: `getGlobalAnnouncer()` (set by ReactAnnouncer in M1). */
  announcer?: import('@lynellf/tablekit-core').Announcer;
  /** getRowId for the source dataset. Default: index-based dev fallback (warning in M4). */
  getRowId?: (row: TRow, index: number) => string;
}
```

### 3.6 `packages/pivot/src/aggregators/types.ts`

```ts
/**
 * @lynellf/tablekit-pivot/aggregators — Aggregator interface (phase 1).
 *
 * Spec §9.2: reducer-shaped aggregators with required `merge` for worker/server
 * engines. The registry, built-ins, and `nameOfAggregator` reverse lookup land
 * in phase 2.
 *
 * Re-exported from `packages/pivot/src/types.ts` for consumer convenience;
 * imported directly from `/aggregators` for tree-shakeable aggregator-only usage.
 */

export type { Aggregator } from '../types';
```

### 3.7 `packages/pivot/src/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot — framework-free PivotTable primitives.
 *
 * M4 phase 1 surface (types only — implementations land in phases 2-6):
 *  - Types (§9.1, §9.3, §9.4, §9.6, §9.7)
 *  - Aggregator interface (§9.2)
 *  - PivotTableOptions / PivotTableInstance (factory impl in phase 4)
 *
 * Not yet exported (later phases):
 *  - Built-in aggregators, registry (phase 2)
 *  - createMainThreadEngine (phase 3)
 *  - createPivotTable factory (phase 4)
 *  - buildPivotQuery / validatePivotQuery (phase 6 + M5 plumbing)
 */

export const VERSION = '0.1.0' as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  FieldValue,
  RowPathKey,
  LeafColumnId,
  MeasureId,
  FieldRef,
  MeasureDef,
  PivotFilter,
  TotalsConfig,
  PivotConfig,
  PivotExpansionState,
  PivotSortingState,
  PivotTableState,
  Aggregator,
  MaybePromise,
  AggregationEngine,
  SerializedFieldRef,
  SerializedMeasureDef,
  SerializedPivotFilter,
  PivotQuery,
  PivotLeafColumn,
  PivotColumnNode,
  PivotRowNode,
  PivotResult,
  PivotTableInstance,
  PivotTableOptions,
} from './types';

// ─── Aggregator re-export (interface only in phase 1) ────────────────────────
export type { Aggregator as AggregatorType } from './aggregators/types';

// ─── Engine + factory + serialize placeholders (impl in later phases) ────────
//
// In phase 1 these are empty barrels so the subpath build succeeds.
// Each phase replaces the barrel contents without changing the export surface.
export {} from './engine';
export {} from './pivotTable';
export {} from './serialize';
```

### 3.8 `packages/pivot/src/aggregators/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/aggregators — aggregator registry + built-ins (phase 1 stub).
 *
 * Phase 2 ships:
 *  - `registerAggregator`, `getAggregator`, `BUILT_IN_AGGREGATORS`, `builtInAggregators`
 *  - `nameOfAggregator` reverse lookup
 *  - Built-ins: `sum`, `count`, `min`, `max`, `avg`
 *  - `__resetAggregatorRegistryForTests`
 *
 * Phase 1 exports the interface only.
 */

export type { Aggregator } from '../types';
export {} from './builtins'; // populated in phase 2
```

### 3.9 `packages/pivot/src/engine/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/engine — aggregation engine contract + implementations (phase 1 stub).
 *
 * Phase 3 ships:
 *  - `createMainThreadEngine()` factory
 *  - `PivotResultCache` memoization
 *  - Lazy expansion semantics
 */

export type { AggregationEngine, PivotQuery, PivotResult } from '../types';
export {} from './mainThread'; // populated in phase 3
```

### 3.10 `packages/pivot/src/pivotTable/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/pivotTable — createPivotTable factory (phase 1 stub).
 *
 * Phase 4 ships:
 *  - `createPivotTable<TRow>(opts)` factory
 *  - Controlled/uncontrolled slice machinery
 *  - `getVisibleRows` / `getHeaderRows` / `getLeafColumns` derived accessors
 *  - Prop getters (treegrid)
 */

export type { PivotTableInstance, PivotTableOptions, PivotTableState } from '../types';
export {} from './factory'; // populated in phase 4
```

### 3.11 `packages/pivot/src/serialize/index.ts`

```ts
/**
 * @lynellf/tablekit-pivot/serialize — PivotQuery serialization (phase 1 stub).
 *
 * Phase 6 + M5 plumbing ship:
 *  - `buildPivotQuery(state, opts)` — pure PivotConfig → PivotQuery serializer
 *  - `validatePivotQuery(q)` — dev warning on inline aggregator/predicate leaks
 *  - `__resetInlineLeakWarningForTests`
 */

export type { PivotQuery, SerializedFieldRef, SerializedMeasureDef, SerializedPivotFilter } from '../types';
export {} from './query'; // populated in phase 6
export {} from './warnings'; // populated in phase 6
```

### 3.12 `packages/pivot/src/__tests__/types.test.ts`

```ts
/**
 * Phase 1 type tests for spec §9.1 types + the Aggregator interface.
 *
 * Runtime assertions: type shapes compile (type-only), value identities match
 * the spec. Where the type is purely structural, we use `expectTypeOf` (already
 * in dev-deps from M0).
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Aggregator,
  FieldRef,
  MeasureDef,
  PivotConfig,
  PivotFilter,
  PivotTableState,
  TotalsConfig,
} from '../types';

describe('§9.1 PivotConfig types', () => {
  it('FieldRef accepts string form', () => {
    const f1: FieldRef = 'region';
    expect(f1).toBe('region');
    expectTypeOf<FieldRef>().toEqualTypeOf<string | { field: string; accessor?: (row: unknown) => unknown; label?: unknown; sortComparator?: string }>();
  });

  it('FieldRef accepts object form', () => {
    const f2: FieldRef = { field: 'region', accessor: (r: unknown) => (r as { region: string }).region };
    expect(typeof f2).toBe('object');
  });

  it('MeasureDef aggregator defaults to "sum" at runtime', () => {
    const m: MeasureDef = { id: 'sales_sum', field: 'sales' };
    expect(m.aggregator).toBeUndefined(); // engine resolves default 'sum'
  });

  it('PivotFilter discriminated union', () => {
    const f1: PivotFilter = { field: 'region', op: 'equals', value: 'West' };
    const f2: PivotFilter = { predicate: (r: unknown) => Boolean(r) };
    const f3: PivotFilter = { predicateRef: 'inRegion', args: ['West', 'East'] };
    expect(f1.op).toBe('equals');
    expect(typeof f2.predicate).toBe('function');
    expect(f3.predicateRef).toBe('inRegion');
  });

  it('TotalsConfig defaults match §9.6', () => {
    const t: TotalsConfig = {};
    expect(t.grandTotalRow).toBeUndefined(); // engine resolves default true
    expect(t.grandTotalColumn).toBeUndefined();
    expect(t.grandTotalColumnPosition).toBeUndefined();
    expect(t.subtotals).toBeUndefined();
  });

  it('PivotConfig composes FieldRef[] + MeasureDef[] + PivotFilter[]', () => {
    const cfg: PivotConfig = {
      rows: ['region', 'quarter'],
      columns: [],
      measures: [{ id: 'sales_sum', field: 'sales' }],
      filters: [{ field: 'year', op: 'equals', value: 2024 }],
    };
    expect(cfg.rows).toHaveLength(2);
    expect(cfg.measures).toHaveLength(1);
  });
});

describe('§9.2 Aggregator interface', () => {
  it('Aggregator requires merge', () => {
    expectTypeOf<Aggregator>().toHaveProperty('merge');
    expectTypeOf<Aggregator['merge']>().toBeFunction();
  });

  it('Aggregator finalize is optional (default identity)', () => {
    type HasFinalize = Aggregator extends { finalize?: (...args: unknown[]) => unknown } ? true : false;
    const _check: HasFinalize = true;
    expect(_check).toBe(true);
  });

  it('sum-shaped Aggregator at runtime', () => {
    const sum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v,
      merge: (a, b) => a + b,
    };
    expect(sum.init()).toBe(0);
    expect(sum.accumulate(0, 5)).toBe(5);
    expect(sum.merge(3, 7)).toBe(10);
    // finalize is optional; identity behavior
    expect(sum.finalize?.(42)).toBe(42);
  });
});

describe('§4.2 PivotTableState', () => {
  it('has pivot, expanded, pivotSorting, plus shared slices', () => {
    const state: PivotTableState = {
      pivot: { rows: [], columns: [], measures: [] },
      expanded: {},
      pivotSorting: [],
      columnPinning: { left: [], right: [] },
      columnSizing: {},
      columnSizingInfo: null,
      focusedCell: null,
    };
    expect(state.pivot.measures).toEqual([]);
    expect(state.expanded).toEqual({});
  });
});
```

### 3.13 `packages/pivot/src/__tests__/aggregatorInterface.test.ts`

```ts
/**
 * Phase 1 runtime smoke for the Aggregator interface — no built-ins yet (phase 2).
 *
 * Verifies the interface can be implemented by inline aggregator objects.
 */

import { describe, expect, it } from 'vitest';
import type { Aggregator } from '../aggregators/types';

describe('Aggregator (inline, phase 1 smoke)', () => {
  it('inline aggregator on main-thread engine compiles and runs', () => {
    const inlineSum: Aggregator<number, number, number> = {
      init: () => 0,
      accumulate: (acc, v) => acc + v,
      merge: (a, b) => a + b,
      finalize: (acc) => acc,
    };
    expect(inlineSum.init()).toBe(0);
    expect(inlineSum.accumulate(5, 3)).toBe(8);
    expect(inlineSum.merge(2, 4)).toBe(6);
  });
});
```

### 3.14 `packages/core/src/state.ts` (generic widening)

```ts
/**
 * Apply an Updater<T> to a value. Synchronously invokes the function form.
 *
 * Widened in M4 to be generic over the state shape so `createPivotTable` can
 * reuse this helper. The signature is signature-compatible for existing M0/M1/M2/M3
 * callers: TS infers `TState = DataTableState` at the existing call sites.
 */
export const resolveUpdater = <T>(prev: T, updater: Updater<T>): T => {
  return typeof updater === 'function' ? (updater as (old: T) => T)(prev) : updater;
};

/** All slice keys. Stable order = insertion order of DataTableState. */
export type StateSliceKey = keyof DataTableState;

/**
 * Apply an updater to a slice of any state shape. M4 widens this from
 * `DataTableState`-specific to generic `Record<string, unknown>`.
 */
export const applySliceChange = <TState extends Record<string, unknown>, K extends keyof TState>(
  state: TState,
  slice: K,
  updater: Updater<TState[K]>,
): TState => {
  const prev = state[slice];
  const next = resolveUpdater(prev, updater);
  if (Object.is(prev, next)) return state;
  const nextState = { ...state, [slice]: next };
  if (shallowEqual(state, nextState as Record<string, unknown>)) return state;
  return nextState;
};

/**
 * Merge initial + controlled state. M4 generic widening.
 */
export const mergeInitialState = <TState extends Record<string, unknown>>(
  initial: Partial<TState> | undefined,
  controlled: Partial<TState> | undefined,
  defaults: TState,
): TState => {
  return { ...defaults, ...(initial ?? {}), ...(controlled ?? {}) } as TState;
};

/**
 * Determine whether a slice is controlled.
 */
export const isSliceControlled = <TState extends Record<string, unknown>, K extends keyof TState>(
  optionsState: Partial<TState> | undefined,
  slice: K,
): boolean => {
  return optionsState !== undefined && Object.prototype.hasOwnProperty.call(optionsState, slice);
};

/**
 * Return the slice keys present in `optionsState` (i.e., controlled slices).
 */
export const controlledSliceKeys = <TState extends Record<string, unknown>>(
  optionsState: Partial<TState> | undefined,
): Array<keyof TState> => {
  if (!optionsState) return [];
  return Object.keys(optionsState) as Array<keyof TState>;
};

/**
 * Determine whether any of `slices` changed between prev and next (shallow
 * compare on each slice value).
 */
export const stateChangedOnSlices = <TState extends Record<string, unknown>>(
  prev: TState,
  next: TState,
  slices: Array<keyof TState>,
): boolean => {
  for (const slice of slices) {
    if (!Object.is(prev[slice], next[slice])) return true;
  }
  return false;
};
```

**Note on `mergeInitialState`:** the M0 version does not take a `defaults` argument — it derives defaults from `DEFAULT_STATE`. The widening requires an explicit `defaults` so the function is generic over `TState` (not `DataTableState`). The existing M0/M1/M2/M3 callers pass `DEFAULT_STATE` explicitly; behavior is identical. The pivot factory in phase 4 passes `DEFAULT_PIVOT_STATE`.

### 3.15 `package.json` (root) — `build` script update

```diff
- "build": "pnpm build:main && pnpm build:subpaths",
+ "build": "pnpm build:main && pnpm build:subpaths",
```
Where `build:main` becomes `pnpm build:core && pnpm build:react && pnpm build:pivot` and `build:subpaths` becomes `pnpm build:core:subpaths && pnpm build:react:subpaths && pnpm build:pivot:subpaths`. Add:

```diff
+ "build:pivot": "pnpm -F @lynellf/tablekit-pivot build",
+ "build:pivot:subpaths": "node packages/pivot/vite.subpaths.config.mjs",
+ "build:main": "pnpm build:core && pnpm build:react && pnpm build:pivot",
+ "build:subpaths": "pnpm build:core:subpaths && pnpm build:react:subpaths && pnpm build:pivot:subpaths",
```

### 3.16 `packages/react/package.json` — optional peer dep

```diff
+ "peerDependencies": {
+   "@lynellf/tablekit-core": ">=0.2.0",
+   "@lynellf/tablekit-pivot": ">=0.1.0"
+ },
+ "peerDependenciesMeta": {
+   "@lynellf/tablekit-pivot": { "optional": true }
+ },
```

(The existing `@lynellf/tablekit-core` peer dep stays. The `react` peer dep stays.)

---

## 3. Commands

```bash
# From repo root:
pnpm install                                                    # install new workspace package
pnpm -F @lynellf/tablekit-pivot typecheck                       # pivot typecheck
pnpm typecheck                                                  # root typecheck
pnpm lint                                                       # Biome
pnpm test                                                       # all tests (M0/M1/M2/M3 still pass; new pivot tests pass)
pnpm -F @lynellf/tablekit-pivot build                           # pivot ESM build
pnpm -F @lynellf/tablekit-pivot build:subpaths                  # pivot subpath build
pnpm build                                                      # full aggregate build
pnpm verify                                                     # aggregate gate — must exit 0
```

---

## 4. Verification

After this phase, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                     # EXIT 0
pnpm test                                                       # 380 M0/M1/M2/M3 + 25-30 new M4 tests = ~405-410, all green

# Subpath smoke
node -e "import('@lynellf/tablekit-pivot').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/aggregators').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/engine').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/pivotTable').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-pivot/serialize').then(m => console.log(Object.keys(m).sort()))"

# Type tests
pnpm --filter @lynellf/tablekit-pivot test -- --run types
```

Expected phase-1 output for the subpath smoke:

```
@lynellf/tablekit-pivot → ['VERSION']
@lynellf/tablekit-pivot/aggregators → []
@lynellf/tablekit-pivot/engine → []
@lynellf/tablekit-pivot/pivotTable → []
@lynellf/tablekit-pivot/serialize → []
```

(Empty runtime exports are intentional — implementations land in phases 2-6. The types-only exports surface in `Object.keys(m)` once the build resolves `.d.ts`; the runtime barrel returns empty objects until populated.)

---

## 5. Out-of-scope

- Built-in aggregators (`sum`, `count`, `min`, `max`, `avg`) — phase 2.
- Aggregator registry (`registerAggregator`, `getAggregator`, `nameOfAggregator`) — phase 2.
- Property-based merge law tests — phase 2.
- `createMainThreadEngine()` implementation — phase 3.
- Lazy expansion semantics — phase 3.
- `createPivotTable()` factory — phase 4.
- Prop getters (`getGridProps`, `getRowProps`, `getRowHeaderProps`, etc.) — phase 4.
- `usePivotTable` React hook — phase 5.
- Treegrid keyboard additions — phase 5.
- `validateGridStructure` treegrid extensions — phase 5.
- Reference app — phase 6.
- Serialization golden fixtures — phase 6.
- `api-freeze.md` final surface — phase 6.

---

## 6. Risks

- **R1 (generic widening regression):** The M0 helpers' generic widening to `Record<string, unknown>` could subtly change inference at existing call sites. Mitigation: the widening is signature-compatible (TS infers `TState = DataTableState` at every existing call site — `applySliceChange<DataTableState, …>`). Verified by the full M0/M1/M2/M3 test suite remaining green. If TS inference regresses (unlikely), the fix is to add an explicit type parameter at the existing call sites — no signature changes.
- **R10 (`pnpm verify` failure on new package):** If the root `build` script is not updated to include `pnpm -F @lynellf/tablekit-pivot build`, CI breaks. Mitigation: the phase-1 verification checklist explicitly includes the root `package.json` script diff. Phase 6's final verify re-runs `pnpm verify` end-to-end.
- **R11 (react peer dep install warnings):** Adding `@lynellf/tablekit-pivot` as a peer dep to react may surface install-time warnings for consumers who don't install the pivot package. Mitigation: marked `optional: true` in `peerDependenciesMeta`. Consumers using only DataTable don't install pivot; tree-shaking keeps the pivot code out of the DataTable-only bundle.
- **R14 (`exactOptionalPropertyTypes` strictness):** Pivot types use optional fields per spec (§9.1 `filters?`, §9.6 `grandTotalColumnPosition?`). Mitigation: phase 1 uses `key?: T` convention consistently; tests in phase 4 verify optional absence vs. explicit `undefined`.
- **`noUncheckedIndexedAccess` + Array indexing in types:** `fieldRefs[0]` returns `FieldRef | undefined`. Mitigation: phase-1 type tests use `expectTypeOf` to verify the shape; runtime tests use `?.` chains. Phase 3's engine impl handles this consistently.

(Other M4 risks tracked in `overview.md` §6 and re-evaluated in their respective phases.)