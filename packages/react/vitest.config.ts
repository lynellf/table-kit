import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist'],
  },
  resolve: {
    alias: [
      {
        find: /^@lynellf\/tablekit-core$/,
        replacement: '/Users/ezellfrazier/Documents/GitHub/table-kit/packages/core/src/index.ts',
      },
      {
        find: /^@lynellf\/tablekit-core\/(.*)/,
        replacement: '/Users/ezellfrazier/Documents/GitHub/table-kit/packages/core/src/$1/index.ts',
      },
    ],
  },
});
