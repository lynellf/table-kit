import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace projects. Each entry runs in isolation
 * (its own test runner, its own deps) — the right shape for a monorepo.
 */
export default defineWorkspace([
  // M0 packages
  'packages/core',
  'packages/react',

  // M4: Pivot
  'packages/pivot',

  // Future milestones:
  // 'packages/worker',    // M5
]);
