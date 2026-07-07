# Phase 2 — Verification

**Slug:** `readme-api-surface-overhaul`
**Phase:** 2 of 2
**Status:** Draft

## Goal

Confirm that every per-package `README.md` satisfies the acceptance criteria defined in `overview.md`, that the workspace still passes `pnpm verify`, and that the snippets compile against the package's actual exports.

## Verification commands

Run from the repo root. Each block is a separate check; the entire script should exit 0 to pass.

### 1. Existence + non-empty

```bash
for pkg in core react pivot worker; do
  test -s "packages/$pkg/README.md" || { echo "MISSING: packages/$pkg/README.md"; exit 1; }
done
echo "OK: all four READMEs exist and are non-empty"
```

### 2. Version matches `package.json`

```bash
for pkg in core react pivot worker; do
  v=$(node -p "require('./packages/$pkg/package.json').version")
  if ! grep -q "$v" "packages/$pkg/README.md"; then
    echo "VERSION MISMATCH: $pkg (expected $v)"
    exit 1
  fi
done
echo "OK: README versions match package.json"
```

### 3. Status block reports `v1.0.0 — stable`

```bash
for pkg in core react pivot worker; do
  if ! grep -q 'v1.0.0 — stable' "packages/$pkg/README.md"; then
    echo "STATUS BLOCK WRONG: $pkg"
    exit 1
  fi
done
echo "OK: all four READMEs report v1.0.0 stable"
```

### 4. No broken in-repo spec links

```bash
for pkg in core react pivot worker; do
  if grep -E '\./docs/|\.\./\.\./docs|/docs/initial-spec' "packages/$pkg/README.md" > /dev/null; then
    echo "BROKEN IN-REPO LINK IN: packages/$pkg/README.md"
    exit 1
  fi
done
echo "OK: no broken in-repo paths in any README"
```

### 5. Each README links to the canonical api-freeze doc via the GitHub blob URL

```bash
for pkg in core react pivot worker; do
  if ! grep -q 'github.com/lynellf/tablekit/blob/main/docs/m6-hardening/api-freeze.md' "packages/$pkg/README.md"; then
    echo "MISSING CANONICAL LINK: $pkg"
    exit 1
  fi
done
echo "OK: all four READMEs link to the canonical v1.0 contract"
```

### 6. Each README has an `## API` section

```bash
for pkg in core react pivot worker; do
  if ! grep -q '^## API' "packages/$pkg/README.md"; then
    echo "MISSING ## API SECTION: $pkg"
    exit 1
  fi
done
echo "OK: all four READMEs have an ## API section"
```

### 7. Core README documents events

```bash
grep -q '^## Events' packages/core/README.md || { echo "MISSING ## Events: core"; exit 1; }
for sym in onCellClick onCellDoubleClick onCellContextMenu onCellActivate onCellFocusChange onRowClick onRowDoubleClick onHeaderClick; do
  grep -q "$sym" packages/core/README.md || { echo "MISSING event $sym in core README"; exit 1; }
done
grep -q 'CellEventContext' packages/core/README.md || { echo "MISSING CellEventContext in core README"; exit 1; }
grep -q 'InteractionSource' packages/core/README.md || { echo "MISSING InteractionSource in core README"; exit 1; }
echo "OK: core README documents the full event surface"
```

### 8. React README documents pivot support and events

```bash
grep -q '^## Events' packages/react/README.md || { echo "MISSING ## Events: react"; exit 1; }
grep -q 'usePivotTable' packages/react/README.md || { echo "MISSING usePivotTable in react README"; exit 1; }
grep -q '^## PivotTable support\|PivotTable support' packages/react/README.md || { echo "MISSING PivotTable support callout in react README"; exit 1; }
grep -q '@lynellf/tablekit-pivot' packages/react/README.md || { echo "MISSING pivot package mention in react README"; exit 1; }
echo "OK: react README documents pivot support and events"
```

### 9. Quick start snippets use only real exports

```bash
# Cross-reference: every function/hook mentioned in a Quick start must appear
# in the corresponding package's index.ts.
for pkg in core react pivot worker; do
  # Extract the Quick start section (between ## Quick start and the next ## heading).
  snippet=$(awk '/^## Quick start/{flag=1; next} /^## /{flag=0} flag' "packages/$pkg/README.md")
  # Find identifiers used as function calls (identifier followed by '(').
  used=$(echo "$snippet" | grep -oE '[A-Za-z_][A-Za-z0-9_]*\(' | sed 's/($//' | sort -u)
  for sym in $used; do
    # Skip common JS keywords / primitives.
    case "$sym" in
      if|for|while|return|new|typeof|function|const|let|var|await|async|class|import|export|from|true|false|null|undefined|void|number|string|boolean|Array|Object|Promise|Record|Partial|HTMLElement|HTMLDivElement|React|useRef|useState|useCallback|useEffect|useMemo|useSyncExternalStore|JSX|IntrinsicAttributes) continue ;;
    esac
    if ! grep -qE "(^|[^A-Za-z0-9_])$sym([^A-Za-z0-9_]|\\b)" "packages/$pkg/src/index.ts"; then
      # Allow exported types from sibling packages referenced via re-export.
      case "$sym" in
        Column|DataTableInstance|DataTableOptions|DataTableState|Cell|Row) continue ;; # re-exported by react
        sumAggregator|countAggregator|minAggregator|maxAggregator|avgAggregator|createPivotTable) continue ;; # re-exported by react
      esac
      echo "QUICK START USES UNKNOWN SYMBOL '$sym' in packages/$pkg/README.md"
      exit 1
    fi
  done
done
echo "OK: Quick start snippets only use exported symbols"
```

Note: this script is heuristic and may need a one-line tweak for symbols that come from a different subpath. Treat a failure as a signal to inspect, not as a hard reject.

### 10. Workspace `pnpm verify` still exits 0

```bash
pnpm verify
```

Expected: exit 0. (README changes should not affect typecheck / lint / test / build, but this is cheap insurance.)

### 11. Peer dependencies are stated explicitly

```bash
# core requires no peer deps (none declared in package.json).
# react requires @lynellf/tablekit-core, react, and optionally @lynellf/tablekit-pivot.
grep -q '@lynellf/tablekit-core' packages/react/README.md || { echo "react README missing core peer dep"; exit 1; }
grep -q 'react' packages/react/README.md || { echo "react README missing react peer dep"; exit 1; }
# pivot requires @lynellf/tablekit-core.
grep -q '@lynellf/tablekit-core' packages/pivot/README.md || { echo "pivot README missing core peer dep"; exit 1; }
# worker requires @lynellf/tablekit-pivot.
grep -q '@lynellf/tablekit-pivot' packages/worker/README.md || { echo "worker README missing pivot peer dep"; exit 1; }
echo "OK: all peer dependencies stated in their READMEs"
```

## Reviewer checks (manual)

A human reviewer (or the next role) should additionally confirm:

- The Quick start snippet in each README is **short enough to fit on one screen** (≤ 25 lines including comments).
- The `## API` section in each README is **organized by category** (factory, types, hooks, helpers, registries) and not just a flat dump.
- No `## API` bullet references a symbol whose name changed (e.g. no `useTable` — must be `useDataTable`).
- The `## Events` section in core + react has the same callback names (they share the surface).
- No README contains a sentence claiming "documentation is sparse" or "see source for details" — those are the exact phrases the user complained about and they must not reappear in the new copy.

## Files touched by this phase

None. Verification is read-only (except `pnpm verify`, which is the existing CI gate).

## Definition of done

- All eleven verification blocks above exit 0.
- `docs/readme-api-surface-overhaul/` directory contains this plan + `overview.md` + `phase-1-rewrite-package-readmes.md`.
- Archive destination recorded by the orchestrator after plan-review approval.
- Total implementation cost (Phase 1) within the `$1.50` implementer budget estimate; verification is cheap.