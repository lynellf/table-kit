import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for table-kit e2e tests.
 *
 * These tests verify the pivot engine with seeded data and capture
 * browser screenshots for visual verification.
 *
 * The tests run against the m4-pivot-main-thread example app.
 */
export default defineConfig({
  testDir: __dirname,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Exclude vitest workspace patterns
  testMatch: '*.spec.ts',

  // Start the example app for e2e tests
  webServer: {
    command: 'pnpm run dev:e2e',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
