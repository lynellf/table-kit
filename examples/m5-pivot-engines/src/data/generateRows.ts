/**
 * Data generation utilities for the M5 pivot engines reference app.
 *
 * Generates deterministic synthetic sales data using a seeded RNG.
 */

export interface SalesRow {
  id: number;
  region: 'North' | 'South' | 'East' | 'West';
  category: 'Electronics' | 'Apparel' | 'Home' | 'Sports';
  product: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  year: '2023' | '2024';
  revenue: number;
  cost: number;
  quantity: number;
}

const REGIONS: SalesRow['region'][] = ['North', 'South', 'East', 'West'];
const CATEGORIES: SalesRow['category'][] = ['Electronics', 'Apparel', 'Home', 'Sports'];
const PRODUCTS: Record<SalesRow['category'], string[]> = {
  Electronics: ['Laptop', 'Phone', 'Tablet', 'Headphones', 'Camera'],
  Apparel: ['T-Shirt', 'Jeans', 'Jacket', 'Sneakers', 'Hat'],
  Home: ['Lamp', 'Chair', 'Table', 'Rug', 'Vase'],
  Sports: ['Ball', 'Racket', 'Weights', 'Bike', 'Ski Set'],
};
const QUARTERS: SalesRow['quarter'][] = ['Q1', 'Q2', 'Q3', 'Q4'];
const YEARS: SalesRow['year'][] = ['2023', '2024'];

/**
 * Mulberry32 — fast, seedable 32-bit PRNG
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate n synthetic sales rows with deterministic output.
 *
 * ~80 bytes per row (structured-clone), so 1M rows ≈ 80MB transfer.
 */
export function generateRows(n: number, seed = 42): SalesRow[] {
  const rand = mulberry32(seed);
  const rows: SalesRow[] = [];

  for (let i = 0; i < n; i++) {
    const regionIdx = Math.floor(rand() * REGIONS.length);
    const categoryIdx = Math.floor(rand() * CATEGORIES.length);
    const quarterIdx = Math.floor(rand() * QUARTERS.length);
    const yearIdx = Math.floor(rand() * YEARS.length);
    const region = REGIONS[regionIdx]!;
    const category = CATEGORIES[categoryIdx]!;
    const products = PRODUCTS[category]!;
    const product = products[Math.floor(rand() * products.length)]!;
    const quarter = QUARTERS[quarterIdx]!;
    const year = YEARS[yearIdx]!;
    const basePrice = 10 + rand() * 990;
    const quantity = Math.floor(1 + rand() * 99);
    const revenue = Math.round(basePrice * quantity * 100) / 100;
    const cost = Math.round(revenue * (0.4 + rand() * 0.3) * 100) / 100;

    rows.push({ id: i, region, category, product, quarter, year, revenue, cost, quantity });
  }

  return rows;
}

/**
 * Get a human-readable size string for a row count.
 */
export function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M rows`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K rows`;
  return `${n} rows`;
}
