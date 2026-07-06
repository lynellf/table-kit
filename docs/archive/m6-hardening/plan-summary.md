# M6: Hardening — Plan Summary

**Slug:** `m6-hardening`
**Milestone:** M6 (per `docs/initial-spec.md` §14 row 7) — the **v1.0 final milestone**
**Status:** Draft v1 for review — decisions D1–D7 resolved (see §3)
**Audience:** implementer (after panel approval)
**Scope:** Code-polish items deferred from M1/M5 (announcer `messages` map + i18n, `tabBehavior` option), recipe documentation (layout, DnD reorder, keyboard reorder, split-pane), bundler-recipes doc (§16 #8), CI benchmark wiring, v1.0 screen-reader matrix, and the v1.0 consolidated `api-freeze.md`.
**Scope resolution:** The target is **M6: Hardening** per `docs/initial-spec.md` §14 row 7 (*"SR manual matrix, docs (recipes: layout, DnD reorder, keyboard reorder, split-pane), benchmarks in CI, API review → v1.0"*). Exit criteria: **v1.0**. Three other items the spec routes to M6 are in scope (announcer `messages` map per §10, `tabBehavior` per §16 #4, bundler-recipes doc per §16 #8).

M0–M5 surface is shipping and frozen at its current api-freeze (M5 reaffirms M0–M4 per `docs/m5-pivot-engines/api-freeze.md`). M6 is an additive milestone: **no breaking changes to existing exports**, version bumped to `1.0.0` on all four packages.

> **Budget reality:** ~$1.46 remaining (of $15.00 total). The full review path is ~$0.90 — a single review cycle only. The plan is scoped to fit one implementer pass. If reviewer findings request substantive rescoping, escalate to the user; otherwise implementer proceeds in one pass.

---

## 1. Goal

Land M6 per the spec: *"SR manual matrix, docs (recipes: layout, DnD reorder, keyboard reorder, split-pane), benchmarks in CI, API review → v1.0"*. Concrete deliverables:

1. **Announcer `messages` map + i18n** (spec §10, deferred from M1) — Default English strings centralized in a `messages` map; consumers override per locale. Every built-in announcer call routes through the map. No hardcoded English strings in `react/dist`.
2. **`tabBehavior: 'exit' | 'cells'` option** (spec §16 #4 open question) — Default `'exit'` (APG-conformant). `'cells'` opt-in for products that want Tab-through-cells.
3. **Four recipe docs** under `docs/recipes/`: layout (virtualization × sticky pinning), DnD column reorder (dnd-kit), keyboard column reorder ("grab" pattern), split-pane (left/center/right viewports with scroll sync).
4. **Bundler-recipes doc** — Vite + webpack (and Rollup, esbuild) worker-entry patterns. Cited by spec §16 #8 as the explicit DX mitigation.
5. **CI benchmarks** — `.github/workflows/test.yml` adds a `bench` job running the pivot main-thread bench and the worker bench. Results uploaded as an artifact (`bench-results.md`). Soft budget regression check: warn if > 1.2× rolling baseline.
6. **Screen-reader manual matrix** (`docs/m6-hardening/sr-matrix.md`) — The release-gate procedure called out by spec §13: a documented grid of (SR × browser) × interaction scenarios, a step-by-step procedure, and a results-log template. **Documentation deliverable — the actual manual testing is run by the team outside the agent loop.** Procedural completeness is what the milestone ships.
7. **v1.0 consolidated `api-freeze.md`** — Single v1.0 contract document covering all four packages, replacing the per-milestone `docs/mN-*/api-freeze.md` as the canonical reference. Includes breaking-change policy for v1.x. Resolves open questions: `tabBehavior` (§16 #4) lands as `'exit'` default with `'cells'` opt-in; RTL (§16 #2) documents the v1 stance (physical `left`/`right`, RTL recipe in docs).

The deliverable from a fresh clone at v1.0: `pnpm verify` exits 0; M6 tests pass; the four recipes render correctly when viewed from the repo; the SR matrix exists and is the documented release gate; `api-freeze.md` matches the shipped exports exactly; CI runs the benches and uploads the artifact.

---

## 2. Scope

### In M6

| Feature | Spec section | Surface |
| --- | --- | --- |
| Announcer `messages` map | §10 | New `defaultMessages` export, `messages` option on `useDataTable`/`usePivotTable`, `t()` helper |
| `messages` i18n plumbing | §10 | All built-in announcer calls route through `t()`; English defaults shipped; consumers override key-by-key |
| `tabBehavior` option | §16 #4 | New `'exit'` (default) / `'cells'` toggle on `useDataTable` / `usePivotTable` |
| `layout.md` recipe | §6.3, §14 | Consumer guide: virtualization + sticky pinning; the `position: absolute; top` rule with rationale |
| `dnd-column-reorder.md` recipe | §8.3, §14 | dnd-kit reference implementation driving `moveColumn()` |
| `keyboard-column-reorder.md` recipe | §8.3, §14 | "Grab" pattern on header (Space, Arrows, Space, Escape) with announcer messages; built on `moveColumn()` + announcer |
| `split-pane.md` recipe | §6.3, §14 | Left/center/right viewports with scroll sync, motivates the API exposure of pinned/unpinned column sets and offsets |
| Bundler-recipes doc (Vite/webpack/Rollup/esbuild) | §16 #8 | Copy-paste worker-entry snippets for each bundler; consumer-facing companion to `createWorkerEntry()` |
| CI bench job | §12, §14 | `.github/workflows/test.yml` `bench` job; runs pivot main-thread + worker benches; uploads `bench-results.md`; soft regression check |
| Screen-reader matrix | §13, §14 | `docs/m6-hardening/sr-matrix.md` — scenario grid, procedure, results-log template |
| v1.0 `api-freeze.md` | §14 | `docs/m6-hardening/api-freeze.md` — consolidated v1.0 contract for all four packages |
| `tabBehavior` integration tests | §13 | Confirm `'exit'` (default) and `'cells'` (opt-in) wiring for both `useDataTable` and `usePivotTable` |
| `messages` i18n tests | §13 | Confirm `messages` override works; confirm default English matches M1–M5 strings |
| Version bumps | §14 | All four `@lynellf/tablekit-*` packages: `0.1.0` → `1.0.0` |
| M6 api-freeze reaffirmance | §14 | M5 surface reaffirmed; M6 additions listed |

### Out of M6 (deferred)

- **`validateGridStructure` CLI / layered diagnostics** — The in-process validator shipped in M2 is the v1.0 surface; layered/CLI diagnostics are post-v1.0.
- **Subtotal rows (`perLevel`)** — v1.5 per spec §15.
- **`rowSelection`, state persistence helper, global quick filter, column auto-fit** — v1.5/v2 per spec §15.
- **Hard gate behind `allowWithinPageOperations`** — v2 per spec §16 risk #10.
- **Columnar / `Arrow` transfer for `setRows`** — v2 per spec §16 and M5 §2.
- **i18n for screens other than ARIA announcements** — The `messages` map is announcer-only in v1.0. Broader i18n (column header rendering, error toasts, etc.) lands when a consumer requests it.
- **Live AT (NVDA/JAWS/VoiceOver) regression in CI** — Not feasible without hosted AT; the SR matrix procedure is what we ship. M6 does not introduce a screenless AT shim.
- **Hard bench CI gate** — Soft warn-only on > 1.2× baseline; a hard gate would be flaky on shared CI runners (per M4/M5 convention).
- **SR matrix results filled in** — Results are filled by the team post-launch. M6 ships the matrix *grid* and a results-log template; the grid is intentionally empty for entries.

---

## 3. Resolved decisions (seven open questions)

| # | Question | Resolution | Why |
| -- | -------- | ---------- | --- |
| D1 | Announcer i18n: bundle one locale, ship `messages` map, or both? | **SHIP `defaultMessages` MAP + CONSUMER OVERRIDE** | Spec §10: *"Every built-in announcement routes through the `messages` map for i18n"*. M1 shipped a live region only. M6 ships the map. Consumers provide their own map (or override English defaults key-by-key). Keeps the bundle small (one locale ships) and lets consumers localize without forking. |
| D2 | `tabBehavior`: ship the option now or defer to v1.5? | **SHIP `'exit'` (DEFAULT) + `'cells'` (OPT-IN) IN M6** | §16 #4 is an open question blocking v1.0. APG says Tab exits the grid; some products want Tab-through-cells. The lean in spec is exit-only, but two-line option is cheap and removes the question from the v1.0 launch. |
| D3 | Recipe docs: one combined doc or four files? | **FOUR FILES** | The four recipes are independent (layout, DnD reorder, keyboard reorder, split-pane) — different code paths, different reference implementations. Separate files match the spec wording and let consumers link directly to the one they need. Bundler-recipes lives at `docs/bundler-recipes.md` (separate from the four recipe docs). |
| D4 | SR matrix deliverable: documentation only or include manual-test record? | **DOCUMENTATION + RESULTS-LOG TEMPLATE** | M6 ships the *procedure* and the *grid* (5 ATs × 7 scenarios per spec §13: NVDA+Chrome, NVDA+Firefox, JAWS+Chrome, JAWS+Firefox, VoiceOver+Safari × grid nav, sort announce, resize, pivot expand/collapse, loading, mixed modes if applicable, DnD revert). Live results are filled by humans after v1.0 launch. The matrix exists so a future contributor changes a11y behavior → must fill the matrix. |
| D5 | Bench CI: which benches and what threshold? | **ADVISORY + SOFT REGRESSION** | Spec §12: *"budgets are tracked, breaches block release only when architectural"*. M4/M5 already ship benches as advisory. M6 wires them into CI and adds a soft regression check (> 1.2× baseline → comment on PR; hard fail only if 2×+ or virtualization architecture breaks). |
| D6 | v1.0 api-freeze: consolidated or per-milestone? | **CONSOLIDATED `docs/m6-hardening/api-freeze.md`** | The per-milestone freezes (`docs/mN-*/api-freeze.md`) served as internal gate documents. v1.0 is the consumer-facing contract; one canonical doc replaces the per-milestone chain. The M0–M5 freezes move to `docs/archive/api-freeze-history/m0-…m5.md`. |
| D7 | Versioning: bump to 1.0.0 even if strictly additive? | **YES — `1.0.0` ON ALL FOUR PACKAGES** | v1.0 is the milestone tag. The API surface is additive over M5 (no breaking changes), but the v1.0 tag is the npm signal of stability. The api-freeze document records the breaking-change policy: v1.x is additive; breaking changes land in v2 (per spec §2.3 non-goals). |

Full rationale for each decision lives in [`overview.md` §3](./overview.md).

---

## 4. Phase structure

| # | Phase | Goal | New/changed files | Tests added (est.) |
| -- | ----- | ---- | ----------------- | ------------------ |
| 1 | [Announcer `messages` map + i18n plumbing](./phase-1-announcer-messages-and-i18n.md) | `defaultMessages` export + consumer override, all built-in announcer calls route through `t()`, locale plumbing is solid | `packages/react/src/messages.ts` (new), `packages/react/src/i18n/t.ts` (new), 6-8 announcer call sites; tests in `__integration__/messages-i18n.test.tsx` | ~10-15 |
| 2 | [`tabBehavior` option](./phase-2-tab-behavior.md) | `'exit'` (default) / `'cells'` (opt-in) on `useDataTable` and `usePivotTable`; existing keyboard suite confirms `'exit'` path | `packages/react/src/useTabBehavior.ts` (new), option wired into `useKeyboardNav.ts` + `usePivotKeyboardNav.ts`; tests in `__integration__/tab-behavior.test.tsx` | ~6-10 |
| 3 | [Recipes (layout, DnD reorder, keyboard reorder, split-pane)](./phase-3-recipes-docs.md) | Four consumer-facing recipe docs under `docs/recipes/`, each with copy-paste snippets, the rationale for the library's design choices, and the pitfalls | `docs/recipes/{layout,dnd-column-reorder,kbd-column-reorder,split-pane}.md` (four new files); cross-links from `README.md` and per-package READMEs | ~0 (docs only) |
| 4 | [CI benchmarks + bundler-recipes](./phase-4-ci-benchmarks-and-bundler-recipes.md) | Wire pivot+worker benches into CI as a new `bench` job with soft regression check; ship `docs/bundler-recipes.md` (Vite/webpack/Rollup/esbuild worker-entry snippets) | `.github/workflows/test.yml` (new `bench` job), `bench/baseline.json` (new), `bench/compare.ts` (helper), `docs/bundler-recipes.md` (new), reference-app `vite.config.ts` (recipe snippet cross-checked) | ~3-5 (benches-as-tests helper) |
| 5 | [SR matrix + v1.0 `api-freeze.md` + final verify + version bumps](./phase-5-sr-matrix-v1-api-freeze-and-verify.md) | The v1.0 closeout: SR matrix procedure + grid + results template; consolidated `api-freeze.md` replacing per-milestone chain; all four packages → `1.0.0`; `pnpm verify` exit 0 | `docs/m6-hardening/sr-matrix.md` (new), `docs/m6-hardening/api-freeze.md` (consolidated v1.0 contract), `docs/archive/api-freeze-history/` (existing api-freeze copies), `packages/*/package.json` (version bump `0.1.0` → `1.0.0`), `README.md` updates | ~5-8 |
| | **Total M6 tests** | | | **~24-38** (on top of M0–M5's ~640) |

Each phase file ends with §3 Commands + §4 Verification + §5 Out-of-scope + §6 Risks. The phases are independently runnable; `pnpm verify` is green after each.

---

## 5. Key risks

1. **Announcer strings vs. existing behavior** — Refactoring every announcer call to route through `t()` risks regressions in the keyboard/sort/expansion tests. Mitigation: keep the English defaults byte-identical to the M0–M5 strings (the test suite asserts on them); the i18n mechanism is *additive* over the existing live-region, not a swap.
2. **`tabBehavior: 'cells'` keyboard suite** — Tab-through-cells requires the focusable row ringer plus per-cell tab order. APG guidance varies; v1.0 ships `'exit'` only as default; `'cells'` is opt-in and the keyboard suite passes only for `'exit'`. The `'cells'` path gets a smoke test, not the full APG suite.
3. **CI bench flakiness** — On shared runners, 1.2× baseline is realistic for an SAP runner. Mitigation: 1.2× threshold as comment-only; 2.0× as a real warning; outlier-detection on a rolling window of 10 runs so a single bad run doesn't trigger.
4. **SR matrix without live testing** — M6 ships the matrix; the actual tests are out of band. Risk: matrix becomes shelfware. Mitigation: `CONTRIBUTING.md` (or `docs/release-process.md`) documents that any PR touching keyboard/screen-reader/file affect-listed files requires filling the matrix before merge.
5. **Version bump on additive change** — Bumping to `1.0.0` when the API is additive over `0.1.0` is semantically unusual. Mitigation: the api-freeze document explicitly states v1.0 is the stability signal, not a breaking change; the changelog records this. Consumers reading the npm registry version see `1.0.0` as the "stable" milestone.
6. **`tabBehavior` + `role="table"` interaction** — `navigationMode: 'none'` already downgrades `role="grid"` → `role="table"`. The `tabBehavior` option is `role="grid"`-only; the `'none'` mode ignores it. Spec §10 makes this clear; M6 doc updates to confirm.
7. **Recipe docs accuracy** — Documentation that drifts from the actual API is a known failure mode. Mitigation: each recipe file includes a "Last verified against" tag and references the exact v1.0 api-freeze section. A doc-only lint (markdown lint via biome) catches broken links at lint time.
8. **Bundler-recipes rot** — Vite/webpack/Rollup/esbuild versions evolve. Mitigation: tag each recipe with the bundler version + month; a "Bundler recipes verifying fixture" workflow runs `examples/m5-pivot-engines` against a pinned Vite version on PRs touching the docs.
9. **Pre-existing M4 cleanup items** — The M5 plan-summary noted two M4 cleanup items documented in the M4 phase files as polish items. They do not block M6 and can run in parallel inside this milestone if budget allows.

---

## 6. Verification

After all 5 phases, from a fresh clone at v1.0:

```bash
git clone <repo> && cd table-kit
pnpm install
pnpm verify                                                      # typecheck + lint + test + build — EXIT 0

# M6 tests added (announcer i18n, tabBehavior, benches-as-tests helper)
pnpm test                                                         # M0–M5 (~640) + M6 (~24-38) tests, all green

# Subpath smoke for the new messages/t() exports
node -e "import('@lynellf/tablekit-react').then(m => console.log('defaultMessages:', Object.keys(m.defaultMessages).length, 'sortKeys:', m.defaultMessages.sortAsc))"

# tabBehavior surface
node -e "import('@lynellf/tablekit-react').then(m => console.log('useDataTable uses tabBehavior via options')))"

# Recipe docs render (no broken links)
node -e "['layout','dnd-column-reorder','kbd-column-reorder','split-pane'].forEach(n => require('fs').accessSync('docs/recipes/'+n+'.md', require('fs').constants.R_OK))"

# Bench job exists (CI only)
grep -q "bench:" .github/workflows/test.yml

# SR matrix exists and links to spec §13 scenarios
test -f docs/m6-hardening/sr-matrix.md && grep -c "NVDA\|JAWS\|VoiceOver" docs/m6-hardening/sr-matrix.md | grep -q '^[1-9]'

# v1.0 api-freeze exists
test -f docs/m6-hardening/api-freeze.md

# Version is 1.0.0 on all four packages
grep -E '"version": "1\.0\.0"' packages/*/package.json
```

`pnpm verify` is the aggregate gate from the dev-tooling-bootstrap plan. All four sub-gates must pass with exit code 0.

---

## 7. M6 exit-criteria mapping (spec §14)

| Spec criterion | Where verified |
| --- | --- |
| **SR manual matrix** | `docs/m6-hardening/sr-matrix.md` — scenario grid (5 AT × 7 interaction scenarios), procedure, results-log template. **The actual manual results are out-of-band team work; the matrix is the gate.** |
| **Recipe docs (4)** | `docs/recipes/layout.md`, `dnd-column-reorder.md`, `kbd-column-reorder.md`, `split-pane.md` — each with copy-paste snippets, design rationale, and pitfalls. |
| **Benchmarks in CI** | `.github/workflows/test.yml` adds a `bench` job; runs `vitest bench` on the pivot main-thread + worker benches; uploads `bench-results.md` artifact; soft regression check at 1.2× rolling baseline. |
| **API review** | `docs/m6-hardening/api-freeze.md` — consolidated v1.0 contract for all four packages; replaces the per-milestone freezes; documents breaking-change policy for v1.x. |
| **§10 messages map + i18n** | `packages/react/src/messages.ts` + `i18n/t.ts`; all built-in announcer call sites route through `t()`; tests in `packages/react/src/__integration__/messages-i18n.test.tsx`. |
| **§16 #4 tabBehavior resolution** | `useTabBehavior.ts` + wiring into keyboard nav; default `'exit'`, opt-in `'cells'`; tests in `__integration__/tab-behavior.test.tsx`. |
| **§16 #8 bundler-recipes** | `docs/bundler-recipes.md` — Vite/webpack/Rollup/esbuild worker-entry snippets; matches the `createWorkerEntry()` API; reference app recipes cross-checked. |
| **Version → 1.0.0** | All four `packages/*/package.json` files updated; v1.0 tag + changelog. |
| **Breaking-change policy** | `api-freeze.md` §"Stability policy" documents that v1.x is additive; breaking changes land in v2 (per spec §2.3). |
| **Open-question resolutions (§16 #2 RTL, #4 tabBehavior)** | `api-freeze.md` §"Resolved open questions" — RTL pinned to physical `left`/`right` for v1; RTL recipe is documentation only; `tabBehavior` default `'exit'` with `'cells'` opt-in. |

---

## 8. Out-of-scope reminder

M6 does **not** ship `rowSelection`, state persistence helper, subtotals (`perLevel`), global quick filter, column auto-fit, hard-gating behind `allowWithinPageOperations`, columnar/`Arrow` transfer, `validateGridStructure` CLI / layered diagnostics, broader i18n (announcer-only in v1.0), or live AT regression in CI. These are explicit non-goals per spec §15, §16, and §14 (the §14 row is the v1.0 exit criteria — anything not in that row or in the M6 scope table above is deferred). A reviewer should flag any phase file that includes v1.5+ work as a scope violation.

---

## 9. Reviewer focus areas

For `plan-reviewer-a` and `plan-reviewer-b`, the highest-leverage areas to scrutinize:

1. **§3 decisions D1–D7** in [`overview.md`](./overview.md) — confirm the include/defer choices match the user's intent and the spec's recommendations. Especially D1 (announcer i18n shape), D2 (`tabBehavior` default), D5 (bench CI threshold), and D6 (consolidated api-freeze vs. per-milestone).
2. **Phase 1 (announcer messages + i18n)** — confirm `defaultMessages` keys exactly match every built-in announcer call site; confirm consumer override semantics (whole-map vs. per-key merge); confirm type ergonomics (Row type flows through unaffected).
3. **Phase 2 (`tabBehavior`)** — confirm `'exit'` matches APG and is the default; confirm `'cells'` ships as opt-in only; confirm `role="table"` downgrade ignores `tabBehavior`; confirm keyboard suite tests still pass for the default.
4. **Phase 3 (recipe docs)** — confirm the four files cover the named scenarios (layout, DnD reorder, kbd reorder, split-pane) with copy-paste snippets that match the v1.0 api-freeze exports; confirm `split-pane.md` does not require library code changes (only consumer CSS + scroll sync); confirm cross-links from `README.md`.
5. **Phase 4 (CI benchmarks + bundler-recipes)** — confirm the bench job is advisory (soft threshold), confirm bundler-recipes match the `createWorkerEntry()` factory from M5, confirm reference-app recipes cross-check.
6. **Phase 5 (SR matrix + v1.0 api-freeze + final verify)** — confirm SR matrix has 5 AT × 7 scenarios per spec §13; confirm api-freeze.md consolidates M0–M5 surface and lists M6 additions; confirm version bumps on all four packages; confirm `pnpm verify` exits 0.
7. **§6 risks** — especially announcer-string regressions (R1), CI bench flakiness (R3), SR matrix becoming shelfware (R4), and version-bump-on-additive-change (R5).
8. **Budget realism** — Phase 1 (announcer plumbing) is the largest; the budget is real. If reviewer findings expand Phase 1's i18n scope or add a sixth phase, escalate to the user for budget guidance rather than absorbing the overage.
