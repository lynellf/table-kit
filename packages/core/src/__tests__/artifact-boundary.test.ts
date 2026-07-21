/**
 * Slice 7 — R6 isolated fixture and peer closure regression tests.
 *
 * These tests verify that the package artifact boundary is isolated from
 * workspace/source/repository-dist paths and that peer dependencies use
 * concrete versions rather than workspace:* references.
 *
 * Run with: pnpm exec vitest run packages/core/src/__tests__/artifact-boundary.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Use process.cwd() which is the repo root when vitest runs from the workspace.
const repoRoot = process.cwd();

// ─── S-007-A1: tsconfig.package-artifact-fixture.json has no repository dist paths ───

describe('S-007-A1 — tsconfig.package-artifact-fixture.json has no repository dist paths', () => {
  it('must not map @lynellf/tablekit-* to packages/*/dist paths', () => {
    const tsconfigPath = resolve(repoRoot, 'tsconfig.package-artifact-fixture.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    const paths: Record<string, string | string[]> = tsconfig.compilerOptions?.paths ?? {};

    const repoDistMappings = Object.entries(paths).filter(([key, values]) => {
      if (!key.startsWith('@lynellf/tablekit-')) return false;
      const targets = Array.isArray(values) ? values : [values];
      // Repository dist paths start with "packages/" and contain "/dist"
      return targets.some((v) => v.startsWith('packages/') && v.includes('/dist'));
    });

    expect(
      repoDistMappings,
      `Found ${repoDistMappings.length} repository dist path mapping(s)`,
    ).toHaveLength(0);
  });
});

// ─── S-007-A2: source package.json files have no workspace:* peer dependencies ───

describe('S-007-A2 — source package manifests use concrete peer version ranges', () => {
  const packages = ['core', 'react', 'pivot', 'worker'] as const;

  for (const pkg of packages) {
    it(`@lynellf/tablekit-${pkg} must not use workspace:* in peerDependencies`, () => {
      const manifest = JSON.parse(
        readFileSync(resolve(repoRoot, 'packages', pkg, 'package.json'), 'utf8'),
      );
      const peerDeps = manifest.peerDependencies ?? {};

      const workspaceRefs = Object.entries(peerDeps).filter(
        ([, version]) => version === 'workspace:*',
      );

      expect(
        workspaceRefs.map(([dep]) => dep),
        `@lynellf/tablekit-${pkg} has workspace:* peer dependency(s)`,
      ).toHaveLength(0);
    });
  }
});

// ─── S-007-A3: fixture manifests have complete internal peer closure ───

describe('S-007-A3 — fixture manifests declare complete internal peer closure', () => {
  interface FixtureExpectation {
    fixture: string;
    expectedInternalDeps: string[];
  }

  const expectations: FixtureExpectation[] = [
    {
      fixture: 'core',
      expectedInternalDeps: ['@lynellf/tablekit-core'],
    },
    {
      fixture: 'react',
      // react fixture imports @lynellf/tablekit-react/validate and @lynellf/tablekit-pivot
      expectedInternalDeps: [
        '@lynellf/tablekit-core',
        '@lynellf/tablekit-react',
        '@lynellf/tablekit-pivot',
      ],
    },
    {
      fixture: 'pivot',
      // pivot fixture imports @lynellf/tablekit-pivot and @lynellf/tablekit-pivot/* subpaths
      // which transitively require @lynellf/tablekit-core
      expectedInternalDeps: ['@lynellf/tablekit-core', '@lynellf/tablekit-pivot'],
    },
    {
      fixture: 'worker',
      // worker fixture imports @lynellf/tablekit-worker and @lynellf/tablekit-pivot/*
      // which transitively requires @lynellf/tablekit-pivot and @lynellf/tablekit-core
      expectedInternalDeps: [
        '@lynellf/tablekit-core',
        '@lynellf/tablekit-pivot',
        '@lynellf/tablekit-worker',
      ],
    },
  ];

  for (const { fixture, expectedInternalDeps } of expectations) {
    it(`${fixture} fixture must declare all internal @lynellf/tablekit-* deps`, () => {
      const manifest = JSON.parse(
        readFileSync(resolve(repoRoot, 'fixtures/consumers/v2', fixture, 'package.json'), 'utf8'),
      );
      const allDeps = {
        ...(manifest.dependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      };

      const missing = expectedInternalDeps.filter(
        (dep) => !Object.prototype.hasOwnProperty.call(allDeps, dep),
      );

      expect(
        missing,
        `${fixture} fixture is missing internal dep(s): ${missing.join(', ')}`,
      ).toHaveLength(0);
    });
  }
});

// ─── S-007-A4: fixture manifests use concrete (not workspace:*) version ranges ───

describe('S-007-A4 — fixture internal deps use concrete version ranges', () => {
  const fixtures = ['core', 'react', 'pivot', 'worker'] as const;

  for (const fixture of fixtures) {
    it(`${fixture} fixture must not use workspace:* for internal deps`, () => {
      const manifest = JSON.parse(
        readFileSync(resolve(repoRoot, 'fixtures/consumers/v2', fixture, 'package.json'), 'utf8'),
      );
      const allDeps = {
        ...(manifest.dependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      };

      const workspaceRefs = Object.entries(allDeps).filter(
        ([dep, version]) => dep.startsWith('@lynellf/tablekit-') && version === 'workspace:*',
      );

      expect(
        workspaceRefs.map(([dep]) => dep),
        `${fixture} fixture has workspace:* dep(s)`,
      ).toHaveLength(0);
    });
  }
});
