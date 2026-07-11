import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageNames = ['core', 'pivot', 'react', 'worker'];
const npmEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('npm_config_')),
);

const collectTypeTargets = (value, targets = []) => {
  if (!value || typeof value !== 'object') return targets;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'types' && typeof child === 'string') targets.push(child);
    else collectTypeTargets(child, targets);
  }
  return targets;
};

const parsePackJson = (output) => {
  const start = output.indexOf('[');
  if (start < 0) throw new Error(`npm pack did not return JSON:\n${output}`);
  return JSON.parse(output.slice(start));
};

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

  const packOutput = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: packageDir,
    encoding: 'utf8',
    env: npmEnvironment,
  });
  const packedFiles = new Set(parsePackJson(packOutput)[0].files.map(({ path }) => path));
  for (const target of targets) {
    if (!packedFiles.has(target.replace(/^\.\//, ''))) {
      throw new Error(`${manifest.name}: ${target} exists but is omitted from npm pack`);
    }
  }

  if (manifest.name === '@lynellf/tablekit-react') {
    const bundle = readFileSync(resolve(packageDir, 'dist/tablekit-react.es.js'), 'utf8');
    for (const marker of ['react.production.js', 'react.development.js', 'Invalid hook call']) {
      if (bundle.includes(marker)) {
        throw new Error(`${manifest.name}: bundled React marker found: ${marker}`);
      }
    }
    if (!/from\s+["']react(?:\/jsx-(?:dev-)?runtime)?["']/.test(bundle)) {
      throw new Error(`${manifest.name}: no external React or JSX runtime import found`);
    }
    if (!bundle.includes('@lynellf/tablekit-pivot')) {
      throw new Error(`${manifest.name}: optional pivot peer appears to be bundled`);
    }
  }
}

execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.package-artifact-fixture.json'], {
  cwd: root,
  stdio: 'inherit',
});

console.log(
  `✓ Verified packed declarations and external runtime boundaries for ${packageNames.length} packages`,
);
