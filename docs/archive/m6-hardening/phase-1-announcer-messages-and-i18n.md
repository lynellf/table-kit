# M6 Phase 1 — Announcer `messages` map + i18n plumbing

**Goal:** Per spec §10, *"Every built-in announcement routes through the `messages` map for i18n"*. M1 shipped the live region only; M6 ships the `messages` map and the plumbing. No hardcoded English strings in the built-in announcer calls.

**Files added (estimated):**
- `packages/react/src/messages.ts` — `defaultMessages`, `AnnouncerKey`
- `packages/react/src/i18n/t.ts` — `createT()` lookup helper
- `packages/react/src/__integration__/messages-i18n.test.tsx`

**Files modified:**
- `packages/react/src/index.ts` — re-export `defaultMessages`, `AnnouncerKey`
- `packages/react/src/useDataTable.ts` — accept `messages?` option, thread to internal hooks
- `packages/react/src/usePivotTable.ts` — accept `messages?` option
- `packages/react/src/useKeyboardNav.ts` — thread `t()` into announcer calls
- `packages/react/src/usePivotKeyboardNav.ts` — thread `t()` into announcer calls
- `packages/react/src/useSortAnnouncer.ts` (or wherever sort announcements live) — thread `t()`
- `packages/react/src/useExpansionAnnouncer.ts` (pivot) — thread `t()`
- `packages/react/src/useResizeAnnouncer.ts` — thread `t()`

**Tests added:** ~10-15 in `__integration__/messages-i18n.test.tsx` (consumer override; partial-merge; per-key autocomplete; default values match existing strings byte-for-byte).

---

## 1. What this phase owns

The spec §10 wording is: *"Every built-in announcement routes through the `messages` map for i18n. Announced events: sort changes, filter result counts, page changes, pin/unpin, column move, resize commits, expansion, loading start/finish, errors."*

M0–M5 has every one of these announce calls with hardcoded English. M6 introduces the `messages` map; consumer overrides English strings via the hook option. The English defaults are byte-identical to M0–M5's hardcoded strings (the integration tests assert this).

---

## 2. Implementation

### 2.1 `packages/react/src/messages.ts`

```ts
/**
 * Default English announcer strings.
 *
 * Spec §10: "Every built-in announcement routes through the messages map for i18n."
 * Consumers override per-key via the `messages` option on useDataTable / usePivotTable:
 *
 *   useDataTable({ messages: { sortAsc: 'Tri croissant' } })
 *
 * Keys not present in the consumer map fall back to the English defaults below.
 * These strings MUST be byte-identical to M0–M5's hardcoded announcer calls.
 */
export const defaultMessages = Object.freeze({
  // Sort
  sortAsc: 'Sorted ascending',
  sortDesc: 'Sorted descending',
  sortCleared: 'Sort cleared',
  multiSort: (count: number) => `Sorted by ${count} columns`,

  // Filter
  filterApplied: (count: number) => `${count} rows match the filter`,
  filterCleared: 'Filter cleared',

  // Pagination
  pageChanged: (page: number, total: number) => `Page ${page} of ${total}`,
  pageSizeChanged: (size: number) => `Page size ${size}`,

  // Pin / move
  columnPinned: (id: string) => `Column ${id} pinned`,
  columnUnpinned: (id: string) => `Column ${id} unpinned`,
  columnMoved: (id: string, from: number, to: number) =>
    `Column ${id} moved from position ${from} to ${to}`,

  // Resize
  resizeCommitted: (id: string, width: number) =>
    `Column ${id} resized to ${width} pixels`,

  // Expansion (pivot)
  expandStarted: 'Loading child rows',
  expandFinished: (count: number) => `${count} child rows loaded`,
  expandError: 'Failed to load child rows',

  // Loading
  loadingStarted: 'Loading',
  loadingFinished: 'Loading complete',

  // Errors
  serverError: 'Failed to load data',
}) as const;

export type AnnouncerKey = keyof typeof defaultMessages;
```

The exact key list and English text must be sourced by `grep`-ing the existing M0–M5 announcer calls and preserving them. The byte-identical assertion in tests prevents drift.

### 2.2 `packages/react/src/i18n/t.ts`

```ts
import type { AnnouncerKey, defaultMessages } from '../messages';

type DefaultMessages = typeof defaultMessages;
type Messages = Partial<{ [K in AnnouncerKey]: DefaultMessages[K] }>;

/**
 * Build a translator that looks up a key in the user-supplied map, falling
 * back to the default English. The translator is closed over the user map;
 * construct once per hook, not per call.
 */
export function createT(messages?: Messages): (key: AnnouncerKey, ...args: never[]) => string {
  if (!messages) {
    // Fast path: no overrides — return the default lookup.
    return (key) => defaultMessages[key] as string;
  }
  const merged = { ...defaultMessages, ...messages };
  return (key, ...args) => {
    const fn = merged[key];
    return typeof fn === 'function' ? (fn as (...a: unknown[]) => string)(...args) : (fn as string);
  };
}
```

`createT()` runs once per hook invocation. The returned function does a single property lookup; no per-call allocation.

### 2.3 Hook wiring

Inside `useDataTable` and `usePivotTable`:

```ts
const t = useMemo(() => createT(options.messages), [options.messages]);

useKeyboardNav({ ...rest, announcer: { announce: (msg, p) => announcer.announce(t(someKey), p) } });
useSortAnnouncer({ ...rest, announcer: createLocalAnnouncer(t) });
// etc.
```

The exact wiring depends on the existing announcer plumbing in the react package — this phase reads the existing call sites and threads `t()` through them. The minimal change is to stop hardcoding strings at the call site and instead call `t('sortAsc')`.

### 2.4 `messages` option typing

```ts
// packages/core/src/types.ts (or wherever DataTableOptions lives)
import type { AnnouncerKey, defaultMessages } from '@lynellf/tablekit-react';

type DefaultMessages = typeof defaultMessages;
export type MessagesOverrides = Partial<{ [K in AnnouncerKey]: DefaultMessages[K] }>;

export interface DataTableOptions<TRow> {
  // ...existing options...
  /** Per-key announcer-string overrides. Defaults to undefined (English). */
  messages?: MessagesOverrides;
}
```

`Partial<{ [K in AnnouncerKey]: DefaultMessages[K] }>` lets consumers override `string` keys with strings and `(args) => string` keys with functions; missing keys fall back to the default.

### 2.5 Re-export from the package root

```ts
// packages/react/src/index.ts
export { defaultMessages } from './messages';
export type { AnnouncerKey } from './messages';
```

Consumers can `import { defaultMessages } from '@lynellf/tablekit-react'` to inspect or copy keys for translation.

---

## 3. Commands

```bash
# After phase 1:
pnpm typecheck
pnpm lint
pnpm test --filter @lynellf/tablekit-react
pnpm build --filter @lynellf/tablekit-react
```

---

## 4. Verification

- `pnpm test` exits 0.
- The integration test `messages-i18n.test.tsx` covers:
  - Default English is byte-identical to the pre-M6 hardcoded strings (snapshot test).
  - `messages: { sortAsc: 'Custom string' }` overrides that single key.
  - Default fallback for keys the consumer didn't override.
  - Function keys (e.g., `filterApplied: (n) => \`...${n}...\``) work with the variadic helper.
  - Per-key autocomplete at the type level (using `expect-type` or a type-level test).
- All existing keyboard/sort/filter/expansion/resize integration tests still pass — the announcer strings are byte-identical.

---

## 5. Out-of-scope

- **Locale switching UI.** v1.0 ships the map; consumers wire their own locale picker.
- **Non-announcer i18n** (column header text, error toasts in DataSource). v1.0 is announcer-only.
- **Translation contributions.** `@lynellf/tablekit-react` ships English only.

---

## 6. Risks

- **R1: Existing call sites reach into private modules.** Some announcer calls live deep in helpers (sort, filter) and may not have direct access to the hook's `t`. Mitigation: a refactor to thread `t` (or a `MessagesOverrides` object) down through the existing internal hook interface — small, mechanical.
- **R1 (long): English defaults drift from M0–M5 strings.** The snapshot test holds the default map to M0–M5's literals; if any default changes mid-phase, the test fails.
- **R1 (fatal): Missing a call site.** A grep-based audit script (`scripts/check-all-announcer-calls-route-through-messages.ts`) is added in this phase: it greps the react package for `announce(` calls and asserts every one of them goes through `t()` or a constant — i.e., no raw string literals as the first argument to `announce()`. The script is wired into `pnpm lint` so it gates the phase.
