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

describe('pivot announcer', () => {
  it('expansion messages route through the consumer-provided announcer', () => {
    const announce = vi.fn();
    const mockAnnouncer: Announcer = { announce };
    const Harness = () => {
      const { pivot } = usePivotTable<Row>({
        data: [{ id: '1', region: 'West' }],
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
