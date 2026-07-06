/**
 * Synthetic sales dataset for the M4 reference app.
 *
 * Generates N rows with random region, quarter, year, sales, orders.
 * Default: 10k rows. Configurable for the §12 perf badge demo.
 */

const REGIONS = ['West', 'East', 'North', 'South'] as const;
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const YEARS = [2022, 2023, 2024] as const;

export interface SalesRow {
  id: string;
  region: string;
  quarter: string;
  year: number;
  product: string;
  sales: number;
  orders: number;
}

export const generateSales = (n: number, seed = 1): SalesRow[] => {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const rows: SalesRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: String(i),
      region: REGIONS[i % REGIONS.length]!,
      quarter: QUARTERS[Math.floor(i / REGIONS.length) % QUARTERS.length]!,
      year: YEARS[i % YEARS.length]!,
      product: `P${(i % 5) + 1}`,
      sales: Math.floor(rand() * 1000),
      orders: Math.floor(rand() * 50),
    });
  }
  return rows;
};
