# GitHub Issue #113: Make useRequesterName.persist reflect actual storage success

**Issue:** [#113](https://github.com/denhamparry/djrequests/issues/113)
**Status:** Reviewed (Approved) **Date:** 2026-04-17

## Problem Statement

`useRequesterName.persist()` calls `saveRequesterName()` then unconditionally
sets `persistedName` to the trimmed value. `saveRequesterName()` silently
swallows storage errors (quota exceeded, SecurityError raised after an initial
successful probe) and returns `void`, so the hook cannot distinguish a
successful write from a silent failure. The UI ends up claiming the name is
persisted when in reality nothing was written, producing a visible divergence
on the next reload: the "Not you? Clear" button disappears because
`loadRequesterName()` returns `null` from empty storage. The same latent
issue affects `clearRequesterName()` — a failed `removeItem` leaves the
persisted value in place while the UI shows it cleared.

### Current Behavior

- `src/lib/requesterStorage.ts`:
  - `saveRequesterName(name: string): void` — returns nothing; swallows all
    `setItem` throws silently.
  - `clearRequesterName(): void` — returns nothing; swallows all `removeItem`
    throws silently.
- `src/hooks/useRequesterName.ts`:
  - `persist(value)` writes then **unconditionally** sets
    `persistedName = trimmed`.
  - `clear()` calls `clearRequesterName()` then **unconditionally** sets
    `persistedName = null` and `name = ''`.

### Expected Behavior

- `saveRequesterName` returns `true` when the trimmed name is confirmed
  written to storage, `false` otherwise (invalid input, probe failure,
  `setItem` throw).
- `clearRequesterName` returns `true` when the post-call state is "nothing
  persisted under the key" (either successful `removeItem`, or probe failure
  which implies nothing was ever persisted via this module), `false` when
  `removeItem` throws.
- `useRequesterName.persist()` only updates `persistedName` when
  `saveRequesterName` returns `true`. On failure, the hook leaves
  `persistedName` unchanged so the UI does not advertise persistence that
  didn't happen.
- `useRequesterName.clear()` always clears the in-memory `name` (the user's
  intent is obvious), but only sets `persistedName = null` when
  `clearRequesterName` returns `true`. On failure, `persistedName` stays at
  its current value — honest about the fact that a reload would re-surface it.
- No changes to caller API shape: `persist` and `clear` remain `void`-returning
  callbacks. The issue is about internal state correctness, not about
  surfacing errors to the UI.

## Current State Analysis

### Relevant Code/Config

- **`src/lib/requesterStorage.ts`** — the module under change. Three exported
  mutation helpers: `saveRequesterName`, `clearRequesterName`, and the
  read-only `loadRequesterName`. `loadRequesterName` already has its own
  housekeeping `removeItem` inside the TTL branch; that inner call is
  best-effort and does not need to change (the load function's contract is
  "return the stored name or null" — the caller treats both paths the same).
- **`src/hooks/useRequesterName.ts`** — thin bridge from helper to React
  state. `persist` and `clear` are the two call sites that need the new
  conditional-update logic.
- **`src/lib/__tests__/requesterStorage.test.ts`** — existing coverage for
  happy-path save/clear, graceful fallback when `localStorage` is unavailable,
  quota-exceeded, length cap, malformed JSON. The "silently swallows
  `setItem` throwing" test becomes "returns `false` when `setItem` throws".
- **`src/hooks/__tests__/useRequesterName.test.tsx`** — existing coverage for
  `persist` success path. New cases: `persist` does not update `persistedName`
  when storage fails; `clear` does not null `persistedName` when
  `removeItem` fails.
- **`src/App.tsx:208`** — only external caller of `persist`. No changes
  needed; keeps calling with `persistRequesterName(trimmedName)`.

### Related Context

- Issue #112's post-PR review flagged this as a latent UI/storage divergence
  (low-probability path because the value is small, but behaviour is
  nonetheless incorrect).
- Issue #111 added TTL expiry and already uses `savedAt`-stamped payloads.
  Nothing in this change affects payload shape or TTL behaviour.
- The module keeps a cached `probedStorage` sentinel (see `safeStorage()`) so
  a single failed probe short-circuits all subsequent calls with `null`.
  That means a probe-level failure classes all three mutation helpers as
  "no storage at all" — different from a post-probe `setItem` quota throw.
  Both paths must return `false` from `saveRequesterName`.

## Solution Design

### Approach

Flip the two mutation helpers' return types from `void` to `boolean`, where
`true` means "the post-call state is the one the caller asked for". In the
hook, gate the `setPersistedName` calls on the returned boolean. Keep the
public hook API (`persist: (value: string) => void`,
`clear: () => void`) unchanged.

Return-value semantics, precisely:

| Function                                     | Returns `true` when | Returns `false` when                                             |
| -------------------------------------------- | ------------------- | ---------------------------------------------------------------- |
| `saveRequesterName(name)`                    | `setItem` succeeded | trimmed name empty / too long, `safeStorage()` is `null`, or `setItem` threw |
| `clearRequesterName()`                       | `removeItem` succeeded OR `safeStorage()` is `null` (nothing was ever persisted via this module) | `removeItem` threw                                               |

The asymmetry on the "no storage" branch is deliberate:

- For `save`, "no storage → return `false`" is honest: the caller's intent
  ("persist this name") was not achieved.
- For `clear`, "no storage → return `true`" is honest: the caller's intent
  ("nothing should be persisted under this key") is already satisfied because
  the module has no storage to write to in the first place. Returning `false`
  here would cause the hook to leave `persistedName` at whatever value it had
  — but in the no-storage branch that value is already `null` (since
  `loadRequesterName` returns `null`), so either return value would produce
  correct hook behaviour. Returning `true` is cleaner because it correctly
  describes the invariant.

### Rationale

- **Boolean, not richer error object:** The issue specifies a `boolean`.
  Callers do not need to distinguish "no storage" from "quota exceeded" —
  the UI response is identical (do not advertise persistence). A boolean
  keeps the surface minimal and matches `issue #113` wording exactly.
- **Do not touch `loadRequesterName`:** Its contract is unchanged and its
  inner housekeeping `removeItem` is best-effort, not a user-driven mutation.
- **Keep hook callbacks `void`:** `persist` and `clear` are called from
  submission/click handlers that don't render based on the result. Making
  them return booleans would force ripple changes in `App.tsx` with no
  user-visible benefit.
- **Do not clear `name` on failed `clear`:** Actually, we **do** clear `name`
  — the user's intent to clear the in-memory input is unconditional and does
  not depend on storage. Only `persistedName` (which reflects "is there a
  persisted value?") is gated on the storage outcome.
- **Do not introduce retry logic:** The issue is explicit that this is a
  low-probability path. Retries in React state updates invite complex
  re-entry bugs; the correct behaviour is to honestly not claim success.

### Alternatives Considered

- **Throw on storage error, catch in hook:** Rejected. The existing
  "graceful fallback" philosophy of the module is that storage absence is a
  normal operating condition, not exceptional. Throwing would force every
  caller to wrap in try/catch; a boolean is lighter and more local.
- **Return an error object (`{ ok: true } | { ok: false, reason }`):**
  Rejected as over-engineering; no caller distinguishes reasons.
- **Surface failure to the UI (toast, error banner):** Rejected for scope.
  The issue is about internal correctness — the hook no longer lying about
  success. Actively telling the user "your name wasn't saved" is a separate
  product decision outside this issue's scope.

### Files to Modify

1. **`src/lib/requesterStorage.ts`**
   - Change `saveRequesterName` signature to `(name: string) => boolean`.
   - Return `false` early for invalid input (empty trim, length cap, no
     storage).
   - Return `true` after successful `setItem`, `false` in the catch.
   - Change `clearRequesterName` signature to `() => boolean`.
   - Return `true` when `safeStorage()` is `null` (nothing to clear);
     `true` after successful `removeItem`; `false` in the catch.

2. **`src/hooks/useRequesterName.ts`**
   - In `persist`: capture `saveRequesterName(trimmed)` into a `const`;
     only call `setPersistedName(trimmed)` when it returns `true`.
   - In `clear`: capture `clearRequesterName()` into a `const`; always call
     `setName('')`; only call `setPersistedName(null)` when it returns
     `true`.

3. **`src/lib/__tests__/requesterStorage.test.ts`**
   - Update the existing "silently swallows setItem throwing" test to also
     assert the return value is `false`.
   - Add a case: `saveRequesterName` returns `true` on the happy path.
   - Add a case: `saveRequesterName` returns `false` for empty/whitespace/too-long
     input.
   - Add a case: `saveRequesterName` returns `false` when `safeStorage()` is
     `null`.
   - Add a case: `clearRequesterName` returns `true` after successful removal.
   - Add a case: `clearRequesterName` returns `true` when storage is
     unavailable (probe failure).
   - Add a case: `clearRequesterName` returns `false` when `removeItem`
     throws.

4. **`src/hooks/__tests__/useRequesterName.test.tsx`**
   - Add a case: when `localStorage.setItem` throws, `persist` leaves
     `persistedName` at its prior value (`null` on fresh mount).
   - Add a case: when `localStorage.removeItem` throws, `clear` empties
     `name` but leaves `persistedName` at its prior value (the previously
     stored name).

## Implementation Plan

### Task 1 — Update storage helpers to return boolean

- **File:** `src/lib/requesterStorage.ts`
- Change `saveRequesterName` body:
  - Invalid input (empty / too long) → `return false`.
  - `safeStorage()` is `null` → `return false`.
  - `setItem` succeeded → `return true` (after the `setItem` call, still
    inside the `try`).
  - `catch` block → `return false`.
- Change `clearRequesterName` body:
  - `safeStorage()` is `null` → `return true` (nothing persisted).
  - `removeItem` succeeded → `return true`.
  - `catch` block → `return false`.
- Export signatures updated to `(name: string) => boolean` and `() => boolean`.

### Task 2 — Gate hook state updates on storage success

- **File:** `src/hooks/useRequesterName.ts`
- In `persist`:

  ```typescript
  const persist = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return;
    if (saveRequesterName(trimmed)) {
      setPersistedName(trimmed);
    }
  }, []);
  ```

- In `clear`:

  ```typescript
  const clear = useCallback(() => {
    const cleared = clearRequesterName();
    setName('');
    if (cleared) {
      setPersistedName(null);
    }
  }, []);
  ```

### Task 3 — Extend storage helper tests

- **File:** `src/lib/__tests__/requesterStorage.test.ts`
- Update existing `'silently swallows setItem throwing (quota exceeded, etc.)'`
  test: rename to describe the new contract (returns `false`) and assert the
  return value.
- New tests (names indicative):
  - `'returns true after successful write'`
  - `'returns false for empty / whitespace / over-cap input'`
  - `'returns false when localStorage is unavailable (probe throws)'`
  - `'clearRequesterName returns true after successful removal'`
  - `'clearRequesterName returns true when storage is unavailable'`
  - `'clearRequesterName returns false when removeItem throws'`

### Task 4 — Extend hook tests

- **File:** `src/hooks/__tests__/useRequesterName.test.tsx`
- New test: `'persist does not update persistedName when setItem throws'`.
  Mount hook, stub `window.localStorage.setItem` to throw, call
  `result.current.persist('Avery')`, assert `result.current.persistedName`
  is still `null` and `result.current.name` is unchanged from `setName`
  behaviour (note: `persist` doesn't drive `name` anyway).
- New test: `'clear empties name but keeps persistedName when removeItem
  throws'`. Pre-seed `localStorage` with a valid entry, mount hook (so
  `persistedName === 'Avery'`), stub `removeItem` to throw, call
  `result.current.clear()`, assert `result.current.name === ''` and
  `result.current.persistedName === 'Avery'`.

### Task 5 — Run the full test suite and pre-commit

- `npm run test:unit` — expect all previously-passing tests still pass plus
  the new assertions.
- `npm run lint` — no new violations.
- `npm run build` — TypeScript strict-mode signature changes must compile
  cleanly across the app (`App.tsx` uses the hook's `void` callbacks, so
  no call-site changes are needed, but the build validates that).
- `pre-commit run --all-files` (via `scripts/pre-commit-check.sh` if
  present) — full hook suite.

## Testing Strategy

### Unit Testing

- Storage helpers: pure functions with explicit return values, trivial to
  assert in isolation. No MSW needed — `localStorage` is either used
  directly or stubbed per test via `Object.defineProperty` (for probe
  failure) or direct assignment (for post-probe `setItem` / `removeItem`
  throws).
- Hook: use `renderHook` + `act` from `@testing-library/react`. Stub
  `window.localStorage.setItem` / `removeItem` per test with a
  `try { ... } finally { restore }` pattern to avoid cross-test leak — same
  pattern already used in `requesterStorage.test.ts`.

### Integration Testing

- Not applicable. `App.tsx` only observes `persistedName` for the
  conditional render of the "Not you? Clear" button. The existing Playwright
  smoke (`tests/e2e/request.spec.ts`) exercises the happy path which is
  unchanged; we do not need a new E2E case for the quota-exceeded branch
  (not representative of real-browser behaviour without contrived setup).

### Acceptance Criteria

- `saveRequesterName` returns `boolean`; unit tests cover all five branches
  (happy, empty, over-cap, no-storage, setItem-throws).
- `clearRequesterName` returns `boolean`; unit tests cover all three
  branches (happy, no-storage, removeItem-throws).
- `useRequesterName.persist` does not advertise persistence on storage
  failure (new hook test).
- `useRequesterName.clear` does not claim persisted-state cleared on
  removal failure (new hook test).
- `App.tsx` unchanged; app builds and lints clean.
- All existing tests still pass.

## Risk Assessment

- **TypeScript signature change (`void` → `boolean`):** Callers that
  previously assigned the return value or passed it to another function
  would break. `App.tsx` calls `persistRequesterName(trimmedName)` as a
  statement-expression; no other callers exist. `strict` mode's
  `noImplicitReturns` does not object to unused boolean returns. Low risk.
- **Hook return shape unchanged:** `persist` and `clear` stay
  `(...) => void`. No ripple through `App.tsx`.
- **Test reliance on internal probe cache:** Tests already use
  `__resetStorageProbeForTests()` — new tests follow the same pattern.
- **Payload shape unchanged:** No migration concern.

## Files Modified

- `src/lib/requesterStorage.ts` — change two function signatures and bodies.
- `src/hooks/useRequesterName.ts` — gate two `setPersistedName` calls on
  returned boolean.
- `src/lib/__tests__/requesterStorage.test.ts` — update one test, add six.
- `src/hooks/__tests__/useRequesterName.test.tsx` — add two tests.
- `docs/plan/issues/113_persist_reflects_storage_success.md` — this plan.

## Dependencies

None. Purely internal refactor.

## Rollback Plan

`git revert` the feature commit. No schema, storage-format, or external-API
changes.

## Review Summary (2026-04-17)

**Overall Assessment:** Approved — no blocking items.

**Non-blocking suggestions folded into implementation:**

1. Scenario (c) "preloaded name + clear succeeds" is already covered by the
   existing test at `src/hooks/__tests__/useRequesterName.test.tsx:63` — no
   new test needed, noted for reviewer orientation.
2. Add a one-line comment in `clearRequesterName` explaining why the
   no-storage branch returns `true` (nothing was ever persisted via this
   module, so the caller's post-condition is trivially satisfied).
3. Rename the existing `'silently swallows setItem throwing'` test to
   `'returns false when setItem throws (quota exceeded, etc.)'` and assert
   the return value is `false`.
4. Keep the module's "explain why we swallow" comment convention in catch
   blocks — replace `/* silent fallback */` with a short reason like
   `/* storage write failed */` rather than deleting the comment.
5. Ensure the new hook tests rely on the existing
   `__resetStorageProbeForTests()` in `beforeEach` to avoid probe-cache
   contamination across the "setItem throws" test and its neighbours.

No other consumers of these helpers in `App.tsx`, the E2E test, or
`SearchView.test.tsx` depend on the `void` return type — the signature
change is safe. Ready for implementation.
