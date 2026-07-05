/**
 * Integration tests for virtualized grid features.
 *
 * These tests focus on the core table instance behavior.
 * Full DOM rendering tests with React hooks are in the end-to-end suite.
 */

import { createDataTable } from '@lynellf/tablekit-core';
import { describe, expect, it, vi } from 'vitest';

describe('Virtualization integration', () => {
  it('getRowVirtualizer returns correct totalSize', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
    }));
    const table = createDataTable({
      data,
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      manualPagination: true,
    });

    // Set scroll state
    table.__setScrollState(0, 600);

    const v = table.getRowVirtualizer();
    // 100 rows × 33px (default) = 3300px
    expect(v.totalSize).toBe(3300);
    // With 600px viewport and 33px rows, ~18-22 rows visible + overscan
    expect(v.rows.length).toBeGreaterThan(15);
    expect(v.rows.length).toBeLessThan(30);
  });

  it('pinned columns bypass virtualization', () => {
    const table = createDataTable({
      data: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      columns: [
        { id: 'name', accessor: 'name' },
        { id: 'age', accessor: 'age' },
      ],
      getRowId: (r) => r.id,
      initialState: {
        columnPinning: { left: ['name'], right: [] },
      },
    });

    // 'name' is pinned left, 'age' is center
    const center = table.getCenterLeafColumns();
    const left = table.getLeftLeafColumns();

    // Verify 'name' is in the left list
    expect(left.length).toBeGreaterThan(0);
    expect(left[0]?.getIsPinned()).toBe('left');
    // Verify 'age' is in the center list
    expect(center.length).toBeGreaterThan(0);
    expect(center[0]?.getIsPinned()).toBe(false);
  });

  it('togglePin updates state and announces', () => {
    const announce = vi.fn<(message: string, politeness?: 'polite' | 'assertive') => void>();
    const table = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      announcer: { announce },
    });

    table.togglePin('name', 'left');
    expect(table.getState().columnPinning.left).toContain('name');
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Pinned'), 'polite');
  });
});

describe('Resize integration', () => {
  it('resize handle emits correct props', () => {
    const table = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name', size: 150 }],
      getRowId: (r) => r.id,
    });

    const headers = table.getHeaderGroups()[0]!.headers;
    const props = headers[0]!.getResizeHandleProps();

    expect(props.role).toBe('separator');
    expect(props['aria-orientation']).toBe('vertical');
    expect(props['aria-valuenow']).toBe(150);
    expect(props['aria-label']).toContain('name');
  });

  it('resize commits and announces', () => {
    const announce = vi.fn<(message: string, politeness?: 'polite' | 'assertive') => void>();
    const table = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name', size: 150 }],
      getRowId: (r) => r.id,
      announcer: { announce },
    });

    table.startResize('name', 150, 100);
    table.adjustResize('name', 50);
    table.commitResize('name');

    expect(table.getState().columnSizing.name).toBe(200);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('200'), 'polite');
  });
});

describe('Keyboard navigation integration', () => {
  it('navigateCell updates focusedCell', () => {
    const table = createDataTable({
      data: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
    });

    table.setFocusedCell({ rowId: '1', columnId: 'name' });
    table.navigateCell('down');

    expect(table.getState().focusedCell).toEqual({ rowId: '2', columnId: 'name' });
  });

  it('navigation mode affects grid role', () => {
    const tableCell = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      navigationMode: 'cell',
    });

    const tableNone = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      navigationMode: 'none',
    });

    const cellProps = tableCell.getGridProps();
    expect(cellProps.role).toBe('grid');
    expect(cellProps.tabIndex).toBe(-1);

    const noneProps = tableNone.getGridProps();
    expect(noneProps.role).toBe('table');
    expect(noneProps.tabIndex).toBe(0);
  });

  it('navigateToEdge moves to row-start, row-end, grid-start, grid-end', () => {
    const table = createDataTable({
      data: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Carol' },
      ],
      columns: [
        { id: 'name', accessor: 'name' },
        { id: 'age', accessor: 'age' },
      ],
      getRowId: (r) => r.id,
    });

    table.setFocusedCell({ rowId: '2', columnId: 'age' });
    table.navigateToEdge('row-start');
    expect(table.getState().focusedCell).toEqual({ rowId: '2', columnId: 'name' });

    table.navigateToEdge('row-end');
    expect(table.getState().focusedCell).toEqual({ rowId: '2', columnId: 'age' });

    table.navigateToEdge('grid-start');
    expect(table.getState().focusedCell).toEqual({ rowId: '1', columnId: 'name' });

    table.navigateToEdge('grid-end');
    expect(table.getState().focusedCell).toEqual({ rowId: '3', columnId: 'age' });
  });

  it('navigateByPage jumps one viewport of rows', () => {
    const table = createDataTable({
      data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `P${i}` })),
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      manualPagination: true, // skip client pagination so all 100 rows are in the model
    });

    table.setFocusedCell({ rowId: '0', columnId: 'name' });

    // Default viewportRowCount is 25
    table.navigateByPage(1);
    expect(table.getState().focusedCell?.rowId).toBe('25');

    table.navigateByPage(-1);
    expect(table.getState().focusedCell?.rowId).toBe('0');
  });

  it('resize onEnd mode does not commit until pointerup', () => {
    const announce = vi.fn<(message: string, politeness?: 'polite' | 'assertive') => void>();
    const table = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name', size: 150, minSize: 30 }],
      getRowId: (r) => r.id,
      announcer: { announce },
    }) as ReturnType<typeof createDataTable> & { setResizeMode: (m: 'onChange' | 'onEnd') => void };

    table.setResizeMode('onEnd');

    table.startResize('name', 150, 100);
    table.adjustResize('name', 80);

    // onEnd: columnSizing should NOT be updated yet
    expect(table.getState().columnSizing.name).toBeUndefined();
    expect(table.getState().columnSizingInfo?.delta).toBe(80);

    table.commitResize('name');

    // Now it should be committed
    expect(table.getState().columnSizing.name).toBe(230);
    expect(table.getState().columnSizingInfo).toBeNull();
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('230'), 'polite');
  });

  it('cancelResize reverts to start size', () => {
    const table = createDataTable({
      data: [{ id: '1', name: 'Alice' }],
      columns: [{ id: 'name', accessor: 'name', size: 150 }],
      getRowId: (r) => r.id,
    }) as ReturnType<typeof createDataTable> & { setResizeMode: (m: 'onChange' | 'onEnd') => void };

    // onEnd mode: size doesn't update until commit
    table.setResizeMode('onEnd');
    table.startResize('name', 150, 100);
    table.adjustResize('name', 100);
    // Sizing is still 150 (not committed)
    expect(table.getState().columnSizing.name).toBeUndefined();

    // Commit: final size becomes 250
    table.commitResize('name');
    expect(table.getState().columnSizing.name).toBe(250);

    // Start a new session and cancel — reverts back to 250
    table.startResize('name', 250, 200);
    table.adjustResize('name', -100); // trying to go below min, will clamp
    table.cancelResize('name');
    expect(table.getState().columnSizing.name).toBe(250); // reverted to session start
  });
});

describe('M2 100k-row scroll budget', () => {
  it('virtualizer computes correct window for 100k rows', () => {
    const ROW_COUNT = 100_000;
    const ROW_HEIGHT = 33;
    const VIEWPORT_SIZE = 600;
    const SCROLL_OFFSET = 33 * 50_000; // scroll to row 50,000

    const data = Array.from({ length: ROW_COUNT }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
    }));

    const table = createDataTable({
      data,
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      manualPagination: true,
    });

    // Simulate scrolling to row 50,000
    table.__setScrollState(SCROLL_OFFSET, VIEWPORT_SIZE);

    const v = table.getRowVirtualizer();

    // Total height should be 100k × 33px
    expect(v.totalSize).toBe(ROW_COUNT * ROW_HEIGHT);

    // With viewport of 600px at 33px per row ≈ 18 natural items + 8 overscan ≈ 26
    // Row 50,000 should be in the visible window
    const visibleIndices = v.rows.map((r) => r.index);
    expect(visibleIndices).toContain(50_000);

    // Should not render all 100k rows
    expect(v.rows.length).toBeLessThan(100);
    expect(v.rows.length).toBeGreaterThan(0);
  });

  it('scrollToIndex returns correct pixel offset', () => {
    const data = Array.from({ length: 100_000 }, (_, i) => ({
      id: String(i),
      name: `P${i}`,
    }));
    const table = createDataTable({
      data,
      columns: [{ id: 'name', accessor: 'name' }],
      getRowId: (r) => r.id,
      manualPagination: true,
    });

    table.__setScrollState(0, 600);
    const v = table.getRowVirtualizer();

    // Row 1000 at 33px/row = 33,000px
    expect(v.scrollToIndex(1000)).toBe(1000 * 33);
  });
});
