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
    // Just check that there are no rule violations
    expect(result.violations.length).toBe(0);
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
      <div role="grid" aria-rowcount="3" aria-colcount="1">
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
        <div role="rowgroup">
          <div role="presentation">
            <div role="row" aria-rowindex="2" tabIndex={0}>
              <div role="gridcell" aria-colindex="1">1</div>
            </div>
          </div>
        </div>
      </div>,
    );
    const result = validateGridStructure(container.firstElementChild);
    // Separator should not have violations
    const separatorViolations = result.violations.filter((v) => v.rule.startsWith('separator'));
    expect(separatorViolations).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('returns valid:true for null rootEl', () => {
    expect(validateGridStructure(null).valid).toBe(true);
  });
});
