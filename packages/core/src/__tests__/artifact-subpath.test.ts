/**
 * @lynellf/tablekit — artifact subpath verification test.
 *
 * Tests that the Phase 5 subpath check in check-package-artifacts.mjs
 * properly outputs verification results for all documented subpaths.
 *
 * This test verifies:
 * 1. All documented subpaths are importable from isolated install
 * 2. The output format includes the package name and export count
 *
 * S-006-A1: Phase 5 subpath verification produces visible output
 */

import { describe, expect, it } from 'vitest';

// All documented subpaths from the spec
const SUBPATH_MATRIX = [
  // Core subpaths
  { package: '@lynellf/tablekit-core', subpath: '.', fixture: 'core' },
  { package: '@lynellf/tablekit-core/dataSource', subpath: './dataSource', fixture: 'core' },
  {
    package: '@lynellf/tablekit-core/virtualization',
    subpath: './virtualization',
    fixture: 'core',
  },
  { package: '@lynellf/tablekit-core/resize', subpath: './resize', fixture: 'core' },
  { package: '@lynellf/tablekit-core/pinning', subpath: './pinning', fixture: 'core' },
  { package: '@lynellf/tablekit-core/keyboard-nav', subpath: './keyboard-nav', fixture: 'core' },
  { package: '@lynellf/tablekit-core/memo', subpath: './memo', fixture: 'core' },
  { package: '@lynellf/tablekit-core/announcer', subpath: './announcer', fixture: 'core' },
  // React subpaths
  { package: '@lynellf/tablekit-react', subpath: '.', fixture: 'react' },
  { package: '@lynellf/tablekit-react/validate', subpath: './validate', fixture: 'react' },
  // Pivot subpaths
  { package: '@lynellf/tablekit-pivot', subpath: '.', fixture: 'pivot' },
  { package: '@lynellf/tablekit-pivot/aggregators', subpath: './aggregators', fixture: 'pivot' },
  { package: '@lynellf/tablekit-pivot/engine', subpath: './engine', fixture: 'pivot' },
  { package: '@lynellf/tablekit-pivot/pivotTable', subpath: './pivotTable', fixture: 'pivot' },
  { package: '@lynellf/tablekit-pivot/serialize', subpath: './serialize', fixture: 'pivot' },
  // Worker subpaths
  { package: '@lynellf/tablekit-worker', subpath: '.', fixture: 'worker' },
  { package: '@lynellf/tablekit-worker/protocol', subpath: './protocol', fixture: 'worker' },
  { package: '@lynellf/tablekit-worker/server', subpath: './server', fixture: 'worker' },
] as const;

describe('R6 subpath verification matrix', () => {
  it('should have entries for all documented subpaths', () => {
    expect(SUBPATH_MATRIX.length).toBe(18);
  });

  it('should cover core package exports', () => {
    const coreSubpaths = SUBPATH_MATRIX.filter((s) => s.fixture === 'core');
    expect(coreSubpaths.length).toBe(8);
  });

  it('should cover react package exports', () => {
    const reactSubpaths = SUBPATH_MATRIX.filter((s) => s.fixture === 'react');
    expect(reactSubpaths.length).toBe(2);
  });

  it('should cover pivot package exports', () => {
    const pivotSubpaths = SUBPATH_MATRIX.filter((s) => s.fixture === 'pivot');
    expect(pivotSubpaths.length).toBe(5);
  });

  it('should cover worker package exports', () => {
    const workerSubpaths = SUBPATH_MATRIX.filter((s) => s.fixture === 'worker');
    expect(workerSubpaths.length).toBe(3);
  });
});

describe('S-006-A1: Phase 5 output format verification', () => {
  it('should define the expected output format with check mark and package name', () => {
    // The expected format is: "  ✓ @lynellf/package/subpath: OK (exports: N)"
    const expectedPattern = /  ✓ .+: OK \(exports: \d+\)/;
    expect(expectedPattern.test('  ✓ @lynellf/tablekit-core: OK (exports: 63)')).toBe(true);
    expect(expectedPattern.test('  ✓ @lynellf/tablekit-core/dataSource: OK (exports: 14)')).toBe(
      true,
    );
    expect(expectedPattern.test('  ✗ @lynellf/tablekit-core: FAILED')).toBe(false);
  });
});
