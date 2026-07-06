import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { peerDependencies = {}, dependencies = {} } = require('./package.json');

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'TableKitPivot',
      formats: ['es'],
      fileName: () => 'tablekit-pivot.es.js',
    },
    rollupOptions: {
      external: [...Object.keys(peerDependencies), ...Object.keys(dependencies)],
      output: { inlineDynamicImports: true },
    },
  },
});
