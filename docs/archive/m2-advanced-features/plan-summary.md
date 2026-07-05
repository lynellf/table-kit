# M2: Advanced Client Features — Plan Summary

**Audience:** `plan-reviewer-a`, `plan-reviewer-b`
**Goal:** Review-ready summary of the M2 plan.
**Full plan:** [`overview.md`](./overview.md) + 7 phase files + [`api-freeze.md`](./api-freeze.md).

---

## 1. Goal recap

Land M2 per `docs/initial-spec.md` §14 row 3: **Row/column virtualization, resizing, pinning, keyboard nav/focus**. Exit criteria: **100k-row scroll budget met; APG keyboard suite passes; validator ships**.

M1 is complete (201 tests across 22 files, `pnpm verify` green). M2 extends the surface additively; no M0/M1 export is renamed, removed, or signature-changed. The only behavioral change is `Column.getPinnedOffset()` now reading `getSize()` for preceding columns (it returned a literal `150` per unpinned-size column in M0/M1).

---

## 2. Scope (what's in, what's out)

### In M2

| Feature | Spec section | New surface |
| --- | --- | --- |
| Row virtualization | §7.1 | `createRowVirtualizer` (core subpath); `table.getRowVirtualizer()`; `VirtualRow<T>` with `positionStyle`; `useRowVirtualizer` hook |
| Column virtualization | §7.1 | `createColumnVirtualizer`; `table.getCenterVirtualizer()`; pinned columns bypass; `useCenterVirtualizer` hook |
| `VirtualizerLike` seam | §7.1 + D1 | Interface exported; built-in core virtualizer; bridge reserved for M2.5+ |
| Memoization | §12 perf | `RowModelCache`; `getRowModel()` keyed on `(data ref, sorting, filters, pagination, manual*, columnOrder ref, columnVisibility ref, columnPinning ref)` |
| `ScrollAdapter` / `SizeObserver` | §4.3 seam | `useScrollAdapter(gridRef, table)`; `useSizeObserver({ gridRef, rowVirtualizer, columnVirtualizer })` |
| Pinning offset math | §7.3 (D3) | `Column.getPinnedOffset()` reads `getSize()`; `defsById` constructor field |
| Pinning dispatchers | §7.3 | `togglePin(id, side)`; `pinColumns(ids, side)`; `unpinColumns(ids)` |
| Pin/unpin announcements | §10 | Through existing `Announcer` seam; "Pinned X to left", etc. |
| Resize handle | §7.2 (D2) | `header.getResizeHandleProps()`; pointer + keyboard; `role="separator"` + full ARIA |
| Resize mode | §7.2 | `columnResizeMode: 'onChange' | 'onEnd'`; `setResizeMode` / `getResizeMode` |
| Resize clamp + announce | §7.2 | `resizeColumn`, `cancelResize`, `clampColumnSize`; `aria-valuenow/min/max` |
| Keyboard navigation / focus | §7.5 (D4) | `navigationMode: 'cell' | 'none'`; roving `tabIndex` on cells; `navigateCell`, `navigateToEdge`, `navigateByPage`; `onKeyDown` on grid |
| Role downgrade for `none` | §10 | `role="grid"` → `role="table"`; `role="gridcell"` → `role="cell"` |
| `keepMounted` integration | §7.5 | Focused cell's row + column stay mounted even when scrolled out |
| Validator | §10 (D5) | `validateGridStructure(rootEl)` in `@lynellf/tablekit-react/validate`; dev-only; tree-shaken in prod |

### Out of M2 (deferred)

- `DataSource` / Level 1 server orchestration — M3.
- `PivotTable` + treegrid + row-mode keyboard nav — M4.
- Worker engine + protocol — M5.
- Full announcer `messages` map / i18n — M6.
- CLI validator; layered diagnostics; runtime dev-mode auto-run — M6.
- Screen-reader manual matrix (NVDA, JAWS, VoiceOver) — M6 release gate per §13.
- `tabBehavior: 'exit' | 'cells'` option — §16 risk #4, deferred per M6.
- Focus trap inside cell interior widgets (Enter/F2) — M6 polish (M2 ships the key bindings but not the focus shift).
- `rowSelection`, subtotals, state persistence — v1.5 per §15.
- DnD reorder implementation — consumer's library; spec §8.3.

---

## 3. Resolved decisions (the five open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | Built-in virtualizer vs `VirtualizerLike` bridge? | **SHIP BUILT-IN CORE VIRTUALIZER** | §12 100k-row budget is most easily met with a tightly-integrated built-in. `VirtualizerLike` is exported so consumers can later bridge TanStack Virtual without API changes. |
| D2 | Resize handle: pointer + keyboard both in M2? | **BOTH IN M2** | §14 exit criterion bundles APG keyboard suite; pointer-only would block it. Keyboard interaction is small (~50 LOC). |
| D3 | Pinning offset math? | **FIX M0 LITERAL + SHIP DISPATCHERS** | `Column.getPinnedOffset` literal `150` is the only derivation change needed; trivial fix. M2 ships `setColumnPinning` tests + `togglePin` + `pinColumns`/`unpinColumns` batch helpers. |
| D4 | Keyboard nav scope? | **CELL-MODE + NONE-MODE FOR DATATABLE** | Treegrid + row-mode are M4 (PivotTable). M2 ships `'cell'` (default) + `'none'` (read-only downgrade). `'row'` is reserved in the type union; emits a dev warning when used. |
| D5 | Validator scope? | **CORE CHECKS IN M2; CLI/MULTI-LAYOUT IN M6** | §10 names the validator as launch-blocking; §14 exit criterion includes "validator ships". M2 ships the function + integration test assertions. M6 adds CLI, layered diagnostics, runtime dev-mode auto-run. |

Full rationale for each is in [`overview.md` §3](../m2-advanced-features/overview.md).

---

## 4. Phase structure

| # | Phase | Goal | Tests added (est.) |
| -- | ----- | ---- | ------------------ |
| 1 | [Virtualization engine + memoization](./phase-1-virtualization-and-memoization.md) | `createRowVirtualizer`/`createColumnVirtualizer`; `getRowModel` memoization; `VirtualizerLike`; perf bench | ~30-40 |
| 2 | [Pinning offset math + dispatchers](./phase-2-pinning.md) | `getPinnedOffset` literal fix; `setColumnPinning` tests; `togglePin`/`pinColumns`/`unpinColumns`; announcer | ~15-20 |
| 3 | [Resize handle + column sizing](./phase-3-resize.md) | `getResizeHandleProps`; pointer + keyboard; `columnResizeMode`; clamp; resize announcements | ~20-25 |
| 4 | [React adapter — scroll + size observers](./phase-4-react-adapters.md) | `useScrollAdapter`; `useSizeObserver`; `useRowVirtualizer`; `useCenterVirtualizer` | ~15-20 |
| 5 | [Keyboard navigation / focus](./phase-5-keyboard-nav.md) | `navigationMode`; `onKeyDown`; roving `tabIndex`; `navigateCell`/`navigateToEdge`/`navigateByPage`; `keepMounted`; role downgrade | ~25-30 |
| 6 | [Accessibility validator](./phase-6-validator.md) | `validateGridStructure`; tree-shakeable dev-only; integration assertions | ~10-15 |
| 7 | [Public surface + integration + perf gate](./phase-7-public-surface-and-integration.md) | Subpath exports; integration tests; §12 perf bench; APG Playwright suite; API freeze | ~15-25 |
| | **Total M2 tests** | | **~130-175** (on top of M0 + M1's 201) |

Each phase's file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 5. Key risks

1. **§12 100k-row budget (≥ 55fps sustained scroll)** — addressed by phase 1's memoization + virtualizer O(log n) math. Bench is advisory until architectural regressions cross thresholds.
2. **`getRowModel()` memoization + `data` mutation** — keyed on `data` reference; consumers mutating in place get stale rows until they pass a new array reference. Documented in the README (phase 7).
3. **`Column.getPinnedOffset` reads from `defsById` map** — adds an optional constructor field; backward-compatible because the field is optional and existing direct callers don't pass it.
4. **Pointer capture in jsdom** — jsdom does not implement the Pointer Events spec fully. Unit tests use synthetic events; Playwright (phase 7) tests exercise real pointer events.
5. **Roving tabindex invariant** — the validator (phase 6) flags grids with zero or multiple `tabIndex=0`. The grid root emits `tabIndex=-1` in cell mode (focus enters via the focused cell, not the root).
6. **`navigationMode: 'none'` + role downgrade** — irreversible per instance. Consumers create a new instance to change modes. Documented.
7. **Variable row heights + scroll anchoring (§16 risk #5)** — M2 uses uniform sizes via `estimateSize: () => 33`. Anchor correction is M6 polish.
8. **`validateGridStructure` is dev-only** — production tree-shake strips the logic; the prod bundle exports a `() => ({valid:true,violations:[]})` no-op. Verified via build output inspection.
9. **Bundle size** — M2 lands at ~27 kB total (core + react min+gzip), 80% over the §12 15 kB guardrail. Tree-shakeable subpath exports mitigate; consumers using only a subset pay only for that subset.
10. **`verbatimModuleSyntax` + circular imports** — types continue to import types from `./columns`, `./headers`, `./events`, `./types` (cycle). M2 doesn't introduce new cycles.

Full risk table in [`overview.md` §7](../m2-advanced-features/overview.md).

---

## 6. Verification

After all 7 phases, from a fresh clone:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                # typecheck + lint + test + build — EXIT 0
pnpm test                                                  # M0 (M1 docs say ~201, see archive) + M1 + M2 (~130-175) tests, all green
pnpm --filter @lynellf/tablekit-core bench                 # 100k-row scroll bench (advisory)
pnpm --filter @lynellf/tablekit-react exec playwright install chromium  # one-time
pnpm --filter @lynellf/tablekit-react test:e2e             # APG keyboard Playwright suite

# Subpath smoke
node -e "import('@lynellf/tablekit-core/virtualization').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/pinning').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/resize').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/keyboard-nav').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-core/memo').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react').then(m => console.log(Object.keys(m).sort()))"
node -e "import('@lynellf/tablekit-react/validate').then(m => console.log(Object.keys(m).sort()))"
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 7. M2 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **100k-row scroll budget met** | `packages/core/bench/scroll.bench.ts` runs in `pnpm --filter @lynellf/tablekit-core bench`. Reports ms/event on synthetic 100k × 50 dataset; required ≤ 16ms/event (≥ 55fps). Logged in the implementation commit message + `api-freeze.md` §7. |
| **APG keyboard suite passes** | `packages/react/src/__integration__/keyboard-nav.spec.ts` is a Playwright suite scripted from §7.5 conformance table. Covers Tab entry, Arrow keys, Home/End, Ctrl+Home/End, PageUp/Down, Tab exit, Enter/F2, Escape, role downgrade for `none` mode, exactly-one `tabIndex=0`. Runs in CI via `pnpm --filter @lynellf/tablekit-react test:e2e`. |
| **Validator ships** | `validateGridStructure(rootEl)` is exported from `@lynellf/tablekit-react/validate`. Every integration test (`packages/react/src/__integration__/*.test.tsx`) calls it after render and asserts `{ valid: true }`. Tree-shaken from production builds. |

---

## 8. Out-of-scope reminder

M2 does **not** ship DataSource, PivotTable, worker engine, full announcer polish, rowSelection, subtotals, state persistence, DnD reorder, or split-pane layout. These are explicit non-goals per spec §14 and the overview §2.5. A reviewer should flag any phase file that includes M3+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D5** in `overview.md` — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D1 (built-in virtualizer vs `VirtualizerLike` bridge) and D4 (cell-mode + none-mode vs full treegrid).
2. **§5 phase structure** — confirm sequencing is correct (virtualization → pinning → resize → react adapters → keyboard nav → validator → integration) and each phase's scope is bounded.
3. **Phase 1 (virtualization + memoization)** — `getRowModel` memoization keyed tuple; `__setScrollState` internal API; `VirtualizerLike` interface being reserved (not wired in M2).
4. **Phase 2 (pinning offset math)** — `Column.getPinnedOffset` reading `getSize()` via the new `defsById` constructor field; backward compatibility for direct `new Column({...})` callers.
5. **Phase 3 (resize)** — pointer capture in jsdom vs Playwright; `columnResizeMode: 'onChange' | 'onEnd'` semantics; `aria-valuenow` initial value.
6. **Phase 5 (keyboard nav)** — roving tabindex invariant; role downgrade for `navigationMode: 'none'`; `keepMounted` integration with the virtualizer; `__lib_onKeyDown` wiring through `mergeProps`.
7. **Phase 6 (validator)** — dev-only tree-shaking; rule coverage; the `pathFor` helper's assumptions about standard DOM.
8. **Phase 7 (integration + perf)** — Playwright suite coverage of the §7.5 conformance table; perf bench interpretation; API freeze manifest completeness.

The plan is intentionally **concrete and tactical** (per the mid-level-planner role spec): specific files to change, specific test commands, specific acceptance criteria. Architectural analysis is bounded to §3 (decisions) and §4 (architecture overview).
