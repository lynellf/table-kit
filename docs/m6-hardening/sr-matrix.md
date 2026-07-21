<!-- Historical: true -->
# v1.0 Screen-Reader Manual Matrix

> Release gate for a11y-affecting changes. Spec §13.
> Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).

## 1. Scope

This matrix is the **release gate** for v1.0 and any future a11y-affecting change. The actual screen-reader (SR) testing is performed by humans outside the agent loop; this document is the procedure + the scenarios + the results-log template that PR reviewers must fill before merge.

Any PR touching the files listed in §6 must update the §5 results row before merge.

## 2. AT × Browser Matrix

Five screen reader × browser pairs (spec §13):

| AT         | Chrome (Windows/macOS) | Firefox (Windows) | Safari (macOS) |
| ---        | ---                    | ---               | ---            |
| NVDA       | ✓ (primary)            | ✓ (secondary)    |                |
| JAWS       | ✓ (primary)            |                  |                |
| VoiceOver  |                        |                  | ✓ (primary)   |

- **NVDA**: latest stable (2024.x). Windows.
- **JAWS**: latest stable (2024.x). Windows.
- **VoiceOver**: ships with macOS (latest). Safari only.

For each cell, run the scenarios in §3 and record results in §5.

## 3. Scenarios

Seven interaction scenarios per spec §13, applied to both DataTable and PivotTable (where applicable):

### 3.1 Grid navigation (DataTable)

- Step through rows and columns with Arrow keys.
- Verify SR announces cell coordinates (row N of M, column K of J).
- Verify focus indicators are visible *and* announced.
- For `role="grid"` (default): verify roving tabindex (Tab enters/exits grid; Arrows move focus).
- For `navigationMode: 'none'` (`role="table"`): verify no grid-specific navigation is active.

### 3.2 Sort announcements

- Click a sortable header to sort ascending.
- Verify SR announces the sort key + direction.
- Click again for descending. Verify announcement changes.
- Clear sort via keyboard (third click or aria-sort=None). Verify "Sort cleared" announcement.
- **M6 addition**: verify announcements come from the messages map (v1.0 i18n surface).

### 3.3 Resize widget

- Hover over a resize handle. Verify no announcement (hover is silent).
- Drag the handle. Verify no announcement during drag (only on commit per spec §10).
- On commit, verify the announcer fires: "Column X resized to N pixels" (or equivalent from the messages map).
- Verify the resize handle is keyboard-accessible: Tab to it, Space/Enter to activate, Arrows to adjust.

### 3.4 Pivot expand/collapse

- Expand a group row via keyboard (ArrowRight on a collapsed row-header).
- Verify `aria-expanded` toggles correctly.
- Verify the loader's `aria-busy` is set during child computation.
- Verify announcements: "Loading child rows" then "N child rows loaded" (from the M6 messages map).
- Collapse: ArrowLeft on an expanded row. Verify announcement.

### 3.5 Loading states

- Trigger a server-mode fetch (clear filter, paginate, sort, or pivot change).
- Verify `aria-busy` is set on the root table element during the fetch.
- Verify the announcer fires "Loading" (messages.map.loadingStarted) then "Loading complete" (messages.map.loadingFinished).

### 3.6 Mixed-mode operations

- With `allowWithinPageOperations` (soft warning mode), perform a client-side filter/sort on a server-mode table.
- Verify the soft warning is visible to sighted users and announced (or suppressed) appropriately for SR users.

### 3.7 Reorder (DnD + keyboard)

- **Pointer**: drag a column to a new position via the DnD recipe.
  - Verify "Column X moved from position N to M" announcement (messages.map.columnMoved).
- **Keyboard**: Space to lift, Arrows to move, Space to drop, Escape to cancel.
  - Verify each state transition is announced.
  - Verify `aria-pressed` on the grabbed header.

## 4. Procedure (worked example)

For each cell in §2 (AT × browser pair), run each scenario in §3:

1. Open the appropriate example app at v1.0.0:
   - DataTable: `examples/m3-server-modes/` or `examples/m5-pivot-engines/`
   - PivotTable: `examples/m5-pivot-engines/`
2. Start the screen reader.
3. Perform the scenario steps in §3.
4. Record the result in §5.

**NVDA + Chrome (primary)** is the recommended first cell to test — it has the best community coverage.

## 5. Results Log

Each release is a row; each column is a scenario. Empty or "skip" cells indicate the test was not run.

| Release | NVDA+Chrome grid nav | NVDA+Chrome sort | NVDA+Chrome resize | NVDA+Chrome pivot expand | NVDA+Chrome loading | NVDA+Chrome mixed-mode | NVDA+Chrome reorder DnD | NVDA+Chrome reorder kbd | JAWS+Chrome grid nav | JAWS+Chrome sort | VoiceOver+Safari grid nav | VoiceOver+Safari pivot expand | … |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1.0.0 | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | (to fill) | … |

*(Fill this table as part of the v1.0 release process. See `docs/release-process.md` §3.)*

## 6. Files That Trigger the Gate

Any PR touching these files must include a SR matrix row update before merge:

- `packages/react/src/useKeyboardNav.ts`
- `packages/react/src/usePivotKeyboardNav.ts`
- `packages/react/src/validate.ts` / accessibility validators
- `packages/react/src/ReactAnnouncer.tsx`
- `packages/react/src/messages.ts` / `i18n/` (announcer string changes)
- `packages/pivot/src/pivotTable/` (pivot a11y surface)
- `packages/core/src/keyboardNav.ts` (core keyboard navigation)
- `packages/react/src/__integration__/*.test.tsx` (a11y tree snapshot tests)

*(These paths are not exhaustive — an a11y-affecting change may touch other files. The PR description must include a "SR matrix impact" section.)*

## 7. How to File Results

1. Clone this repo and check out the PR branch.
2. Run the scenario in §3 using the SR + browser pair.
3. Record PASS / FAIL / SKIP in the §5 results log for that AT × scenario cell.
4. If any FAIL: file a separate issue and link it in the PR description.
5. The PR cannot merge without either all cells filled (PASS or SKIP) or a linked issue for each FAIL.

## 8. Known AT Variance

Spec §16 #9: AT variance is an accepted risk. The matrix documents the current state; deviations between ATs are expected and documented rather than blocking. Known variance:

- **NVDA vs JAWS**: JAWS sometimes suppresses live-region announcements in favor of virtual cursor. Test both.
- **VoiceOver**: Safari's VO does not expose `aria-colcount` in the same way as NVDA/JAWS. Verify column count announcements manually.
- **Treegrid**: VoiceOver does not expose the pivot tree as a treegrid in the same way NVDA does. The pivot expand/collapse scenario may require additional UI affordance for VoiceOver users.

## 9. Verification

This document is part of the v1.0 release. The matrix is complete as a *procedure*; the *results* are filled by humans post-v1.0 (see §5 and `docs/release-process.md` §3).
