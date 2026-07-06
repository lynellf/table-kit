import { useDataTable } from '@lynellf/tablekit-react';
/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { createFakeServer } from './fakeServer';

export const PerfBadge = () => {
  const source = createFakeServer({ delayMs: 50, totalRows: 100_000 });
  const { table, dataSourceState, Announcer } = useDataTable({
    data: [],
    columns: [
      { id: 'name', accessor: 'name' },
      { id: 'sales', accessor: 'sales' },
    ],
    dataSource: source,
  });
  const lastFetchTime = useRef<number | null>(null);
  const [badge, setBadge] = useState<string>('—');

  useEffect(() => {
    if (dataSourceState?.status === 'success' && dataSourceState.data) {
      // Measure the time from previous success to next.
      const now = performance.now();
      if (lastFetchTime.current !== null) {
        const ms = now - lastFetchTime.current;
        const verdict = ms < 16 ? '✓ within §12 budget' : '✗ over §12 budget';
        setBadge(`${ms.toFixed(1)}ms ${verdict}`);
      }
      lastFetchTime.current = now;
    }
  }, [dataSourceState?.status, dataSourceState?.data]);

  return (
    <div>
      <Announcer />
      <div className="perf-badge">Page render time: {badge}</div>
      <div {...table.getGridProps()} className="grid">
        {/* Minimal render — just the count badge */}
      </div>
    </div>
  );
};
