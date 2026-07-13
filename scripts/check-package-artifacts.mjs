/**
 * @lynellf/tablekit — package artifact verification script.
 *
 * Verifies that packed artifacts are properly isolated from workspace/source.
 *
 * R6-ARTIFACT-009 fix: This script now creates actual temporary tarballs,
 * installs fixtures from those tarballs, and compiles from the isolated install.
 * It verifies no workspace/source/dist escapes exist.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageNames = ['core', 'pivot', 'react', 'worker'];
const npmEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_')),
);

// R6 fix: Temporary directory outside the workspace (use os.tmpdir())
const timestamp = Date.now();
const tempDir = resolve(tmpdir(), `tablekit-artifact-check-${timestamp}`);
const tarballsDir = resolve(tempDir, 'tarballs');
const installDir = resolve(tempDir, 'install');

/**
 * R6-ARTIFACT-009 fix: Clean up temp directory on exit.
 */
const cleanup = () => {
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
};
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

// ─── Phase 1: Verify repository metadata ───────────────────────────────────────

const collectTypeTargets = (value, targets = []) => {
  if (!value || typeof value !== 'object') return targets;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'types' && typeof child === 'string') targets.push(child);
    else collectTypeTargets(child, targets);
  }
  return targets;
};

console.log('=== Phase 1: Verifying package metadata ===');

for (const packageName of packageNames) {
  const packageDir = resolve(root, 'packages', packageName);
  const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  const metadataUrls = [manifest.repository?.url, manifest.homepage, manifest.bugs?.url];
  if (
    metadataUrls.some(
      (url) => typeof url !== 'string' || !url.includes('github.com/lynellf/table-kit'),
    )
  ) {
    throw new Error(
      `${manifest.name}: repository, homepage, and bugs links must target lynellf/table-kit`,
    );
  }
  const targets = [...new Set([manifest.types, ...collectTypeTargets(manifest.exports)])].filter(
    (target) => typeof target === 'string',
  );

  for (const target of targets) {
    if (!existsSync(resolve(packageDir, target))) {
      throw new Error(`${manifest.name}: missing declared type target ${target}`);
    }
  }

  // R6-ARTIFACT-009 fix: Actually create tarballs, not dry-run
  if (!existsSync(tarballsDir)) {
    mkdirSync(tarballsDir, { recursive: true });
  }

  console.log(`  Packing ${packageName}...`);
  execFileSync('pnpm', ['pack', '--pack-destination', tarballsDir], {
    cwd: packageDir,
    encoding: 'utf8',
    env: npmEnvironment,
  });

  // Verify the packed manifest has correct peer dependencies (no workspace:*)
  const tarballFiles = execFileSync('ls', ['-1', tarballsDir], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.includes(packageName) && f.endsWith('.tgz'));

  if (tarballFiles.length === 0) {
    throw new Error(`${packageName}: no tarball created`);
  }

  const tarballPath = resolve(tarballsDir, tarballFiles[tarballFiles.length - 1]);
  const tarballManifest = JSON.parse(
    execFileSync('tar', ['-xOz', '-f', tarballPath, 'package/package.json'], {
      encoding: 'utf8',
    }),
  );

  // Check for workspace:* in peerDependencies
  const peerDeps = tarballManifest.peerDependencies ?? {};
  for (const [dep, version] of Object.entries(peerDeps)) {
    if (dep.startsWith('@lynellf/tablekit-') && version === 'workspace:*') {
      throw new Error(
        `${manifest.name}: peer dependency ${dep} uses workspace:* - must be concrete version`,
      );
    }
  }

  console.log(`  ✓ ${packageName}: tarball created at ${tarballPath}`);
  console.log(`  ✓ ${packageName}: no workspace:* peer dependencies`);
}

// ─── Phase 2: Set up isolated fixture install ───────────────────────────────────

console.log('\n=== Phase 2: Installing fixtures from tarballs ===');

// Create isolated install directory
if (existsSync(installDir)) {
  rmSync(installDir, { recursive: true });
}
mkdirSync(installDir, { recursive: true });

// Copy fixture manifests to temp install
const fixturesDir = resolve(root, 'fixtures', 'consumers', 'v2');
for (const fixtureName of ['core', 'react', 'pivot', 'worker']) {
  const srcFixture = resolve(fixturesDir, fixtureName);
  if (!existsSync(srcFixture)) {
    throw new Error(`Fixture ${fixtureName} not found`);
  }

  // Copy fixture source
  const destFixture = resolve(installDir, fixtureName);
  mkdirSync(destFixture, { recursive: true });
  cpSync(srcFixture, destFixture, { recursive: true });

  // Read and modify package.json to use tarball paths
  const fixturePkg = JSON.parse(readFileSync(resolve(destFixture, 'package.json'), 'utf8'));

  // Replace @lynellf/tablekit-* dependencies with tarball file paths
  const deps = { ...fixturePkg.dependencies, ...fixturePkg.peerDependencies };
  for (const [dep, _version] of Object.entries(deps)) {
    if (dep.startsWith('@lynellf/tablekit-')) {
      const pkgName = dep.replace('@lynellf/tablekit-', '');
      if (packageNames.includes(pkgName)) {
        const pkgTarballFiles = execFileSync('ls', ['-1', tarballsDir], { encoding: 'utf8' })
          .split('\n')
          .filter((f) => f.includes(pkgName) && f.endsWith('.tgz'));

        if (pkgTarballFiles.length === 0) {
          throw new Error(`No tarball found for ${dep}`);
        }

        // Update the dependency to use tarball path
        const tarballFilePath = `file:${tarballsDir}/${pkgTarballFiles[pkgTarballFiles.length - 1]}`;
        fixturePkg.dependencies[dep] = tarballFilePath;

        // Also update peerDependencies if present
        if (fixturePkg.peerDependencies?.[dep]) {
          fixturePkg.peerDependencies[dep] = tarballFilePath;
        }
      }
    }
  }

  // Write modified package.json
  writeFileSync(resolve(destFixture, 'package.json'), JSON.stringify(fixturePkg, null, 2) + '\n');

  console.log(`  ✓ ${fixtureName}: fixture prepared with tarball dependencies`);
}

// R6-ARTIFACT-009 fix: Don't create a workspace - install each fixture separately
// This ensures packages resolve from the tarballs, not from workspace links
console.log('  Installing fixtures individually from tarballs...');

for (const fixtureName of ['core', 'react', 'pivot', 'worker']) {
  const fixtureDir = resolve(installDir, fixtureName);

  // Run pnpm install in each fixture directory separately
  try {
    execFileSync('pnpm', ['install', '--ignore-workspace'], {
      cwd: fixtureDir,
      encoding: 'utf8',
      env: { ...npmEnvironment, PNPM_HOME: resolve(tempDir, '.pnpm') },
      stdio: 'pipe',
    });
    console.log(`  ✓ ${fixtureName}: installed from tarball`);
  } catch (err) {
    console.error(`  ✗ ${fixtureName}: install failed`);
    throw err;
  }
}

// ─── Phase 3: Verify fixture compilation from isolated install ───────────────────

console.log('\n=== Phase 3: Compiling fixtures from isolated install ===');

// Create a temporary tsconfig for each fixture that uses the isolated node_modules
// R6 fix: Do NOT extend root tsconfig.base.json (which contains workspace path mappings).
// Instead, generate a self-contained config with NO repository path aliases.
for (const fixtureName of ['core', 'react', 'pivot', 'worker']) {
  const fixtureDir = resolve(installDir, fixtureName);
  const fixtureTsConfig = {
    compilerOptions: {
      noEmit: true,
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      baseUrl: '.',
      strict: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: false,
      paths: {},
    },
    include: ['src'],
  };

  writeFileSync(
    resolve(fixtureDir, 'tsconfig.json'),
    JSON.stringify(fixtureTsConfig, null, 2) + '\n',
  );

  try {
    execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], {
      cwd: fixtureDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(`  ✓ ${fixtureName}: compiles from isolated install`);
  } catch (err) {
    const stderr = err.stderr || '';
    console.error(`${fixtureName}: tsc failed with:`);
    console.error(stderr);
    throw new Error(`${fixtureName}: fixture failed to compile from isolated install\n${stderr}`);
  }
}

// ─── Phase 4: Verify runtime imports from isolated install ─────────────────────

console.log('\n=== Phase 4: Executing runtime imports from isolated install ===');

// Create runtime test scripts for ALL packages (not just core and pivot)
for (const fixtureName of packageNames) {
  const fixtureDir = resolve(installDir, fixtureName);
  const testScript = resolve(fixtureDir, 'runtime-test.mjs');

  if (fixtureName === 'core') {
    writeFileSync(
      testScript,
      `
import { createDataTable } from '@lynellf/tablekit-core';
const table = createDataTable({ data: [], columns: [] });
console.log('core runtime: OK');
`,
    );
  } else if (fixtureName === 'pivot') {
    writeFileSync(
      testScript,
      `
import { createPivotTable } from '@lynellf/tablekit-pivot';
const pivot = createPivotTable({ data: [], pivot: { rows: [], columns: [], measures: [] } });
console.log('pivot runtime: OK');
`,
    );
  } else if (fixtureName === 'react') {
    // React fixture: test importing from main and subpath exports
    writeFileSync(
      testScript,
      `
import { useDataTable } from '@lynellf/tablekit-react';
import { buildQueryKey } from '@lynellf/tablekit-core/dataSource';
console.log('react runtime: OK');
console.log('  useDataTable type:', typeof useDataTable);
console.log('  buildQueryKey type:', typeof buildQueryKey);
`,
    );
  } else if (fixtureName === 'worker') {
    writeFileSync(
      testScript,
      `
import { createWorkerEngine } from '@lynellf/tablekit-worker';
console.log('worker runtime: OK');
console.log('  createWorkerEngine type:', typeof createWorkerEngine);
`,
    );
  }

  try {
    execFileSync('node', [testScript], {
      cwd: fixtureDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(`  ✓ ${fixtureName}: runtime import works from isolated install`);
  } catch (err) {
    const stderr = err.stderr || '';
    throw new Error(`${fixtureName}: runtime import failed from isolated install\n${stderr}`);
  }
}

// ─── Phase 5: Verify subpath exports from isolated install ─────────────────────

console.log('\n=== Phase 5: Verifying subpath exports from isolated install ===');

// R6-SUBPATH-008 fix: Expanded subpath matrix covering ALL documented exports.
// R6 requires "all-package/subpath packed evidence" — previously only 4 subpaths were checked.
// The matrix now mirrors the actual package.json exports fields for each package.
const subpathChecks = [
  {
    fixture: 'core',
    checks: [
      { name: '@lynellf/tablekit-core', importPath: '@lynellf/tablekit-core' },
      {
        name: '@lynellf/tablekit-core/dataSource',
        importPath: '@lynellf/tablekit-core/dataSource',
      },
      {
        name: '@lynellf/tablekit-core/virtualization',
        importPath: '@lynellf/tablekit-core/virtualization',
      },
      { name: '@lynellf/tablekit-core/resize', importPath: '@lynellf/tablekit-core/resize' },
      { name: '@lynellf/tablekit-core/pinning', importPath: '@lynellf/tablekit-core/pinning' },
      {
        name: '@lynellf/tablekit-core/keyboard-nav',
        importPath: '@lynellf/tablekit-core/keyboard-nav',
      },
      { name: '@lynellf/tablekit-core/memo', importPath: '@lynellf/tablekit-core/memo' },
      { name: '@lynellf/tablekit-core/announcer', importPath: '@lynellf/tablekit-core/announcer' },
    ],
  },
  {
    fixture: 'react',
    checks: [
      { name: '@lynellf/tablekit-react', importPath: '@lynellf/tablekit-react' },
      { name: '@lynellf/tablekit-react/validate', importPath: '@lynellf/tablekit-react/validate' },
    ],
  },
  {
    fixture: 'pivot',
    checks: [
      { name: '@lynellf/tablekit-pivot', importPath: '@lynellf/tablekit-pivot' },
      {
        name: '@lynellf/tablekit-pivot/aggregators',
        importPath: '@lynellf/tablekit-pivot/aggregators',
      },
      { name: '@lynellf/tablekit-pivot/engine', importPath: '@lynellf/tablekit-pivot/engine' },
      {
        name: '@lynellf/tablekit-pivot/pivotTable',
        importPath: '@lynellf/tablekit-pivot/pivotTable',
      },
      {
        name: '@lynellf/tablekit-pivot/serialize',
        importPath: '@lynellf/tablekit-pivot/serialize',
      },
    ],
  },
  {
    fixture: 'worker',
    checks: [
      { name: '@lynellf/tablekit-worker', importPath: '@lynellf/tablekit-worker' },
      {
        name: '@lynellf/tablekit-worker/protocol',
        importPath: '@lynellf/tablekit-worker/protocol',
      },
      { name: '@lynellf/tablekit-worker/server', importPath: '@lynellf/tablekit-worker/server' },
    ],
  },
];

for (const { fixture, checks } of subpathChecks) {
  const fixtureDir = resolve(installDir, fixture);
  for (const { name, importPath } of checks) {
    // R6 fix: Create the check script IN the fixture directory so Node resolves packages correctly.
    // Node resolves imports relative to the script location, not cwd.
    const checkScript = resolve(fixtureDir, 'subpath-check.mjs');
    writeFileSync(
      checkScript,
      `
try {
  const mod = await import('${importPath}');
  console.log('  \u2713 ${name}: OK (exports: ' + Object.keys(mod).length + ')');
} catch (e) {
  console.error('  \u2717 ${name}: ' + e.message);
  process.exit(1);
}
`,
      'utf8',
    );

    try {
      execFileSync('node', [checkScript], {
        cwd: fixtureDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      // R6 fix: Fail on subpath import errors, don't just note them
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';
      console.error(`  \u2717 ${name}: ${stderr || stdout}`);
      throw new Error(`${name}: subpath import failed from isolated install\n${stderr || stdout}`);
    }
  }
}

// ─── Phase 6: Verify no workspace/source/dist escapes ───────────────────────────

console.log('\n=== Phase 6: Verifying no workspace/source escapes ===');

for (const fixtureName of ['core', 'react', 'pivot', 'worker']) {
  const fixtureDir = resolve(installDir, fixtureName);
  const nodeModules = resolve(fixtureDir, 'node_modules');

  // Read fixture's package.json to see what dependencies it has
  const fixturePkg = JSON.parse(readFileSync(resolve(fixtureDir, 'package.json'), 'utf8'));
  const fixtureDeps = {
    ...fixturePkg.dependencies,
    ...fixturePkg.peerDependencies,
  };

  // Check that @lynellf/tablekit-* packages in fixture's dependencies resolve correctly
  for (const [depName, _depVersion] of Object.entries(fixtureDeps)) {
    if (!depName.startsWith('@lynellf/tablekit-')) continue;
    const pkgShortName = depName.replace('@lynellf/tablekit-', '');
    const pkgPath = resolve(nodeModules, '@lynellf', `tablekit-${pkgShortName}`);

    if (!existsSync(pkgPath)) {
      throw new Error(`${fixtureName}: ${depName} not found in isolated node_modules`);
    }

    // Verify it's not a symlink to workspace
    const stat = execFileSync('stat', ['-c', '%F', pkgPath], { encoding: 'utf8' }).trim();
    if (stat === 'symbolic link') {
      const linkTarget = execFileSync('readlink', [pkgPath], { encoding: 'utf8' }).trim();
      // Allow symlinks to tarballs (pnpm extraction) and temp pnpm store
      // Reject symlinks to workspace packages or repository source
      const isAllowedSymlink =
        linkTarget.includes('tarballs') ||
        linkTarget.includes('.pnpm') ||
        linkTarget.includes(tempDir);
      const isWorkspaceEscape =
        (linkTarget.includes('/packages/') || linkTarget.includes('/node_modules/')) &&
        !linkTarget.includes('.pnpm');

      if (isWorkspaceEscape) {
        throw new Error(`${fixtureName}: ${depName} is a symlink to workspace: ${linkTarget}`);
      }
      if (!isAllowedSymlink) {
        console.log(`  Note: ${fixtureName}: ${depName} symlink: ${linkTarget}`);
      }
    }

    // Check package.json points to local dist
    const pkgJson = JSON.parse(readFileSync(resolve(pkgPath, 'package.json'), 'utf8'));
    const mainFile = pkgJson.main || pkgJson.module;
    if (mainFile && !mainFile.startsWith('./')) {
      // External dependency is OK
    } else if (mainFile) {
      const resolvedMain = resolve(pkgPath, mainFile);
      if (!existsSync(resolvedMain)) {
        throw new Error(
          `${fixtureName}: @lynellf/tablekit-${pkgShortName} main file does not exist: ${resolvedMain}`,
        );
      }
    }
  }

  console.log(`  ✓ ${fixtureName}: no workspace/source/dist escapes`);
}

// ─── Phase 7: React bundle validation ─────────────────────────────────────────

console.log('\n=== Phase 7: Validating React bundle ===');

const reactDir = resolve(root, 'packages', 'react');
const bundle = readFileSync(resolve(reactDir, 'dist/tablekit-react.es.js'), 'utf8');

for (const marker of ['react.production.js', 'react.development.js', 'Invalid hook call']) {
  if (bundle.includes(marker)) {
    throw new Error(`@lynellf/tablekit-react: bundled React marker found: ${marker}`);
  }
}
if (!/from\s+["']react(?:\/jsx-(?:dev-)?runtime)?["']/.test(bundle)) {
  throw new Error('@lynellf/tablekit-react: no external React or JSX runtime import found');
}
if (!bundle.includes('@lynellf/tablekit-pivot')) {
  throw new Error('@lynellf/tablekit-react: optional pivot peer appears to be bundled');
}
console.log('  ✓ React bundle does not bundle React');

// ─── Phase 8: Docs drift and public-surface checks from isolated root ───────────

console.log('\n=== Phase 8: Invoking docs and public-surface checks ===');

// R6 fix: Run check-docs-version against the live docs (this tests docs drift).
// The script exits 0 on success, 1 on drift.
let docsResult = { pass: true, output: '', failed: false };
try {
  const docsOutput = execFileSync('node', [resolve(root, 'scripts/check-docs-version.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  docsResult.output = docsOutput;
  console.log('  ✓ check-docs-version: passed (no drift)');
} catch (err) {
  const stderr = err.stderr || '';
  const stdout = err.stdout || '';
  docsResult.output = stdout + stderr;
  // If the script exited with code 1, that's drift detected - record but don't fail
  // If it exited with other code or has content, it may be a real error
  if (err.status === 1) {
    docsResult.failed = true;
    docsResult.pass = false;
    console.log('  ✗ check-docs-version: drift detected');
  } else {
    console.log('  ✗ check-docs-version: script error');
    throw new Error(`check-docs-version failed unexpectedly:\n${stdout}\n${stderr}`);
  }
}

// R6-R7 fix: Run check-public-surface against the isolated packages.
// The script throws on real errors (missing exports, wrong versions, etc.).
let surfaceResult = { pass: true, output: '', failed: false };
try {
  const surfaceOutput = execFileSync('node', [resolve(root, 'scripts/check-public-surface.mjs')], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    // R6-R7 fix: Pass isolated prefix so check-public-surface verifies
    // against isolated packages, not workspace dist.
    // Note: packages are installed in installDir/{fixture}/node_modules/, so use installDir.
    env: { ...process.env, ISOLATED_PREFIX: installDir },
  });
  surfaceResult.output = surfaceOutput;
  console.log('  ✓ check-public-surface: passed');
} catch (err) {
  const stderr = err.stderr || '';
  const stdout = err.stdout || '';
  surfaceResult.output = stdout + stderr;
  surfaceResult.failed = true;
  surfaceResult.pass = false;
  console.log('  ✗ check-public-surface: failed');
  throw new Error(`check-public-surface failed:\n${stdout}\n${stderr}`);
}

// R6-DOC-EXIT-007 fix: Both docs drift AND public-surface errors are now fatal.
// Previously docs drift was informational only, which allowed stale docs to pass the gate.

// ─── Cleanup and summary ───────────────────────────────────────────────────────

console.log('\n=== Summary ===');
console.log(`Artifact root: ${tempDir}`);
console.log(`check-docs-version: ${docsResult.failed ? '✗ drift detected' : '✓ passed'}`);
console.log(`check-public-surface: ${surfaceResult.failed ? '✗ failed' : '✓ passed'}`);
cleanup();

// R6-DOC-EXIT-007 fix: Fail on any check failure (docs drift or public-surface)
if (surfaceResult.failed) {
  throw new Error('check-public-surface failed - public surface verification did not pass');
}
if (docsResult.failed) {
  throw new Error('check-docs-version failed - docs drift detected');
}

console.log(
  `✓ Verified packed artifacts and isolated fixture boundaries for ${packageNames.length} packages`,
);
console.log('✓ No workspace/source/dist escapes detected');
console.log('✓ All fixtures compile and execute from isolated install');
console.log('✓ Public surface verification passed');
