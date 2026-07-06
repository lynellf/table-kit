/**
 * Worker engine performance benchmarks.
 *
 * Tests 1M-row pivot computation against the §12 perf budget:
 * - Cold: createWorkerEngine + setRows + first compute < 5s
 * - Warm: re-pivot (config change, no setRows) < 1.5s
 *
 * These benchmarks are ADVISORY — CI logs numbers but does not gate on them.
 */

import type { PivotQuery } from '@lynellf/tablekit-pivot';
import { bench, describe } from 'vitest';
import { createWorkerEngine } from '../src/engine/createWorkerEngine';

interface SalesRow {
  id: number;
  region: string;
  category: string;
  product: string;
  quarter: string;
  revenue: number;
  cost: number;
  quantity: number;
}

// Inline data generator (same algorithm as the example app)
const REGIONS = ['North', 'South', 'East', 'West'];
const CATEGORIES = ['Electronics', 'Apparel', 'Home', 'Sports'];
const PRODUCTS = ['Laptop', 'Phone', 'Tablet', 'Headphones', 'Camera'];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateRows(n: number, seed = 42): SalesRow[] {
  const rand = mulberry32(seed);
  const rows: SalesRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i,
      region: REGIONS[Math.floor(rand() * REGIONS.length)],
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
      product: PRODUCTS[Math.floor(rand() * PRODUCTS.length)],
      quarter: `Q${1 + Math.floor(rand() * 4)}`,
      revenue: Math.round((10 + rand() * 990) * 100) / 100,
      cost: Math.round((10 + rand() * 990) * 100) / 100,
      quantity: Math.floor(1 + rand() * 99),
    });
  }
  return rows;
}

// Stub Worker for benchmarks (in-process, no structured-clone overhead for the bench itself)
type MessageListener = (event: { data: unknown }) => void;
class StubWorker {
  private listeners: Map<string, Set<MessageListener>> = new Map();
  public postCount = 0;

  postMessage(message: { type: string; requestId: number }) {
    this.postCount++;
    // Simulate async compute response
    setTimeout(() => {
      const response = {
        data: {
          type: message.type === 'setRows' ? 'setRows:ok' : 'compute:ok',
          requestId: message.requestId,
          result: { rows: [], grandTotals: { values: {} } },
        },
      };
      const listeners = this.listeners.get('message');
      if (listeners) {
        for (const fn of listeners) {
          fn(response as { data: unknown });
        }
      }
    }, 10);
  }

  terminate() {}
  addEventListener(type: string, listener: MessageListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: MessageListener) {
    this.listeners.get(type)?.delete(listener);
  }
}

const QUERY: PivotQuery<SalesRow> = {
  rows: [],
  rowsFieldRef: [{ field: 'region' }, { field: 'category' }],
  columnsFieldRef: [{ field: 'quarter' }],
  measures: [
    { id: 'rev', field: 'revenue', aggregator: 'sum' },
    { id: 'cnt', aggregator: 'count' },
  ],
  filters: [],
  totals: { grandTotalRow: true },
  expandedPaths: [],
  pivotSorting: [],
};

describe('worker engine — 1M-row budget', () => {
  // Generate 1M rows once for all benchmarks
  const rows = generateRows(1_000_000);

  bench(
    'cold: createWorkerEngine + setRows + first compute',
    async () => {
      const stub = new StubWorker();
      const engine = createWorkerEngine<SalesRow>({ createWorker: () => stub });

      await engine.setRows(rows);
      await engine.compute(QUERY, { signal: new AbortController().signal });

      engine.dispose();
    },
    { iterations: 3, time: 30_000 },
  );

  bench(
    'warm: re-pivot (config change, no setRows)',
    async () => {
      const stub = new StubWorker();
      const engine = createWorkerEngine<SalesRow>({ createWorker: () => stub });

      // Warm up: set rows and initial compute
      await engine.setRows(rows);
      await engine.compute(QUERY, { signal: new AbortController().signal });

      // Re-pivot: toggle a measure
      const nextQuery: PivotQuery<SalesRow> = {
        ...QUERY,
        measures: [...QUERY.measures, { id: 'cost', field: 'cost', aggregator: 'sum' }],
      };
      await engine.compute(nextQuery, { signal: new AbortController().signal });

      engine.dispose();
    },
    { iterations: 5, time: 30_000 },
  );

  bench(
    'setRows only: 1M row transfer',
    async () => {
      const stub = new StubWorker();
      const engine = createWorkerEngine<SalesRow>({ createWorker: () => stub });

      await engine.setRows(rows);

      engine.dispose();
    },
    { iterations: 3, time: 15_000 },
  );
});
