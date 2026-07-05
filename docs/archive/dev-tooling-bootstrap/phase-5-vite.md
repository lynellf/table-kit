# Phase 5 — Vite (Library Mode)

**Goal:** A working Vite pipeline in library mode that emits ESM. After this
phase, `pnpm build` produces `packages/core/dist/` with at least one entry
chunk.

---

## 1. Files created / modified

| File              | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `vite.config.ts`  | Root Vite config — library mode for `@tablekit/core`. |

A single root config covers M0 because the only package with anything to build
is `core` (and even that's a stub). When `@tablekit/react` gains buildable
content, that package gets its own `vite.config.ts` (Vite will auto-pick it
up via workspace resolution).

---

## 2. File contents — `vite.config.ts`

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { dependencies } from './packages/core/package.json';

// Build configuration for the headless library.
// Each package that becomes buildable later will get its own vite.config.ts
// that re-uses this pattern.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: resolve(__dirname, 'packages/core/dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'packages/core/src/index.ts'),
      name: 'TableKitCore',
      formats: ['es'],
      fileName: (format) => `tablekit-core.${format}.js`,
    },
    rollupOptions: {
      external: [
        ...Object.keys(dependencies ?? {}),
      ],
      output: {
        // Single chunk for now — the lib is a stub. Multi-entry split lands
        // with feature modules (spec §3: "Feature modules inside core are
        // tree-shakeable").
        inlineDynamicImports: true,
      },
    },
  },
});
```

Notes:

- **`formats: ['es']`** — libraries ship ESM only. CJS users can interop via
  `esModuleInterop`. (Add `cjs` later if a consumer demands it.)
- **`target: 'es2022'`** — matches `tsconfig.base.json`. Modern enough to skip
  legacy transforms, broad enough to cover every browser the spec targets.
- **`external: Object.keys(dependencies)`** — at M0 the dependencies map is
  empty, so nothing is bundled external. When real deps land, they are
  automatically treated as peer / external (no double-bundling).
- **`outDir: packages/core/dist`** — keeps the build output co-located with
  its source for clarity. The `.gitignore` from phase 1 already excludes
  `dist/`.
- **`sourcemap: true`** — required for useful stack traces during dev.

---

## 3. Commands

```bash
# 1. Write vite.config.ts (write tool)
# 2. Build
pnpm build
```

---

## 4. Verification

```bash
pnpm build
ls packages/core/dist/                  # should contain:
#   tablekit-core.es.js
#   tablekit-core.es.js.map
cat packages/core/dist/tablekit-core.es.js | head -20   # ESM output, minified-readable
```

Expected:
- Exit code 0.
- Two files in `packages/core/dist/`: the `.es.js` entry and its sourcemap.
- File starts with a comment header or `export` — no `require()` calls.

Sanity probe (manual, not committed):

```bash
node -e "import('./packages/core/dist/tablekit-core.es.js').then(m => console.log(m.VERSION))"
# Expected: 0.0.0
```

---

## 5. Out of scope

- **Multi-entry library build** — single entry for M0.
- **TypeScript declaration emission** (`.d.ts`) — `vite-plugin-dts` or
  `tsc --emitDeclarationOnly` lands in a later phase once the public API
  stabilizes (per overview §7 "deferred").
- **CSS / asset handling** — library is headless; no styles.
- **Worker bundle for `@tablekit/worker`** — separate plan (M5).
- **Demo / example app** — separate plan.
- **Minification customization** — Vite's default esbuild minify is fine for
  M0.