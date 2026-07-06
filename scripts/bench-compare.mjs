#!/usr/bin/env node
/**
 * bench-compare.mjs
 *
 * M6 Phase 4: Compare vitest bench JSON output against bench/baseline.json.
 *
 * Emits GitHub Actions ::warning annotations for regressions > 1.2× baseline;
 * ::error annotations for regressions > 2.0× baseline.
 *
 * Writes a markdown summary to bench/results/bench-results.md (uploaded as a CI artifact).
 *
 * Soft thresholds only — never fails the build. Spec §12 says benchmarks are
 * tracked but a hard gate would be flaky on shared CI runners.
 *
 * Usage:
 *   node scripts/bench-compare.mjs
 *
 * Exit codes:
 *   0 — always (this is advisory only)
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? join(__dirname, '../bench/results');
const BASELINE_PATH = join(__dirname, '../bench/baseline.json');

const SOFT_RATIO = 1.2;
const HARD_RATIO = 2.0;

function loadBaseline() {
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Support both flat and nested benchmark format.
    if (parsed.benchmarks) return parsed.benchmarks;
    // Strip metadata fields.
    const { $schema, version, source, last_updated, note, ...benches } = parsed;
    void $schema; void version; void source; void last_updated; void note;
    return benches;
  } catch (err) {
    console.warn('bench-compare: Could not load baseline.json:', (err instanceof Error) ? err.message : err);
    return {};
  }
}

function findBenchResults() {
  try {
    mkdirSync(RESULTS_DIR, { recursive: true });
    return readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.bench.json') || f.endsWith('.json'));
  } catch {
    return [];
  }
}

function parseVitestBenchJson(content) {
  try {
    const json = JSON.parse(content);
    const entries = [];
    // vitest 2.x bench JSON format: { tasks: [{ name, id, group?, result: { mean, ops, samples } }] }
    for (const task of json.tasks ?? []) {
      if (!task.result) continue;
      const name = task.name ?? task.id ?? 'unknown';
      const mean = task.result.mean ?? task.result.ops ??
        (typeof task.result === 'number' ? task.result : null);
      if (mean != null) {
        entries.push({ name, mean });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function main() {
  const baseline = loadBaseline();
  const files = findBenchResults();
  const entries = [];

  for (const file of files) {
    const filePath = join(RESULTS_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = parseVitestBenchJson(content);
      entries.push(...parsed);
    } catch (err) {
      console.warn(`bench-compare: Could not parse ${file}:`, (err instanceof Error) ? err.message : err);
    }
  }

  const warnings = [];
  const errors = [];
  const rows = [];

  for (const entry of entries) {
    // Try to match against baseline by name (case-insensitive prefix match).
    const baselineKey = Object.keys(baseline).find(
      (k) => entry.name.toLowerCase().includes(k.toLowerCase()),
    );
    const baseMean = baselineKey ? baseline[baselineKey] : null;

    if (baseMean != null && baseMean > 0) {
      const ratio = entry.mean / baseMean;
      const row = {
        name: entry.name,
        mean: entry.mean,
        baseline: baseMean,
        ratio,
        status: ratio > HARD_RATIO ? 'HARD' : ratio > SOFT_RATIO ? 'SOFT' : 'OK',
      };
      rows.push(row);

      if (ratio > HARD_RATIO) {
        errors.push(row);
        console.error(
          `::error file=bench::${entry.name}:: ${ratio.toFixed(2)}× baseline (${entry.mean.toFixed(1)}ms vs ${baseMean}ms). This is a significant regression (> 2×).`,
        );
      } else if (ratio > SOFT_RATIO) {
        warnings.push(row);
        console.warn(
          `::warning file=bench::${entry.name}:: ${ratio.toFixed(2)}× baseline (${entry.mean.toFixed(1)}ms vs ${baseMean}ms). Advisory: performance regressed by > 20%.`,
        );
      }
    } else {
      // No baseline — just record the result.
      rows.push({ name: entry.name, mean: entry.mean, baseline: null, ratio: null, status: 'NEW' });
    }
  }

  // Write markdown summary.
  mkdirSync(RESULTS_DIR, { recursive: true });
  const mdLines = [
    '# Benchmark results',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source: ${files.length} bench result file(s)`,
    '',
    '| Bench | Mean (ms) | Baseline (ms) | Ratio | Status |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const row of rows) {
    const ratioStr = row.ratio != null ? `${row.ratio.toFixed(2)}×` : '—';
    mdLines.push(
      `| ${row.name} | ${row.mean != null ? row.mean.toFixed(1) : '—'} | ${row.baseline ?? '—'} | ${ratioStr} | ${row.status} |`,
    );
  }

  mdLines.push('');
  if (warnings.length > 0) {
    mdLines.push(`⚠️  ${warnings.length} soft regression(s) (> 1.2× baseline). See ::warning annotations above.`);
  }
  if (errors.length > 0) {
    mdLines.push(`🚨 ${errors.length} hard regression(s) (> 2.0× baseline). Review required.`);
  }
  if (warnings.length === 0 && errors.length === 0) {
    mdLines.push('✅ All benchmarks within baseline. No regressions detected.');
  }

  const mdPath = join(RESULTS_DIR, 'bench-results.md');
  writeFileSync(mdPath, mdLines.join('\n'));
  console.log(`bench-compare: Results written to ${mdPath}`);
  console.log(`bench-compare: ${rows.length} entries, ${warnings.length} soft, ${errors.length} hard`);

  // Advisory — always exit 0.
  process.exit(0);
}

main();
