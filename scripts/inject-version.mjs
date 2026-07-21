/**
 * R6-VERSION-SOURCE-009 fix: Derive runtime VERSION values from root package.json metadata.
 *
 * This script reads the version from the monorepo root package.json and replaces the
 * hardcoded VERSION constant in each package's source file. This ensures all packages
 * publish with the same version as the monorepo release, preventing silent drift.
 *
 * Run as part of the build process before TypeScript compilation.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read version from root package.json
const rootPkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = rootPkg.version;

console.log(`Injecting version ${version} into package sources...`);

const packages = [
  {
    name: '@lynellf/tablekit-core',
    file: resolve(root, 'packages/core/src/index.ts'),
    pattern: /export const VERSION = '[\d.]+' as const;/,
    replacement: `export const VERSION = '${version}' as const;`,
  },
  {
    name: '@lynellf/tablekit-react',
    file: resolve(root, 'packages/react/src/index.ts'),
    pattern: /export const VERSION = '[\d.]+' as const;/,
    replacement: `export const VERSION = '${version}' as const;`,
  },
  {
    name: '@lynellf/tablekit-pivot',
    file: resolve(root, 'packages/pivot/src/index.ts'),
    pattern: /export const VERSION = '[\d.]+' as const;/,
    replacement: `export const VERSION = '${version}' as const;`,
  },
  {
    name: '@lynellf/tablekit-worker',
    file: resolve(root, 'packages/worker/src/version.ts'),
    pattern: /export const VERSION = '[\d.]+' as const;/,
    replacement: `export const VERSION = '${version}' as const;`,
  },
];

for (const pkg of packages) {
  const content = readFileSync(pkg.file, 'utf8');
  if (!pkg.pattern.test(content)) {
    console.error(`  ✗ ${pkg.name}: VERSION pattern not found in ${pkg.file}`);
    throw new Error(`VERSION pattern not found in ${pkg.file}`);
  }
  const newContent = content.replace(pkg.pattern, pkg.replacement);
  writeFileSync(pkg.file, newContent, 'utf8');
  console.log(`  ✓ ${pkg.name}: VERSION = '${version}'`);
}

console.log('Done.');
