# Phase 3 — Biome (Lint + Format)

**Goal:** Single-tool replacement for ESLint + Prettier. Biome handles both
lint rules and formatting. After this phase, `pnpm lint` and `pnpm format`
both work; the codebase is auto-formatted on first run.

---

## 1. Files created

| File          | Purpose                                            |
| ------------- | -------------------------------------------------- |
| `biome.json`  | Biome configuration (root-applied).                |

No `.eslintrc*`, `.prettierrc*`, or `eslint.config.*` are created — Biome
explicitly replaces those.

---

## 2. File contents — `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "**",
      "!**/node_modules",
      "!**/dist",
      "!**/coverage",
      "!**/.vitest-cache",
      "!**/pnpm-lock.yaml",
      "!**/*.tsbuildinfo"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "error"
      },
      "style": {
        "useImportType": "error",
        "useNodejsImportProtocol": "error",
        "useConst": "error",
        "useTemplate": "error",
        "useExportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      },
      "complexity": {
        "noBannedTypes": "error"
      },
      "a11y": {
        "useKeyWithClickEvents": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSpacing": true
    }
  },
  "json": {
    "formatter": {
      "indentWidth": 2,
      "trailingCommas": "none"
    }
  }
}
```

Notes on the rule picks:

- `recommended: true` — gives Biome's vetted defaults.
- `noExplicitAny: "error"` — strict, but `unknown` is preferred; if any real
  need for `any` arises, suppress with an inline `// biome-ignore` and a
  comment.
- `useImportType: "error"` + `useExportType: "error"` — aligns with
  `verbatimModuleSyntax` from phase 2's TS config.
- `useKeyWithClickEvents: "warn"` (not error) — React components will need
  keyboard equivalents eventually (spec §10 / §7.5) but at M0 we have no UI
  yet, so warn-only is fine.
- `noBannedTypes: "error"` — catches `Object`, `String`, `Number` mistakes.
- `useExhaustiveDependencies: "error"` — future React hook lint baseline.

`vcs.useIgnoreFile: true` makes Biome respect `.gitignore` automatically.

---

## 3. Commands

```bash
# 1. Write biome.json (write tool)
# 2. Format existing source so it matches Biome's opinions
pnpm format
# 3. Lint to confirm everything is green
pnpm lint
```

If `pnpm format` rewrites any files, commit those changes as part of phase 3 —
they're the canonical formatting of the repo going forward.

---

## 4. Verification

```bash
pnpm lint                                # exits 0
pnpm format --log-level=error            # dry-run-ish; should be no-op
pnpm exec biome check --max-diagnostics=0 .   # stricter check (no warnings)
```

Expected:
- `biome check .` reports 0 errors and 0 warnings on the current file set
  (`packages/core/src/index.ts`, `packages/react/src/index.ts`, plus all
  configs).
- After `pnpm format`, files use 2-space indent, single quotes, semicolons,
  trailing commas — matches the rule config above.

Sanity tests:

```bash
# Inject a deliberate violation to confirm Biome catches it
echo "const x:any = 1" >> packages/core/src/_scratch.ts
pnpm lint                               # should report noExplicitAny
rm packages/core/src/_scratch.ts
pnpm lint                               # back to clean
```

This sanity test is **not** part of the committed plan; it's a manual probe
during implementation to confirm the linter is wired correctly.

---

## 5. Out of scope

- Per-package Biome overrides (the single root config covers all packages).
- Prettier config / `.editorconfig` (Biome covers both).
- ESLint plugins (Biome is the only linter).
- Stylelint, HTMLLint, etc. (no styles or HTML until an example app lands).