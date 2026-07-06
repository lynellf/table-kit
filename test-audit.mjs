#!/usr/bin/env node
/**
 * test-audit.mjs
 *
 * Phase 3: Audit script to detect recursive or problematic test paths.
 * Ensures tests are organized to avoid nested test directories that can
 * cause Vitest to spawn multiple concurrent processes unexpectedly.
 *
 * Usage:
 *   node test-audit.mjs              # Run audit
 *   node test-audit.mjs --calibrate  # Print current coverage as baseline
 *
 * Exit codes:
 *   0 = audit passed
 *   1 = audit failed (recursive paths detected)
 *   2 = calibration mode (just prints stats)
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { argv } from 'node:process';

// Known legitimate nested test directories (add exceptions here if needed)
const ALLOWED_NESTED = new Set([
  // Example: 'packages/core/src/dataSource/__tests__/query.test.ts'
  // Add more allowed patterns here as needed
]);

const PROJECT_ROOT = resolve(import.meta.dirname);

/**
 * @typedef {Object} TestFile
 * @property {string} path
 * @property {number} size
 * @property {boolean} nested
 */

/**
 * Recursively find all test files in a directory.
 * Detects if __tests__ or *.test.ts exists inside another __tests__ directory.
 * @param {string} dir
 * @param {string} [baseDir]
 * @returns {Promise<TestFile[]>}
 */
async function findTestFiles(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const subFiles = await findTestFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile() && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const stats = await stat(fullPath);

      // Check if this test file is in a nested __tests__ directory
      const isNested =
        relPath.includes('__tests__/__tests__') || /__tests__\/.*\/__tests__/.test(relPath);

      files.push({
        path: relPath,
        size: stats.size,
        nested: isNested,
      });
    }
  }

  return files;
}

/**
 * Detect test directories that contain other test directories.
 * @param {string} dir
 * @param {string} [baseDir]
 * @returns {Promise<Set<string>>}
 */
async function findRecursiveDirs(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const recursiveDirs = new Set();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const fullPath = join(dir, entry.name);

    if (entry.name === '__tests__' || entry.name === '__specs__') {
      // This is a test directory - check if it contains nested test directories
      const children = await readdir(fullPath, { withFileTypes: true });
      const hasNestedTests = children.some(
        (c) => c.isDirectory() && (c.name === '__tests__' || c.name === '__specs__'),
      );

      if (hasNestedTests) {
        recursiveDirs.add(relative(baseDir, fullPath));
      }
    } else {
      // Recurse into non-test directories
      const nested = await findRecursiveDirs(fullPath, baseDir);
      for (const d of nested) {
        recursiveDirs.add(d);
      }
    }
  }

  return recursiveDirs;
}

/**
 * Run the audit against the project.
 * @returns {Promise<{files: TestFile[], nestedFiles: TestFile[], recursiveDirs: Set<string>, passed: boolean}>}
 */
async function audit() {
  const srcDirs = [
    join(PROJECT_ROOT, 'packages', 'core', 'src'),
    join(PROJECT_ROOT, 'packages', 'react', 'src'),
  ];

  const allFiles = [];
  const allRecursiveDirs = new Set();

  for (const srcDir of srcDirs) {
    try {
      const files = await findTestFiles(srcDir);
      const recursiveDirs = await findRecursiveDirs(srcDir);

      allFiles.push(...files);
      for (const d of recursiveDirs) {
        allRecursiveDirs.add(d);
      }
    } catch (err) {
      // Directory might not exist, skip
      console.warn(`Warning: Could not audit ${srcDir}: ${err.message}`);
    }
  }

  // Filter to only nested files that aren't in the allowed set
  const nestedFiles = allFiles.filter((f) => f.nested && !ALLOWED_NESTED.has(f.path));

  return {
    files: allFiles,
    nestedFiles,
    recursiveDirs: allRecursiveDirs,
    passed: nestedFiles.length === 0 && allRecursiveDirs.size === 0,
  };
}

/**
 * Print coverage calibration stats.
 */
async function calibrate() {
  console.log('\n🧪 Test Audit Calibration Report\n');
  console.log('='.repeat(50));

  const result = await audit();

  console.log('\n📊 Project Stats:');
  console.log(`   Total test files: ${result.files.length}`);
  console.log(`   Nested test files: ${result.nestedFiles.length}`);
  console.log(`   Recursive directories: ${result.recursiveDirs.size}`);

  if (result.nestedFiles.length > 0) {
    console.log('\n⚠️  Nested test files detected:');
    for (const file of result.nestedFiles) {
      console.log(`   - ${file.path}`);
    }
  }

  if (result.recursiveDirs.size > 0) {
    console.log('\n⚠️  Recursive test directories detected:');
    for (const dir of result.recursiveDirs) {
      console.log(`   - ${dir}`);
    }
  }

  console.log('\n💡 To set up coverage thresholds:');
  console.log('   1. Run the test suite without thresholds');
  console.log('   2. Check the coverage/lcov-report/index.html');
  console.log('   3. Use those percentages as your baseline thresholds');
  console.log('   4. Set thresholds slightly below baseline (5-10% buffer)');
  console.log('='.repeat(50));
  console.log('\n');
}

/**
 * Main audit function.
 */
async function main() {
  // Check for calibration mode
  if (argv.includes('--calibrate') || argv.includes('-c')) {
    await calibrate();
    process.exit(2);
  }

  console.log('\n🔍 Running test audit...\n');

  const result = await audit();

  console.log(`📊 Found ${result.files.length} test file(s)`);

  if (result.nestedFiles.length > 0) {
    console.log(`\n❌ Nested test files detected (${result.nestedFiles.length}):`);
    for (const file of result.nestedFiles) {
      console.log(`   - ${file.path}`);
    }
  }

  if (result.recursiveDirs.size > 0) {
    console.log(`\n❌ Recursive test directories detected (${result.recursiveDirs.size}):`);
    for (const dir of result.recursiveDirs) {
      console.log(`   - ${dir}`);
    }
  }

  if (result.passed) {
    console.log('\n✅ Audit passed! No recursive test paths detected.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Audit failed! Review the issues above.\n');
    console.log('💡 Solutions:');
    console.log('   1. Move nested test files to the parent __tests__ directory');
    console.log('   2. Or add the path to ALLOWED_NESTED in this script');
    console.log('   3. Or restructure your test organization\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
