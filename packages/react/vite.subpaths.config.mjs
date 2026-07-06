/**
 * @lynellf/tablekit-react — subpath build runner.
 *
 *   .         → dist/tablekit-react.es.js
 *   ./validate → dist/validate.es.js
 *
 * Run directly via:
 *   node packages/react/vite.subpaths.config.mjs
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
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-react.es.js' },
  { entry: resolve(src, 'validate.ts'), outFile: 'validate.es.js' },
];

const baseConfig = {
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      // Externalize all workspace core subpaths — they are built separately and available
      // at runtime from the @lynellf/tablekit-core package's dist artifacts.
      external: [
        ...Object.keys(dependencies),
        '@lynellf/tablekit-core',
        '@lynellf/tablekit-core/virtualization',
        '@lynellf/tablekit-core/resize',
        '@lynellf/tablekit-core/pinning',
        '@lynellf/tablekit-core/keyboard-nav',
        '@lynellf/tablekit-core/memo',
        '@lynellf/tablekit-core/dataSource',
        '@lynellf/tablekit-core/announcer',
      ],
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
        emptyOutDir: i === 0,
        lib: {
          entry,
          name: 'TableKitReact',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`✓ Built ${subpaths.length} subpaths into ${dist}`);
