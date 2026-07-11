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
        replacement: new URL('../core/src/index.ts', import.meta.url).pathname,
      },
      {
        find: /^@lynellf\/tablekit-core\/dataSource$/,
        replacement: new URL('../core/src/dataSource/index.ts', import.meta.url).pathname,
      },
      {
        find: /^@lynellf\/tablekit-core\/virtualization$/,
        replacement: new URL('../core/src/virtualization/index.ts', import.meta.url).pathname,
      },
      {
        find: /^@lynellf\/tablekit-core\/src\/state$/,
        replacement: new URL('../core/src/state.ts', import.meta.url).pathname,
      },
      {
        find: /^@lynellf\/tablekit-pivot$/,
        replacement: new URL('../pivot/src/index.ts', import.meta.url).pathname,
      },
    ],
  },
});
