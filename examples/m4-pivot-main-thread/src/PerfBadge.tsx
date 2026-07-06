import { createPivotTable } from '@lynellf/tablekit-pivot';
import { useEffect, useState } from 'react';

interface PerfBadgeProps<TRow> {
  rowCount: number;
  data: TRow[];
  onMeasure?: (ms: number) => void;
}

export function PerfBadge<TRow>({ rowCount, data, onMeasure }: PerfBadgeProps<TRow>) {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const pivot = createPivotTable<TRow>({
      data,
      pivot: {
        rows: ['region', 'quarter'],
        columns: [],
        measures: [{ id: 'sales_sum', field: 'sales' }],
      },
      getRowId: (r: TRow, i: number) => String((r as { id?: string }).id ?? i),
    });
    const start = performance.now();
    pivot.getResult();
    const end = performance.now();
    setMs(end - start);
    onMeasure?.(end - start);
  }, [data, onMeasure]);

  const overBudget = ms !== null && rowCount > 200_000;
  return (
    <span className={`perf-badge ${overBudget ? 'perf-badge-warn' : ''}`}>
      {ms !== null ? `${ms.toFixed(2)} ms / ${rowCount.toLocaleString()} rows` : 'measuring…'}
      {overBudget && ' — over §12 budget; consider worker engine (M5)'}
    </span>
  );
}
