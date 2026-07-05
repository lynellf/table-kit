# Phase 2 — TypeScript

**Goal:** Strict TypeScript with project references. The base config is shared;
each package extends it. After this phase, `pnpm typecheck` exits 0 against
stub packages.

---

## 1. Files created / modified

| File                              | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `tsconfig.base.json`              | Shared compiler options.                 |
| `tsconfig.json`                   | Root — project references to all packages. |
| `packages/core/package.json`      | Stub package manifest.                   |
| `packages/core/tsconfig.json`     | Extends base; references root.           |
| `packages/core/src/index.ts`      | Stub: `export const VERSION = '0.0.0';`  |
| `packages/react/package.json`     | Stub package manifest.                   |
| `packages/react/tsconfig.json`    | Extends base; references root.           |
| `packages/react/src/index.ts`     | Stub: `export const VERSION = '0.0.0';`  |

`.gitkeep` files in `packages/core/` and `packages/react/` are deleted in this
phase (replaced by real `package.json` + `src/`).

---

## 2. File contents

### 2.1 `tsconfig.base.json`

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Base",
  "compilerOptions": {
    // Module + target
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",

    // Strictness (every flag on)
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,

    // Interop
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    // Emit hygiene
    "noEmit": true,                      // Vite handles emit
    "incremental": true,
    "composite": true,                   // required: tsc -b needs composite on every referenced project; leaf tsconfigs inherit this
    "skipLibCheck": true,

    // Path mapping for workspace imports
    "baseUrl": ".",
    "paths": {
      "@tablekit/core": ["./packages/core/src/index.ts"],
      "@tablekit/core/*": ["./packages/core/src/*"],
      "@tablekit/react": ["./packages/react/src/index.ts"],
      "@tablekit/react/*": ["./packages/react/src/*"]
    }
  },
  "exclude": ["**/node_modules", "**/dist", "**/.vitest-cache", "**/coverage"]
}
```

Why each strict flag matters for this library:
- `noUncheckedIndexedAccess` — pivot result arrays and column lookups are central; protects against `undefined` slipping through.
- `exactOptionalPropertyTypes` — distinguishes `{ x?: T }` from `{ x: T | undefined }`; crucial for prop-getter options.
- `verbatimModuleSyntax` — forces explicit `type` imports; tree-shakes better with Vite.
- `moduleResolution: Bundler` — required for Vite-style resolution.

### 2.2 `tsconfig.json` (root)

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Root",
  "files": [],
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/react" }
  ]
}
```

`files: []` means the root itself emits nothing — it only orchestrates project
references. `tsc -b` (run by `pnpm typecheck`) walks the references.

### 2.3 `packages/core/package.json`

```json
{
  "name": "@tablekit/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc -b"
  },
  "peerDependencies": {},
  "devDependencies": {}
}
```

`main` and `types` pointing at `./src/index.ts` are placeholders for M0; the
proper `exports` map and dist build are added in a later plan (see overview §7
"deferred" items).

### 2.4 `packages/core/tsconfig.json`

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@tablekit/core",
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

### 2.5 `packages/core/src/index.ts`

```ts
/**
 * @tablekit/core — framework-free state engine, row pipeline,
 * column model, virtualization, navigation, events.
 *
 * M0 stub. Real surface lands in milestone M0 of the spec.
 */
export const VERSION = '0.0.0' as const;
```

### 2.6 `packages/react/package.json`

```json
{
  "name": "@tablekit/react",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc -b"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "react": "^18.3.1"
  }
}
```

React is added as a devDependency so the package can compile standalone; the
`peerDependencies` entry is the contract consumers will see.

### 2.7 `packages/react/tsconfig.json`

```jsonc
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "@tablekit/react",
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]
}
```

### 2.8 `packages/react/src/index.ts`

```ts
/**
 * @tablekit/react — React adapter: hooks, prop getters, announcer,
 * dev-mode a11y validator.
 *
 * M0 stub. Real surface lands in milestone M0 of the spec.
 */
import * as React from 'react';

export const VERSION = '0.0.0' as const;

// Force React type acquisition so the package doesn't appear "unused".
export type { ReactElement } from 'react';
```

The `ReactElement` re-export guarantees `react` is actually imported — without
it, an unused-import lint check (Biome) would later flag the import as dead
once real code lands.

---

## 3. Commands

```bash
# 1. Create stub source files (write tool)
# 2. Delete .gitkeep files for packages that now have content
rm packages/core/.gitkeep packages/react/.gitkeep
# 3. Re-install (adds React + types for @tablekit/react)
pnpm install
# 4. Run typecheck
pnpm typecheck
```

---

## 4. Verification

```bash
pnpm typecheck
```

Expected:
- Exit code 0.
- Output: empty or just `tsc -b` summary (no errors).
- `*.tsbuildinfo` files generated in each package's directory.

Quick sanity:

```bash
pnpm -F @tablekit/core typecheck    # scoped typecheck works
pnpm -F @tablekit/react typecheck   # scoped typecheck works
```

---

## 5. Out of scope

- Test type-checking (`**/*.test.ts` is excluded — Vitest handles its own
  type-narrowing via `expect-type` if needed; that lands with the testing plan
  in a later milestone).
- Build output / `dist/` configs (phase 5 + later).
- `exports` field in `package.json` (deferred — see overview §7).