import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist', '**/.vitest-cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      // Mirror the TS paths from tsconfig.base.json so tests resolve workspace sources.
      '@tablekit/core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@tablekit/react': new URL('./packages/react/src/index.ts', import.meta.url).pathname,
    },
  },
});
