# Phase 4 — Vitest

**Goal:** Workspace-aware Vitest setup with one smoke test per package. After
this phase, `pnpm test` runs all package projects and exits 0.

---

## 1. Files created / modified

| File                                  | Purpose                                         |
| ------------------------------------- | ----------------------------------------------- |
| `vitest.workspace.ts`                 | Top-level workspace config; lists projects.     |
| `vitest.config.ts`                    | Root config (delegates to workspace).           |
| `packages/core/src/index.test.ts`     | Smoke test for `@tablekit/core` stub.           |
| `packages/react/src/index.test.ts`    | Smoke test for `@tablekit/react` stub.          |

The per-package `vitest.config.ts` is **not** created here — workspace mode
in `vitest.workspace.ts` lets one config drive all packages. We add per-package
overrides only if/when packages need divergent settings (e.g. jsdom env for
`@tablekit/react`).

---

## 2. File contents

### 2.1 `vitest.workspace.ts`

```ts
import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace projects. Each entry runs in isolation
 * (its own test runner, its own deps) — the right shape for a monorepo.
 */
export default defineWorkspace([
  // M0 packages
  'packages/core',
  'packages/react',

  // Future milestones:
  // 'packages/pivot',     // M4
  // 'packages/worker',    // M5
]);
```

Each path must contain a `vitest.config.ts` *or* be a directory whose
`package.json` is detectable — Vitest will pick up the default config.
For M0, we use a single root config (next file) and let Vitest infer the
package boundary via the workspace path itself.

### 2.2 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,                       // explicit imports from 'vitest'
    environment: 'node',                  // default; React package will override in its own config later
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
```

`environment: 'node'` is the M0 default. The future `@tablekit/react` package
will need `environment: 'jsdom'` and `react` plugin — when that lands, switch
that package to its own `vitest.config.ts` and override `environment` there.
The `vitest.workspace.ts` path-based project model makes this trivial: each
path can carry its own config.

### 2.3 `packages/core/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('@tablekit/core', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

### 2.4 `packages/react/src/index.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('@tablekit/react', () => {
  it('exports a version string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

The smoke tests validate that:
- Workspace aliases resolve.
- Vitest's `describe`/`it`/`expect` imports work.
- The TypeScript test files are included via the `include` glob.

---

## 3. Commands

```bash
# 1. Write config + test files (write tool)
# 2. Run the test suite
pnpm test
```

---

## 4. Verification

```bash
pnpm test                                # exits 0, all tests pass
pnpm test -- --reporter=verbose           # confirms 2 tests across 2 projects
pnpm exec vitest list                    # shows discovered projects
```

Expected output (truncated):

```
 ✓ packages/core/src/index.test.ts (1)
 ✓ packages/react/src/index.test.ts (1)

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Duration  ~0.5s
```

Sanity probe (manual, not committed):

```bash
echo "test('bad', () => { expect(1).toBe(2) })" >> packages/core/src/_scratch.test.ts
pnpm test                                # should fail
rm packages/core/src/_scratch.test.ts
pnpm test                                # back to green
```

---

## 5. Out of scope

- `@vitest/coverage-v8` — already configured but only emits when
  `vitest run --coverage` is passed. Install in a later phase when coverage
  thresholds become a CI gate.
- `happy-dom` / `jsdom` environments — not needed for M0 stubs.
- Playwright / browser tests — separate plan (spec §13 calls for them in
  milestone M2+).
- MSW for network mocking — Level 1 DataSource tests will need it later;
  not in M0 scope.