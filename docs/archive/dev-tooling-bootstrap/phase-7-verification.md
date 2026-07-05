# Phase 7 — End-to-End Verification

**Goal:** A single command (`pnpm verify`) proves the entire toolchain is
green. This phase consolidates the verification commands from phases 1–6 and
adds an aggregate script.

---

## 1. Files modified

| File           | Change                                                                                |
| -------------- | ------------------------------------------------------------------------------------- |
| `package.json` | `verify` script already declared in phase 1; verified to exist + pass end-to-end here. |

No new files. The verification commands and expected outcomes are listed below
for use in PR review and run-book.

---

## 2. The aggregate command

```bash
pnpm verify
```

This resolves to:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

(run sequentially — lefthook's pre-push runs them in parallel, but
`pnpm verify` is the developer-facing serial command because:
- build depends on lint finding nothing wrong (lint must finish first).
- test depends on typecheck (test files reference types).

`&&` short-circuits, so a typecheck failure skips the rest.)

---

## 3. Final acceptance checklist

Run these in order from a clean working tree. Every step must pass before this
plan is considered complete.

```bash
# A. Clean state
git status                                    # no uncommitted changes to config files
git stash                                     # in case there are any
git stash pop                                 # immediately restore

# B. Fresh install (simulates a new contributor)
rm -rf node_modules pnpm-lock.yaml
pnpm install                                  # exits 0; prepare script wires up lefthook

# C. Sequential verification (developer)
pnpm verify                                   # typecheck, lint, test, build all 0

# D. Pre-push hook verification (CI-style)
pnpm exec lefthook run pre-push               # runs the 3 checks in parallel

# E. Smoke import of built artifact
node --input-type=module -e "import('./packages/core/dist/tablekit-core.es.js').then(m => console.log('VERSION:', m.VERSION))"
# Expected: VERSION: 0.0.0

# F. Smoke test of cross-package imports
node --input-type=module -e "
  const core = await import('./packages/core/dist/tablekit-core.es.js');
  console.log('core VERSION:', core.VERSION);
  // React package not built in M0; add to phase 5 later
"
# Expected: core VERSION: 0.0.0

# G. Workspace structure sanity
pnpm list -r --depth=-1 --json | head -40     # shows root + @tablekit/core + @tablekit/react
ls packages/                                  # core, pivot, react, worker all present
```

Every command above must exit 0 and produce the noted output. Any failure
rolls back to the corresponding earlier phase.

---

## 4. Failure recovery matrix

| Symptom                                    | Likely cause                       | Fix                                                |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------- |
| `pnpm install` warns `prepare failed`      | `lefthook.yml` doesn't exist yet   | Phase 1 mitigation: install with `--ignore-scripts`, then add the file in phase 6. |
| `tsc -b` reports `cannot find @tablekit/...` | TS paths not picked up            | Confirm `tsconfig.base.json` `paths` field matches `vitest.config.ts` aliases. |
| `biome check` reports hundreds of errors   | Unformatted initial files          | Run `pnpm format` then re-run `pnpm lint`.         |
| `vitest` reports "No test files found"     | `include` glob mismatch            | Confirm `vitest.config.ts` `include` is `src/**/*.{test,spec}.{ts,tsx}`. |
| `vite build` fails with "Rollup failed to resolve import" | External dep not declared        | Add to `dependencies` in `packages/core/package.json`. |
| `lefthook run pre-push` exits non-zero     | One of the three commands failed   | Re-run the failing one directly for a full stack trace. |
| `lefthook install` says "pre-push exists"  | Prior global hook in `.git/hooks/` | `rm .git/hooks/pre-push && pnpm exec lefthook install`. |

---

## 5. Post-implementation housekeeping

After all 7 phases complete and pass, commit the result:

```bash
git add -A
git status                                  # review the file list — should match overview §4
git commit -m "chore(tooling): bootstrap dev tooling stack

- pnpm workspaces monorepo (packages/{core,pivot,react,worker})
- TypeScript strict + project references (tsconfig.base.json)
- Biome lint + format (biome.json)
- Vitest workspace mode + smoke tests
- Vite library mode build (vite.config.ts)
- lefthook pre-push hook (typecheck + lint + test)"
git push                                    # triggers pre-push hook; should pass cleanly
```

This first commit is intentionally large. Future config changes land as small,
focused commits so each phase's diff is reviewable.

---

## 6. Sign-off

This plan is complete when:

- [x] Phases 1–6 written with concrete file contents and verification steps.
- [x] Phase 7 written with end-to-end smoke test + failure recovery matrix.
- [ ] All 7 phases executed by `implementer` and every check in §3 passes.
- [ ] First commit per §5 lands and pre-push hook fires green.

Once all boxes tick, the dev tooling stack is ready and milestone M0 (core
engine + React adapter shell, per spec §14) can begin in a follow-up plan.