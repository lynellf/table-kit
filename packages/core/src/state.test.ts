import { describe, expect, it } from 'vitest';
import {
  applySliceChange,
  controlledSliceKeys,
  isSliceControlled,
  mergeInitialState,
  resolveUpdater,
  stateChangedOnSlices,
} from './state';
import { DEFAULT_STATE } from './types';
import type { DataTableState } from './types';

describe('state engine', () => {
  describe('resolveUpdater', () => {
    it('returns the value when updater is a value', () => {
      expect(resolveUpdater(0, 5)).toBe(5);
    });

    it('invokes the function form with the previous value', () => {
      expect(resolveUpdater(10, (n) => n + 1)).toBe(11);
    });
  });

  describe('applySliceChange', () => {
    it('returns the same reference when the updater produces the same value', () => {
      const out = applySliceChange(DEFAULT_STATE, 'sorting', []);
      expect(out).toBe(DEFAULT_STATE);
    });

    it('returns a new state object with the slice replaced', () => {
      const out = applySliceChange(DEFAULT_STATE, 'sorting', [{ id: 'a', desc: false }]);
      expect(out).not.toBe(DEFAULT_STATE);
      expect(out.sorting).toEqual([{ id: 'a', desc: false }]);
    });

    it('supports function updaters', () => {
      const out = applySliceChange(DEFAULT_STATE, 'pagination', (p) => ({
        ...p,
        pageIndex: 2,
      }));
      expect(out.pagination.pageIndex).toBe(2);
    });
  });

  describe('isSliceControlled', () => {
    it('returns false when no options state', () => {
      expect(isSliceControlled(undefined, 'sorting')).toBe(false);
    });

    it('returns true when the key is present (even with undefined value)', () => {
      // With exactOptionalPropertyTypes: true, use Object.prototype.hasOwnProperty
      const optsWithKey = { sorting: [] as never };
      expect(isSliceControlled(optsWithKey, 'sorting')).toBe(true);
    });

    it('returns false when the key is absent', () => {
      expect(isSliceControlled({ pagination: { pageIndex: 0, pageSize: 10 } }, 'sorting')).toBe(
        false,
      );
    });
  });

  describe('mergeInitialState', () => {
    it('uses defaults when neither is provided', () => {
      expect(mergeInitialState(undefined, undefined)).toEqual(DEFAULT_STATE);
    });

    it('overlays initialState onto defaults', () => {
      const out = mergeInitialState({ sorting: [{ id: 'a', desc: false }] }, undefined);
      expect(out.sorting).toEqual([{ id: 'a', desc: false }]);
    });

    it('controlled state wins over initialState', () => {
      const out = mergeInitialState(
        { sorting: [{ id: 'a', desc: false }] },
        { sorting: [{ id: 'b', desc: true }] },
      );
      expect(out.sorting).toEqual([{ id: 'b', desc: true }]);
    });
  });

  describe('controlledSliceKeys', () => {
    it('returns an empty array when no options state', () => {
      expect(controlledSliceKeys(undefined)).toEqual([]);
    });

    it('returns the keys present in options state', () => {
      expect(
        controlledSliceKeys({ sorting: [], pagination: { pageIndex: 0, pageSize: 25 } }),
      ).toEqual(['sorting', 'pagination']);
    });
  });

  describe('stateChangedOnSlices', () => {
    it('returns false when no slices differ', () => {
      const a: DataTableState = { ...DEFAULT_STATE };
      const b: DataTableState = { ...DEFAULT_STATE };
      expect(stateChangedOnSlices(a, b, ['sorting', 'pagination'])).toBe(false);
    });

    it('returns true when a slice differs by reference', () => {
      const a: DataTableState = { ...DEFAULT_STATE };
      const b: DataTableState = { ...DEFAULT_STATE, sorting: [{ id: 'a', desc: false }] };
      expect(stateChangedOnSlices(a, b, ['sorting'])).toBe(true);
    });

    it('returns true when a slice value differs by deep equality', () => {
      const a: DataTableState = { ...DEFAULT_STATE, pagination: { pageIndex: 0, pageSize: 10 } };
      const b: DataTableState = { ...DEFAULT_STATE, pagination: { pageIndex: 1, pageSize: 10 } };
      expect(stateChangedOnSlices(a, b, ['pagination'])).toBe(true);
    });
  });

  describe('stateChangedOnSlices (object-slice regression — M3 abort-stale)', () => {
    it('reports no change when a re-derived pagination object has identical values', () => {
      const prev: DataTableState = {
        ...DEFAULT_STATE,
        pagination: { pageIndex: 0, pageSize: 10 },
      };
      const next: DataTableState = {
        ...prev,
        pagination: { pageIndex: 0, pageSize: 10 }, // new ref, same values
      };
      expect(stateChangedOnSlices(prev, next, ['pagination'])).toBe(false);
    });

    it('reports a change when pagination values differ', () => {
      const prev: DataTableState = {
        ...DEFAULT_STATE,
        pagination: { pageIndex: 0, pageSize: 10 },
      };
      const next: DataTableState = {
        ...prev,
        pagination: { pageIndex: 1, pageSize: 10 },
      };
      expect(stateChangedOnSlices(prev, next, ['pagination'])).toBe(true);
    });

    it('reports no change for columnPinning when contents match across new refs', () => {
      const prev: DataTableState = {
        ...DEFAULT_STATE,
        columnPinning: { left: ['a'], right: [] },
      };
      const next: DataTableState = {
        ...prev,
        columnPinning: { left: ['a'], right: [] },
      };
      expect(stateChangedOnSlices(prev, next, ['columnPinning'])).toBe(false);
    });
  });
});
