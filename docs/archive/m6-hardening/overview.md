# M6: Hardening — Architecture Overview

**Status:** Companion to `plan-summary.md`. Decisions D1–D7 live here with full rationale; the summary links here for §3.

---

## 1. Recap

M6 closes the v1.0 release. It is the **final milestone** per `docs/initial-spec.md` §14 row 7: *"SR manual matrix, docs (recipes: layout, DnD reorder, keyboard reorder, split-pane), benchmarks in CI, API review → v1.0"*. Three additional items the spec defers to M6 are in scope: the announcer `messages` map + i18n plumbing (§10 deferred from M1), the `tabBehavior` option (§16 #4 open question), and the bundler-recipes doc (§16 #8 explicit DX mitigation).

The deliverable is a stable v1.0 npm release of all four packages with a consolidated api-freeze, a docs site that maps cleanly to the spec, and CI that tracks the §12 perf budgets.

M0–M5 surface is locked at its current api-freeze (per `docs/m5-pivot-engines/api-freeze.md`). M6 is **strictly additive** over that surface (no breaking changes). The `1.0.0` tag is the stability signal, not a breaking-change signal.

---

## 2. Spec mapping

| Spec section | M6 deliverable |
| --- | --- |
| §6.3 layout recipe + §14 recipe doc | `docs/recipes/layout.md` |
| §8.3 column re-ordering + §14 | `docs/recipes/dnd-column-reorder.md`, `docs/recipes/kbd-column-reorder.md` |
| §6.3 split-pane + §14 | `docs/recipes/split-pane.md` |
| §10 announcer messages + i18n | `packages/react/src/messages.ts` (defaults), `i18n/t.ts` (lookup helper), `useDataTable`/`usePivotTable` `messages` option |
| §13 manual SR matrix (release gate) | `docs/m6-hardening/sr-matrix.md` — procedure + grid + results-log template |
| §12 benchmarks in CI | `.github/workflows/test.yml` `bench` job + soft regression check |
| §14 API review → v1.0 | `docs/m6-hardening/api-freeze.md` — consolidated v1.0 contract |
| §14 v1.0 exit criteria | All four packages `1.0.0`; v1.0 tag |
| §16 #2 RTL | api-freeze documents the v1 stance (physical `left`/`right`, RTL recipe in docs); formally resolved |
| §16 #4 `tabBehavior` | `useTabBehavior.ts` + option on hooks; default `'exit'`, opt-in `'cells'`; formally resolved |
| §16 #8 bundler-recipes | `docs/bundler-recipes.md` — Vite/webpack/Rollup/esbuild snippets |
| §15 (excluded items) | Subtotals, `rowSelection`, state persistence, global quick filter, column auto-fit → v1.5/v2; not in scope for M6 |

---

## 3. Decisions — full rationale

### D1 — Announcer i18n shape: `defaultMessages` export + consumer `messages` override

**Resolution:** Ship `defaultMessages` (a flat `Record<AnnouncerKey, string>`) as a top-level export from `@lynellf/tablekit-react`. Consumers pass an optional `messages` option to `useDataTable` / `usePivotTable` for whole-locale overrides or partial-key merges (consumer's keys override matching keys; defaults fill the rest).

```ts
import { defaultMessages } from '@lynellf/tablekit-react';

const t = (key: AnnouncerKey) => userMessages[key] ?? defaultMessages[key];

useDataTable({ messages: { sortAsc: 'Tri croissant' }, /* ... */ });
```

The internal `t()` helper does a single property lookup per announcement; no per-call function construction. The `messages` option is **additive** over M0–M5's live-region; passing `undefined` (or omitting it) preserves M0–M5 behavior byte-for-byte.

**Why not bundle all locales:** the bundle-size goal from §12 (~15 kB min+gzip for DataTable-only usage) doesn't tolerate a multi-locale dictionary. One locale (English) ships; consumers provide their own.

**Why not just expose `Announcer` directly:** consumers already can plug in their own `Announcer`. But the *built-in* announcer calls in `react/dist` hardcode English strings; a consumer's `Announcer.announce()` only fires if the consumer reads the raw strings. Putting the strings through a `messages` map makes them localizable without a fork.

**Type ergonomics:** the `messages` option is typed as `Partial<typeof defaultMessages>`; consumers get autocomplete on key names.

### D2 — `tabBehavior: 'exit' | 'cells'`; default `'exit'`

**Resolution:** New `tabBehavior` option on `useDataTable` / `usePivotTable`. Defaults to `'exit'`. `'cells'` is opt-in only and gets a smoke test (not the full APG suite).

```ts
useDataTable({ tabBehavior: 'exit', /* ... */ }); // default
useDataTable({ tabBehavior: 'cells', /* ... */ }); // opt-in
```

- `'exit'` is APG-conformant (Tab moves focus *out* of the grid; the roving-tabindex pattern applies). This is the default and gets the full keyboard suite.
- `'cells'` is for products where Tab-then-Tab is the expected behavior (e.g., forms with a grid in the middle). M6 ships a smoke test that confirms Tab reaches the first cell and Arrow keys move within the grid; the full conformance suite for `'cells'` is v1.5+ if a consumer requests it.
- When `navigationMode: 'none'` (the `role="table"` downgrade), `tabBehavior` is ignored — read-only semantics don't have interactive tab order to customize.

§16 #4 is resolved by shipping the option; consumers don't need a workaround.

**Why default exit-only:** §16 #4 says *"Leaning exit-only for v1"*. The v1 default matches APG. Consumers who want Tab-through-cells opt in.

### D3 — Recipe docs as four separate files under `docs/recipes/`

**Resolution:** `docs/recipes/{layout,dnd-column-reorder,kbd-column-reorder,split-pane}.md`, four independent files.

Each recipe file:
- Opens with the problem/pattern (1-2 paragraphs).
- Provides a copy-paste implementation (the longest section).
- Lists the pitfalls (with explicit links to the spec section they map to).
- Ends with a "Last verified against" tag (e.g., "v1.0.0 — `docs/m6-hardening/api-freeze.md`").

Cross-linked from root `README.md` ("Recipes" section) and each per-package `README.md` (top-level "See also" link per relevant section).

**Why separate files:** the four recipes are different patterns targeting different code paths; bundling them dilutes discoverability (the consumer searches for "keyboard reorder" and finds a 1k-line combined doc). The naming is spec-faithful (§14 names them explicitly).

**Why no code changes for split-pane:** the spec §6.3 says *"the library supports it because pinned/unpinned column sets and offsets are exposed as data, not markup"*. M0–M5 already exposes that data. The recipe is a consumer-side CSS + scroll-sync pattern, no library code.

### D4 — SR matrix is documentation, not automation

**Resolution:** `docs/m6-hardening/sr-matrix.md` is the v1.0 release-gate *procedure*. It documents:
- The 5 AT × 7 interaction scenarios per spec §13 (NVDA+Chrome, NVDA+Firefox, JAWS+Chrome, JAWS+Firefox, VoiceOver+Safari × grid nav, sort announce, resize widget, pivot expand/collapse, loading states, mixed-mode, DnD revert).
- The step-by-step procedure for each scenario (set up the demo grid, run the user action, observe the SR, record the result).
- A results-log template (markdown table).

The grid is filled by humans (out-of-band). M6 ships an empty-grid matrix; the team fills it as part of the v1.0 release process.

**Why not automate:** SR testing requires a hosted AT instance (no headless NVDA/JAWS). The matrix is the gate; filling it is a release-process artifact, not a v1.0 deliverable.

**Why ship the procedure now:** spec §13 names the matrix as *"a release gate for a11y-affecting changes"*. Without a documented procedure, the gate is informal and easy to skip.

### D5 — Bench CI: advisory + soft regression (1.2×), warn at 2×+

**Resolution:**

- New `bench` job in `.github/workflows/test.yml` runs after `test`; runs `vitest bench` on the pivot main-thread bench and the worker bench.
- A `bench/compare.ts` helper compares against a `bench/baseline.json` rolling median.
- Soft regression: > 1.2× baseline → add a `bench-regression` comment on the PR.
- Hard warn: > 2.0× baseline → add a `bench-regression-hard` label.
- Outlier detection: use a rolling window of the last 10 CI runs; a single bad run doesn't trip on the first occurrence.

**Why soft:** spec §12: *"budgets are tracked, breaches block release only when architectural"*. A hard gate would be flaky on shared runners. M4/M5 already established the advisory convention.

**Why add regression-detection at all:** the spec explicitly says benchmarks are the way to catch regressions. The current state (advisory but no detection) means a regression can ship silently. Adding the PR comment is the minimum viable guardrail.

### D6 — v1.0 api-freeze: one consolidated doc, per-milestone freezes archived

**Resolution:** `docs/m6-hardening/api-freeze.md` is the canonical v1.0 contract. The existing per-milestone api-freezes (`docs/m0/`, `m3/`, `m4/`, `m5/`) move to `docs/archive/api-freeze-history/`. The consolidated doc lists M0–M5 surface (reaffirmed, with cross-refs to the originals in the archive) plus M6 additions.

The doc structure:
- §1 Stability policy (v1.x is additive; breaking changes land in v2)
- §2 Resolved open questions (§16 #2 RTL, #4 `tabBehavior`, #5 variable-row-height scroll anchoring decision, #7 Level-1 debounce ownership)
- §3 `messages` map and i18n (the M6 announcer surface)
- §4 `tabBehavior` option (the M6 keyboard surface)
- §5 v1.0 export list, package by package, with one paragraph each per export
- §6 Deprecations: none
- §7 Migration from 0.x: trivially additive; no migration guide needed

**Why consolidate:** the per-milestone freezes were internal gates. v1.0 is the consumer-facing release; one canonical doc is what npm consumers will read.

**Why archive the originals:** historical record. The originals document the milestone-by-milestone API decisions, which are useful for contributors in v1.x.

### D7 — `1.0.0` on all four packages, additive over `0.1.0`

**Resolution:** Version bumps:
- `@lynellf/tablekit-core`: `0.1.0` → `1.0.0`
- `@lynellf/tablekit-react`: `0.1.0` → `1.0.0`
- `@lynellf/tablekit-pivot`: `0.1.0` → `1.0.0`
- `@lynellf/tablekit-worker`: `0.1.0` → `1.0.0`

The M6 `api-freeze.md` §1 documents that v1.x is additive; breaking changes land in v2.

**Why bump even though additive:** v1.0 is the npm signal of stability. A `1.0.0` tag tells consumers "this release is intended for production". The changelog records the additive-over-`0.1.0` stance and links to the freeze.

**Why not `0.2.0`:** spec §14 row 7 names v1.0 as the milestone exit criteria; bumping to `1.0.0` aligns with the milestone.

---

## 4. Architecture overview

### 4.1 Announcer i18n seam

```
useDataTable({ messages?: Partial<typeof defaultMessages> })
            │
            ▼
   t(key: AnnouncerKey): string
            │  (does userMessages[key] ?? defaultMessages[key])
            ▼
   announcer.announce(message, politeness)
```

- `defaultMessages` is a frozen `Record<AnnouncerKey, string>` exported from the package root.
- `AnnouncerKey` is a union of literal strings (`'sortAsc' | 'sortDesc' | ...`) — autocomplete on every consumer override.
- `t()` is created once per hook (closed over the user override); no per-call allocation.
- All built-in announcer call sites (sort changes, filter result counts, page changes, pin/unpin, column move, resize commits, expansion, loading start/finish, errors) route through `t()`.

### 4.2 `tabBehavior` plumbing

```
useDataTable({ tabBehavior?: 'exit' | 'cells' /* default 'exit' */ })
            │
   ┌────────┴────────┐
   │                 │
   ▼                 ▼
useKeyboardNav   usePivotKeyboardNav
   │                 │
   ▼                 ▼
onTabKey = behavior === 'exit'
          ? exitGrid   // blur active element
          : focusNextCellInRow
```

- When `navigationMode: 'none'` (role="table" downgrade), `tabBehavior` is ignored — Tab exits the grid as if it were any other static content.
- Tab key handling runs *after* the existing roving-tabindex keydown handler; `'exit'` calls `gridEl.blur()` and lets the browser continue its natural Tab order; `'cells'` updates the roving `tabIndex` to point at the first cell, then Arrow keys move within the row.

### 4.3 Recipe docs structure

```
docs/recipes/
├── layout.md
├── dnd-column-reorder.md
├── kbd-column-reorder.md
└── split-pane.md
```

Each file is self-contained (~150-300 lines). Cross-linked from `README.md`.

### 4.4 SR matrix structure

```
docs/m6-hardening/sr-matrix.md
├── §1 Scope (which screens/flows are tested)
├── §2 AT × Browser matrix (5 × 4 + VoiceOver Safari)
├── §3 Scenarios (7 per spec §13)
├── §4 Procedure (step-by-step for one scenario as the worked example)
├── §5 Results log template (empty markdown table)
└── §6 Filing process (PRs that touch a11y-affecting files must update §5)
```

### 4.5 CI bench wiring

```
.github/workflows/test.yml
  ├── test (existing — runs vitest run)
  └── bench (new — runs vitest bench on pivot + worker)
              ├── bench/baseline.json (rolling median, updated by maintainer)
              └── bench-results.md (artifact upload)
```

`bench/compare.ts` is a small node script that reads the latest vitest bench JSON output, compares against baseline, and emits a `::warning file=` annotation for soft regressions. The script is invoked as a post-step in the bench job.

---

## 5. Stability policy (v1.0 contract)

The v1.0 api-freeze documents:

1. **Additive v1.x.** v1.0.1, v1.1.0, etc. add exports and behavior. They do not rename, remove, or change the semantic of an existing export. New optional fields are allowed; existing required-field semantic is locked.
2. **Deprecations land in v1.x, removals in v2.** A deprecated export continues to work with a console warning; the next major (v2) is allowed to remove it. v1.0 ships no deprecations; the first deprecation opportunity is v1.1+ if a consumer requests an API change.
3. **Breaking changes per the spec §2.3 non-goals are not in scope.** Renaming the npm scope, restructuring the package layout, renaming export names — all v2 considerations.
4. **`api-freeze.md` is the canonical reference.** Per-milestone freezes in `docs/archive/api-freeze-history/` are historical.

---

## 6. Resolved open questions (§16)

| # | Question | M6 resolution |
| -- | -------- | ------------- |
| 2 | RTL — physical `left`/`right` or logical `start/end`? | **PHYSICAL for v1.0** (matches CSS `position: sticky`). RTL recipe documented in `docs/recipes/`-style appendix (`docs/rtl-notes.md`) — physical offsets still work, the recipe describes the CSS mirror consumers need to add. v2 may move to logical. |
| 4 | `tabBehavior: 'exit' \| 'cells'`? | **BOTH, with `'exit'` default.** See D2. |
| 5 | Variable row heights + scroll anchoring | **RESOLVED IN M2** (locked estimate + offset correction). Documented in the v1.0 api-freeze for posterity. |
| 7 | Level-1 debounce ownership | **CONSUMER-OWNED for v1.0.** Documented in the v1.0 api-freeze; revisit in v1.5 if every consumer writes the same debounce. |
| 8 | Worker DX | **DONE IN M5** (`createWorkerEntry()` factory). M6 adds the bundler-recipes doc. |
| 9 | AT variance risk | **DOCUMENTED IN SR MATRIX.** M6 ships the procedure; treegrid variance is the accepted risk. |
| 10 | Mixed client/server semantics | **HARD GATE DEFERRED TO v2.** Consumers see the warning; v1.0 ships soft warnings only. |

---

## 7. Risks (full table)

(See `plan-summary.md` §5 for the condensed list. Full risks per phase in each phase file.)

1. **R1 — Announcer strings vs. existing behavior.** All built-in announcer calls must route through `t()` without changing the English-default strings; the M0–M5 tests assert on the literal strings.
2. **R2 — `tabBehavior: 'cells'` keyboard suite.** Tab-through-cells is APG-divergent; v1.0 ships `'exit'`-full coverage and `'cells'`-smoke only.
3. **R3 — CI bench flakiness.** On shared runners. Soft threshold + outlier window.
4. **R4 — SR matrix becoming shelfware.** Mitigation: a `release-process.md` documents that a11y-affecting changes require filling the matrix.
5. **R5 — Version-bump on additive change.** Documented in the api-freeze; breaking-change policy keeps v1.0 additive.
6. **R6 — `tabBehavior` + `role="table"` interaction.** `'none'` mode ignores the option; tests confirm.
7. **R7 — Recipe docs accuracy.** Each tagged "Last verified against"; broken-link lint at lint time.
8. **R8 — Bundler-recipes rot.** Tagged with bundler version + month; cross-checked against the reference app.
9. **R9 — Pre-existing M4 cleanup items.** Run in parallel inside M6 if budget allows.
10. **R10 — Listener for "messages` map is overkill for v1.0".** Mitigation: the map is small (~15 keys), the bundle cost is < 200 bytes min+gzip; the i18n seam is the v1.0 contract that consumers need.

---

## 8. Out-of-scope (explicit)

Per the M6 row + §15 + §16:

- `rowSelection` slice → v1.5
- State persistence helper (`serializeState()/hydrateState()`) → v1.5
- Subtotal rows (`perLevel`) → v1.5
- `validateGridStructure` CLI / layered diagnostics → post-v1.0
- Global quick filter → v2
- Column auto-fit → v2
- Hard gate behind `allowWithinPageOperations` → v2
- Columnar / `Arrow` transfer for `setRows` → v2
- Broader i18n (non-announcer strings) → when requested
- Live AT regression in CI → infeasible; SR matrix is the substitute
- Hard bench CI gate → soft + warn only

---

## 9. Phase break rationale

- **Phase 1 = code (i18n).** Largest single phase by code impact; isolated so that plan-reviewer feedback can iterate without affecting other phases.
- **Phase 2 = code (`tabBehavior`).** Small, isolated, integrates with the keyboard suite.
- **Phase 3 = docs only (recipes).** Zero code change; fast to author; cross-checked against the v1.0 api-freeze.
- **Phase 4 = infra + docs (CI + bundler recipes).** Cross-package (CI workflow file) but no library code; bundler recipes docs.
- **Phase 5 = closeout.** SR matrix + v1.0 api-freeze + version bumps + final verify. Nothing here is high-risk; it's wrap-up.

Phase 1 depends on no other phase. Phase 2 depends on no other phase. Phases 3-5 depend on Phase 1 (because Phase 3 cross-links to the `messages` map exposed in Phase 1, Phase 5's api-freeze documents Phase 1's surface). Phases 1 and 2 can run in parallel within the implementer's pass if budget allows.
