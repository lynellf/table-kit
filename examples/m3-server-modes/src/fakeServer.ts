/**
 * Synthetic data source that mimics a real server: configurable delay,
 * respects AbortSignal, returns totalRowCount on every call.
 */

import type { DataSource, RowsQuery } from '@lynellf/tablekit-core/dataSource';

export interface FakeServerOptions {
  /** Synthetic dataset size. Default 10_000. */
  totalRows?: number;
  /** Delay in ms before resolving. Default 300. */
  delayMs?: number;
  /** Probability (0-1) of throwing an error per call. Default 0 (no errors). */
  errorRate?: number;
}

interface Row {
  id: string;
  name: string;
  region: 'West' | 'East' | 'North' | 'South';
  sales: number;
}

const REGIONS = ['West', 'East', 'North', 'South'] as const;

export const createFakeServer = (opts: FakeServerOptions = {}): DataSource<Row> => {
  const totalRows = opts.totalRows ?? 10_000;
  const delayMs = opts.delayMs ?? 300;
  const errorRate = opts.errorRate ?? 0;

  // Generate the synthetic dataset once.
  const allRows: Row[] = Array.from({ length: totalRows }, (_, i) => ({
    id: String(i + 1),
    name: `Person ${i + 1}`,
    region: REGIONS[i % 4] as 'West' | 'East' | 'North' | 'South',
    sales: Math.round(Math.random() * 1000),
  }));

  return {
    capabilities: { sort: 'server', filter: 'server', paginate: 'server' },
    getRows: async (q: RowsQuery, { signal }) => {
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        const t = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        const onAbort = () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort);
      });

      if (Math.random() < errorRate) {
        throw new Error('Synthetic server error');
      }

      // Apply filters.
      let filtered = allRows;
      for (const f of q.filters) {
        if (f.id === 'region' && typeof f.value === 'string') {
          filtered = filtered.filter((r) => r.region === f.value);
        } else if (f.id === 'sales' && Array.isArray(f.value) && f.value.length === 2) {
          const [min, max] = f.value as [number, number];
          filtered = filtered.filter((r) => r.sales >= min && r.sales <= max);
        }
      }

      // Apply sort.
      if (q.sorting[0]) {
        const { id, desc } = q.sorting[0];
        filtered = [...filtered].sort((a, b) => {
          const av = a[id as keyof Row];
          const bv = b[id as keyof Row];
          if (typeof av === 'number' && typeof bv === 'number') return desc ? bv - av : av - bv;
          return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
        });
      }

      // Paginate.
      const pageIndex = q.pagination?.pageIndex ?? 0;
      const pageSize = q.pagination?.pageSize ?? 25;
      const start = pageIndex * pageSize;
      const end = start + pageSize;

      return { rows: filtered.slice(start, end), totalRowCount: filtered.length };
    },
  };
};
