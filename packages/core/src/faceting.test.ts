import { describe, expect, it } from 'vitest';
import { getFacetedMinMax, getFacetedUniqueValues } from './faceting';

interface Person {
  id: string;
  name: string;
  age: number;
}

const rows: Person[] = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
  { id: '3', name: 'Alice', age: 30 },
  { id: '4', name: 'Carol', age: 35 },
  { id: '5', name: 'Bob', age: 25 },
];

const nameKey = (row: Person) => row.name;
const ageKey = (row: Person) => row.age;

describe('getFacetedUniqueValues', () => {
  it('returns a count map for string values', () => {
    const map = getFacetedUniqueValues(rows, 'name', nameKey);
    expect(map.size).toBe(3);
    expect(map.get('Alice')).toBe(2);
    expect(map.get('Bob')).toBe(2);
    expect(map.get('Carol')).toBe(1);
  });

  it('returns a count map for numeric values', () => {
    const map = getFacetedUniqueValues(rows, 'age', ageKey);
    expect(map.size).toBe(3);
    expect(map.get(30)).toBe(2);
    expect(map.get(25)).toBe(2);
    expect(map.get(35)).toBe(1);
  });

  it('returns an empty map for empty input', () => {
    const map = getFacetedUniqueValues([], 'name', nameKey);
    expect(map.size).toBe(0);
  });

  it('inserts in first-occurrence order', () => {
    const map = getFacetedUniqueValues(rows, 'name', nameKey);
    expect(Array.from(map.keys())).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

describe('getFacetedMinMax', () => {
  it('returns [min, max] for a numeric column', () => {
    const out = getFacetedMinMax(rows, 'age', ageKey);
    expect(out).toEqual([25, 35]);
  });

  it('returns [value, value] when only one numeric value', () => {
    const out = getFacetedMinMax([{ id: '1', name: 'A', age: 42 }], 'age', ageKey);
    expect(out).toEqual([42, 42]);
  });

  it('returns undefined for non-numeric column', () => {
    const out = getFacetedMinMax(rows, 'name', nameKey);
    expect(out).toBeUndefined();
  });

  it('returns undefined for empty input', () => {
    const out = getFacetedMinMax([], 'age', ageKey);
    expect(out).toBeUndefined();
  });

  it('ignores non-finite values (NaN, Infinity)', () => {
    const out = getFacetedMinMax(
      [
        { id: '1', name: 'A', age: 10 },
        { id: '2', name: 'B', age: Number.NaN },
        { id: '3', name: 'C', age: Number.POSITIVE_INFINITY },
        { id: '4', name: 'D', age: 20 },
      ],
      'age',
      ageKey,
    );
    expect(out).toEqual([10, 20]);
  });
});
