<!-- Historical: true -->
# Release Process (v1.x)

## Cutting a Release

1. **`pnpm verify` exits 0.** Run this from a fresh clone before tagging.
2. **API contract.** Review the [v1.0 API contract](docs/m6-hardening/api-freeze.md) for the full export surface.
3. **Benchmarks.** If bench drift was observed, update `bench/baseline.json` with a note explaining the change.
4. **SR matrix.** Fill the §5 results row in `docs/m6-hardening/sr-matrix.md` for the new version. Any FAIL cell requires a linked issue.
5. **Version bump.** Update the version in all four `packages/*/package.json` files.
   ```bash
   # Manual bump (or use Changesets if wired):
   pnpm --filter @lynellf/tablekit-core version 1.0.0
   pnpm --filter @lynellf/tablekit-react version 1.0.0
   pnpm --filter @lynellf/tablekit-pivot version 1.0.0
   pnpm --filter @lynellf/tablekit-worker version 1.0.0
   ```
6. **Tag the release:**
   ```bash
   git add -A && git commit -m "v1.0.0" && git tag v1.0.0
   ```
7. **Publish:**
   ```bash
   pnpm build:main
   pnpm release:core && pnpm release:react && pnpm release:pivot && pnpm release:worker
   ```
8. **Update the changelog.** Add the v1.0.0 entry at the top of `CHANGELOG.md`.

## SR Matrix Integration

Any PR touching an a11y-affecting file (see `docs/m6-hardening/sr-matrix.md` §6) must update the §5 results row in the SR matrix before merge.

Reviewers are responsible for checking the matrix update. A PR with a11y changes and no matrix update is **not approvable**.

The matrix tracks 5 AT × browser pairs × 8 scenarios = 40 cells. Not all cells need to be tested — focus on:
1. **NVDA + Chrome** (primary — highest community coverage)
2. Any AT × scenario that the PR changes

## Bench CI

The `bench` job in `.github/workflows/test.yml` runs after tests. It is **advisory only**:
- Soft threshold (1.2× baseline): `::warning` annotation on the PR.
- Hard threshold (2.0× baseline): `::error` annotation + PR label.
- Neither threshold blocks merge — they are signals for the author to investigate.

If a benchmark regresses due to a legitimate architectural change (not a bug), update `bench/baseline.json` with a note and merge.

## Breaking Changes

v1.x is additive. Breaking changes land in `v2.0`. If a breaking change is unavoidable:
1. Open a tracking issue with the "breaking-change" label.
2. Implement a deprecation warning in v1.x (optional, per decision).
3. Land the breaking change in v2.0.
