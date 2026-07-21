/**
 * Phase 5 — announcer routes through ReactAnnouncer.
 */

import type { Announcer } from '@lynellf/tablekit-core';
/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePivotTable } from '../usePivotTable';

interface Row {
  id: string;
  region: string;
}

// Memoize data to prevent unnecessary recomputation on every render.
// R4-IDENTITY-008 fix: The spec forbids deep equality on row data,
// so consumers must provide stable data references for unchanged data.
const TEST_DATA = [{ id: '1', region: 'West' }];

describe('pivot announcer', () => {
  it('expansion messages route through the consumer-provided announcer', () => {
    const announce = vi.fn();
    const mockAnnouncer: Announcer = { announce };
    const Harness = () => {
      const { pivot } = usePivotTable<Row>({
        data: TEST_DATA,
        pivot: { rows: ['region'], columns: [], measures: [{ id: 'count', aggregator: 'count' }] },
        getRowId: (r) => r.id,
        announcer: mockAnnouncer,
      });
      // Call toggleExpanded after mount to avoid infinite render loop.
      // Calling state setters during render triggers useSyncExternalStore, causing re-renders.
      useEffect(() => {
        pivot.toggleExpanded(['West']);
      }, [pivot]);
      return null;
    };
    render(<Harness />);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('West'), 'polite');
  });
});
