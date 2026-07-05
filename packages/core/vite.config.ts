import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { dependencies = {} } = require('./package.json');

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TableKitCore',
      formats: ['es'],
      fileName: () => 'tablekit-core.es.js',
    },
    rollupOptions: {
      external: Object.keys(dependencies),
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
