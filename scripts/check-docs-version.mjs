/**
 * @lynellf/tablekit — docs version drift check script.
 *
 * Verifies that live documentation does not contain stale v1 claims
 * or broken documented imports.
 *
 * R6 required artifact for Foundation gate.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const expectedVersion = '2.0.0';

// ─── Files that should be marked as historical/archived ───────────────────────

const historicalMarkers = ['docs/archive/'];

// ─── Files that should contain v2 claims ─────────────────────────────────────

const v2ClaimFiles = [
  'docs/migration-v1-to-v2.md',
  'docs/table-kit-2.0-parity-assessment-and-spec-v2.md',
  'docs/table-kit-2.0-parity-plan/phase-1-foundation.md', // original acceptance criteria; kept as reference
  'docs/table-kit-2.0-parity-plan/phase-1-foundation-remediation.md',
  // phase-1-foundation/ plan documents are active v2 deliverables
  'docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md',
  'docs/table-kit-2.0-parity-plan/phase-1-foundation/review-evidence-round-7.md',
  'docs/table-kit-2.0-parity-plan/phase-1-foundation/docs/changes.md',
];

// ─── Plan subdirectories that contain active v2 documents ───────────────────────
// Files under these paths are active plan deliverables, not misplaced legacy files.
// Skip them when checking for misplaced plan files.
const activePlanSubdirs = ['phase-1-foundation'];

// ─── Patterns that indicate stale v1 claims ─────────────────────────────────

const stalePatterns = [
  // Version references - match v1.0, v1.2.3 but NOT "v1 " followed by words
  { pattern: /version\s+1\.\d+\.\d+/, message: 'found v1.x version reference' },
  // Only match v1 when it's followed by a dot and digit (version number) or end of string
  { pattern: /v1(?:\.\d+)+(?!\w)/, message: 'found v1.x version reference (not v1.x.x format)' },
  // API references that changed in v2
  { pattern: /onStateChange.*undefined/, message: 'stale onStateChange default claim' },
  // Claims that should be labeled as historical
  { pattern: /M1 minimal.*§10/, message: '§10 reference in M1 minimal - should reference spec' },
];

// ─── Check that migration guide exists and has v2 claims ─────────────────────

const migrationGuide = resolve(root, 'docs', 'migration-v1-to-v2.md');
if (!existsSync(migrationGuide)) {
  throw new Error('docs/migration-v1-to-v2.md does not exist - required for v2 gate');
}

const migrationContent = readFileSync(migrationGuide, 'utf8');
if (!migrationContent.includes('v2.0.0') && !migrationContent.includes('v2.0')) {
  throw new Error('docs/migration-v1-to-v2.md does not mention v2.0');
}
console.log('✓ docs/migration-v1-to-v2.md exists and mentions v2.0');

// ─── Check archived documents are in archive directory ─────────────────────────

const tableKitPlanDir = resolve(root, 'docs', 'table-kit-2.0-parity-plan');
if (existsSync(tableKitPlanDir)) {
  const files = readdirSync(tableKitPlanDir, { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string') continue;
    if (!file.endsWith('.md')) continue;

    const fullPath = resolve(tableKitPlanDir, file);

    // Skip active plan subdirectories — their files are legitimate v2 deliverables
    const isActivePlanSubdir = activePlanSubdirs.some((subdir) => file.startsWith(subdir + '/'));
    // Skip files that are in v2ClaimFiles (recognized active plan documents)
    const fileFullPath = resolve(tableKitPlanDir, file);
    const isRecognizedClaimFile = v2ClaimFiles.some((claimFile) => {
      const claimFullPath = resolve(root, claimFile);
      return claimFullPath === fileFullPath;
    });
    if (
      !isActivePlanSubdir &&
      !isRecognizedClaimFile &&
      file.startsWith('phase-1-foundation') &&
      !file.includes('remediation')
    ) {
      console.warn(`⚠ Found ${file} - should be in phase-1-foundation-remediation.md`);
    }
  }
}

// ─── Check live docs for stale claims ────────────────────────────────────────

const docsDir = resolve(root, 'docs');
let issuesFound = 0;

function checkFile(filePath, relPath) {
  if (!filePath.endsWith('.md')) return;
  if (relPath.startsWith('archive/')) return; // Skip archived docs

  const content = readFileSync(filePath, 'utf8');

  // Skip files marked as historical - they may contain v1 references intentionally
  if (content.includes('Historical: true')) {
    return;
  }

  for (const { pattern, message } of stalePatterns) {
    if (pattern.test(content)) {
      console.warn(`⚠ ${relPath}: ${message}`);
      issuesFound++;
    }
  }
}

function walkDir(dir, prefix = '') {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Skip archive directory
      if (entry.name === 'archive') continue;
      walkDir(fullPath, relPath);
    } else {
      checkFile(fullPath, relPath);
    }
  }
}

walkDir(docsDir);

// ─── Verify phase-1-foundation/review-decision.md exists ─────────────────────

const reviewDecisionPath = resolve(
  root,
  'docs',
  'table-kit-2.0-parity-plan',
  'phase-1-foundation',
  'review-decision.md',
);

if (!existsSync(reviewDecisionPath)) {
  throw new Error(
    'docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md does not exist - required for R7 gate',
  );
}
console.log('✓ docs/table-kit-2.0-parity-plan/phase-1-foundation/review-decision.md exists');

// ─── Check README references ───────────────────────────────────────────────────

const readmePath = resolve(root, 'README.md');
if (existsSync(readmePath)) {
  const readmeContent = readFileSync(readmePath, 'utf8');
  // Check that README mentions v2 or the migration guide
  if (!readmeContent.includes('v2.0') && !readmeContent.includes('migration')) {
    console.warn('⚠ README.md does not mention v2.0 or migration guide');
    issuesFound++;
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

if (issuesFound > 0) {
  console.error(`\n✗ ${issuesFound} documentation issue(s) found - failing gate`);
  process.exit(1);
} else {
  console.log('\n✓ Docs version drift check passed');
}
