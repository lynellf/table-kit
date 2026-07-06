/**
 * @lynellf/tablekit-core/dataSource — warnings.test.ts
 *
 * Tests for validateModeConfiguration (mixed-mode trap detection).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetMixedModeWarningForTests, validateModeConfiguration } from '../warnings';

describe('validateModeConfiguration', () => {
  beforeEach(() => {
    __resetMixedModeWarningForTests();
    vi.restoreAllMocks();
  });

  it('does not warn when manualPagination is false', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when manualPagination is undefined', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when manualPagination=true and manualSorting=true and manualFiltering=true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: true,
      manualFiltering: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when manualPagination=true and allowWithinPageOperations=true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
      manualFiltering: false,
      allowWithinPageOperations: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when manualPagination=true and manualSorting=false (client sort)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
      manualFiltering: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowWithinPageOperations'));
  });

  it('warns when manualPagination=true and manualFiltering=false (client filter)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: true,
      manualFiltering: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('allowWithinPageOperations'));
  });

  it('warns when manualPagination=true with both client sort and filter', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
      manualFiltering: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is one-shot: warns only once per process', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
      manualFiltering: false,
    });
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
      manualFiltering: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warning text names the trap and the opt-in flag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
    });
    const msg = warn.mock.calls[0]![0] as string;
    expect(msg).toContain('allowWithinPageOperations');
    expect(msg).toContain('Server pagination');
    expect(msg).toContain('client-side');
  });

  it('__resetMixedModeWarningForTests resets the one-shot flag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    __resetMixedModeWarningForTests();
    validateModeConfiguration<Record<string, unknown>>({
      data: [],
      columns: [],
      manualPagination: true,
      manualSorting: false,
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
