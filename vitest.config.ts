import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // Phase 1: V8 heap limit safeguards to reduce memory runaway
    // --experimental-vm-regions: isolates heap allocations
    // --max-old-space-size=256: caps each worker at 256MB
    // ⚠️ Calibration: Adjust --max-old-space-size based on your CI memory limits.
    //   If tests OOM, reduce from 256 to 128; if CI has headroom, 512 is safer.
    server: {
      v8: {
        options: {
          // '--experimental-vm-regions': true, // Uncomment if Node 22+ and you need strict region isolation
          maxOldSpaceSize: 256,
        },
      },
    },
    // Phase 2: Disable parallel to prevent concurrent process spawning
    // Each project runs sequentially, reducing memory pressure
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run all tests in a single child process
      },
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules', '**/dist', '**/.vitest-cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/index.ts'],
      // Phase 4: Coverage thresholds
      // ⚠️ CALIBRATION REQUIRED: Run `node test-audit.mjs --calibrate` first.
      //   Copy the measured percentages below after verifying they match your baseline.
      //   Thresholds that are too high will block valid changes; too low provides no value.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      // Mirror the TS paths from tsconfig.base.json so tests resolve workspace sources.
      '@lynellf/tablekit-core': new URL('./packages/core/src/index.ts', import.meta.url).pathname,
      '@lynellf/tablekit-react': new URL('./packages/react/src/index.ts', import.meta.url).pathname,
    },
  },
});
