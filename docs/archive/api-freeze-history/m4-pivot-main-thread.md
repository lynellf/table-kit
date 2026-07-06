# API Freeze — M4 (Pivot, Main Thread)

**Date:** 2026-07-05
**Milestone:** M4 Pivot, Main Thread
**Status:** Frozen for M4; subject to deprecation only (no removal without major version bump)

---

## M4 additions (additive; no M0/M1/M2/M3 changes)

### New package: `@lynellf/tablekit-pivot`

#### Root export (`@lynellf/tablekit-pivot`)

- `createPivotTable<TRow>(options): PivotTableInstance<TRow>`
- `defaultGetRowId<TRow>(row, index): string` (with dev warning)
- `__resetPivotDefaultGetRowIdWarningForTests(): void`
- `DEFAULT_PIVOT_STATE: PivotTableState`

#### Types

- `FieldValue`
- `RowPathKey`
- `LeafColumnId`
- `MeasureId`
- `FieldRef<TRow>`
- `MeasureDef<TRow, TIn, TAcc, TOut>`
- `PivotFilter<TRow>`
- `TotalsConfig`
- `PivotConfig<TRow>`
- `PivotExpansionState`
- `PivotSortingState`
- `PivotTableState`
- `Aggregator<TIn, TAcc, TOut>`
- `MaybePromise<T>`
- `AggregationEngine<TRow>`
- `SerializedFieldRef`
- `SerializedMeasureDef`
- `SerializedPivotFilter`
- `PivotQuery<TRow>`
- `PivotLeafColumn<TRow>`
- `PivotColumnNode`
- `PivotRowNode<TRow>`
- `PivotResult<TRow>`
- `PivotTableInstance<TRow>`
- `PivotTableOptions<TRow>`

#### Treegrid prop getters

- `getGridProps(consumerProps?)`
- `getBodyProps(consumerProps?)`
- `getRowProps(row, consumerProps?)`
- `getRowHeaderProps(row, consumerProps?)`
- `getHeaderProps(node, consumerProps?)`
- `getToggleExpandedProps(row, consumerProps?)`
- `getFooterProps(consumerProps?)` (returns null when `grandTotalRow: false`)
- `getTotalsColumnProps(leaf, consumerProps?)`

#### Derived accessors

- `getVisibleRows(): PivotRowNode<TRow>[]`
- `getHeaderRows(): HeaderEntry[][]`
- `getLeafColumns(): PivotLeafColumn<TRow>[]`

#### Announcer messages

- `announceExpansion(announcer, path, wasExpanded, childCount)`
- `announceSorting(announcer, sorting)`
- `announceTotals(announcer)`

#### Subpath: `@lynellf/tablekit-pivot/aggregators`

- `sumAggregator`, `countAggregator`, `minAggregator`, `maxAggregator`, `avgAggregator`
- `AvgAccumulator`
- `BUILT_IN_AGGREGATORS` (frozen record)
- `BuiltInAggregatorName` (type)
- `builtInAggregators` (frozen record)
- `registerAggregator(name, fn)`
- `getAggregator(name)`
- `nameOfAggregator(fn)`
- `__resetAggregatorRegistryForTests()`
- `AggregatorName` (type)

#### Subpath: `@lynellf/tablekit-pivot/engine`

- `createMainThreadEngine<TRow>(opts?): AggregationEngine<TRow>`
- `MainThreadEngineOptions` (type)
- `PivotResultCache<TRow>` (class)
- `buildPivotResult<TRow>(query): PivotResult<TRow>`
- `applyPivotSortingAtLevel<TRow>(children, level, sorting, config, getMeasureValue, registryLookup)`
- `rowPathKeyOf(path): RowPathKey`
- `__registerCoreFilterFn(name, fn)`

#### Subpath: `@lynellf/tablekit-pivot/pivotTable`

- `createPivotTable<TRow>(options): PivotTableInstance<TRow>` (re-export)
- `getVisibleRows<TRow>(root, expanded): PivotRowNode<TRow>[]`
- `getHeaderRows(root): HeaderEntry[][]`
- `HeaderEntry` (type)
- All treegrid prop getters (re-export)
- All announcer messages (re-export)

#### Subpath: `@lynellf/tablekit-pivot/serialize`

- `buildPivotQuery<TRow>(data, config, expanded, sorting, totals, opts?): PivotQuery<TRow>`
- `BuildPivotQueryOptions` (type)
- `validatePivotQuery<TRow>(q): void` (dev-only warning)
- `__resetInlineLeakWarningForTests(): void`

### `@lynellf/tablekit-react` (new exports)

- `usePivotTable<TRow>(options): UsePivotTableResult<TRow>` (hook)
- `UsePivotTableOptions<TRow>` (type)
- `UsePivotTableResult<TRow>` (type)
- `resolveTreegridKeyAction<TRow>(pivot, focusedRowKey, key): PivotKeyboardAction | null`
- `applyTreegridAction<TRow>(pivot, action, currentFocusedRowKey): RowPathKey | null`
- `PivotKeyboardAction` (type)
- Re-exports of `@lynellf/tablekit-pivot` surface for consumer convenience (`createPivotTable`, built-in aggregators, registry helpers, types, `DEFAULT_PIVOT_STATE`).

### `@lynellf/tablekit-core` (additive changes only)

- `applySliceChange`, `mergeInitialState`, `resolveUpdater`, `isSliceControlled`, `controlledSliceKeys`, `stateChangedOnSlices` widened to a generic over `TState extends Record<string, unknown>`. Signature-compatible for existing M0/M1/M2/M3 callers (TS infers `TState = DataTableState`). No removal, no rename, no signature change.

### `@lynellf/tablekit-react/validate` (additive changes only)

- `validateGridStructure` extended with treegrid-specific rules:
  - `treegrid-tabindex`: root must have `tabIndex=0`.
  - `treegrid-row-expanded`: rows with `data-has-children="true"` must have `aria-expanded`.
  - `treegrid-level-monotonic`: `aria-level` strictly increasing across rendered rows.
  - `treegrid-rowheader-ownership`: `role="rowheader"` cells must be inside a row.
- Production tree-shaking preserved (the rules are wrapped in `if (process.env.NODE_ENV === 'production') return noOpResult;`).

## M0/M1/M2/M3 surface reaffirmed

- All M0/M1/M2/M3 exports remain. No renames, no removals, no signature changes.
- `pnpm verify` continues to pass; M0/M1/M2/M3 tests remain green (~380).

## Behavior changes (additive only)

- `createPivotTable` returns an instance with the same controlled-slice contract as `createDataTable`.
- `usePivotTable` mirrors `useDataTable`'s React 19 + `useSyncExternalStore` pattern.
- Treegrid prop getters emit `role="treegrid"`, `aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`, `role="rowheader"`.
- `validateGridStructure` accepts `role="treegrid"` and asserts treegrid-specific rules.
- `nameOfAggregator` enables forward-looking inline-leak dev warnings (M5).

## Tests

- ~150-210 new tests added on top of M0/M1/M2/M3's 380.
- Serialization golden fixtures (6 files) committed under `packages/pivot/src/__tests__/fixtures/pivotQuery/`.
- Property-based merge law tests for all 5 built-in aggregators (associativity, commutativity, accumulate ≡ chunked-merge).
- Reference app demonstrates row hierarchy + expansion + totals + sorting + perf badge.

## Exit criteria (spec §14)

- **Pivot integration + a11y tree tests**: ✓ `packages/react/src/__integration__/pivot-*.test.tsx` + `pivot-treegrid-a11y.test.tsx` assert the DOM shape and `validateGridStructure({ valid: true })`.
- **Sum-default verified**: ✓ `aggregators.test.ts` + `engine.test.ts` confirm that omitting `aggregator` from `MeasureDef` defaults to `'sum'`.
