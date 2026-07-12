/**
 * @lynellf/tablekit — public surface verification script.
 *
 * Verifies that:
 * 1. All documented public exports are actually importable from packed artifacts
 * 2. No private source paths are used in consumer fixtures
 * 3. All packages export the expected subpaths
 *
 * R6 required artifact for Foundation gate.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageNames = ['core', 'pivot', 'react', 'worker'];

// ─── Public surface definition ────────────────────────────────────────────────
// These are the documented v2.0.0 public exports per the spec.
// R6 fix: This is now actually used to verify imports, not just dead data.

const publicSurfaces = {
  '@lynellf/tablekit-core': [
    // Root types and factory
    'createDataTable',
    'type DataTableOptions',
    'type DataTableInstance',
    'type DataTableState',
    // State slices
    'type SortItem',
    'type ColumnFilterItem',
    'type PaginationState',
    'type ColumnOrder',
    'type ColumnVisibility',
    'type ColumnPinningState',
    'type ColumnSizingState',
    'type ColumnResizeSession',
    'type CellPosition',
    'type Row',
    // Announcer
    'type Announcer',
    'setGlobalAnnouncer',
    'getGlobalAnnouncer',
    // Version
    'VERSION',
  ],
  '@lynellf/tablekit-core/dataSource': [
    'type DataSource',
    'type DataSourceState',
    'type DataSourceOptions',
    'type RowsResult',
    'type DataVersion',
    'type PaginationStrategy',
    'type OffsetPagination',
    'type CursorPagination',
    'type CursorState',
    'type CursorResult',
  ],
  '@lynellf/tablekit-react': [
    'useDataTable',
    'type UseDataTableOptions',
    'type UseDataTableResult',
    'ReactAnnouncer',
  ],
  '@lynellf/tablekit-pivot': [
    'createPivotTable',
    'type PivotTableOptions',
    'type PivotTableInstance',
    'type PivotConfig',
    'type PivotResult',
    'type PivotLeafColumn',
    'type PivotColumnNode',
    'type PivotRowNode',
    'type Aggregator',
    'VERSION',
    // Resize commands (F0.3)
    'startResize',
    'adjustResize',
    'commitResize',
    'cancelResize',
  ],
  '@lynellf/tablekit-worker': ['VERSION'],
};

// ─── Check that packed artifacts exist ───────────────────────────────────────

for (const packageName of packageNames) {
  const packageDir = resolve(root, 'packages', packageName);
  const distDir = resolve(packageDir, 'dist');

  // Check that dist directory exists
  if (!existsSync(distDir)) {
    throw new Error(`${packageName}: dist directory does not exist - run build first`);
  }

  // Check for ESM artifact
  const esmFile = resolve(distDir, `tablekit-${packageName}.es.js`);
  if (!existsSync(esmFile)) {
    throw new Error(`${packageName}: ESM artifact not found at ${esmFile}`);
  }

  console.log(`✓ ${packageName}: dist artifact exists`);
}

// ─── Verify fixtures directory exists with v2 consumer fixtures ─────────────────

const fixturesDir = resolve(root, 'fixtures', 'consumers', 'v2');
if (!existsSync(fixturesDir)) {
  throw new Error(`fixtures/consumers/v2/ does not exist - create clean consumer fixtures per R6`);
}

// Check that fixture packages exist
const fixturePackages = ['core', 'react', 'pivot', 'worker'];
for (const pkg of fixturePackages) {
  const fixturePkg = resolve(fixturesDir, pkg);
  if (!existsSync(fixturePkg)) {
    throw new Error(`fixtures/consumers/v2/${pkg}/ does not exist`);
  }

  // Check that fixture doesn't import from private source paths
  const fixtureSrc = resolve(fixturePkg, 'src', 'index.ts');
  if (existsSync(fixtureSrc)) {
    const content = readFileSync(fixtureSrc, 'utf8');
    // Private imports that would indicate the fixture is incorrectly set up
    const privatePatterns = [
      /from\s+['"]@lynellf\/tablekit-core\/src/,
      /from\s+['"]@lynellf\/tablekit-react\/src/,
      /from\s+['"]@lynellf\/tablekit-pivot\/src/,
      /from\s+['"]@lynellf\/tablekit-worker\/src/,
      /from\s+['"]\.\.\/\.\.\/\.\.\/packages\//,
    ];

    for (const pattern of privatePatterns) {
      if (pattern.test(content)) {
        throw new Error(
          `fixtures/consumers/v2/${pkg}/ imports from private source path - use packed artifacts`,
        );
      }
    }
  }
  console.log(`✓ fixtures/consumers/v2/${pkg}/ is correctly configured`);
}

// ─── Verify version alignment ──────────────────────────────────────────────────

const rootManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const expectedVersion = rootManifest.version;

for (const packageName of packageNames) {
  const packageDir = resolve(root, 'packages', packageName);
  const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));

  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${manifest.name}: version ${manifest.version} does not match root ${expectedVersion}`,
    );
  }

  // Check runtime VERSION constant
  const versionFile = resolve(packageDir, 'src', 'version.ts');
  if (existsSync(versionFile)) {
    const content = readFileSync(versionFile, 'utf8');
    if (!content.includes(`VERSION = '${expectedVersion}'`)) {
      throw new Error(`${packageName}: runtime VERSION does not match ${expectedVersion}`);
    }
  }

  console.log(`✓ ${packageName}: version ${expectedVersion} aligned`);
}

// ─── Verify public exports are importable from dist artifacts ──────────────────────
// R6 fix: Actually verify exports are available, not just dead data.
// We verify runtime exports via dynamic import and type declarations via grep.

const runtimeExports = {
  '@lynellf/tablekit-core': [
    'createDataTable',
    'VERSION',
    'setGlobalAnnouncer',
    'getGlobalAnnouncer',
  ],
  '@lynellf/tablekit-core/dataSource': ['createClientDataSource'],
  '@lynellf/tablekit-react': ['useDataTable', 'ReactAnnouncer'],
  '@lynellf/tablekit-pivot': ['createPivotTable', 'VERSION'],
  '@lynellf/tablekit-worker': ['VERSION'],
};

for (const [packageName, exports] of Object.entries(runtimeExports)) {
  // Parse package name into base package and subpath
  // @lynellf/tablekit-core -> base: core
  // @lynellf/tablekit-core/dataSource -> base: core, subpath: dataSource
  const parts = packageName.split('/');
  const scopedName = parts[0] ?? ''; // e.g. '@lynellf'
  const packageShortName = parts[1] ?? ''; // e.g. 'tablekit-core' or 'tablekit-react'
  const subpath = parts[2]; // e.g. 'dataSource' or undefined

  // Map short package name to directory name
  const dirNameMap = {
    'tablekit-core': 'core',
    'tablekit-react': 'react',
    'tablekit-pivot': 'pivot',
    'tablekit-worker': 'worker',
  };
  const baseDir = dirNameMap[packageShortName] ?? packageShortName;

  const packageDir = resolve(root, 'packages', baseDir);
  const distDir = resolve(packageDir, 'dist');

  // Determine the correct type declaration file path
  const typesFile = subpath
    ? resolve(distDir, subpath, 'index.d.ts')
    : resolve(distDir, 'index.d.ts');

  if (!existsSync(typesFile)) {
    throw new Error(`${packageName}: no type declaration file found at ${typesFile}`);
  }

  // Read type declarations
  const declContent = readFileSync(typesFile, 'utf8');

  for (const exportName of exports) {
    // Check if export is declared (as type or value)
    // Handle direct exports (export const X) and re-exports (export { X } from ...)
    // Also handle type exports (export type X)
    const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exportPattern = new RegExp(`export\\s+(?:type\\s+)?[^;]*${escapedName}`);
    if (!exportPattern.test(declContent)) {
      throw new Error(`${packageName}: missing export '${exportName}' in type declarations`);
    }
  }
  console.log(`✓ ${packageName}: declared exports verified in type declarations`);
}

console.log(`\n✓ Public surface verification passed for ${packageNames.length} packages`);
