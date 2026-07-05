# Phase 6 — lefthook

**Goal:** Wire up a git `pre-push` hook that runs `typecheck`, `lint`, and
`test`. After this phase, `git push` triggers the three checks automatically
and blocks the push on any failure.

---

## 1. Files created

| File           | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `lefthook.yml` | lefthook config — declares the pre-push hook.      |

`lefthook install` is invoked by the `prepare` script in `package.json`
(phase 1), so the hook is wired up automatically after every
`pnpm install`.

---

## 2. File contents — `lefthook.yml`

```yaml
# lefthook configuration
# Docs: https://lefthook.dev/configuration/

pre-push:
  parallel: true
  commands:
    typecheck:
      glob_filter: |
        **/*.{ts,tsx,js,jsx,mjs,cjs}
        **/package.json
        **/tsconfig*.json
        **/biome.json
        **/vite.config.ts
        **/vitest.config.ts
        **/vitest.workspace.ts
        lefthook.yml
      run: pnpm typecheck

    lint:
      glob_filter: |
        **/*.{ts,tsx,js,jsx,mjs,cjs,json,md}
        **/biome.json
        lefthook.yml
      run: pnpm lint

    test:
      glob_filter: |
        **/*.{ts,tsx,js,jsx,mjs,cjs,json}
        **/package.json
        **/vitest.config.ts
        **/vitest.workspace.ts
        **/vite.config.ts
        lefthook.yml
      run: pnpm test
```

Design notes:

- **`parallel: true`** — runs the three commands concurrently. Total wall time
  ≈ max(typecheck, lint, test), not the sum.
- **`glob_filter`** — only re-runs the check if a relevant file changed in the
  push range. For M0 with the entire repo being changed, every push triggers
  all three; once the repo grows this saves real time.
- **`run: pnpm …`** — runs the same script the developer runs manually. No
  hidden scripts, no surprises.
- **`pre-push`** (not `pre-commit`) — the user explicitly asked for pre-push;
  keeps slow test runs off the commit path.

If any of the three commands exits non-zero, lefthook aborts the push with a
clear summary.

---

## 3. Commands

```bash
# 1. Write lefthook.yml (write tool)
# 2. (Re-)install hooks — the prepare script does this on every pnpm install,
#    but a manual install guarantees the hook is current right now.
pnpm exec lefthook install
# 3. Verify hook is registered
ls -la .git/hooks/pre-push          # should be a symlink to lefthook's shim
```

If `pnpm exec lefthook install` fails because the `.git/hooks/pre-push` is
already a regular file (e.g., from a prior global config), delete the file
first and re-run:

```bash
rm -f .git/hooks/pre-push
pnpm exec lefthook install
```

---

## 4. Verification

Three ways to verify, in order of confidence:

### 4.1 Manual hook invocation (no git push required)

```bash
pnpm exec lefthook run pre-push
```

Expected:
- Three commands run in parallel.
- All exit 0.
- Output resembles:

  ```
  typecheck... ✓
  lint... ✓
  test... ✓
  ```

### 4.2 Local push dry-run

```bash
# Make a trivial commit on a throwaway branch
git checkout -b test/pre-push-hook
echo "" >> README.md
git add README.md
git commit -m "test: exercise pre-push hook"
# Simulate push without hitting a remote (use a fake remote)
git remote add fake /tmp/fake.git 2>/dev/null || true
git push fake test/pre-push-hook --dry-run 2>&1 | head -30
```

If dry-run isn't supported on this git version, use:

```bash
# Local pre-push smoke test by triggering the hook directly via git's plumbing
.git/hooks/pre-push fake $(git rev-parse --abbrev-ref HEAD) \
  $(git rev-parse --abbrev-ref HEAD@{upstream} 2>/dev/null || echo HEAD)
```

Cleanup:

```bash
git checkout main
git branch -D test/pre-push-hook
git remote remove fake
```

### 4.3 Failure-path sanity (manual probe, not committed)

```bash
# Deliberately break typecheck, attempt commit + push
echo "const x: number = 'wrong'" >> packages/core/src/index.ts
git add packages/core/src/index.ts
git commit -m "break typecheck" --no-verify
git push fake main --dry-run 2>&1 || .git/hooks/pre-push fake main HEAD
# Expected: typecheck fails, push aborted, exit code ≠ 0
# Revert
git reset --hard HEAD~1
pnpm typecheck    # confirm back to clean
```

---

## 5. Out of scope

- **`commit-msg` lint** (e.g., conventional commits) — not requested.
- **`pre-commit` hook** — user explicitly asked for pre-push.
- **CI-side pre-push mirroring** — CI workflows are out of scope per overview §6.
- **Lefthook output formatting tweaks** — defaults are fine.