#!/usr/bin/env node
/**
 * check-broken-links.mjs
 *
 * M6 Phase 3: Broken-link lint for the docs directory.
 *
 * Scans .md files for Markdown links and verifies each link resolves to a
 * file or anchor that exists in the repo. Anchor links (#heading) are skipped.
 * External links (http://, https://) are skipped.
 *
 * Usage:
 *   node scripts/check-broken-links.mjs docs/recipes/
 *   node scripts/check-broken-links.mjs docs/   # scan all docs
 *
 * Exit codes:
 *   0 — all links valid
 *   1 — broken links found (FAIL)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, isAbsolute } from 'node:path';
import { argv } from 'node:process';

// ── Config ───────────────────────────────────────────────────────────────────

const SKIP_PROTOCOLS = ['http://', 'https://', 'mailto:', 'tel:'];
const SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
const SKIP_DIRS = ['archive', 'node_modules', '.git'];
const SKIP_FILES = ['initial-spec.md']; // spec doc has code snippets that look like links
const DOCS_ROOT = 'docs';

// Markdown link patterns.
// [text](url)
// [text]: url  (reference-style)
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;
const REF_LINK_PATTERN = /^\s*\[[^\]]+\]:\s*(.+)$/gm;

function* walkDir(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        yield* walkDir(full);
      } else if (extname(full) === '.md' && !SKIP_FILES.includes(entry)) {
        yield full;
      }
    } catch {
      // Skip unreadable files.
    }
  }
}

/**
 * Extract all link targets from a Markdown file.
 * Returns an array of { target, line, lineNumber } objects.
 */
function extractLinks(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const links = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN.exec(line)) !== null) {
      const target = match[2].trim();
      // Skip external links, anchors, and javascript.
      if (SKIP_PROTOCOLS.some((p) => target.startsWith(p))) continue;
      if (target.startsWith('#')) continue;
      if (target.startsWith('javascript:')) continue;
      // Skip images and other non-link files.
      if (SKIP_EXTENSIONS.some((e) => target.endsWith(e))) continue;
      links.push({ target, lineNumber: i + 1, line: line.trim() });
    }

    // Reference-style links: [label]: url
    const refMatch = line.match(/^\s*\[[^\]]+\]:\s*(.+)$/);
    if (refMatch) {
      const target = refMatch[1].trim();
      if (!SKIP_PROTOCOLS.some((p) => target.startsWith(p)) && !target.startsWith('#')) {
        links.push({ target, lineNumber: i + 1, line: line.trim() });
      }
    }
  }
  return links;
}

/**
 * Resolve a link target relative to the file it appears in.
 * Returns the absolute filesystem path.
 */
function resolveLink(target, filePath) {
  // Absolute paths are anchored to the repo root.
  if (isAbsolute(target)) {
    return join(DOCS_ROOT, target);
  }
  // Remove leading ./ or .
  const normalized = target.replace(/^\.\//, '').replace(/^\.\.\//, '../');
  // Resolve relative to the file's directory.
  const fileDir = join(filePath, '..');
  return join(fileDir, normalized);
}

function main() {
  const targets = argv.slice(2);
  if (targets.length === 0) {
    console.error('Usage: node scripts/check-broken-links.mjs <dir-or-file>...');
    process.exit(1);
  }

  const scanDirs = [];
  for (const t of targets) {
    if (statSync(t).isDirectory()) {
      scanDirs.push(t);
    } else {
      scanDirs.push(join(t, '..'));
    }
  }

  const allFiles = [];
  for (const dir of scanDirs) {
    for (const file of walkDir(dir)) {
      allFiles.push(file);
    }
  }

  const violations = [];
  for (const file of allFiles) {
    const links = extractLinks(file);
    for (const { target, lineNumber, line } of links) {
      // Handle links with anchors: "file.md#section"
      const [pathPart, anchorPart] = target.split('#');
      const resolvedPath = resolveLink(pathPart, file);

      if (!existsSync(resolvedPath)) {
        violations.push({
          file: relative('.', file),
          line: lineNumber,
          target,
          resolved: resolvedPath,
          lineText: line,
          type: 'missing-file',
        });
      }
      // Anchor-only links (#section) don't need file existence check here.
    }
  }

  if (violations.length > 0) {
    console.error('ERROR: Broken links found:');
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} → "${v.target}"`);
      console.error(`    Line: ${v.lineText}`);
    }
    console.error(`\n${violations.length} broken link(s) found.`);
    process.exit(1);
  }

  console.log(`check-broken-links.mjs: PASS (${allFiles.length} files scanned)`);
  process.exit(0);
}

main();
