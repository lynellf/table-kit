/**
 * Phase 5 — controlled slice behavior.
 */

/** @jsxImportSource react */
import { render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usePivotTable } from '../usePivotTable';
import type { PivotExpansionState } from '@lynellf/tablekit-pivot';

interface Row {
  id: string;
  region: string;
}

const ControlledChild = ({
  expanded,
  setExpanded,
}: {
  expanded: PivotExpansionState;
  setExpanded: (next: PivotExpansionState) => void;
}) => {
  const { pivot } = usePivotTable<Row>({
    data: [{ id: '1', region: 'West' }],
    pivot: { rows: ['region'], columns: [], measures: [{ id: 'count', aggregator: 'count' }] },
    getRowId: (r) => r.id,
    state: { expanded },
    onExpandedChange: setExpanded,
  });
  pivot.toggleExpanded(['West']);
  return null;
};

describe('controlled pivot', () => {
  it('state and onChange route through React state', () => {
    const onExpandedChange = vi.fn();
    const TestControlled = () => {
      const [expanded, setExpanded] = useState<PivotExpansionState>({});
      return (
        <ControlledChild
          expanded={expanded}
          setExpanded={(next) => {
            setExpanded(next);
            onExpandedChange(next);
          }}
        />
      );
    };
    render(<TestControlled />);
    expect(onExpandedChange).toHaveBeenCalledWith({ '["West"]': true });
  });
});
