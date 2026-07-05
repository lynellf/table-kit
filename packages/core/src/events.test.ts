import { describe, expect, it } from 'vitest';
import type { CellEventContext } from './events';

describe('CellEventContext shape', () => {
  it('is structurally assignable to the spec', () => {
    const ctx: CellEventContext<{ id: string }, string> = {
      table: undefined,
      row: {
        id: 'r1',
        index: 0,
        original: { id: 'r1' },
        getVisibleCells: () => [],
        getRowProps: () => ({}),
      },
      column: {} as CellEventContext<{ id: string }, string>['column'],
      cell: {} as CellEventContext<{ id: string }, string>['cell'],
      value: 'Alice',
      rowIndex: 0,
      colIndex: 1,
      source: 'mouse',
    };
    expect(ctx.value).toBe('Alice');
    expect(ctx.source).toBe('mouse');
  });
});
