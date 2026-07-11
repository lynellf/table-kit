import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { peerDependencies = {}, dependencies = {} } = require('./package.json');

const src = resolve(__dirname, 'src');
const dist = resolve(__dirname, 'dist');

const subpaths = [
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-pivot.es.js' },
  { entry: resolve(src, 'aggregators/index.ts'), outFile: 'aggregators/index.es.js' },
  { entry: resolve(src, 'engine/index.ts'), outFile: 'engine/index.es.js' },
  { entry: resolve(src, 'pivotTable/index.ts'), outFile: 'pivotTable/index.es.js' },
  { entry: resolve(src, 'serialize/index.ts'), outFile: 'serialize/index.es.js' },
];

const baseConfig = {
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: [...Object.keys(peerDependencies), ...Object.keys(dependencies)],
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
          name: 'TableKitPivot',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`✓ Built ${subpaths.length} subpaths into ${dist}`);
