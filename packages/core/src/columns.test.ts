import { describe, expect, it } from 'vitest';
import { createColumns, defaultGetRowId, resolveAccessor } from './columns';
import type { ColumnDef, DataTableState } from './types';
import { DEFAULT_STATE } from './types';

interface Person {
  id: string;
  name: string;
  age: number;
}

const baseDef: ColumnDef<Person, string> = {
  id: 'name',
  accessor: 'name',
};

const defs: Array<ColumnDef<Person, unknown>> = [
  baseDef,
  { id: 'age', accessor: 'age', enableSorting: true },
  { id: 'email', accessor: 'email' as keyof Person & string },
];

describe('columns', () => {
  describe('resolveAccessor', () => {
    it('returns the function as-is when accessor is a function', () => {
      const fn = (row: Person) => row.id;
      const resolved = resolveAccessor<Person, string>({ id: 'x', accessor: fn });
      expect(resolved({ id: 'r', name: 'n', age: 1 }, 0)).toBe('r');
    });

    it('looks up the key when accessor is a string', () => {
      const resolved = resolveAccessor<Person, string>({ id: 'name', accessor: 'name' });
      expect(resolved({ id: 'r', name: 'Alice', age: 1 }, 7)).toBe('Alice');
    });

    it('returns undefined when no accessor is provided', () => {
      const resolved = resolveAccessor<Person, string>({ id: 'x' });
      expect(resolved({ id: 'r', name: 'n', age: 1 }, 0)).toBeUndefined();
    });
  });

  describe('createColumns', () => {
    it('preserves def order when columnOrder is empty', () => {
      const cols = createColumns<Person>(defs, DEFAULT_STATE);
      expect(cols.map((c) => c.id)).toEqual(['name', 'age', 'email']);
    });

    it('honors columnOrder when provided', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['email', 'name'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['email', 'name', 'age']);
    });

    it('appends unknown defs at the end', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['age'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['age', 'name', 'email']);
    });

    it('drops unknown ids from columnOrder', () => {
      const state: DataTableState = { ...DEFAULT_STATE, columnOrder: ['age', 'ghost', 'name'] };
      const cols = createColumns<Person>(defs, state);
      expect(cols.map((c) => c.id)).toEqual(['age', 'name', 'email']);
    });

    it('assigns sequential indices', () => {
      const cols = createColumns<Person>(defs, DEFAULT_STATE);
      expect(cols.map((c) => c.index)).toEqual([0, 1, 2]);
    });
  });

  describe('Column derived getters', () => {
    const cols = createColumns<Person>(defs, DEFAULT_STATE);

    it('getValue returns the row cell', () => {
      const nameCol = cols[0];
      const ageCol = cols[1];
      expect(nameCol?.getValue({ id: '1', name: 'Alice', age: 30 }, 0)).toBe('Alice');
      expect(ageCol?.getValue({ id: '1', name: 'Alice', age: 30 }, 0)).toBe(30);
    });

    it('getSize returns def.size or default', () => {
      const sizedCol = createColumns<Person>(
        [{ id: 'name', accessor: 'name', size: 200 }],
        DEFAULT_STATE,
      )[0];
      expect(sizedCol?.getSize()).toBe(200);
      expect(cols[0]?.getSize()).toBe(150); // default
    });

    it('getSize returns columnSizing override when present', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnSizing: { name: 250 },
      };
      const col = createColumns<Person>(defs, state)[0];
      expect(col?.getSize()).toBe(250);
    });

    it('getIsPinned returns false by default', () => {
      expect(cols[0]?.getIsPinned()).toBe(false);
    });

    it('getIsPinned reads columnPinning state', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnPinning: { left: ['name'], right: [] },
      };
      const col = createColumns<Person>(defs, state)[0];
      expect(col?.getIsPinned()).toBe('left');
    });

    it('getIsSorted returns false when not sorted', () => {
      expect(cols[0]?.getIsSorted()).toBe(false);
    });

    it('getIsSorted reads sorting state', () => {
      const state: DataTableState = { ...DEFAULT_STATE, sorting: [{ id: 'age', desc: true }] };
      const col = createColumns<Person>(defs, state)[1];
      expect(col?.getIsSorted()).toBe('desc');
    });

    it('getCanSort reflects enableSorting', () => {
      expect(cols[0]?.getCanSort()).toBe(false);
      expect(cols[1]?.getCanSort()).toBe(true);
    });

    it('getCanFilter reflects enableFiltering', () => {
      expect(cols[0]?.getCanFilter()).toBe(false);
    });

    it('getIsVisible reflects columnVisibility', () => {
      expect(cols[0]?.getIsVisible()).toBe(true);
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnVisibility: { name: false },
      };
      const col = createColumns<Person>(defs, state)[0];
      expect(col?.getIsVisible()).toBe(false);
    });

    it('getMinSize / getMaxSize have safe defaults', () => {
      expect(cols[0]?.getMinSize()).toBe(30);
      expect(cols[0]?.getMaxSize()).toBe(Number.POSITIVE_INFINITY);
    });

    it('getPinnedOffset is 0 when unpinned', () => {
      expect(cols[0]?.getPinnedOffset()).toBe(0);
    });

    it('getPinnedOffset sums preceding pinned widths', () => {
      const state: DataTableState = {
        ...DEFAULT_STATE,
        columnPinning: { left: ['name', 'age'], right: [] },
        columnSizing: { name: 100, age: 50 },
      };
      const cols2 = createColumns<Person>(defs, state);
      const ageCol2 = cols2.find((c) => c.id === 'age');
      expect(ageCol2?.getPinnedOffset()).toBe(100); // name is 100 wide and pinned before age
    });

    it('getMeta returns the def meta', () => {
      const meta = { custom: 'value' };
      const col = createColumns<Person>([{ id: 'name', accessor: 'name', meta }], DEFAULT_STATE)[0];
      expect(col?.getMeta()).toBe(meta);
    });
  });

  describe('defaultGetRowId', () => {
    it('produces a string id', () => {
      const id = defaultGetRowId({ id: 'r' }, 5);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('Column identity stability', () => {
    it('re-running createColumns with the same state returns structurally equal getters', () => {
      const a = createColumns<Person>(defs, DEFAULT_STATE);
      const b = createColumns<Person>(defs, DEFAULT_STATE);
      // Different instances — that is expected. But each instance reads the same state.
      expect(a[0]?.getSize()).toBe(b[0]?.getSize());
      expect(a[0]?.id).toBe(b[0]?.id);
    });
  });
});
