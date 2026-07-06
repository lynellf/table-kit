# M6 Phase 3 — Recipe docs (layout, DnD reorder, keyboard reorder, split-pane)

**Goal:** Ship the four recipe docs named in spec §14 row 7: layout, DnD column reorder, keyboard column reorder, split-pane. **Documentation-only phase.** Zero library code changes.

**Files added (4):**
- `docs/recipes/layout.md`
- `docs/recipes/dnd-column-reorder.md`
- `docs/recipes/kbd-column-reorder.md`
- `docs/recipes/split-pane.md`

**Files modified:**
- `README.md` — add a "Recipes" section linking to `docs/recipes/`
- `packages/core/README.md` — link to `docs/recipes/{layout,split-pane}.md`
- `packages/react/README.md` — link to `docs/recipes/{layout,split-pane,dnd-column-reorder,kbd-column-reorder}.md`
- `docs/recipes/README.md` — index page (lists all four recipes with one-line summaries)

**Tests added:** 0 (docs only). A markdown link-check is wired into `pnpm lint` to catch broken cross-refs.

---

## 1. What this phase owns

Each recipe is a **consumer-facing guide** that:
- States the problem (1-2 paragraphs).
- Provides a copy-paste implementation that runs against the v1.0 api-freeze.
- Lists the pitfalls with explicit links back to the relevant spec section.
- Ends with a "Last verified against" tag (e.g., "v1.0.0 — `docs/m6-hardening/api-freeze.md`").

The recipe docs are the first thing a consumer hits after `npm install`. They are the practical mirror of the spec.

---

## 2. Recipe specs

### 2.1 `docs/recipes/layout.md` (the default recipe)

**Pattern:** Single scroll container; rows use `position: absolute; top: <offset>px; width: max-content` inside the spacer; pinned cells use `position: sticky; left|right: column.getPinnedOffset()px`; header row is sticky on top inside the same container.

**Pitfalls to call out:**
1. **`top`, not `transform: translateY`.** A transformed ancestor becomes the containing block for `position: sticky`, which silently breaks pinned columns. This is the single biggest layout footgun (spec §6.3 verbatim).
2. **One scroll container.** Horizontal scroll lives on the same element as vertical scroll; this is what makes pinned columns stick to the viewport correctly.
3. **Header row sticky on top inside the same container.** Header and body share one horizontal scrollbar.
4. **Z-index ladder.** Pinned header > header > pinned cell > cell. Document the ladder; consumers can't override it without breaking the sticky behavior.
5. **Column virtualization exclusions.** Pinned columns are excluded from column virtualization and always rendered (spec §7.3).

**Code:** Provides a self-contained `<Grid>` component (a minimal styled wrapper around `useDataTable`).

### 2.2 `docs/recipes/dnd-column-reorder.md`

**Pattern:** Use `dnd-kit/core` (any DnD library works; dnd-kit is the chosen example). Drive `table.moveColumn(id, toIndex)` on drop. Header cell exposes the dnd-kit `setNodeRef` + `attributes` + `listeners` via the prop getter.

**Pitfalls:**
1. **Pin-region crossings.** Reordering across pinning boundaries re-pins to the target region (spec §8.3). The recipe shows how to render an "unpinned → pinned-left" drop zone visually.
2. **Keyboard parity.** Mouse-only drag breaks a11y. The recipe cross-references `kbd-column-reorder.md` (same release).
3. **Stable ids.** Use the column id, not the index, as the drag item id (spec §6.1 — prop getters expose stable ids).
4. **Announcer messages on drop.** Reorder fires `columnMoved(id, from, to)` through the messages map from phase 1.

**Code:** Provides a working dnd-kit example wiring `table.moveColumn`.

### 2.3 `docs/recipes/kbd-column-reorder.md`

**Pattern:** "Grab" pattern on the header (spec §8.3 verbatim):
- **Space** to lift (the column enters "grabbed" mode; ARIA `aria-pressed`).
- **Arrow Left / Arrow Right** to move within the header row.
- **Space** to drop at the new position.
- **Escape** to cancel (returns the column to its original position).

The recipe ships a copy-paste keyboard implementation built on:
- `table.moveColumn(id, toIndex)` — the library action.
- The M6 phase 1 `messages` map — every state transition (lift, move, drop, cancel) announces through `aria-live`.

**Pitfalls:**
1. **Escape restores the original position.** The recipe uses an internal "original position" store during the grab.
2. **No reordering across pinning boundaries via keyboard alone.** v1.0 ships keyboard-reorder within a single pin region; cross-region is v1.5 (or always use the mouse + cross-region pattern from `dnd-column-reorder.md`).
3. **Announcer messages come from the messages map.** Consumers must override `grabbed`, `movedTo`, `dropped`, `canceled` keys for non-English.

**Code:** Provides a `<KbdReorderHeaderCell>` wrapper component.

### 2.4 `docs/recipes/split-pane.md`

**Pattern:** Three viewports (left, center, right) with **scroll sync** via shared `scrollLeft` state. Used when the surrounding layout imposes a transform that would break sticky.

**Pitfalls:**
1. **Scroll sync overhead.** Each scroll event triggers a `setState` on the shared `scrollLeft`. Throttle to one update per `requestAnimationFrame`.
2. **Horizontal scroll synchronization.** All three viewports share `scrollLeft`. Vertical scroll is per-viewport (each pane scrolls its rows independently).
3. **No library code changes.** Pinned/unpinned column sets and offsets are exposed as data (spec §6.3). The recipe is purely consumer-side CSS + scroll-sync.
4. **When NOT to use.** If transforms aren't in the surrounding layout, use `layout.md` instead — it's faster and simpler.

**Code:** Provides a `<SplitPaneGrid>` component using `useDataTable` + a small `useScrollSync` hook.

---

## 3. Markdown structure (per recipe file)

```markdown
# {Title}

> Recipe — Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`)

## Problem

{1-2 paragraphs describing the integration pattern and when to use it.}

## Implementation

{copy-paste snippet, fully self-contained, ~30-80 lines}

```tsx
// The implementation
```

## How it works

{Walk through the code: what each prop getter returns, what each state slice does.}

## Pitfalls

1. **{Pitfall name}.** {Description with link to spec section.}
2. ...

## See also

- Related recipes
- Spec §X.Y
- M6 phase file

## Verified against

- Package versions: `@lynellf/tablekit-core@1.0.0`, `@lynellf/tablekit-react@1.0.0`
- Spec: `docs/initial-spec.md` (v1.0)
- API freeze: `docs/m6-hardening/api-freeze.md` (v1.0)
```

### 3.1 `docs/recipes/README.md` (index)

```markdown
# Recipes

Consumer-facing integration patterns. Each recipe is a copy-paste snippet with pitfalls.

| Recipe | What it solves | Library surface |
| --- | --- | --- |
| [layout.md](../recipes/layout.md) | Default recipe: virtualization + sticky pinning in one scroll container | `useDataTable` + prop getters |
| [dnd-column-reorder.md](../recipes/dnd-column-reorder.md) | Pointer-based column re-ordering via dnd-kit | `useDataTable` + `moveColumn` |
| [kbd-column-reorder.md](../recipes/kbd-column-reorder.md) | Keyboard "grab" pattern: Space → Arrows → Space | `useDataTable` + `moveColumn` + announcer |
| [split-pane.md](../recipes/split-pane.md) | Left/center/right viewports with scroll sync (use when surrounding layout has transforms) | `useDataTable` + a small `useScrollSync` hook |
```

---

## 4. Commands

```bash
# Render check (markdown lint, broken-link lint):
pnpm lint                       # includes markdown-style lint via biome

# Manual review: open the files and verify the snippets compile mentally
# (no test runner involved in this phase)

# Cross-link check (broken-link script wired to lint)
node scripts/check-broken-links.mjs docs/recipes/
```

---

## 5. Verification

- All four recipe files exist under `docs/recipes/`.
- Each file is self-contained (no external snippet dependencies — each example imports only from `@lynellf/tablekit-react`).
- `docs/recipes/README.md` lists all four recipes.
- Cross-links from root `README.md` and per-package READMEs.
- The markdown-link lint pass catches broken anchor refs at lint time.
- Spot-check: copy each snippet into a sandbox Vite project with the v1.0 packages installed; all four compile. (Manual sanity check; not automated in this phase.)

---

## 6. Out-of-scope

- **More recipes** (sort, filter, pagination, etc.). The M6 milestone names these four specifically (spec §14). Other recipes (e.g., `pagination.md`, `sort.md`) are v1.5+ if requested.
- **Recipe playgrounds** (an `examples/recipes/` Vite app with each recipe running live). Out of v1.0 budget; the reference apps (`m3-`, `m4-`, `m5-pivot-engines`) cover the live-demo need.
- **Translations of the recipes.** English-only v1.0; consumer translations are community-driven post-v1.0.

---

## 7. Risks

- **R7A: Recipe snippets drift from the v1.0 api-freeze.** Each recipe files tags the freeze it was verified against; a follow-up agent task checks recipes on every api-freeze change.
- **R7B: Copy-paste snippets use preview APIs.** The recipe review (this phase) audits every snippet for `import` lines and prop getter usage against the v1.0 freeze.
- **R7C: Pitfall list misses a known footgun.** The implementer cross-references each pitfall with a spec section; reviewers verify the cross-references in §9 of `plan-summary.md` (reviewer focus area 4).
