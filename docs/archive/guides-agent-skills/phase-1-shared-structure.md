# Phase 1 — Shared Structure & Template

**Phase:** 1 of 6
**Goal:** Stand up the `docs/guides/` directory tree with an index page and a doc-presence smoke test. Subsequent phases fill in the four target doc pairs against this scaffolding.
**Status:** Draft v1 for review

---

## 1. What this phase produces

1. `docs/guides/README.md` — index page that documents:
   - The four target slugs and their display names.
   - The shared SKILL.md frontmatter shape.
   - The shared guide.md section list.
   - The concept-table groups used by each guide (DataTable docs vs. pivot docs).
   - A "How to add a new target" stub (so future maintainers extending this to MUI X / Handsontable / etc. have a recipe).
2. `packages/core/src/__tests__/guides.test.ts` — a Vitest smoke test that asserts each target directory exists, each SKILL.md has the required frontmatter keys, and each guide.md has the required section headers + Verified against footer.

## 2. Files to create

| Path | Action | What it contains |
|------|--------|------------------|
| `docs/guides/README.md` | create | Index page (see §3) |
| `packages/core/src/__tests__/guides.test.ts` | create | Smoke test (see §4) |

## 3. `docs/guides/README.md` content shape

```markdown
# Guides & Agent Skills

Concept-map documents that map table-kit's `@lynellf/tablekit-react` and
`@lynellf/tablekit-pivot` feature surfaces onto popular external library
targets. Each target gets one `SKILL.md` (agent-skill frontmatter, used by
agents to pick up the task) plus a companion `guide.md` (recipe-style body,
readable by humans).

| Target | Display name | Companion guide | table-kit packages |
| --- | --- | --- | --- |
| `webix-datagrid` | Webix DataTable | [guide](./webix-datagrid/guide.md) | `@lynellf/tablekit-react` + `@lynellf/tablekit-core` |
| `webix-pivot` | Webix Pivot | [guide](./webix-pivot/guide.md) | `@lynellf/tablekit-pivot` + `@lynellf/tablekit-core` |
| `ag-grid-datagrid` | AG-Grid DataGrid | [guide](./ag-grid-datagrid/guide.md) | `@lynellf/tablekit-react` + `@lynellf/tablekit-core` |
| `ag-grid-pivot` | AG-Grid Pivot | [guide](./ag-grid-pivot/guide.md) | `@lynellf/tablekit-pivot` + `@lynellf/tablekit-core` |

> Verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).

## Shared structure

Every `SKILL.md` follows the same frontmatter shape:

| Key | Required | Example |
| --- | --- | --- |
| `name` | yes | `webix-datagrid` |
| `description` | yes | One-sentence trigger. `Use when …` |
| `type` | yes | `guide-companion` |
| `verified_against` | yes | `docs/m6-hardening/api-freeze.md v1.0.0` |
| `target` | yes | `webix-datagrid` |
| `tablekit_packages` | yes | List of `@lynellf/tablekit-*` packages referenced |
| `companion_guide` | yes | `./guide.md` |

Every `guide.md` follows the same body sections (in order):

1. `# <Display name> → table-kit concept map` (title + verified-against tag)
2. `## Mapping at a glance` — orientation paragraph
3. `## Concept → feature table` — one table per group (see below)
4. `## Where the target has no v1.0 analog` — bullet list
5. `## Where table-kit v1.0 is richer` — bullet list
6. `## See also` — links to docs/, recipes/, sibling guides
7. `## Verified against` — version footer

### Concept-table groups

**DataTable docs (`webix-datagrid`, `ag-grid-datagrid`):**

- Data & schema
- State & lifecycle
- Rendering & layout
- Interactions & accessibility

**Pivot docs (`webix-pivot`, `ag-grid-pivot`):**

- Data & schema
- Pivot configuration (rows/columns/measures/filters)
- Aggregation & totals
- Expansion, sorting & treegrid

Each table row has the shape: `| Target feature | table-kit analog | v1.0 coverage | Notes |` where `v1.0 coverage` is one of `full` / `partial` / `none`.

## How to add a new target

1. Pick a slug (kebab-case; matches the package's public name).
2. Create `docs/guides/<slug>/SKILL.md` and `guide.md`.
3. Fill the SKILL.md frontmatter (copy an existing one's shape).
4. Fill the guide.md sections (copy an existing one's shape; pick the matching concept-table group list).
5. Add a row to the index table above.
6. Add a "cross-link" bullet to any sibling guide whose target shares features with the new one.
7. Run `pnpm verify` — the doc-presence smoke test enforces the structural rules.

## See also

- `docs/m6-hardening/api-freeze.md` — v1.0 canonical API contract
- `docs/initial-spec.md` §1, §11 — table-kit's positioning vs. premium commercial grids
- `docs/recipes/README.md` — consumer-facing wiring patterns
- `.okf/concepts/documentation-conventions.md` — repo-wide documentation conventions
```

## 4. `packages/core/src/__tests__/guides.test.ts` content shape

A Vitest test that walks `docs/guides/` and asserts:

- Each of the four target directories exists.
- Each `SKILL.md` is non-empty and contains the literal lines `^name:`, `^description:`, `^verified_against:`, `^target:`, `^companion_guide:`.
- Each `guide.md` is non-empty and contains the literal section headers `## Mapping at a glance`, `## Concept → feature table`, `## Where the target has no v1.0 analog`, `## Where table-kit v1.0 is richer`, `## Verified against`.
- Every guide.md's `## Verified against` section cites `docs/m6-hardening/api-freeze.md`.

The test should:

- Be a `describe('docs/guides/')` block with one nested `describe` per target.
- Use `node:fs/promises` + `node:path` for path resolution from `process.cwd()`.
- Skip gracefully when a directory is missing (during Phase 1 the test runs against zero targets, so the inner `describe` blocks either `it.todo` or assert-empty — the implementer chooses between "fail-loud on missing target" and "warn-only until populated". The plan picks **fail-loud** so reviewers see at a glance that Phase 1 isn't enough.)
- Co-locate its expected-target list with the same list the README uses (DRY in spirit — accept a small duplication for clarity).
- Not import from any `@lynellf/*` package; the test is doc-only.

A representative shape:

```ts
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const GUIDES_DIR = resolve(process.cwd(), 'docs/guides');

const TARGETS = [
  'webix-datagrid',
  'webix-pivot',
  'ag-grid-datagrid',
  'ag-grid-pivot',
] as const;

const REQUIRED_SKILL_KEYS = [
  'name',
  'description',
  'verified_against',
  'target',
  'companion_guide',
] as const;

const REQUIRED_GUIDE_SECTIONS = [
  '## Mapping at a glance',
  '## Concept → feature table',
  '## Where the target has no v1.0 analog',
  '## Where table-kit v1.0 is richer',
  '## Verified against',
] as const;

describe('docs/guides/', () => {
  for (const target of TARGETS) {
    describe(target, () => {
      it('SKILL.md exists', async () => {
        const path = resolve(GUIDES_DIR, target, 'SKILL.md');
        const content = await readFile(path, 'utf8');
        expect(content.length).toBeGreaterThan(0);
      });

      it('SKILL.md has required frontmatter keys', async () => {
        const path = resolve(GUIDES_DIR, target, 'SKILL.md');
        const content = await readFile(path, 'utf8');
        for (const key of REQUIRED_SKILL_KEYS) {
          expect(content, `${target}/SKILL.md missing ${key}:`).toMatch(
            new RegExp(`^${key}:`, 'm'),
          );
        }
      });

      it('guide.md exists', async () => {
        const path = resolve(GUIDES_DIR, target, 'guide.md');
        const content = await readFile(path, 'utf8');
        expect(content.length).toBeGreaterThan(0);
      });

      it('guide.md has required sections', async () => {
        const path = resolve(GUIDES_DIR, target, 'guide.md');
        const content = await readFile(path, 'utf8');
        for (const section of REQUIRED_GUIDE_SECTIONS) {
          expect(content, `${target}/guide.md missing ${section}`).toContain(section);
        }
      });

      it('guide.md cites the v1.0 API freeze', async () => {
        const path = resolve(GUIDES_DIR, target, 'guide.md');
        const content = await readFile(path, 'utf8');
        expect(content).toContain('docs/m6-hardening/api-freeze.md');
      });
    });
  }
});
```

## 5. Acceptance criteria

- [ ] `docs/guides/README.md` exists, is non-empty, and contains the index table for all four targets (rows may have links that don't resolve yet — Phase 6 finalizes the cross-links).
- [ ] `packages/core/src/__tests__/guides.test.ts` exists and is non-empty.
- [ ] `pnpm test` runs the new smoke test and reports failure for each of the 20 assertions (5 per target × 4 targets) because the target directories don't exist yet. This is the expected Phase 1 exit state.
- [ ] `pnpm typecheck && pnpm lint && pnpm build` all exit 0 (the test file itself typechecks under the strict config).

## 6. Verification

```bash
# 1. Index page exists
test -s docs/guides/README.md

# 2. Smoke test exists
test -s packages/core/src/__tests__/guides.test.ts

# 3. Toolchain green (the new test file typechecks + lints even though its targets don't exist)
pnpm typecheck
pnpm lint

# 4. The smoke test fails (as expected) until Phases 2–5 land
pnpm test 2>&1 | grep -E "docs/guides|guides.test" | head -20
# Expected: failures for each missing target. Phase 1 deliberately ends in this state.
```

## 7. Risks

- **The smoke test deliberately fails on Phase 1 exit.** Phases 2–5 must land before `pnpm verify` goes green. This is intentional — the test guards structural convention.
- **Biome `noExplicitAny` rule.** The smoke test must avoid `any`; the shape above uses `as const` arrays and string literals only.
- **Vitest workspace config.** `packages/core/src/__tests__/` matches the `__tests__` convention used in `packages/pivot/src/__tests__/` (verified during planning). Confirm via `vitest.workspace.ts` that the `core` workspace picks up files under `__tests__/`. If not, move the file to `packages/core/src/__tests__/guides.test.ts` and rely on `vitest.config.ts`'s default include of `**/*.test.ts`.

## 8. Out of scope for this phase

- Writing the four doc pairs (Phases 2–5).
- Final cross-links in the README index (Phase 6).
- Any source code change in `packages/*/src/` (only the new test file lands in `packages/core/src/__tests__/`).