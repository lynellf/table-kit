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
      name: 'TableKitReact',
      formats: ['es'],
      fileName: () => 'tablekit-react.es.js',
    },
    rollupOptions: {
      // Externalize peer/runtime dependencies plus the workspace core package and all
      // subpaths. Subpaths are built separately (build:core:subpaths) before the React
      // main build runs, but Vite's exports-map resolution fails if the file doesn't
      // exist yet — so we externalize everything upfront. Subpaths are then available
      // at runtime from the separately-built dist/ artifacts.
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
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
