import { describe, expect, it } from 'vitest';
import { computePageCount, paginateRows } from './paginate';

const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i) }));

describe('paginateRows', () => {
  it('returns the first page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 0, pageSize: 10 } });
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ id: '0' });
    expect(out[9]).toEqual({ id: '9' });
  });

  it('returns a middle page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 1, pageSize: 10 } });
    expect(out.map((r) => r.id)).toEqual([
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
    ]);
  });

  it('returns the last partial page', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 2, pageSize: 10 } });
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ id: '20' });
  });

  it('returns [] when pageIndex is beyond the data', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 99, pageSize: 10 } });
    expect(out).toEqual([]);
  });

  it('returns all rows when pageSize is invalid (<=0)', () => {
    const out = paginateRows({ rows, pagination: { pageIndex: 0, pageSize: 0 } });
    expect(out).toEqual(rows);
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    paginateRows({ rows: input, pagination: { pageIndex: 1, pageSize: 10 } });
    expect(input).toEqual(rows);
  });
});

describe('computePageCount', () => {
  it('returns 0 for empty data', () => {
    expect(computePageCount(0, 10)).toBe(0);
  });

  it('rounds up partial pages', () => {
    expect(computePageCount(25, 10)).toBe(3);
    expect(computePageCount(21, 10)).toBe(3);
    expect(computePageCount(20, 10)).toBe(2);
  });

  it('returns 0 for invalid pageSize', () => {
    expect(computePageCount(100, 0)).toBe(0);
    expect(computePageCount(100, -1)).toBe(0);
  });
});
