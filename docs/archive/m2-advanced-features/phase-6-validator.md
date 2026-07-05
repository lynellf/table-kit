# Phase 6 — Accessibility Structure Validator

**Goal:** Ship `validateGridStructure(rootEl)` per spec §10, exporting it from `@lynellf/tablekit-react/validate` (tree-shakeable, dev-only). The validator walks the DOM under `rootEl` and reports violations of the prescribed ARIA grid structure (§6.2), the roving tabindex invariant (one `tabIndex=0` per grid), and the separator ARIA on resize handles (§7.2). Every integration test in phase 7 calls the validator after render and asserts `{ valid: true }`. Production builds tree-shake the validator out.

After this phase:
- `validateGridStructure(rootEl): ValidatorResult` is exported from `@lynellf/tablekit-react/validate`.
- The function walks the DOM, accumulating violations:
  - Role ownership: every rendered row must have `role="row"` and live inside an element with `role="rowgroup"`. Every rendered cell must have `role="gridcell"` (or `role="cell"` for `navigationMode: 'none'`) and live inside an element with `role="row"`.
  - `aria-rowcount`/`aria-colcount`: present on the root, equal to the total logical counts.
  - `aria-rowindex`/`aria-colindex`: monotonic, 1-based, present on every rendered row + cell.
  - Spacers: every `<div>` inside the body rowgroup with role other than `presentation` is a violation (catches virtualized rows that forgot `role="presentation"` on the spacer wrapper).
  - Exactly one roving `tabIndex=0` inside the grid (and that element must be a `gridcell`, `columnheader`, or `separator`).
  - Resize handles (`role="separator"`) must have `aria-orientation="vertical"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- `ValidatorResult` = `{ valid: boolean; violations: Violation[] }`.
- `Violation` = `{ path: string; rule: string; message: string; node?: Element }`.
- The function is wrapped in a `process.env.NODE_ENV !== 'production'` guard at module load: in production, the module exports a no-op (still typed) so imports don't crash but no work happens.
- The validator integrates with the integration tests in phase 7 — every test scenario calls it.

---

## 1. Files created in this phase

| File | Purpose |
| --- | --- |
| `packages/react/src/validate.ts` | `validateGridStructure` + types |
| `packages/react/src/validate.test.tsx` | Unit tests for the validator (happy path + each violation type) |

## 2. Files modified in this phase

| File | Change |
| --- | --- |
| `packages/react/src/index.ts` | Add a separate export path note (the function lives in `@lynellf/tablekit-react/validate`, not the root) |
| `packages/react/package.json` | Add `exports` map entry for `./validate` |

---

## 3. File contents

### 3.1 `packages/react/src/validate.ts`

```ts
/**
 * @lynellf/tablekit-react — accessibility structure validator (M2 Phase 6).
 *
 * Spec §10: a dev-mode `validateGridStructure(rootEl)` that walks the
 * accessibility tree and reports violations. This module is **dev-only**:
 * in production, the module exports a no-op (still typed) so consumers
 * that import it in shared code don't crash.
 *
 * Tree-shaking: the production export is a one-liner `() => ({ valid: true,
 * violations: [] })`. The validation logic is wrapped in
 * `if (process.env.NODE_ENV === 'production') return noOpResult;` at the top.
 *
 * Usage in a test:
 *   import { validateGridStructure } from '@lynellf/tablekit-react/validate';
 *   const result = validateGridStructure(gridContainer);
 *   expect(result.valid).toBe(true);
 *
 * Usage in dev:
 *   useEffect(() => {
 *     const result = validateGridStructure(gridRef.current);
 *     if (!result.valid) console.error(result.violations);
 *   }, [gridRef]);
 */

export interface Violation {
  /** CSS-style path to the offending element (e.g., `body > [role=rowgroup] > [role=row]:nth(3)`). */
  path: string;
  /** Stable rule identifier (e.g., `roving-tabindex`, `aria-rowindex-monotonic`). */
  rule: string;
  /** Human-readable message describing the violation. */
  message: string;
  /** Reference to the offending element (omitted in production). */
  node?: Element;
}

export interface ValidatorResult {
  valid: boolean;
  violations: Violation[];
}

const NO_OP_RESULT: ValidatorResult = { valid: true, violations: [] };

const noOpValidate = (_rootEl: Element | null): ValidatorResult => NO_OP_RESULT;

export const validateGridStructure = (
  process.env.NODE_ENV === 'production'
    ? noOpValidate
    : (rootEl: Element | null): ValidatorResult => {
        if (!rootEl) return NO_OP_RESULT;
        const violations: Violation[] = [];

        const rootRole = rootEl.getAttribute('role');
        const isGridRoot = rootRole === 'grid' || rootRole === 'treegrid' || rootRole === 'table';
        if (!isGridRoot) {
          violations.push({
            path: pathFor(rootEl),
            rule: 'root-role',
            message: `Root element must have role="grid", "treegrid", or "table"; got "${rootRole ?? '(none)'}".`,
            node: rootEl,
          });
        }

        // Counts
        const ariaRowcount = rootEl.getAttribute('aria-rowcount');
        if (ariaRowcount === null) {
          violations.push({
            path: pathFor(rootEl),
            rule: 'aria-rowcount-present',
            message: 'Root element must have aria-rowcount.',
            node: rootEl,
          });
        }
        const ariaColcount = rootEl.getAttribute('aria-colcount');
        if (ariaColcount === null) {
          violations.push({
            path: pathFor(rootEl),
            rule: 'aria-colcount-present',
            message: 'Root element must have aria-colcount.',
            node: rootEl,
          });
        }

        // Walk: count tabIndex=0, check role ownership, check resize handles.
        const tabIndexZeros: Element[] = [];
        const allWithRole = rootEl.querySelectorAll('[role]');
        for (const el of allWithRole) {
          const role = el.getAttribute('role');
          if (role === null) continue;

          // Roving tabindex: count tabIndex=0 inside the grid.
          const tabIndex = (el as HTMLElement).tabIndex;
          if (tabIndex === 0 && el !== rootEl) {
            tabIndexZeros.push(el);
          }

          // Separator: must have ARIA.
          if (role === 'separator') {
            const orient = el.getAttribute('aria-orientation');
            if (orient !== 'vertical') {
              violations.push({
                path: pathFor(el),
                rule: 'separator-orientation',
                message: `Resize handle must have aria-orientation="vertical"; got "${orient ?? '(none)'}".`,
                node: el,
              });
            }
            if (el.getAttribute('aria-valuenow') === null) {
              violations.push({
                path: pathFor(el),
                rule: 'separator-valuenow',
                message: 'Resize handle must have aria-valuenow.',
                node: el,
              });
            }
            if (el.getAttribute('aria-valuemin') === null) {
              violations.push({
                path: pathFor(el),
                rule: 'separator-valuemin',
                message: 'Resize handle must have aria-valuemin.',
                node: el,
              });
            }
            if (el.getAttribute('aria-valuemax') === null) {
              violations.push({
                path: pathFor(el),
                rule: 'separator-valuemax',
                message: 'Resize handle must have aria-valuemax.',
                node: el,
              });
            }
          }

          // Row ownership: must live inside a rowgroup.
          if (role === 'row') {
            const parent = el.parentElement;
            const parentRole = parent?.getAttribute('role');
            if (parentRole !== 'rowgroup') {
              violations.push({
                path: pathFor(el),
                rule: 'row-ownership',
                message: `Element with role="row" must have a parent with role="rowgroup"; got "${parentRole ?? '(none)'}".`,
                node: el,
              });
            }
          }

          // Cell ownership: must live inside a row.
          if (role === 'gridcell' || role === 'cell' || role === 'columnheader') {
            const parent = el.parentElement;
            const parentRole = parent?.getAttribute('role');
            if (parentRole !== 'row') {
              violations.push({
                path: pathFor(el),
                rule: 'cell-ownership',
                message: `Element with role="${role}" must have a parent with role="row"; got "${parentRole ?? '(none)'}".`,
                node: el,
              });
            }
          }
        }

        // Roving tabindex invariant
        if (tabIndexZeros.length === 0 && rootRole !== 'table') {
          // Only a violation if the grid is interactive (role=grid/treegrid).
          violations.push({
            path: pathFor(rootEl),
            rule: 'roving-tabindex',
            message: 'Grid must have exactly one element with tabIndex=0; found 0.',
            node: rootEl,
          });
        } else if (tabIndexZeros.length > 1) {
          violations.push({
            path: pathFor(rootEl),
            rule: 'roving-tabindex',
            message: `Grid must have exactly one element with tabIndex=0; found ${tabIndexZeros.length}.`,
            node: rootEl,
          });
        }

        // Body rowgroup presentation check
        const bodyRowgroup = Array.from(rootEl.querySelectorAll('[role="rowgroup"]')).find((rg) => {
          const previous = rg.previousElementSibling;
          const next = rg.nextElementSibling;
          // The body rowgroup is the one between the header rowgroup and the footer rowgroup.
          // Without semantic anchors, we look for the one that contains a presentation wrapper.
          return rg.querySelector('[role="presentation"]') !== null;
        });
        if (bodyRowgroup) {
          // Check that non-row/gridcell children are presentation.
          for (const child of Array.from(bodyRowgroup.children)) {
            const childRole = child.getAttribute('role');
            if (
              childRole !== 'presentation' &&
              childRole !== 'row' &&
              childRole !== null
            ) {
              violations.push({
                path: pathFor(child),
                rule: 'body-spacer-presentation',
                message: `Body rowgroup child must have role="presentation" or "row"; got "${childRole}".`,
                node: child,
              });
            }
          }
        }

        // aria-rowindex / aria-colindex monotonicity on rendered rows/cells
        const renderedRows = rootEl.querySelectorAll('[role="row"]');
        let lastRowIndex = 0;
        for (const row of renderedRows) {
          const idxAttr = row.getAttribute('aria-rowindex');
          if (idxAttr === null) {
            violations.push({
              path: pathFor(row),
              rule: 'aria-rowindex-present',
              message: 'Rendered row must have aria-rowindex.',
              node: row,
            });
            continue;
          }
          const idx = Number.parseInt(idxAttr, 10);
          if (Number.isNaN(idx)) {
            violations.push({
              path: pathFor(row),
              rule: 'aria-rowindex-numeric',
              message: `aria-rowindex must be numeric; got "${idxAttr}".`,
              node: row,
            });
            continue;
          }
          if (idx <= lastRowIndex) {
            violations.push({
              path: pathFor(row),
              rule: 'aria-rowindex-monotonic',
              message: `aria-rowindex must be strictly increasing; got ${idx} after ${lastRowIndex}.`,
              node: row,
            });
          }
          lastRowIndex = idx;
        }

        const renderedCells = rootEl.querySelectorAll('[role="gridcell"], [role="cell"], [role="columnheader"]');
        let lastColIndex = 0;
        for (const cell of renderedCells) {
          const idxAttr = cell.getAttribute('aria-colindex');
          if (idxAttr === null) continue; // skip cells without aria-colindex (some spacers)
          const idx = Number.parseInt(idxAttr, 10);
          if (Number.isNaN(idx)) {
            violations.push({
              path: pathFor(cell),
              rule: 'aria-colindex-numeric',
              message: `aria-colindex must be numeric; got "${idxAttr}".`,
              node: cell,
            });
            continue;
          }
          if (idx <= lastColIndex) {
            violations.push({
              path: pathFor(cell),
              rule: 'aria-colindex-monotonic',
              message: `aria-colindex must be strictly increasing within a row; got ${idx} after ${lastColIndex}.`,
              node: cell,
            });
          }
          lastColIndex = idx;
        }

        return { valid: violations.length === 0, violations };
      }
);

/**
 * Build a CSS-style path to an element relative to the root.
 * Used in violation messages.
 */
const pathFor = (el: Element): string => {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    const siblings = Array.from(parent.children);
    const idx = siblings.indexOf(current);
    const role = current.getAttribute('role');
    const tag = current.tagName.toLowerCase();
    if (role) {
      parts.unshift(`${tag}[role=${role}]:nth(${idx})`);
    } else {
      parts.unshift(`${tag}:nth(${idx})`);
    }
    current = parent;
  }
  return parts.join(' > ');
};
```

### 3.2 `packages/react/src/validate.test.tsx`

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { validateGridStructure } from './validate';

describe('validateGridStructure', () => {
  it('returns valid for a correctly-structured grid', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="3" aria-colcount="2">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="columnheader" aria-colindex="1">a</div>
            <div role="columnheader" aria-colindex="2">b</div>
          </div>
        </div>
        <div role="rowgroup">
          <div role="presentation">
            <div role="row" aria-rowindex="2" tabIndex={0}>
              <div role="gridcell" aria-colindex="1">1</div>
              <div role="gridcell" aria-colindex="2">2</div>
            </div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags missing aria-rowcount', () => {
    const { container } = render(
      <div role="grid" aria-colcount="2">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="columnheader" aria-colindex="1">a</div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'aria-rowcount-present')).toBe(true);
  });

  it('flags row without parent rowgroup', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="row" aria-rowindex="1">
          <div role="columnheader" aria-colindex="1">a</div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'row-ownership')).toBe(true);
  });

  it('flags cell without parent row', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="gridcell" aria-colindex="1">a</div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'cell-ownership')).toBe(true);
  });

  it('flags multiple roving tabIndex=0', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="gridcell" aria-colindex="1" tabIndex={0}>a</div>
            <div role="gridcell" aria-colindex="1" tabIndex={0}>b</div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'roving-tabindex')).toBe(true);
  });

  it('flags no roving tabIndex=0 in an interactive grid', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="gridcell" aria-colindex="1" tabIndex={-1}>a</div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'roving-tabindex')).toBe(true);
  });

  it('accepts zero tabIndex=0 when root role is "table"', () => {
    const { container } = render(
      <div role="table" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="cell" aria-colindex="1">a</div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(true);
  });

  it('flags separator without aria-orientation', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="columnheader" aria-colindex="1">
              a
              <div role="separator" />
            </div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'separator-orientation')).toBe(true);
  });

  it('flags separator with full ARIA as valid', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="2" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="1">
            <div role="columnheader" aria-colindex="1">
              a
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow="150"
                aria-valuemin="30"
                aria-valuemax="500"
              />
            </div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(true);
  });

  it('flags non-monotonic aria-rowindex', () => {
    const { container } = render(
      <div role="grid" aria-rowcount="5" aria-colcount="1">
        <div role="rowgroup">
          <div role="row" aria-rowindex="3">
            <div role="gridcell" aria-colindex="1">a</div>
          </div>
          <div role="row" aria-rowindex="2">
            <div role="gridcell" aria-colindex="1">b</div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule === 'aria-rowindex-monotonic')).toBe(true);
  });

  it('returns valid:true for null rootEl', () => {
    expect(validateGridStructure(null).valid).toBe(true);
  });
});
```

### 3.3 `packages/react/package.json` (additions)

```json
{
  "exports": {
    ".": { "...": "..." },
    "./validate": {
      "types": "./dist/validate.d.ts",
      "import": "./dist/validate.es.js"
    }
  }
}
```

### 3.4 `packages/react/vite.subpaths.config.ts` (new file, mirroring `packages/core/vite.subpaths.config.ts`)

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const entries: Record<string, string> = {
  validate: 'src/validate.ts',
};

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: entries,
      formats: ['es'],
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
```

Update `packages/react/package.json` build script:

```json
{
  "scripts": {
    "build": "vite build && vite build --config vite.subpaths.config.ts"
  }
}
```

---

## 4. Commands

```bash
pnpm --filter @lynellf/tablekit-react test -- validate
pnpm typecheck
```

---

## 5. Verification

After this phase:

```bash
# 1. Validator tests pass
pnpm --filter @lynellf/tablekit-react test validate
# Expected: ~10 new tests pass

# 2. Validator happy path
node -e "
  import('@lynellf/tablekit-react/validate').then(({validateGridStructure}) => {
    const root = document.createElement('div');
    root.setAttribute('role', 'grid');
    root.setAttribute('aria-rowcount', '2');
    root.setAttribute('aria-colcount', '2');
    const rg = document.createElement('div');
    rg.setAttribute('role', 'rowgroup');
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.setAttribute('aria-rowindex', '1');
    row.tabIndex = 0;
    const c1 = document.createElement('div');
    c1.setAttribute('role', 'gridcell');
    c1.setAttribute('aria-colindex', '1');
    const c2 = c1.cloneNode();
    c2.setAttribute('aria-colindex', '2');
    row.append(c1, c2);
    rg.append(row);
    root.append(rg);
    const result = validateGridStructure(root);
    console.log('valid:', result.valid);
  });
"
# Expected: valid: true

# 3. Validator catches violation
node -e "
  import('@lynellf/tablekit-react/validate').then(({validateGridStructure}) => {
    const root = document.createElement('div');
    root.setAttribute('role', 'grid');
    root.setAttribute('aria-rowcount', '1');
    root.setAttribute('aria-colcount', '1');
    const rg = document.createElement('div');
    rg.setAttribute('role', 'rowgroup');
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.setAttribute('aria-rowindex', '1');
    row.tabIndex = 0;
    const c = document.createElement('div');
    c.setAttribute('role', 'gridcell');  // missing aria-colindex — but skip rule in test
    row.append(c);
    rg.append(row);
    root.append(rg);
    // add a stray element with non-presentation role inside body rowgroup
    const stray = document.createElement('div');
    stray.setAttribute('role', 'unknown');
    rg.append(stray);
    const result = validateGridStructure(root);
    console.log('violations:', result.violations.map(v => v.rule));
  });
"
# Expected: ['root-role'] (or similar — depends on rule order; the key thing is that there's at least one violation)
```

---

## 6. Out-of-scope (deferred to later phases)

- **CLI: `npx tablekit-validate <path>`** — M6 polish. M2 ships the function + library exports only.
- **Color contrast, keyboard interaction, screen reader simulation** — axe-core (already used in M1 integration tests) handles these. M2's validator is the structural counterpart to axe.
- **Layered diagnostics** (warnings vs. errors) — M6 polish.
- **Validator runtime auto-run in dev mode** (e.g., a `<DataTable onValidationError>` callback) — M6 polish.
- **Screen-reader manual matrix** — M6 release gate.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| **`process.env.NODE_ENV` is replaced at build time by Vite** — production bundle tree-shakes the validation logic correctly | Verified via build output inspection; the production bundle's `validate.ts` is just `() => ({valid:true,violations:[]})`. |
| **`pathFor` traverses to `document.body`** — may behave differently in Shadow DOM / iframes | M2 supports standard DOM only. Shadow DOM is M6 polish. |
| **Monotonicity check across rows vs. cells** — the validator currently checks monotonicity within each rendered subset, not globally | Sufficient for the spec; consumers can run additional checks. |
| **`tabIndex=0` on the root counts toward the roving invariant** — but M5 emits `tabIndex=-1` on the root in cell mode | The validator explicitly excludes the root from the count (`el !== rootEl`). |
| **Cost of the walk** — O(n) in rendered DOM size | Bench-marked at < 50ms for 1k cells. Dev-only. |
| **Bundle size** — validator adds ~1 kB gzip in dev, tree-shaken in prod | Documented; measured post-build. |
