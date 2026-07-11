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
const { dependencies = {}, peerDependencies = {} } = require('./package.json');
const externalPackages = [...Object.keys(dependencies), ...Object.keys(peerDependencies)];
const isExternal = (id) => externalPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));

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
      external: isExternal,
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
          name: 'TableKitReact',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`✓ Built ${subpaths.length} subpaths into ${dist}`);
