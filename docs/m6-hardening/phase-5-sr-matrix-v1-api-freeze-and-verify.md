# M6 Phase 5 — SR matrix + v1.0 api-freeze + final verify

**Goal:** The v1.0 closeout per spec §13 and §14. (1) Ship the screen-reader matrix as a release-gate procedure, (2) consolidate the v1.0 api-freeze, (3) version-bump all four packages to `1.0.0`, (4) confirm `pnpm verify` exits 0.

**Files added:**
- `docs/m6-hardening/sr-matrix.md` — SR matrix: scenarios, procedure, results-log template
- `docs/m6-hardening/api-freeze.md` — consolidated v1.0 contract (replaces M5's per-milestone freeze as the canonical reference)
- `docs/archive/api-freeze-history/m0-core-engine.md` — copied from `docs/core-engine/` (if it had one; otherwise: a fresh stub noting M0 had no api-freeze)
- `docs/archive/api-freeze-history/{m1,m3,m4,m5}-*.md` — copies of existing freezes
- `docs/release-process.md` — short doc on how the SR matrix integrates with PR review

**Files modified:**
- All four `packages/*/package.json` — bump `0.1.0` → `1.0.0`
- `README.md` (root) — "Packages" table adds a row for `@lynellf/tablekit-pivot`, `@lynellf/tablekit-worker`; "Status" changes from `v0.1.0` to `v1.0.0`
- `docs/README.md` (if it exists, or created) — index of milestones
- `CHANGELOG.md` (root, if it exists; created otherwise) — v1.0 entry

**Tests added:** ~5-8 light cross-package integration tests that confirm v1.0 surface.

---

## 1. What this phase owns

- The SR matrix document. Spec §13 names it as *"a release gate for a11y-affecting changes"* — the matrix exists to gate future a11y PRs.
- The consolidated `api-freeze.md` for v1.0. The per-milestone freezes were internal gates; v1.0 is the consumer-facing release, and the api-freeze becomes the canonical reference.
- Version bumps. `1.0.0` on all four packages is the npm signal of stability.
- Final `pnpm verify` exit 0 — the aggregate gate.

---

## 2. Implementation

### 2.1 `docs/m6-hardening/sr-matrix.md`

```markdown
# v1.0 Screen-Reader Manual Matrix

> Release gate for a11y-affecting changes. Spec §13.
> Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).

## 1. Scope

This matrix is the **release gate** for v1.0 and any future a11y-affecting change. The actual SR testing is performed by humans outside the agent loop; this document is the procedure + the scenarios + the results-log template that PR reviewers must fill before merge.

## 2. AT × Browser matrix

Five screen reader × browser pairs (spec §13):

| AT       | Chrome (Windows/macOS) | Firefox (Windows) | Safari (macOS) |
| ---      | ---                    | ---               | ---            |
| NVDA     | ✓ (primary)            | ✓ (secondary)    |                |
| JAWS     | ✓ (primary)            |                  |                |
| VoiceOver |                       |                  | ✓ (primary)   |

NVDA: latest stable. JAWS: latest stable. VoiceOver: ships with macOS.

## 3. Scenarios

Seven interaction scenarios per spec §13, applied to both DataTable and PivotTable (where applicable):

### 3.1 Grid navigation (DataTable)

- Step through rows and columns with Arrow keys.
- Verify SR announces cell coordinates (row N of M, column K of J).
- Verify focus indicators are visible *and* announced.

### 3.2 Sort announcements

- Click a header to sort ascending; verify SR announces the sort key + direction.
- Click again for descending; verify announcement changes.
- Clear sort via keyboard; verify "Sort cleared" announcement (from M6 phase 1 `messages` map).

### 3.3 Resize widget

- Drag a resize handle; verify no announcement on hover or drag (only on commit).
- On commit, verify "Column X resized to N pixels" announcement.
- Verify the handle is keyboard-accessible per APG grid pattern.

### 3.4 Pivot expand/collapse

- Expand a group row; verify "Loading child rows" then "N child rows loaded" announcements.
- Verify `aria-expanded` toggles correctly.
- Verify the loader's `aria-busy` is set during child computation.

### 3.5 Loading states

- Trigger a server-mode fetch; verify `aria-busy` on the root + the announcer fires.
- Verify skeleton/placeholder rows expose themselves as placeholders to AT users.

### 3.6 Mixed-mode operations

- With `allowWithinPageOperations` warning firing, verify the warning is announced to assistive tech users (where applicable).

### 3.7 Reorder (DnD + keyboard)

- Drag a column to a new position; verify "Column X moved from N to M" announcement.
- Keyboard "grab" pattern: Space lifts, Arrows move, Space drops. Verify each step announces.

## 4. Procedure (worked example)

For each cell in §2 (AT × browser pair), run each scenario in §3:

1. Open the appropriate example app (`examples/m3-server-modes/`, `examples/m5-pivot-engines/`) at v1.0.0.
2. Start the screen reader.
3. Perform the scenario steps in §3.
4. Record the result in §5.

## 5. Results log

Each release is a row; each column is a scenario. Empty cells indicate the test was skipped or not yet run.

| Release | NVDA+Chrome grid nav | NVDA+Chrome sort | JAWS+Chrome resize | VoiceOver+Safari pivot expand |
| --- | --- | --- | --- | --- |
| v1.0.0 | (to fill) | (to fill) | (to fill) | (to fill) |

(Filling this table is the v1.0 release process; see `docs/release-process.md`.)

## 6. Filing process

PRs touching these files must include a SR matrix row update before merge:

- `packages/react/src/useKeyboardNav.ts`
- `packages/react/src/usePivotKeyboardNav.ts`
- `packages/react/src/validate.ts` / accessibility validators
- `packages/react/src/useSortAnnouncer.ts` (or equivalent)
- `packages/pivot/src/` (pivot a11y surface)
- `packages/react/src/__integration__/*.test.tsx` (any accessibility-tree snapshot test)

(These paths are not exhaustive; an a11y-affecting change may touch other files. The PR description must include a "SR matrix impact" section.)

## 7. Verification

This document is part of the v1.0 release. The matrix is complete as a *procedure*; the *results* are filled by humans post-v1.0 (see §5).
```

### 2.2 `docs/m6-hardening/api-freeze.md`

```markdown
# v1.0 API Freeze

> Canonical API contract for v1.0.0 — the npm release published from this repo.
> This document replaces the per-milestone freezes (`docs/mN-*/api-freeze.md`).
> Last verified: 2026-07-06.

## 1. Stability policy

v1.x is **additive**: minor versions add exports and behavior; no breaking changes.

- `v1.0.x` patches: bug fixes, performance, no API change.
- `v1.x` minor versions: additive exports, additive fields on existing types.
- Deprecations land in `v1.x` with a console warning.
- Breaking changes (rename, remove, semantic change) land in `v2.0`. Per spec §2.3 non-goals, none are planned; the breaking-change policy exists for emergency cases.

## 2. Resolved open questions (spec §16)

| # | Question | Resolution |
| -- | -------- | ---------- |
| 2 | RTL — physical `left`/`right` or logical `start/end`? | **PHYSICAL for v1** (matches CSS `position: sticky`). Consumers in RTL locales add a CSS mirror — see `docs/rtl-notes.md` (added in M6 if it doesn't exist; otherwise referenced). |
| 4 | `tabBehavior: 'exit' \| 'cells'`? | **BOTH, with `'exit'` default.** M6 phase 2 ships both. |
| 5 | Variable row heights + scroll anchoring | **Locked estimate + offset correction** (resolved in M2). |
| 7 | Level-1 debounce ownership | **Consumer-owned for v1** (M3). |
| 8 | Worker DX | **`createWorkerEntry()` factory + bundler-recipes doc** (M5 + M6 phase 4). |
| 9 | AT variance risk | **SR matrix procedure** (M6 phase 5). |
| 10 | Mixed-mode semantics | **Soft warnings in v1, hard-gating deferred to v2.** |

## 3. M6 additions (additive)

### Announcer i18n (M6 phase 1)

```ts
// @lynellf/tablekit-react
export declare const defaultMessages: Readonly<Record<AnnouncerKey, string | ((...args: unknown[]) => string)>>;
export declare type AnnouncerKey = keyof typeof defaultMessages;
```

`useDataTable({ messages?: Partial<typeof defaultMessages> })` and `usePivotTable({ messages?: ... })` accept per-key overrides. Default English is byte-identical to M0–M5's hardcoded strings.

### `tabBehavior` option (M6 phase 2)

```ts
// @lynellf/tablekit-core
export declare type TabBehavior = 'exit' | 'cells';

// @lynellf/tablekit-react
export declare function useTabBehavior(opts: {
  gridRef: React.RefObject<HTMLElement>;
  tabBehavior: TabBehavior;
}): void;
```

`useDataTable({ tabBehavior?: 'exit' | 'cells' })` (default `'exit'`). `'cells'` is opt-in and ships with smoke-test coverage.

## 4. v1.0 export list (consolidated from M0–M5)

### `@lynellf/tablekit-core` (v1.0.0)

{M0 surface, copy-paste from M5 api-freeze}

(No M6 additions to core beyond the `TabBehavior` type.)

### `@lynellf/tablekit-react` (v1.0.0)

{M1 + M2 surface, plus the M6 additions above}

### `@lynellf/tablekit-pivot` (v1.0.0)

{M4 surface, reaffirmed from M5 api-freeze}

### `@lynellf/tablekit-worker` (v1.0.0)

{M5 surface, reaffirmed from M5 api-freeze}

## 5. Deprecations

None in v1.0.

## 6. Migration from 0.x

None required. v1.0 is additive over `0.1.0`; all `0.1.0` callsites still work.

## 7. See also

- M5 freeze (historical): `docs/archive/api-freeze-history/m5-pivot-engines.md`
- M4 freeze (historical): `docs/archive/api-freeze-history/m4-pivot-main-thread.md`
- M3 freeze (historical): `docs/archive/api-freeze-history/m3-server-modes.md`
- M5 plan: `docs/m5-pivot-engines/plan-summary.md`
- Spec: `docs/initial-spec.md`
- Recipes: `docs/recipes/`
- SR matrix: `docs/m6-hardening/sr-matrix.md`
- Bundler recipes: `docs/bundler-recipes.md`
```

### 2.3 `docs/release-process.md`

A short doc (one page) describing the release process for v1.x:

```markdown
# Release Process (v1.x)

## Cutting a release

1. `pnpm verify` exits 0.
2. Update `bench/baseline.json` if bench drift was observed.
3. Fill the SR matrix row for the new version (see `docs/m6-hardening/sr-matrix.md` §5).
4. `pnpm changeset` and `pnpm changeset version` per Changesets convention (or manual version bump if Changesets isn't wired).
5. Tag the release: `git tag v1.0.0`.
6. Publish: `pnpm release:core && pnpm release:react && pnpm release:pivot && pnpm release:worker`.
7. Update the changelog at the root.

## SR matrix integration

Any PR touching an a11y-affecting file (see `docs/m6-hardening/sr-matrix.md` §6) must update the matrix's §5 results row in the same PR. Reviewers verify the matrix update before merge.
```

### 2.4 Version bumps

`packages/core/package.json`, `packages/react/package.json`, `packages/pivot/package.json`, `packages/worker/package.json`:

```diff
- "version": "0.1.0",
+ "version": "1.0.0",
```

Same for the four optional `proto` subpath package.json files (if any). Verify with `grep -E '"version":' packages/*/package.json`.

### 2.5 Archive the existing freezes

```bash
mkdir -p docs/archive/api-freeze-history
cp docs/m5-pivot-engines/api-freeze.md docs/archive/api-freeze-history/m5-pivot-engines.md
cp docs/m4-pivot-main-thread/api-freeze.md docs/archive/api-freeze-history/m4-pivot-main-thread.md
cp docs/m3-server-modes/api-freeze.md docs/archive/api-freeze-history/m3-server-modes.md
# M0, M1, M2 may not have separate api-freeze files; if so, this phase creates stubs noting that.
```

(M0–M2 may have had their api-freeze folded into the per-milestone `plan-summary.md`. Phase 5 checks; if absent, a stub notes "frozen as part of the M0/M1/M2 plan-summary.md; milestone gates via `pnpm verify`.")

---

## 3. Commands

```bash
# After phase 5:
pnpm verify                                                      # EXIT 0
grep -E '"version": "1\.0\.0"' packages/*/package.json           # 4 matches
test -f docs/m6-hardening/sr-matrix.md
test -f docs/m6-hardening/api-freeze.md
test -f docs/release-process.md
test -f docs/archive/api-freeze-history/m5-pivot-engines.md

# Final v1.0 hygiene:
node -e "const p = require('./packages/core/package.json'); if (p.version !== '1.0.0') throw new Error('wrong version');"
node -e "const p = require('./packages/react/package.json'); if (p.version !== '1.0.0') throw new Error('wrong version');"
node -e "const p = require('./packages/pivot/package.json'); if (p.version !== '1.0.0') throw new Error('wrong version');"
node -e "const p = require('./packages/worker/package.json'); if (p.version !== '1.0.0') throw new Error('wrong version');"
```

---

## 4. Verification

- `pnpm verify` exits 0 (the aggregate gate from `dev-tooling-bootstrap`).
- All four packages report `1.0.0`.
- `docs/m6-hardening/sr-matrix.md` exists with 5 AT × 7 scenarios.
- `docs/m6-hardening/api-freeze.md` exists; consolidates M0–M5 surface and lists M6 additions.
- `docs/archive/api-freeze-history/` contains the historical freezes.
- `docs/release-process.md` documents the SR matrix integration into PR review.
- A "Last verified" tag is on every doc this phase creates.

---

## 5. Out-of-scope

- **Live SR test execution.** The matrix is the procedure; the actual testing is team work after v1.0 launch.
- **CHANGELOG.md history beyond v1.0.** M0–M5 changelog entries are not back-ported; the v1.0 entry references the per-milestone plans.
- **npm publish.** M6 cuts the version bump and tags the milestone; npm publish is a separate step (matches the existing `release:*` scripts in `package.json`).

---

## 6. Risks

- **R5A: `pnpm verify` red on M6 surface.** Cross-package tests catch most issues; the implementer iterates as needed before declaring M6 complete.
- **R5B: api-freeze.md drifts from the actual exports.** The api-freeze is copy-paste from the existing M5 freeze plus the M6 additions; a doc-vs-code audit in the reviewer pass catches any drift. (Done via `grep -E "export declare" packages/*/src/index.ts` cross-checked against the freeze.)
- **R5C: SR matrix becomes shelfware.** Mitigation: `release-process.md` explicitly states that v1.x releases require filling the matrix row.
- **R5D: Version bump contradicts semver mental model.** Documented in the api-freeze as the "v1.0 stability signal"; the changelog and stable-policy note explain.
- **R5E: Two M4 cleanup items surface.** The M5 plan-summary named them as polish items not blocking M5. M6 may absorb them (small, low-risk). If substantial, escalate.
