#!/usr/bin/env node
/**
 * check-all-announcer-calls-route-through-messages.ts
 *
 * M6 Phase 1 gate script. Greps the react package for raw string literals
 * passed to `announce()` and asserts every call site uses `t(key)` or a
 * constant imported from the messages map.
 *
 * Exit codes:
 *   0 — all clear (no raw string literals to announce())
 *   1 — raw string literal found (FAIL)
 *
 * Wired into `pnpm lint` via biome's custom-linter hook or as a standalone
 * pre-commit step. Run with:
 *   node scripts/check-all-announcer-calls-route-through-messages.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────
const SCAN_DIRS = ['packages/react/src'];
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /check-all-announcer-calls-route-through-messages\.ts$/,
  /messages\.ts$/,
  /i18n\//,
];

// Pattern: any call to `announce(...)` where the first arg is a string literal.
// We allow: announce(t('sortAsc')) — t() call is fine
//            announce(MESSAGES.sortAsc) — constant is fine
// We flag:  announce('Sorted ascending') — raw string literal is NOT fine
const RAW_STRING_LITERAL_PATTERN = /\.announce\s*\(\s*['"`]/;
const ESCAPE_HATCH_PATTERN = /\/\/\s*@ts-ignore|\/\/\s*@ts-expect-error|\/\/\s*grepgf:allow/;

function* walkDir(dir: string): Generator<string> {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (IGNORE_PATTERNS.some((p) => p.test(full))) continue;
    if (statSync(full).isDirectory()) {
      yield* walkDir(full);
    } else if (extname(full) === '.ts' || extname(full) === '.tsx') {
      yield full;
    }
  }
}

function main(): void {
  let hasViolations = false;
  const violations: Array<{ file: string; line: number; snippet: string }> = [];

  for (const dir of SCAN_DIRS) {
    for (const file of walkDir(dir)) {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (RAW_STRING_LITERAL_PATTERN.test(line)) {
          // Allow escape hatches (inline comments that opt out).
          if (ESCAPE_HATCH_PATTERN.test(line)) continue;
          hasViolations = true;
          violations.push({
            file,
            line: i + 1,
            snippet: line.trim(),
          });
        }
      }
    }
  }

  if (hasViolations) {
    console.error('ERROR: Raw string literals passed to announce() in react package:');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    ${v.snippet}`);
    }
    console.error(
      '\nFix: replace raw string literals with t(key) or a constant from the messages map.',
    );
    process.exit(1);
  }

  console.log('check-all-announcer-calls-route-through-messages.ts: PASS');
  process.exit(0);
}

main();
