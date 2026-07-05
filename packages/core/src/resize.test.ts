import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESIZE_STEP_PX,
  cancelResize,
  clampColumnSize,
  resizeAnnouncement,
  resizeColumn,
} from './resize';
import type { ColumnResizeSession, ColumnSizingState } from './types';

const baseSizing = (): ColumnSizingState => ({ name: 150 });

const baseSession = (overrides: Partial<ColumnResizeSession> = {}): ColumnResizeSession => ({
  columnId: 'name',
  startSize: 150,
  delta: 0,
  mode: 'onChange',
  ...overrides,
});

describe('resizeColumn', () => {
  it('applies the delta and returns new sizing', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: 50 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(200);
    expect(out.changed).toBe(true);
  });

  it('clamps to minSize', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: -500 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(30);
    expect(out.changed).toBe(true);
  });

  it('clamps to maxSize', () => {
    const out = resizeColumn({
      columnSizing: baseSizing(),
      session: baseSession({ delta: 1000 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.columnSizing.name).toBe(500);
    expect(out.changed).toBe(true);
  });

  it('returns unchanged when clamping results in same size', () => {
    const out = resizeColumn({
      columnSizing: { name: 500 },
      session: baseSession({ delta: 0, startSize: 500 }),
      minSize: 30,
      maxSize: 500,
    });
    expect(out.changed).toBe(false);
  });
});

describe('cancelResize', () => {
  it('reverts to start size', () => {
    const out = cancelResize(
      { name: 250 },
      baseSession({ startSize: 150, delta: 100 }),
    );
    expect(out.name).toBe(150);
  });

  it('returns input unchanged when session is null', () => {
    const sizing = baseSizing();
    expect(cancelResize(sizing, null)).toBe(sizing);
  });

  it('returns input unchanged when current equals start', () => {
    const sizing = baseSizing();
    expect(cancelResize(sizing, baseSession({ startSize: 150 }))).toBe(sizing);
  });
});

describe('clampColumnSize', () => {
  it('clamps to bounds', () => {
    expect(clampColumnSize(1000, 30, 500)).toBe(500);
    expect(clampColumnSize(10, 30, 500)).toBe(30);
    expect(clampColumnSize(100, 30, 500)).toBe(100);
  });
});

describe('resizeAnnouncement', () => {
  it('formats with column name when provided', () => {
    expect(resizeAnnouncement('name', 240, 'Name')).toBe('Name column, 240 pixels');
  });

  it('falls back to columnId when no name', () => {
    expect(resizeAnnouncement('name', 240)).toBe('name column, 240 pixels');
  });
});

describe('DEFAULT_RESIZE_STEP_PX', () => {
  it('is 10', () => {
    expect(DEFAULT_RESIZE_STEP_PX).toBe(10);
  });
});
