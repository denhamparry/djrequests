# GitHub Issue #110: feat: persist requester name in browser localStorage

**Issue:** [#110](https://github.com/denhamparry/djrequests/issues/110)
**Status:** Planning
**Date:** 2026-04-17

## Problem Statement

Guests at an event often submit several song requests over the course of the
night. The current UI requires them to re-type their name into the "Your name"
field on every visit (and after every page reload), even though the name is
the only piece of data that doesn't change between requests.

### Current Behavior

- `src/App.tsx` initialises `requesterName` to the empty string
  (`useState('')`) on every mount.
- The "Request" button is disabled until a non-empty trimmed name is entered
  (see `hasName` guard at `src/App.tsx:35` and the disabled check at
  `src/App.tsx:346`).
- A page reload throws away the typed name, forcing re-entry.

### Expected Behavior

- After a successful request submission, the requester's name is saved to
  `localStorage` under a namespaced key.
- On a subsequent visit (new tab, reload, return after navigation), the
  "Your name" input pre-fills from `localStorage` so the user can request
  another song with one fewer step.
- A small affordance lets a different user clear or overwrite the stored name
  — important on shared/kiosk devices.
- If `localStorage` is unavailable (private mode, quota exceeded, disabled by
  policy), the app falls back silently to the existing in-memory-only
  behaviour rather than throwing.

## Current State Analysis

### Relevant Code/Config

- **`src/App.tsx:19`** — `const [requesterName, setRequesterName] = useState('')`
  - This is the single source of truth for the name across the page; no modal.
- **`src/App.tsx:34`** — `const trimmedName = requesterName.trim()` and
  `hasName` derived flag.
- **`src/App.tsx:182-214`** — `handleRequest`: on success it sets
  `requestFeedback`. **No persistence step today.** This is the natural
  hook point to write the name to `localStorage`.
- **`src/App.tsx:232-243`** — the "Your name" `<input>`. We will add a sibling
  "Not you? Clear" button rendered conditionally when the input matches the
  stored value.
- **`src/hooks/useSongSearch.ts`** — establishes the pattern for custom hooks
  in this codebase: single-file hook, named export, lives under `src/hooks/`.
- **`src/__tests__/SearchView.test.tsx`** — establishes the React Testing
  Library + MSW pattern used for App-level tests.
- **`tests/e2e/request.spec.ts`** — Playwright smoke. The current test fills
  `input[aria-label="Your name"]` with `'Avery'` then submits. Adding
  persistence MUST NOT regress this test.

### Related Context

- **`shared/types.ts`** defines `Requester` (`name`, `requestType`); we are
  not touching that shape — only the UX of how `name` is sourced.
- **CLAUDE.md → "Vitest on Node 22+"** — `localStorage` is provided by jsdom
  in this project; an existing fix (issue #035) wired it up. Tests can
  read/write `window.localStorage` directly. The `--no-warnings` flag
  suppresses an unrelated jsdom warning.
- **No existing `localStorage` usage** in `src/`. Confirmed with a quick
  inspection — this will be the first persistence touchpoint, so getting the
  abstraction right (small, reusable, testable) matters.

## Solution Design

### Approach

Add a thin, well-tested helper module `src/lib/requesterStorage.ts` that
encapsulates `localStorage` read/write/clear with try/catch fallbacks, and a
custom hook `src/hooks/useRequesterName.ts` that bridges the helper into React
state. Wire the hook into `src/App.tsx`, save on successful submission, and
add a "Not you? Clear" button beside the name input.

**Rationale:**

- **Helper + hook split** matches the codebase's existing pattern (pure
  helpers under `src/lib/`, stateful glue under `src/hooks/`) and keeps the
  storage logic trivially unit-testable without React.
- **Save on success only** (not on every keystroke) avoids persisting
  half-typed names and keeps the data minimal. The user explicitly
  "committed" to the name by submitting a request.
- **"Not you? Clear" button** (not a hidden setting) is the explicit privacy
  affordance called out in the issue's "shared devices" consideration.

### Trade-offs Considered

- **Save-on-keystroke vs save-on-success:** keystroke saving is simpler but
  pollutes storage with abandoned half-typed values and surprises kiosk
  users. Save-on-success is the better default.
- **Custom event vs storage event for cross-tab sync:** out of scope for MVP.
  The issue does not require multi-tab sync, and adding it would add
  complexity for a vanishingly rare scenario at events.
- **Storing `contact` too:** the current UI doesn't collect `contact` — only
  `name` and `requestType`. Storing only `name` matches the implementation
  surface and the issue's "PII scope" guidance ("name only by default").

### Implementation Outline

1. **`src/lib/requesterStorage.ts`** — pure helper:
   - `STORAGE_KEY = 'djrequests:requester'`
   - `loadRequesterName(): string | null` — try/catch, returns `null` on
     unavailable, parse error, or missing key.
   - `saveRequesterName(name: string): void` — try/catch, no-op on failure.
   - `clearRequesterName(): void` — try/catch, no-op on failure.
   - Stores as JSON `{ name: string }` (forward-compatible with adding more
     fields later without a key migration).

2. **`src/hooks/useRequesterName.ts`** — React glue:
   - Initialises state from `loadRequesterName()` (lazy initial state via
     `useState(() => …)` so SSR-style imports stay cheap and storage is read
     once on mount).
   - Returns `{ name, setName, persist, clear }`:
     - `setName` updates in-memory state only (mirrors `useState` setter).
     - `persist()` saves the current trimmed name (called from
       `handleRequest` on success).
     - `clear()` empties state AND removes the stored value.

3. **`src/App.tsx`** — wire-up:
   - Replace `useState('')` with `useRequesterName()`.
   - In `handleRequest`'s success branch, call `persist()` after setting the
     success feedback (use the trimmed name).
   - Render a small "Not you? Clear" button next to the input, visible only
     when the input value is non-empty AND matches the persisted value.
     Clicking it calls `clear()` and focuses the input.

4. **Tests** — see Testing Strategy.

### Benefits

- One fewer step for repeat requesters (the common case at events).
- Privacy-respecting default (save only after explicit submission).
- Clear escape hatch on shared devices.
- Reusable storage primitives if we later persist other UI preferences (e.g.
  preferred request type).

## Implementation Plan

### Step 1: Add the storage helper

**File:** `src/lib/requesterStorage.ts` (new)

**Changes:**

```ts
const STORAGE_KEY = 'djrequests:requester';

type StoredRequester = { name: string };

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    // Touch the API to surface SecurityError in locked-down browsers.
    const probe = '__djrequests_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadRequesterName(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRequester>;
    return typeof parsed?.name === 'string' && parsed.name.length > 0
      ? parsed.name
      : null;
  } catch {
    return null;
  }
}

export function saveRequesterName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: StoredRequester = { name: trimmed };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota exceeded, etc. — silent fallback */
  }
}

export function clearRequesterName(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* silent fallback */
  }
}
```

**Why a probe write?** Some browsers (Safari private mode historically)
expose `localStorage` but throw on `setItem`. A probe surfaces this once at
read time so callers consistently get `null` instead of a delayed throw.

**Testing:** unit tests in `src/lib/__tests__/requesterStorage.test.ts`.

### Step 2: Add the React hook

**File:** `src/hooks/useRequesterName.ts` (new)

**Changes:**

```ts
import { useCallback, useState } from 'react';
import {
  clearRequesterName,
  loadRequesterName,
  saveRequesterName
} from '../lib/requesterStorage';

export function useRequesterName() {
  const [name, setName] = useState<string>(() => loadRequesterName() ?? '');
  const [persistedName, setPersistedName] = useState<string | null>(() =>
    loadRequesterName()
  );

  const persist = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    saveRequesterName(trimmed);
    setPersistedName(trimmed);
  }, []);

  const clear = useCallback(() => {
    clearRequesterName();
    setPersistedName(null);
    setName('');
  }, []);

  return { name, setName, persist, clear, persistedName };
}
```

`persistedName` is exposed so the UI can decide when to show the "Not you?
Clear" affordance (only when the input still matches what's stored — not
after the user has started typing a different name).

**Testing:** unit tests in `src/hooks/__tests__/useRequesterName.test.ts`.

### Step 3: Wire the hook into `App.tsx`

**File:** `src/App.tsx`

**Changes:**

- Import `useRequesterName` and replace
  `const [requesterName, setRequesterName] = useState('')` with
  `const { name: requesterName, setName: setRequesterName, persist: persistRequesterName, clear: clearRequesterName, persistedName } = useRequesterName();`
- In `handleRequest`'s success branch (after setting `requestFeedback` to
  success), call `persistRequesterName(trimmedName)`.
- Add the "Not you? Clear" button next to the name input, rendered only
  when `persistedName !== null && persistedName === requesterName`. Clicking
  calls `clearRequesterName()` and re-focuses the input.

**Sketch of the input block:**

```tsx
<label className="input-label" htmlFor="requester-name">
  <span className="label-text">Your name</span>
  <input
    id="requester-name"
    aria-label="Your name"
    placeholder="So the DJ knows who requested it"
    value={requesterName}
    autoComplete="name"
    required
    onChange={(event) => setRequesterName(event.target.value)}
  />
  {persistedName && persistedName === requesterName && (
    <button
      type="button"
      className="link-button"
      onClick={clearRequesterName}
    >
      Not you? Clear
    </button>
  )}
</label>
```

The styling for `link-button` can reuse existing button styles in
`src/index.css` (small text-style button); add it if it doesn't exist.

**Testing:** new App-level tests added to `src/__tests__/SearchView.test.tsx`
or a new `src/__tests__/RequesterName.test.tsx`.

### Step 4: Update the Playwright smoke test (regression-only)

**File:** `tests/e2e/request.spec.ts`

**Changes:**

- The existing assertion (`fill('input[aria-label="Your name"]', 'Avery')`)
  must continue to pass when storage is empty at test start. Playwright's
  default context starts with empty storage per test, so no change needed
  for the existing path.
- Optionally add a second `test()` that:
  1. Submits a request (success).
  2. Reloads the page.
  3. Asserts the name field is pre-filled with `'Avery'`.
  4. Clicks "Not you? Clear" and asserts the field is empty again.

This second test directly proves the acceptance criteria end-to-end.

### Step 5: Run quality gates

- `npm run lint`
- `npm run test:unit` (with coverage; ensure new files pass the >80%
  threshold)
- `npm run test:e2e`
- `pre-commit run --all-files` (twice if the first pass auto-fixes)

## Testing Strategy

### Unit Testing

**`src/lib/__tests__/requesterStorage.test.ts`** (new):

- `loadRequesterName` returns `null` on empty storage.
- `loadRequesterName` returns the saved name after `saveRequesterName`.
- `loadRequesterName` returns `null` on malformed JSON in storage.
- `loadRequesterName` returns `null` when stored payload has no `name`.
- `saveRequesterName` trims whitespace and stores the trimmed value.
- `saveRequesterName` is a no-op for empty/whitespace-only input.
- `clearRequesterName` removes the key.
- All three functions degrade gracefully when `localStorage` throws on
  access (simulated by stubbing `Object.defineProperty(window, 'localStorage', { get() { throw … } })` for a single test, then restoring).

Use `beforeEach(() => window.localStorage.clear())` to keep tests isolated.

**`src/hooks/__tests__/useRequesterName.test.ts`** (new):

- Initialises `name` to `''` when storage is empty.
- Initialises `name` to the stored value when storage has a name.
- `setName` updates state without persisting.
- `persist(value)` writes to storage and updates `persistedName`.
- `clear()` empties state and removes the stored value.
- `persistedName` is `null` after `clear()`.

Use `@testing-library/react`'s `renderHook`.

### Integration Testing (App-level)

In `src/__tests__/` (new test or extend `SearchView.test.tsx`):

- Renders with empty storage → name field is empty.
- Renders with pre-seeded storage → name field is pre-filled, "Not you?
  Clear" button is visible.
- After successful request submission, storage contains the trimmed name.
- Clicking "Not you? Clear" empties the field and removes the stored value.
- Editing the pre-filled field hides the "Not you? Clear" button.

### E2E Testing

Add a second Playwright test (see Step 4) that proves persistence across a
real reload.

### Regression Testing

- Existing Playwright smoke test still passes unchanged.
- Existing unit tests in `src/__tests__/SearchView.test.tsx` and
  `PreviewButton.test.tsx` still pass.
- `npm run lint` and `npm run build` succeed.

## Success Criteria

- [ ] `src/lib/requesterStorage.ts` created with full unit-test coverage.
- [ ] `src/hooks/useRequesterName.ts` created with full unit-test coverage.
- [ ] `src/App.tsx` uses the hook; success path calls `persist`.
- [ ] "Not you? Clear" button visible only when the input matches the
      persisted value; clicking it clears state + storage.
- [ ] Graceful no-throw fallback when `localStorage` is unavailable
      (covered by tests).
- [ ] New Playwright test verifies persistence across reload + clear flow.
- [ ] Existing Playwright smoke test still passes.
- [ ] `npm run lint`, `npm run test:unit`, `npm run test:e2e`, and
      `pre-commit run --all-files` all pass.

## Files Modified

1. `src/lib/requesterStorage.ts` — **new**, storage helper.
2. `src/hooks/useRequesterName.ts` — **new**, React hook glue.
3. `src/App.tsx` — wire in the hook, persist on success, render clear button.
4. `src/lib/__tests__/requesterStorage.test.ts` — **new**, unit tests.
5. `src/hooks/__tests__/useRequesterName.test.ts` — **new**, hook tests.
6. `src/__tests__/SearchView.test.tsx` — extended (or new
   `RequesterName.test.tsx`) for App-level integration coverage.
7. `tests/e2e/request.spec.ts` — additional persistence test (existing test
   unchanged).
8. (Optional) `src/index.css` — small `.link-button` style if not already
   present.

## Related Issues and Tasks

### Depends On

- None — purely additive.

### Blocks

- None.

### Related

- #035 (Vitest setup for `localStorage` in jsdom) — confirms the test
  infrastructure already supports this work.

### Enables

- Future persistence of other lightweight UI preferences (preferred request
  type, theme, etc.) using the same `safeStorage` pattern.

## References

- [GitHub Issue #110](https://github.com/denhamparry/djrequests/issues/110)
- `CLAUDE.md` → "Vitest on Node 22+" (jsdom localStorage notes)
- `src/hooks/useSongSearch.ts` (reference hook pattern)

## Notes

### Key Insights

- The issue calls the entry point a "request modal" but the current UI
  collects the name via a top-of-page input, not a modal. The plan persists
  the value of that input — same UX outcome, simpler implementation.
- The current form does not collect `contact` from the user, so storing
  contact is moot. Sticking to `name` matches the implementation surface
  and the issue's "PII scope" guidance.
- A JSON-shaped payload (`{ name: string }`) is forward-compatible: future
  fields can be added without a storage-key migration.

### Alternative Approaches Considered

1. **Save on every keystroke** — simpler but persists abandoned half-typed
   names and creates surprise on shared devices. ❌
2. **Cookie-based persistence** — sent on every Netlify Function request
   unnecessarily; `localStorage` is the right primitive. ❌
3. **In-page modal for "Welcome back, X. Not you?"** — heavier UX for
   little gain; an inline "Not you? Clear" button is sufficient. ❌
4. **Inline `localStorage.getItem` in `App.tsx` without a helper** —
   harder to test, scatters error handling. ❌
5. **Helper + hook split with save-on-success and inline clear button** —
   chosen. ✅

### Best Practices

- Probe-write inside `safeStorage()` surfaces locked-down storage at read
  time, avoiding deferred throws in callers.
- Lazy `useState` initialiser keeps the storage read off the render path.
- All `try`/`catch` blocks degrade silently — `localStorage` is a
  best-effort convenience layer, never load-bearing.
