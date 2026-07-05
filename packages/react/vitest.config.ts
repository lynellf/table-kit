import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist'],
  },
  resolve: {
    alias: {
      '@lynellf/tablekit-core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
