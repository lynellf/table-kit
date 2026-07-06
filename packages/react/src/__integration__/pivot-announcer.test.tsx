/**
 * Phase 5 — announcer routes through ReactAnnouncer.
 */

/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import type { Announcer } from '@lynellf/tablekit-core';

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
      pivot.toggleExpanded(['West']);
      return null;
    };
    render(<Harness />);
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('West'), 'polite');
  });
});
