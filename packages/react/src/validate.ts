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
 */

export interface Violation {
  /** CSS-style path to the offending element. */
  path: string;
  /** Stable rule identifier. */
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

/**
 * Build a CSS-style path to an element relative to the root.
 */
const pathFor = (el: Element): string => {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const parent: Element | null = current.parentElement;
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

export const validateGridStructure =
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
        if (rootEl.getAttribute('aria-rowcount') === null) {
          violations.push({
            path: pathFor(rootEl),
            rule: 'aria-rowcount-present',
            message: 'Root element must have aria-rowcount.',
            node: rootEl,
          });
        }
        if (rootEl.getAttribute('aria-colcount') === null) {
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
            if (el.getAttribute('aria-orientation') !== 'vertical') {
              violations.push({
                path: pathFor(el),
                rule: 'separator-orientation',
                message: `Resize handle must have aria-orientation="vertical".`,
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
          }

          // Row ownership: must live inside a rowgroup or presentation (inside a rowgroup).
          if (role === 'row') {
            const parent = el.parentElement;
            const parentRole = parent?.getAttribute('role');
            // Allow presentation as intermediate wrapper (spec §6.2 body structure)
            if (parentRole !== 'rowgroup' && parentRole !== 'presentation') {
              violations.push({
                path: pathFor(el),
                rule: 'row-ownership',
                message: `Element with role="row" must have a parent with role="rowgroup" or "presentation".`,
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
                message: `Element with role="${role}" must have a parent with role="row".`,
                node: el,
              });
            }
          }
        }

        // Roving tabindex invariant
        if (tabIndexZeros.length === 0 && rootRole !== 'table') {
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

        // aria-rowindex monotonicity
        const renderedRows = rootEl.querySelectorAll('[role="row"]');
        let lastRowIndex = 0;
        for (const row of renderedRows) {
          const idxAttr = row.getAttribute('aria-rowindex');
          if (idxAttr === null) continue;
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
              message: 'aria-rowindex must be strictly increasing.',
              node: row,
            });
          }
          lastRowIndex = idx;
        }

        return { valid: violations.length === 0, violations };
      };
