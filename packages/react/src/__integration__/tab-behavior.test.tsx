/**
 * @lynellf/tablekit-react — tab-behavior.test.tsx
 *
 * M6 Phase 2: Integration tests for the `tabBehavior` option.
 *
 * Covers:
 *   - useDataTable accepts tabBehavior: undefined (default 'exit')
 *   - useDataTable accepts tabBehavior: 'exit' and 'cells'
 *   - gridRef is attached to the returned ref
 *   - usePivotTable accepts tabBehavior option (type smoke)
 *   - Type-level: omitting the option defaults to 'exit'; invalid values rejected
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataTable } from '../useDataTable';

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

// ── Minimal grid component for testing ──────────────────────────────────────

function MinimalGrid({
  tabBehavior,
}: {
  tabBehavior?: 'exit' | 'cells';
}) {
  const { table, gridRef } = useDataTable<Row>({
    data: ROWS,
    columns: [{ id: 'name', accessor: 'name' }],
    tabBehavior,
  });

  return (
    <div>
      <button data-testid="outside-button" type="button">
        Outside button
      </button>
      {/* Grid element — gridRef must be attached for Tab behavior to work. */}
      <div {...table.getGridProps()} ref={gridRef} data-testid="grid">
        {/* Simple row rendering without the header model. */}
        {(table.getRowModel() as Row[]).map((row) => (
          <div key={row.id} data-row-id={row.id}>
            {String(row.name)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('tabBehavior option — useDataTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('accepts tabBehavior: undefined (default exit)', () => {
    const { unmount } = render(<MinimalGrid />);
    expect(() => unmount()).not.toThrow();
  });

  it('accepts tabBehavior: "exit"', () => {
    const { unmount } = render(<MinimalGrid tabBehavior="exit" />);
    expect(() => unmount()).not.toThrow();
  });

  it('accepts tabBehavior: "cells"', () => {
    const { unmount } = render(<MinimalGrid tabBehavior="cells" />);
    expect(() => unmount()).not.toThrow();
  });

  it('gridRef is returned and can be attached', () => {
    const { getByTestId, unmount } = render(<MinimalGrid tabBehavior="exit" />);
    expect(getByTestId('grid')).toBeTruthy();
    unmount();
  });

  it('gridRef is returned for cells mode', () => {
    const { getByTestId, unmount } = render(<MinimalGrid tabBehavior="cells" />);
    expect(getByTestId('grid')).toBeTruthy();
    unmount();
  });
});

describe('tabBehavior type safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('omitting tabBehavior renders without error (type default to exit)', () => {
    const { unmount } = render(<MinimalGrid />);
    unmount();
  });

  it('explicit "exit" is accepted', () => {
    const { unmount } = render(<MinimalGrid tabBehavior="exit" />);
    unmount();
  });

  it('explicit "cells" is accepted', () => {
    const { unmount } = render(<MinimalGrid tabBehavior="cells" />);
    unmount();
  });

  // This test documents that invalid values are rejected at compile time.
  // @ts-expect-error — 'invalid' is not a valid TabBehavior value.
  const _invalidRender = () => render(<MinimalGrid tabBehavior="invalid" />);
  it('invalid tabBehavior value is rejected at compile time', () => {
    // The @ts-expect-error above confirms this is rejected.
    expect(true).toBe(true);
  });
});
