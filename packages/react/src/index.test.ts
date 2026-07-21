import { describe, expect, it } from 'vitest';
import { DataGrid, PivotGrid, VERSION, useDataTable } from './index';

describe('@lynellf/tablekit-react', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exports useDataTable', () => {
    expect(typeof useDataTable).toBe('function');
  });

  it('exports the rendered grid components', () => {
    expect(typeof DataGrid).toBe('function');
    expect(typeof PivotGrid).toBe('function');
  });
});
