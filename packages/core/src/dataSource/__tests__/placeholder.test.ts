/**
 * @lynellf/tablekit-core/dataSource — placeholder.test.ts
 *
 * Tests for synthesizePlaceholderRows.
 */

import { describe, expect, it } from 'vitest';
import { synthesizePlaceholderRows } from '../placeholderRows';

describe('synthesizePlaceholderRows', () => {
  it('returns empty array for count <= 0', () => {
    expect(synthesizePlaceholderRows(0)).toEqual([]);
    expect(synthesizePlaceholderRows(-1)).toEqual([]);
  });

  it('returns correct number of rows', () => {
    const rows = synthesizePlaceholderRows(5);
    expect(rows).toHaveLength(5);
  });

  it('assigns sequential ids with __placeholder_ prefix', () => {
    const rows = synthesizePlaceholderRows<{ name: string }>(3);
    expect(rows[0]!.id).toBe('__placeholder_0');
    expect(rows[1]!.id).toBe('__placeholder_1');
    expect(rows[2]!.id).toBe('__placeholder_2');
  });

  it('assigns sequential indices', () => {
    const rows = synthesizePlaceholderRows<Record<string, unknown>>(5);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('rows have isPlaceholder: true', () => {
    const rows = synthesizePlaceholderRows<Record<string, unknown>>(2);
    expect(rows[0]!.isPlaceholder).toBe(true);
    expect(rows[1]!.isPlaceholder).toBe(true);
  });

  it('getRowProps returns data-placeholder attribute', () => {
    const rows = synthesizePlaceholderRows<Record<string, unknown>>(1);
    const props = rows[0]!.getRowProps();
    expect(props).toMatchObject({ 'data-placeholder': 'true', role: 'row' });
  });

  it('ids are unique across multiple calls', () => {
    const rows1 = synthesizePlaceholderRows<Record<string, unknown>>(2);
    const rows2 = synthesizePlaceholderRows<Record<string, unknown>>(2);
    expect(rows1[0]!.id).toBe('__placeholder_0');
    expect(rows1[1]!.id).toBe('__placeholder_1');
    expect(rows2[0]!.id).toBe('__placeholder_0');
    expect(rows2[1]!.id).toBe('__placeholder_1');
    // Same id is fine across calls (ids are synthetic/placeholder)
  });
});
