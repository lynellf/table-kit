import { describe, expect, it } from 'vitest';
import { VERSION, createDataTable } from './index';

describe('@lynellf/tablekit-core', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports createDataTable', () => {
    expect(typeof createDataTable).toBe('function');
  });

  it('createDataTable returns a usable instance with the default state', () => {
    const table = createDataTable({
      data: [],
      columns: [{ id: 'x', accessor: 'x' }],
    });
    expect(typeof table.getState).toBe('function');
    expect(typeof table.setOptions).toBe('function');
    expect(typeof table.subscribe).toBe('function');
    expect(typeof table.getRowModel).toBe('function');
    expect(table.getState().sorting).toEqual([]);
  });
});
