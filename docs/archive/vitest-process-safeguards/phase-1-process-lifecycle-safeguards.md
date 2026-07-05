# Phase 1: Vitest Process Lifecycle Safeguards

## Overview

This document describes the safeguards implemented to reduce the likelihood of orphaned/zombie Vitest processes consuming excessive memory.

## Problem Statement

Multiple concurrent Vitest processes can consume several gigabytes of memory, potentially due to:
- Workers not properly terminating
- Test files that spawn child processes without cleanup
- Memory leaks in test infrastructure

## Implemented Safeguards

### Phase 1: V8 Heap Limits

Added memory limits to prevent runaway heap growth:

```typescript
// vitest.config.ts
server: {
  v8: {
    options: {
      maxOldSpaceSize: 256, // Cap each worker at 256MB
    },
  },
},
```

**⚠️ Calibration Required**: Adjust `maxOldSpaceSize` based on your CI memory limits:
- If tests OOM: reduce from 256 to 128
- If CI has headroom: increase to 512

### Phase 2: Sequential Execution in CI

Created GitHub Actions workflow with process safeguards:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    timeout-minutes: 15
    steps:
      - name: Run tests
        run: pnpm test --bail --reporter=basic
```

Key features:
- `--bail`: Stop on first failure to prevent cascade issues
- `--parallel=false` (via `singleFork: true`): Run all tests in single child process
- 15-minute timeout: Hard stop for runaway processes

### Phase 3: Recursive Test Path Audit

Created `test-audit.mjs` to detect problematic test organization:

```bash
node test-audit.mjs              # Run audit
node test-audit.mjs --calibrate  # Print stats
```

The script detects:
- Nested `__tests__` directories
- Test files in unexpected locations

### Phase 4: Coverage Thresholds

Configured coverage thresholds with calibration workflow:

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80,
  },
},
```

## Calibration Workflow

### Step 1: Measure Baseline Coverage

Run tests without thresholds first:

```bash
pnpm test
```

### Step 2: Review Coverage Report

Open `coverage/lcov-report/index.html` and note the actual percentages for:
- Lines
- Functions  
- Branches
- Statements

### Step 3: Set Thresholds

Set thresholds **5-10% below** your baseline to allow for natural variation:

```typescript
// Example: if baseline is 85% lines, set threshold to 78%
thresholds: {
  lines: 78,    // ~7% buffer
  functions: 75,
  branches: 65,
  statements: 78,
},
```

### Step 4: Verify Calibration

Re-run tests and verify thresholds pass with your current code.

## Files Changed

| File | Purpose |
|------|---------|
| `.gitignore` | Added `*.heapsnapshot` |
| `vitest.config.ts` | V8 limits, singleFork, coverage thresholds |
| `.github/workflows/test.yml` | CI pipeline with safeguards |
| `test-audit.mjs` | Recursive path detection script |

## Related Concerns

### M3 Fix (Separate Task)

The `Maximum update depth exceeded` error in `abort-stale.test.tsx` indicates a React infinite loop bug. This is tracked as a separate issue (M3 fix) and is not addressed in this phase.

## Verification

Run the verification commands:

```bash
# Check heapsnapshot is ignored
grep heapsnapshot .gitignore  # Should show: *.heapsnapshot

# Run audit
node test-audit.mjs  # Should pass

# Run tests
pnpm test  # Same pass/fail count as baseline
```
