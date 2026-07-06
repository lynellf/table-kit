/**
 * Mock server API for the server engine reference app.
 *
 * Simulates a remote server with async latency and occasional errors.
 * The server is the source of truth — the client passes no data.
 */

import type {
  PivotQuery,
  PivotResult,
  PivotRowNode,
  FieldValue,
  PivotColumnNode,
  LeafColumnId,
} from '@lynellf/tablekit-pivot';

// Simulated "database" on the server side
const SERVER_DATASET = [
  { region: 'North', category: 'Electronics', revenue: 450000, cost: 180000, quantity: 1200 },
  { region: 'North', category: 'Apparel', revenue: 320000, cost: 140000, quantity: 4500 },
  { region: 'North', category: 'Home', revenue: 280000, cost: 112000, quantity: 890 },
  { region: 'North', category: 'Sports', revenue: 190000, cost: 76000, quantity: 1100 },
  { region: 'South', category: 'Electronics', revenue: 380000, cost: 152000, quantity: 980 },
  { region: 'South', category: 'Apparel', revenue: 420000, cost: 168000, quantity: 5800 },
  { region: 'South', category: 'Home', revenue: 210000, cost: 84000, quantity: 670 },
  { region: 'South', category: 'Sports', revenue: 240000, cost: 96000, quantity: 1350 },
  { region: 'East', category: 'Electronics', revenue: 520000, cost: 208000, quantity: 1400 },
  { region: 'East', category: 'Apparel', revenue: 290000, cost: 116000, quantity: 4100 },
  { region: 'East', category: 'Home', revenue: 350000, cost: 140000, quantity: 1100 },
  { region: 'East', category: 'Sports', revenue: 170000, cost: 68000, quantity: 950 },
  { region: 'West', category: 'Electronics', revenue: 610000, cost: 244000, quantity: 1650 },
  { region: 'West', category: 'Apparel', revenue: 380000, cost: 152000, quantity: 5200 },
  { region: 'West', category: 'Home', revenue: 410000, cost: 164000, quantity: 1300 },
  { region: 'West', category: 'Sports', revenue: 220000, cost: 88000, quantity: 1250 },
];

interface SalesRow {
  region: string;
  category: string;
  revenue: number;
  cost: number;
  quantity: number;
}

type ServerPivotResult = PivotResult<SalesRow>;

// Simulate network delay
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * Compute the top-level (collapsed) pivot result.
 * Server aggregates data and returns collapsed row nodes with lazy children.
 */
export async function computeTopLevel(
  _q: PivotQuery<SalesRow>,
  ctx: { signal: AbortSignal },
): Promise<ServerPivotResult> {
  await sleep(200, ctx.signal);

  // Extract row fields from the query config
  const rowsFieldRef = _q.rowsFieldRef;
  const rowFields = rowsFieldRef.map((r) => r.field);

  // Aggregate by the first row field (region)
  const byRegion = new Map<string, { revenue: number; cost: number; quantity: number }>();

  for (const row of SERVER_DATASET) {
    const key = row[rowFields[0] as keyof SalesRow] as string;
    const existing = byRegion.get(key) || { revenue: 0, cost: 0, quantity: 0 };
    byRegion.set(key, {
      revenue: existing.revenue + row.revenue,
      cost: existing.cost + row.cost,
      quantity: existing.quantity + row.quantity,
    });
  }

  const children: PivotRowNode<SalesRow>[] = Array.from(byRegion.entries()).map(
    ([region, totals], idx) => ({
      key: `["${region}"]`,
      path: [region],
      level: 0,
      label: region,
      hasChildren: true,
      childState: 'notLoaded',
      values: {
        '["Q1"]::revenue_sum': totals.revenue / 4,
        '["Q2"]::revenue_sum': totals.revenue / 4,
        '["Q3"]::revenue_sum': totals.revenue / 4,
        '["Q4"]::revenue_sum': totals.revenue / 4,
      } as Record<LeafColumnId, unknown>,
      rowTotals: {
        revenue: totals.revenue,
        quantity: totals.quantity,
      },
    }),
  );

  const grandTotalRevenue = SERVER_DATASET.reduce((s, r) => s + r.revenue, 0);
  const grandTotalQuantity = SERVER_DATASET.reduce((s, r) => s + r.quantity, 0);

  const result: ServerPivotResult = {
    columnRoot: {
      id: 'root',
      path: [],
      label: '',
      colSpan: 4,
      children: [
        { id: 'Q1', path: ['Q1'], label: 'Q1', colSpan: 1, leaves: [] },
        { id: 'Q2', path: ['Q2'], label: 'Q2', colSpan: 1, leaves: [] },
        { id: 'Q3', path: ['Q3'], label: 'Q3', colSpan: 1, leaves: [] },
        { id: 'Q4', path: ['Q4'], label: 'Q4', colSpan: 1, leaves: [] },
      ],
    } as PivotColumnNode,
    leafColumns: [
      { id: '["Q1"]::revenue_sum', path: ['Q1'], measureId: 'revenue', isTotal: false, size: 100, header: 'Q1 Revenue' },
      { id: '["Q2"]::revenue_sum', path: ['Q2'], measureId: 'revenue', isTotal: false, size: 100, header: 'Q2 Revenue' },
      { id: '["Q3"]::revenue_sum', path: ['Q3'], measureId: 'revenue', isTotal: false, size: 100, header: 'Q3 Revenue' },
      { id: '["Q4"]::revenue_sum', path: ['Q4'], measureId: 'revenue', isTotal: false, size: 100, header: 'Q4 Revenue' },
    ] as unknown as PivotResult<SalesRow>['leafColumns'],
    rowRoot: {
      key: '[]',
      path: [],
      level: -1,
      label: '',
      hasChildren: true,
      childState: 'loaded',
      children,
      values: {},
      rowTotals: {},
    },
    grandTotals: {
      '["Q1"]::revenue_sum': grandTotalRevenue / 4,
      '["Q2"]::revenue_sum': grandTotalRevenue / 4,
      '["Q3"]::revenue_sum': grandTotalRevenue / 4,
      '["Q4"]::revenue_sum': grandTotalRevenue / 4,
    },
  };

  return result;
}

/**
 * Compute children for a given row path.
 * Used when the user expands a collapsed row.
 */
export async function computeChildren(
  path: FieldValue[],
  _q: PivotQuery<SalesRow>,
  ctx: { signal: AbortSignal },
): Promise<PivotRowNode<SalesRow>[]> {
  await sleep(300, ctx.signal);

  const rowsFieldRef = _q.rowsFieldRef;
  const rowFields = rowsFieldRef.map((r) => r.field);

  // Filter data by parent path
  const filtered = SERVER_DATASET.filter((row) => {
    return path.every((val, i) => row[rowFields[i] as keyof SalesRow] === val);
  });

  // Group by next level field
  const nextField = rowFields[path.length] as keyof SalesRow;
  if (!nextField) return [];

  const byCategory = new Map<string, { revenue: number; cost: number; quantity: number }>();

  for (const row of filtered) {
    const key = row[nextField] as string;
    const existing = byCategory.get(key) || { revenue: 0, cost: 0, quantity: 0 };
    byCategory.set(key, {
      revenue: existing.revenue + row.revenue,
      cost: existing.cost + row.cost,
      quantity: existing.quantity + row.quantity,
    });
  }

  const children: PivotRowNode<SalesRow>[] = Array.from(byCategory.entries()).map(
    ([category, totals]) => ({
      key: `["${path[0]}","${category}"]`,
      path: [path[0] as string, category],
      level: path.length + 1,
      label: category,
      hasChildren: false,
      childState: 'loaded',
      values: {
        '["Q1"]::revenue_sum': totals.revenue / 4,
        '["Q2"]::revenue_sum': totals.revenue / 4,
        '["Q3"]::revenue_sum': totals.revenue / 4,
        '["Q4"]::revenue_sum': totals.revenue / 4,
      } as Record<LeafColumnId, unknown>,
      rowTotals: {
        revenue: totals.revenue,
        quantity: totals.quantity,
      },
    }),
  );

  return children;
}

// Mock API object for the server engine
export const mockServerApi = {
  computeTopLevel,
  computeChildren,
};
