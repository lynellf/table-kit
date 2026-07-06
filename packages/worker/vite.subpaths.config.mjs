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
  { entry: resolve(src, 'index.ts'), outFile: 'tablekit-worker.es.js' },
  { entry: resolve(src, 'protocol/index.ts'), outFile: 'protocol/index.es.js' },
  { entry: resolve(src, 'server/index.ts'), outFile: 'server/index.es.js' },
];

// Externalize all @lynellf/tablekit-* packages including subpaths
const externals = [
  ...Object.keys(peerDependencies),
  ...Object.keys(dependencies),
  /@lynellf\/tablekit-/,
];

const baseConfig = {
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: dist,
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: externals,
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
          name: 'TableKitWorker',
          formats: ['es'],
          fileName: () => outFile,
        },
      },
    }),
  );
}

console.log(`\u2713 Built ${subpaths.length} subpaths into ${dist}`);
