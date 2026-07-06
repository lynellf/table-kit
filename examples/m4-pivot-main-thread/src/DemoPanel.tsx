import type { PivotConfig, PivotExpansionState, PivotSortingState } from '@lynellf/tablekit-pivot';
import { usePivotTable } from '@lynellf/tablekit-react';
import { useEffect, useState } from 'react';

interface Props<TRow> {
  title: string;
  data: TRow[];
  pivot: PivotConfig<TRow>;
  getRowId: (row: TRow, index: number) => string;
  initialPivotSorting?: PivotSortingState;
  onMeasure?: (ms: number) => void;
}

export function DemoPanel<TRow>({
  title,
  data,
  pivot,
  getRowId,
  initialPivotSorting,
  onMeasure,
}: Props<TRow>) {
  const [expanded, setExpanded] = useState<PivotExpansionState>({});
  const [sorting, setSorting] = useState<PivotSortingState>(initialPivotSorting ?? []);

  const { pivot: instance, Announcer } = usePivotTable<TRow>({
    data,
    pivot,
    getRowId,
    state: { expanded, pivotSorting: sorting },
    onExpandedChange: setExpanded,
    onPivotSortingChange: setSorting,
  });

  const visible = instance.getVisibleRows();
  const headerRows = instance.getHeaderRows();
  const leafColumns = instance.getLeafColumns();

  // §12 perf measurement
  useEffect(() => {
    const start = performance.now();
    instance.getResult();
    const end = performance.now();
    onMeasure?.(end - start);
  }, [instance, onMeasure]);

  return (
    <section className="demo-panel">
      <h2>{title}</h2>
      <Announcer />
      <div {...instance.getGridProps({ className: 'pivot-treegrid' })}>
        <div role="rowgroup" className="pivot-header">
          {headerRows.map((row, rowIdx) => (
            // biome-disable-next-line lint/suspicious/noArrayIndexKey -- Header rows are static; stable composite keys would require structural changes
            <div key={`header-row-${rowIdx}`} role="row" className="pivot-header-row">
              <div role="columnheader" className="pivot-row-header-cell" />
              {row.map((entry, colIdx) => {
                const node = entry.node;
                const label = 'label' in node ? String(node.label ?? '') : String(node.measureId);
                const isTotal = 'isTotal' in node && node.isTotal;
                return (
                  // biome-disable-next-line lint/suspicious/noArrayIndexKey -- Header cells are static; stable composite keys would require structural changes
                  <div
                    key={`header-${rowIdx}-${colIdx}`}
                    role="columnheader"
                    aria-colspan={entry.colSpan}
                    className={`pivot-cell ${isTotal ? 'pivot-cell-total' : ''}`}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div {...instance.getBodyProps()}>
          {visible.map((row) => (
            <div key={row.key} {...instance.getRowProps(row, { className: 'pivot-row' })}>
              <div {...instance.getRowHeaderProps(row)} className="pivot-row-header">
                {String(row.label ?? '')}
                {row.hasChildren && (
                  <button
                    type="button"
                    {...instance.getToggleExpandedProps(row)}
                    className="pivot-toggle"
                  >
                    {row.childState === 'loaded' ? '−' : '+'}
                  </button>
                )}
              </div>
              {leafColumns.map((leaf) => (
                <div
                  key={leaf.id}
                  role="gridcell"
                  className={`pivot-cell ${leaf.isTotal ? 'pivot-cell-total' : ''}`}
                >
                  {String(row.values[leaf.id] ?? '')}
                </div>
              ))}
            </div>
          ))}
        </div>

        {instance.getFooterProps() && (
          <div {...instance.getFooterProps({ className: 'pivot-footer' })}>
            <div role="row" data-total="row" aria-label="Grand total row">
              <div role="rowheader" className="pivot-row-header">
                Total
              </div>
              {leafColumns.map((leaf) => (
                <div
                  key={leaf.id}
                  role="gridcell"
                  className={`pivot-cell ${leaf.isTotal ? 'pivot-cell-total' : ''}`}
                >
                  {String(instance.getResult().grandTotals[leaf.id] ?? '')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
