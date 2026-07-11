import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const { dependencies = {}, peerDependencies = {} } = require('./package.json');

const externalPackages = [...Object.keys(dependencies), ...Object.keys(peerDependencies)];
const isExternal = (id: string): boolean =>
  externalPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));

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
      // Peer dependencies include React and the optional pivot adapter. The
      // predicate also covers React's JSX runtime subpaths and future workspace
      // subpaths without maintaining a second list.
      external: isExternal,
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
