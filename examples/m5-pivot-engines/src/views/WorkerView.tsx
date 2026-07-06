import { useEffect, useMemo, useState, useCallback } from 'react';
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import { generateRows, formatRowCount } from '../data/generateRows';
import type { SalesRow } from '../data/generateRows';

// Dynamic import for worker
async function loadWorker(): Promise<Worker> {
  const module = await import('../worker/pivotWorker?worker');
  return new module.default();
}

// Create engine at module level to avoid ref issues
let engineInstance: ReturnType<typeof createWorkerEngine<SalesRow>> | null = null;
let workerInstance: Worker | null = null;

export function WorkerView() {
  const [rowCount] = useState(1_000_000);
  const [dataReady, setDataReady] = useState(false);
  const [perfBadge, setPerfBadge] = useState<string>('');
  const [computeTime, setComputeTime] = useState<string>('');
  const [engineReady, setEngineReady] = useState(false);

  // Generate rows once on mount
  const rows = useMemo(() => {
    const generated = generateRows(rowCount);
    setDataReady(true);
    return generated;
  }, [rowCount]);

  // Initialize worker engine
  useEffect(() => {
    let mounted = true;

    loadWorker().then((w) => {
      if (!mounted) {
        w.terminate();
        return;
      }
      workerInstance = w;
      engineInstance = createWorkerEngine<SalesRow>({
        createWorker: () => workerInstance!,
      });
      setEngineReady(true);
    }).catch((err) => {
      console.error('Failed to create worker:', err);
    });

    const engineToDispose = engineInstance;
    const workerToTerminate = workerInstance;
    return () => {
      mounted = false;
      if (engineToDispose !== null && engineToDispose !== undefined) {
        (engineToDispose as { dispose(): void }).dispose();
        engineInstance = null;
      }
      if (workerToTerminate !== null && workerToTerminate !== undefined) {
        workerToTerminate.terminate();
        workerInstance = null;
      }
    };
  }, []);

  // Send rows to worker
  useEffect(() => {
    if (!engineReady || rows.length === 0) return;

    const engine = engineInstance;
    if (!engine) return;

    const t0 = performance.now();

    engine.setRows(rows).then(
      () => setComputeTime(`setRows: ${(performance.now() - t0).toFixed(0)}ms`),
      (err: unknown) => {
        setComputeTime('setRows: error');
        console.error('setRows failed:', err);
      },
    );
  }, [rows, engineReady]);

  const handleRepivot = useCallback(() => {
    if (!engineInstance) return;

    const t0 = performance.now();
    // Toggle a filter to trigger re-compute
    const q = {
      rows: rows,
      rowsFieldRef: [{ field: 'region' }, { field: 'category' }],
      columnsFieldRef: [{ field: 'quarter' }],
      measures: [
        { id: 'revenue', field: 'revenue', aggregator: 'sum' },
        { id: 'quantity', field: 'quantity', aggregator: 'sum' },
        { id: 'count', aggregator: 'count' },
      ],
      filters:
        Math.random() > 0.5
          ? [{ field: 'region', op: 'equals' as const, value: 'North' }]
          : [],
      totals: { grandTotalRow: true },
      expandedPaths: [],
      pivotSorting: [],
    };

    const result = engineInstance.compute(q, { signal: new AbortController().signal });
    if (result instanceof Promise) {
      result.then(
        () => setPerfBadge(`Re-pivot: ${(performance.now() - t0).toFixed(0)}ms`),
        (err: unknown) => {
          setPerfBadge('Re-pivot: error');
          console.error('compute failed:', err);
        },
      );
    }
  }, [rows]);

  if (!dataReady) {
    return <div className="loading">Generating {formatRowCount(rowCount)}...</div>;
  }

  return (
    <div className="view">
      <div className="info-panel">
        <div className="info-item">
          <span className="info-label">Dataset:</span>
          <span className="info-value">{formatRowCount(rowCount)}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Engine:</span>
          <span className="info-value">Web Worker</span>
        </div>
        <div className="info-item">
          <span className="info-label">Compute:</span>
          <span className="info-value">{computeTime || 'Initializing...'}</span>
        </div>
        {perfBadge && <div className="perf-badge">{perfBadge}</div>}
        <button className="action-button" onClick={handleRepivot}>
          Re-pivot
        </button>
      </div>

      <div className="pivot-placeholder">
        <p>Worker engine initialized with 1M rows.</p>
        <p>Click &quot;Re-pivot&quot; to trigger a new compute in the worker.</p>
        <p className="perf-hint">
          Expected: cold setRows ~2-4s, warm re-pivot &lt;1.5s on mid-tier laptop.
        </p>
      </div>
    </div>
  );
}
