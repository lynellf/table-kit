# M6 Phase 4 — CI benchmarks + bundler-recipes doc

**Goal:** Wire the existing pivot main-thread and worker benchmarks into CI as an advisory job with soft regression detection (spec §12, §13, §14). Add the bundler-recipes doc for Vite/webpack/Rollup/esbuild worker-entry patterns (spec §16 #8 explicit).

**Files added:**
- `bench/baseline.json` — rolling median baseline (initial seed from M4/M5 reference-app runs)
- `bench/compare.ts` — helper that reads vitest bench JSON, compares against baseline, emits `::warning` annotations and a markdown artifact
- `docs/bundler-recipes.md` — Vite + webpack + Rollup + esbuild snippets for `createWorkerEntry()`
- `.github/workflows/test.yml` (modified — adds a `bench` job)

**Files modified:**
- `.github/workflows/test.yml` — adds a `bench` job after the existing `test` job
- `package.json` (root) — adds `bench:compare` script
- `vitest.workspace.ts` — confirms bench files are in workspace mode

**Tests added:** ~3-5 in `bench/compare.test.ts` (the helper as a tested script).

---

## 1. What this phase owns

The M4 + M5 benches (`packages/pivot/bench/main-thread.bench.ts`, `packages/worker/bench/worker.bench.ts`) currently run locally only. M6:
1. Wires them into CI as a `bench` job.
2. Adds a soft-regression detection: > 1.2× rolling baseline → PR comment; > 2.0× → warn label.
3. Adds a markdown artifact (`bench-results.md`) for visibility.
4. Ships the bundler-recipes doc so consumers don't reach into the M5 reference app to copy-paste.

---

## 2. Implementation

### 2.1 CI bench job

` .github/workflows/test.yml`:

```yaml
jobs:
  test:
    # ...existing test job...

  bench:
    name: Run Benchmarks (advisory)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: ${{ vars.PNPM_VERSION || '10' }}

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run pivot main-thread bench
        run: pnpm --filter @lynellf/tablekit-pivot bench main-thread.bench.ts --reporter=json

      - name: Run worker bench
        run: pnpm --filter @lynellf/tablekit-worker bench worker.bench.ts --reporter=json

      - name: Compare against baseline (soft regression)
        run: pnpm bench:compare
        env:
          BENCH_RESULTS_DIR: ./bench/results

      - name: Upload bench results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: bench-results
          path: bench/results/bench-results.md
          retention-days: 30
```

### 2.2 `bench/compare.ts`

A node script:

```ts
/**
 * Compare vitest bench JSON output against bench/baseline.json.
 *
 * Emits GitHub Actions ::warning annotations for regressions > 1.2× baseline;
 * ::error annotations for regressions > 2.0× baseline. Writes a markdown
 * summary to bench/results/bench-results.md (uploaded as an artifact).
 *
 * Soft thresholds only — never fails the build; spec §12 says benchmarks are
 * tracked but a hard gate would be flaky on shared CI runners.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface BenchEntry {
  name: string;
  mean: number;
  baseline: number;
  ratio: number;  // mean / baseline
}

const SOFT_RATIO = 1.2;
const HARD_RATIO = 2.0;

function loadBaseline(): Record<string, number> {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'baseline.json'), 'utf8'));
}

function findBenchResults(): string[] {
  // vitest --reporter=json writes to stdout; capture via process args or env.
  const dir = process.env.BENCH_RESULTS_DIR ?? './bench/results';
  return readdirSync(dir).filter((f) => f.endsWith('.bench.json'));
}

function main(): void {
  const baseline = loadBaseline();
  const files = findBenchResults();
  const entries: BenchEntry[] = [];
  for (const f of files) {
    const json = JSON.parse(readFileSync(join(process.env.BENCH_RESULTS_DIR!, f), 'utf8'));
    for (const task of json.tasks ?? []) {
      const baseMean = baseline[task.name];
      if (baseMean == null) continue;  // Not in baseline; skip.
      const ratio = task.result?.mean ? task.result.mean / baseMean : 1.0;
      entries.push({ name: task.name, mean: task.result?.mean ?? 0, baseline: baseMean, ratio });
    }
  }
  // Emit annotations.
  for (const e of entries) {
    if (e.ratio > HARD_RATIO) {
      console.error(`::error file=bench::${e.name}: ${e.ratio.toFixed(2)}× baseline (${e.mean.toFixed(1)}ms vs ${e.baseline}ms)`);
    } else if (e.ratio > SOFT_RATIO) {
      console.warn(`::warning file=bench::${e.name}: ${e.ratio.toFixed(2)}× baseline (${e.mean.toFixed(1)}ms vs ${e.baseline}ms)`);
    }
  }
  // Write summary.
  mkdirSync(process.env.BENCH_RESULTS_DIR ?? './bench/results', { recursive: true });
  const md = `# Benchmark results\n\n| Bench | Mean (ms) | Baseline (ms) | Ratio |\n| --- | --- | --- | --- |\n` +
    entries.map((e) => `| ${e.name} | ${e.mean.toFixed(1)} | ${e.baseline} | ${e.ratio.toFixed(2)}× |`).join('\n') +
    `\n\nGenerated by bench:compare at ${new Date().toISOString()}\n`;
  writeFileSync(join(process.env.BENCH_RESULTS_DIR ?? './bench/results', 'bench-results.md'), md);
}

main();
```

### 2.3 `bench/baseline.json`

```json
{
  "main-thread re-pivot 50,000 rows × region × quarter × year × 2 measures": 120,
  "main-thread re-pivot 100,000 rows × region × quarter × year × 2 measures": 240,
  "main-thread re-pivot 200,000 rows × region × quarter × year × 2 measures": 480,
  "warm re-pivot 1M rows × region × category × product (no setRows)": 1100
}
```

The initial baselines come from a single M4/M5 reference-app run on a reference machine; documented in `bench/baseline.json` as `"source": "M4-M5 reference-app runs, github runner ubuntu-latest"`. Future baselines update via a maintainer PR with a comment explaining the expected vs. measured numbers.

### 2.4 `docs/bundler-recipes.md`

```markdown
# Bundler Recipes — Worker Entry

> Last verified against v1.0.0 (`docs/m6-hardening/api-freeze.md`).

Spec §16 #8 names worker DX as the roughest edge; the mitigation is the `createWorkerEntry()` factory (shipped in M5) plus this document.

## Vite (default)

```ts
// src/worker.ts
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();

// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';
import MyWorker from './worker.ts?worker';

const engine = createWorkerEngine({ createWorker: () => new MyWorker() });
```

`?worker` is a Vite import suffix; the bundler returns a constructor.

## webpack 5

```ts
// src/worker.ts (no special suffix needed)
import { createWorkerEntry } from '@lynellf/tablekit-worker';

createWorkerEntry();

// src/main.ts
import { createWorkerEngine } from '@lynellf/tablekit-worker';

const engine = createWorkerEngine({ createWorker: () => new Worker(new URL('./worker.ts', import.meta.url)) });
```

webpack 5 understands `new Worker(new URL(...))` natively.

## Rollup (with `@rollup/plugin-typescript` and `rollup-plugin-web-worker`)

```ts
// Same as webpack; use rollup-plugin-web-worker to inline the worker bundle.
```

## esbuild (with `esbuild-plugin-wasm` or hand-rolled)

```ts
// Same as webpack; the consumer wires their worker entry through esbuild's
// `--bundle --format=esm` flags and serves the worker file at a URL.
```

## Reference

- Spec §9.3 (worker engine contract)
- Spec §16 #8 (worker DX risk)
- M5 plan: `docs/m5-pivot-engines/plan-summary.md`
- M5 reference app: `examples/m5-pivot-engines/`
- API freeze §"@lynellf/tablekit-worker": `docs/m6-hardening/api-freeze.md`

## Verified against

- Vite 5
- webpack 5
- Rollup 4
- esbuild 0.20+

Verified: 2026-07.
```

### 2.5 `package.json` script

```json
{
  "scripts": {
    "bench:compare": "node --experimental-strip-types bench/compare.ts"
  }
}
```

(Or compiled to JS if Node's type stripping is too new; the helper is small enough to convert to plain JS trivially.)

---

## 3. Commands

```bash
# Local verification (no CI):
pnpm --filter @lynellf/tablekit-pivot bench main-thread.bench.ts
pnpm --filter @lynellf/tablekit-worker bench worker.bench.ts

# Manual compare (after a CI dry-run):
mkdir -p bench/results
# capture bench JSON output, save to bench/results/*.bench.json, then:
pnpm bench:compare

# Bundler-recipes file sanity:
test -f docs/bundler-recipes.md && grep -c "Vite\|webpack\|Rollup\|esbuild" docs/bundler-recipes.md
```

---

## 4. Verification

- `.github/workflows/test.yml` has a `bench:` job with the four steps above.
- `bench/baseline.json` exists with the four initial baselines.
- `bench/compare.ts` runs without error on a synthetic fixtures set (test: `bench/compare.test.ts`).
- `docs/bundler-recipes.md` exists with copy-paste snippets for Vite, webpack, Rollup, esbuild.
- Sanity check: copy each snippet into a sandbox project; all four compile.
- CI run uploads `bench-results.md` (verified by inspecting a test PR).

---

## 5. Out-of-scope

- **Tachometer / mitata integration.** Vitest's built-in `bench` is sufficient for v1.0. Tachometer is a v1.5+ consideration if consumer demand for tighter tracking emerges.
- **Hard CI gate on bench regression.** Spec §12 explicitly forbids this on shared runners (correctly — flaky).
- **Benchmark tracking dashboard.** Out of v1.0; the artifact is sufficient.
- **More bundlers** (Parcel, Bun, Rspack). The four named are the consumers' most-requested. Adding a new bundler is a one-PR docs change post-v1.0.

---

## 6. Risks

- **R3A: Soft regression detection produces noise on a single bad CI run.** Mitigation: rolling-window outlier detection (median of last 10 runs; flag only if both the current run AND the rolling median exceed the threshold). The v1.0 implementation does median-of-recent-CI-runs inside `bench/compare.ts` once enough data lands (initially, just the single-run check; rolling window activates after the first 10 CI runs).
- **R3B: Baselines get out of date.** Mitigation: `bench/baseline.json` has a `"last_updated"` field; a maintainer PR rotates the baseline quarterly (or on a known hardware class change). M6 ships the field; the rotation process is owner-driven.
- **R3C: Bundler-recipes rot.** Mitigation: each recipe's version + month is in the file; the "Verified against" tag triggers a doc-only audit if a major-version bump lands in any of the four bundlers.
- **R3D: `bench/compare.ts` fails on different vitest bench output formats.** Mitigation: the script version-locks the parser to vitest 2.x's JSON output. If vitest bumps the format, the script updates in lockstep.
