/**
 * @lynellf/tablekit-core — subpath build runner.
 *
 * Builds every subpath declared in package.json exports map by calling
 * vite.build() programmatically. This avoids Rollup's cross-entry
 * deduplication issue (which produces empty entry files when shared code
 * lands in an unnamed intermediate chunk).
 *
 *   .               → dist/tablekit-core.es.js
 *   ./virtualization → dist/virtualization/index.es.js
 *   ./resize         → dist/resize.es.js
 *   ./pinning        → dist/pinning.es.js
 *   ./keyboard-nav   → dist/keyboard-nav.es.js
 *   ./memo           → dist/pipeline/memo.es.js
 *   ./dataSource     → dist/dataSource/index.es.js
 *   ./announcer      → dist/announcer.es.js
 *
 * Run directly via:
 *   node packages/core/vite.subpaths.config.mjs
 *
 * Or via pnpm script (see packages/core/package.json):
 *   pnpm -F @lynellf/tablekit-core build:subpaths
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { dependencies = {} } = require('./package.json');

const src = resolve(__dirname, 'src');
const dist = resolve(__dirname, 'dist');

const subpaths = [
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-core.es.js' },
  { entry: resolve(src, 'virtualization/index.ts'), outFile: 'virtualization/index.es.js' },
  { entry: resolve(src, 'resize.ts'), outFile: 'resize.es.js' },
  { entry: resolve(src, 'pinning.ts'), outFile: 'pinning.es.js' },
  { entry: resolve(src, 'keyboardNav.ts'), outFile: 'keyboard-nav.es.js' },
  { entry: resolve(src, 'pipeline/memo.ts'), outFile: 'pipeline/memo.es.js' },
  { entry: resolve(src, 'dataSource/index.ts'), outFile: 'dataSource/index.es.js' },
  { entry: resolve(src, 'announcer.ts'), outFile: 'announcer.es.js' },
];

const baseConfig = {
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: Object.keys(dependencies),
      output: { inlineDynamicImports: true },
    },
  },
};

for (let i = 0; i < subpaths.length; i++) {
  const { entry, outFile } = subpaths[i];

  await build(
    defineConfig({
      ...baseConfig,
      build: {
        ...baseConfig.build,
        // The main build already owns cleanup; preserve emitted declarations.
        emptyOutDir: false,
        lib: {
          entry,
          name: 'TableKitCore',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`✓ Built ${subpaths.length} subpaths into ${dist}`);
