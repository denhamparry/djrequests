# GitHub Issue #111: Consider sessionStorage (or explicit TTL) for requester name

**Issue:** [#111](https://github.com/denhamparry/djrequests/issues/111)
**Status:** Reviewed (Approved) **Date:** 2026-04-17

## Problem Statement

Issue #110 landed persistence of the requester's name in `localStorage` so
repeat guests don't re-enter it across reloads. `localStorage` persists
indefinitely — a deliberate MVP choice — but creates two practical issues on
shared/kiosk devices:

- A guest at an event two months ago still has their name pre-filled today.
- Shared-device users must actively click "Not you? Clear" to reset.

### Current Behavior

- `src/lib/requesterStorage.ts` writes `{ name }` to `localStorage` with no
  expiry. `loadRequesterName` returns the stored name forever until cleared.
- `src/hooks/useRequesterName.ts` reads the stored name on mount and pre-fills
  the "Your name" input.

### Expected Behavior

- The stored name expires after a configurable TTL (default: **12 hours**),
  covering a single event evening without retaining the name long-term.
- An expired entry is treated as "no stored name" and silently removed from
  storage on read.
- All existing behaviour (graceful fallback, length cap, trim, malformed JSON
  handling) is preserved.

## Current State Analysis

### Relevant Code/Config

- **`src/lib/requesterStorage.ts`** — stored payload shape is
  `StoredRequester = { name: string }`. The helper module is the only writer
  and the only reader of `localStorage` for this key.
- **`src/lib/__tests__/requesterStorage.test.ts`** — covers load/save/clear,
  malformed JSON, length cap, quota-exceeded, and graceful fallback when
  `localStorage` is unavailable. This is the test file to extend.
- **`src/hooks/useRequesterName.ts`** — thin bridge from helper to React
  state. No changes needed here; the hook consumes whatever `loadRequesterName`
  returns.
- **`src/App.tsx`** — calls `persist(name)` on successful submission and
  clears via the hook's `clear()` callback. No changes needed.

### Related Context

- `STORAGE_KEY = 'djrequests:requester'` is the single key in use.
  Re-using the same key with an expanded payload shape is safe because
  `loadRequesterName` already returns `null` for any malformed / unexpected
  payload, so pre-existing entries from #110 will be silently discarded on
  first read after upgrade — acceptable one-time re-entry.
- No server-side persistence: `localStorage` is the only state carrier, so
  adding TTL logic here covers the whole feature.

## Solution Design

### Approach

Extend the stored payload from `{ name }` to `{ name, savedAt }` where
`savedAt` is a Unix millisecond timestamp. On read, compare `Date.now() -
savedAt` against a module-level constant `TTL_MS` (default 12 hours). If the
entry is expired, return `null` and remove it from storage as a housekeeping
side-effect.

**Rationale:**

- **TTL over sessionStorage:** A party evening routinely involves locked
  phones, app-switches, and tab closures on iOS Safari (which aggressively
  evicts background tabs). `sessionStorage` would reset at unpredictable
  moments mid-event. 12 hours comfortably covers one evening while preventing
  indefinite retention.
- **Single constant, no config surface:** Exporting `TTL_MS` keeps the
  module API minimal and avoids premature configurability. Tests can import
  the constant directly instead of hard-coding a duration.
- **Silent housekeeping on expiry:** Removing the expired entry on read
  prevents the stored blob from lingering on shared devices longer than the
  TTL even if the user never visits again.

### Implementation

- Add `TTL_MS` constant (`12 * 60 * 60 * 1000` = 43_200_000).
- Change `StoredRequester` to `{ name: string; savedAt: number }`.
- `saveRequesterName` writes `{ name: trimmed, savedAt: Date.now() }`.
- `loadRequesterName`:
  - Parse JSON as today.
  - Validate `name` (existing checks) AND validate `savedAt` is a finite
    number.
  - If `Date.now() - savedAt > TTL_MS`, call `storage.removeItem(STORAGE_KEY)`
    inside a try/catch and return `null`.
  - Otherwise return `parsed.name`.
- Tests use `vi.useFakeTimers()` / `vi.setSystemTime()` to exercise the
  boundary without introducing real-time delays.

### Benefits

- Bounded PII retention on shared devices.
- No user-visible change for the common case (same evening).
- Keeps existing helper API (`loadRequesterName`, `saveRequesterName`,
  `clearRequesterName`) unchanged; only the stored shape evolves.

## Implementation Plan

### Step 1: Add TTL logic to the storage helper

**File:** `src/lib/requesterStorage.ts`

**Changes:**

- Export `TTL_MS` as `12 * 60 * 60 * 1000`.
- Update `StoredRequester` type to `{ name: string; savedAt: number }`.
- `saveRequesterName`: include `savedAt: Date.now()` in the payload.
- `loadRequesterName`: after existing validation, reject entries where
  `typeof parsed.savedAt !== 'number'` or `!Number.isFinite(parsed.savedAt)`,
  and expire entries where the age exceeds `TTL_MS` (removing them from
  storage).

**Testing:**

```bash
npm run test:unit -- src/lib/__tests__/requesterStorage.test.ts
```

### Step 2: Extend storage tests for TTL behaviour

**File:** `src/lib/__tests__/requesterStorage.test.ts`

**Changes:**

- Add a `describe('TTL')` block using `vi.useFakeTimers()`.
- Tests:
  - Returns name when age < TTL.
  - Returns null and removes the entry when age > TTL.
  - Returns null when `savedAt` is missing (legacy payload from #110).
  - Returns null when `savedAt` is not a finite number (string, NaN, Infinity).
  - `saveRequesterName` writes a `savedAt` timestamp equal to `Date.now()` at
    call time.
- Ensure `vi.useRealTimers()` is restored in `afterEach` so unrelated tests
  are unaffected.

**Testing:**

```bash
npm run test:unit
```

### Step 3: Verify hook and integration tests still pass

**Files:** `src/hooks/__tests__/useRequesterName.test.tsx`,
`src/__tests__/SearchView.test.tsx`

**Changes:**

- No production changes to these files expected.
- Existing tests that seed `localStorage` directly with
  `JSON.stringify({ name: 'Avery' })` will now resolve to `null` on load
  (missing `savedAt` → rejected). These seeds must be updated to include
  `savedAt: Date.now()` so the pre-existing assertions still exercise the
  pre-fill path.

**Testing:**

```bash
npm run test:unit
```

### Step 4: Playwright smoke test — no change expected

**File:** `tests/e2e/request.spec.ts`

**Changes:**

- Walk through the file to confirm no direct `localStorage.setItem` seed
  exists with the old shape. If the smoke test relies on fresh state (it
  should), nothing to update.

**Testing:**

```bash
npm run test:e2e
```

## Testing Strategy

### Unit Testing

- **TTL boundary:** with `vi.setSystemTime(baseTime)`, save a name, advance by
  `TTL_MS - 1`, assert `loadRequesterName()` returns the name. Advance by
  `TTL_MS + 1` from `baseTime`, assert it returns `null` and that
  `localStorage.getItem(STORAGE_KEY)` is now `null`.
- **Legacy payload:** seed `{ name: 'Avery' }` (no `savedAt`), assert
  `loadRequesterName()` returns `null`.
- **Malformed `savedAt`:** seed `{ name: 'Avery', savedAt: 'yesterday' }`,
  assert `null`.

### Integration Testing

**Test Case 1: Same-evening re-fill still works**

1. Open app, type "Avery", submit a request.
2. Reload page.
3. Expect "Your name" pre-filled with "Avery".

**Test Case 2: Expired entry is discarded**

1. Seed storage with a name saved 13 hours ago (via test helper).
2. Open app.
3. Expect "Your name" to be empty and storage to be cleared.

### Regression Testing

- All existing test cases in `requesterStorage.test.ts` still pass (trim,
  length cap, malformed JSON, graceful fallback, clear).
- `useRequesterName` hook behaviour unchanged once seed payloads are updated
  to include `savedAt`.
- Playwright smoke (`tests/e2e/request.spec.ts`) unaffected.

## Success Criteria

- [ ] `TTL_MS` exported and applied in `loadRequesterName`.
- [ ] `saveRequesterName` writes a `savedAt` timestamp.
- [ ] Expired entries return `null` and are removed from storage on read.
- [ ] Tests cover boundary, legacy payload, and malformed `savedAt` cases.
- [ ] Existing unit and e2e tests still pass.
- [ ] No public API change (function signatures stable).

## Files Modified

1. `src/lib/requesterStorage.ts` — add TTL, change payload shape.
2. `src/lib/__tests__/requesterStorage.test.ts` — TTL test coverage.
3. `src/hooks/__tests__/useRequesterName.test.tsx` — update seed payloads to
   include `savedAt`.
4. `src/__tests__/SearchView.test.tsx` — no seed updates needed (verified
   during review: no direct `STORAGE_KEY` seed in the file).

## Related Issues and Tasks

### Depends On

- #110 — introduced the persistence this plan evolves.

### Related

- #110 code review (where this enhancement was flagged).

## References

- [GitHub Issue #111](https://github.com/denhamparry/djrequests/issues/111)
- [GitHub Issue #110](https://github.com/denhamparry/djrequests/issues/110)
- `src/lib/requesterStorage.ts`

## Notes

### Key Insights

- Re-using the same storage key with an expanded payload is safe because
  `loadRequesterName` already treats malformed shapes as "no stored value"
  and returns `null`. Pre-existing #110 entries require one re-entry after
  upgrade — acceptable for an MVP.
- TTL housekeeping on read (not on a timer) keeps the module pure and
  avoids background work; the cost is one extra `removeItem` per expired
  load, which is negligible.

### Alternative Approaches Considered

1. **`sessionStorage`** ❌ — resets on tab close. iOS Safari evicts
   background tabs aggressively, which would interrupt a guest mid-evening.
2. **Configurable TTL via env var** ❌ — premature; one constant is enough
   for the MVP. Can be promoted later if needed.
3. **Chosen: `localStorage` + 12h TTL** ✅ — preserves the "one evening"
   UX, caps PII retention, minimal code change.

### Best Practices

- Validate every field on read; never trust previously-written shapes,
  since the writer may be from an older app version.
- Use fake timers in tests for any time-based logic to keep tests
  deterministic and fast.

## Review Summary

**Reviewed:** 2026-04-17
**Overall Assessment:** Approved

### Scope and Correctness

- TTL approach correctly targets the issue's concern (indefinite PII
  retention on shared devices) while preserving the single-evening UX.
- Storage-on-read expiry is the right call — avoids background work and
  keeps the module pure.
- Re-use of `STORAGE_KEY` with an expanded payload is safe because
  `loadRequesterName` already treats malformed shapes as null. Pre-existing
  #110 entries require one re-entry post-upgrade — called out and acceptable.

### Test Coverage

- Existing seed payloads at `useRequesterName.test.tsx:26-29` and `:64-67`
  use the legacy `{ name }` shape and will need `savedAt` added — plan
  correctly identifies this.
- Verified `SearchView.test.tsx` has no direct `STORAGE_KEY` seed, so no
  changes are required there. Plan's Files Modified has been updated to
  reflect this.
- Boundary testing via `vi.setSystemTime` is the right approach; no
  real-time delays introduced.

### Minor Notes (non-blocking)

- Clock-skew consideration: a user who rolls their system clock backward
  could extend the TTL indefinitely. Negligible attack surface for this
  app — no action needed.
- If a future plan wants a shorter TTL (e.g. 6h for heavy shared-device
  scenarios), exporting `TTL_MS` as done here makes that trivial.

### Outcome

Approved for implementation. Proceed to `/workflow-action-plan`.
