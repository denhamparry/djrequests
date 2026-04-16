# GitHub Issue #32: Harden request.ts — validate payload shape and rate-limit submissions

**Issue:** [#32](https://github.com/denhamparry/djrequests/issues/32)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

`netlify/functions/request.ts` is the public write surface for the app but has
two hardening gaps:

### Current Behavior

- **No payload shape validation.** Only `payload.song` truthiness is checked.
  Missing `song.id`/`song.title`/`song.artist` or a missing
  `requester.name` still results in a successful submission with empty Google
  Form entries, which pollutes the Google Sheet and Doc queue.
- **No submission throttling.** A guest holding the submit button (or a
  malicious client bypassing the UI) can flood the Google Sheet / Doc. The
  client disables the button only while `requestingSongId === song.id`
  (`src/App.tsx:115`), which does not prevent rapid sequential requests for
  different songs or direct API calls.

### Expected Behavior

- Garbage/partial payloads are rejected with `400` and a clear error.
- Rapid submissions from the same IP are rejected with `429` and a
  `Retry-After` header after a reasonable burst (issue suggests 5/minute).
- Client-side submit button stays disabled for a short cooldown after a
  successful/failed submission to avoid accidental double-taps.

## Current State Analysis

### Relevant Code

- `netlify/functions/request.ts:73-153` — request handler. Only validates
  method, body present, JSON parseable, and `payload.song` truthy.
- `netlify/functions/__tests__/request.test.ts` — existing tests for method,
  missing-song, happy path, CORS, Google Form failure.
- `src/App.tsx:14-39` — `handleRequest`. Disables button only per-song while
  in-flight.
- `shared/formFields.ts` — form field IDs the function populates.
- `netlify/functions/_cors.ts` — CORS helper.

### Constraints

- **No new runtime dependencies desired.** Package.json lists only React
  runtime deps; adding `zod` here adds bundle weight to a serverless function
  that currently ships zero deps. Hand-rolled guards are preferred.
- **Netlify functions are stateless and per-region.** An in-memory Map works
  for a single-region deployment but does not share state across cold starts
  or instances. This is acceptable for the threat model (casual guest flood,
  not a determined attacker) — but must be documented.
- **Client IP source.** Netlify sets `x-forwarded-for` (comma-separated list;
  left-most entry is the original client). `event.headers` keys are
  lowercased.

## Solution Design

### Approach

1. Add a hand-rolled validator for `{ song, requester }` that returns a
   normalised payload on success or a descriptive 400 error on failure.
2. Add an in-memory sliding-window rate limiter keyed by client IP. Default:
   5 submissions / 60s window. Return `429` with `Retry-After` (seconds) when
   exceeded.
3. Extend the client `submitting` state to briefly cooldown the row button
   after any submission (success or error) to prevent accidental doubles.

### Rationale / Trade-offs

- Hand-rolled validator keeps the function dependency-free and easy to audit.
  The shape is small enough that zod would be overkill.
- An in-memory limiter is imperfect (not shared across instances / cold
  starts) but matches the issue's guidance and is a meaningful brake on
  casual floods. We document the limitation in code and the plan.
- The limiter runs **before** validation so that a flood of malformed
  requests cannot exhaust Google Form quota via the validation path — but
  after the method/body checks (cheap filters first for simple misuse).

### Implementation

#### New module: `netlify/functions/_validate.ts`

```ts
export type ValidatedSong = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
};

export type ValidatedRequester = {
  name: string;
  dedication: string | null;
  contact: string | null;
};

export type ValidatedRequest = {
  song: ValidatedSong;
  requester: ValidatedRequester;
};

export type ValidationResult =
  | { ok: true; value: ValidatedRequest }
  | { ok: false; error: string };

const MAX_STRING = 500;

const requireString = (value: unknown, field: string): string | { error: string } => {
  if (typeof value !== 'string') return { error: `${field} is required` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required` };
  if (trimmed.length > MAX_STRING) return { error: `${field} is too long` };
  return trimmed;
};

const optionalString = (value: unknown, field: string): string | null | { error: string } => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  if (value.length > MAX_STRING) return { error: `${field} is too long` };
  return value.trim() || null;
};

export const validateRequestBody = (raw: unknown): ValidationResult => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Request body must be an object' };
  }
  const body = raw as Record<string, unknown>;
  const song = body.song as Record<string, unknown> | undefined;
  const requester = (body.requester ?? {}) as Record<string, unknown>;

  if (!song || typeof song !== 'object') {
    return { ok: false, error: 'Song information is required' };
  }

  const id = requireString(song.id, 'song.id');
  if (typeof id === 'object') return { ok: false, error: id.error };
  const title = requireString(song.title, 'song.title');
  if (typeof title === 'object') return { ok: false, error: title.error };
  const artist = requireString(song.artist, 'song.artist');
  if (typeof artist === 'object') return { ok: false, error: artist.error };

  const album = optionalString(song.album, 'song.album');
  if (album && typeof album === 'object') return { ok: false, error: album.error };
  const artworkUrl = optionalString(song.artworkUrl, 'song.artworkUrl');
  if (artworkUrl && typeof artworkUrl === 'object') return { ok: false, error: artworkUrl.error };
  const previewUrl = optionalString(song.previewUrl, 'song.previewUrl');
  if (previewUrl && typeof previewUrl === 'object') return { ok: false, error: previewUrl.error };

  const name = requireString(requester.name, 'requester.name');
  if (typeof name === 'object') return { ok: false, error: name.error };
  const dedication = optionalString(requester.dedication, 'requester.dedication');
  if (dedication && typeof dedication === 'object') return { ok: false, error: dedication.error };
  const contact = optionalString(requester.contact, 'requester.contact');
  if (contact && typeof contact === 'object') return { ok: false, error: contact.error };

  return {
    ok: true,
    value: {
      song: {
        id,
        title,
        artist,
        album: album as string | null,
        artworkUrl: artworkUrl as string | null,
        previewUrl: previewUrl as string | null
      },
      requester: {
        name,
        dedication: dedication as string | null,
        contact: contact as string | null
      }
    }
  };
};
```

#### New module: `netlify/functions/_rateLimit.ts`

```ts
// In-memory sliding-window rate limiter.
// Limitation: per-instance state only — not shared across Netlify function
// instances or cold starts. Adequate for casual flood protection only.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export const checkRateLimit = (
  key: string,
  now: number = Date.now()
): RateLimitResult => {
  const windowStart = now - WINDOW_MS;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS) {
    const retryAfterMs = existing[0] + WINDOW_MS - now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  existing.push(now);
  hits.set(key, existing);
  return { allowed: true };
};

export const resetRateLimit = () => hits.clear();

export const resolveClientKey = (headers: Record<string, string | undefined>): string => {
  const forwarded = headers['x-forwarded-for'] ?? headers['X-Forwarded-For'];
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers['client-ip'] ?? 'unknown';
};
```

#### Wire into `request.ts`

- After method + body checks, compute `clientKey = resolveClientKey(event.headers)`.
- Call `checkRateLimit(clientKey)` — if not allowed, return
  `429` with `Retry-After` header and JSON error.
- Replace the current `if (!payload.song)` block with `validateRequestBody`;
  on failure return `400` with the validator's error.
- Use the validator's normalised `value` to populate form fields.

#### Client: `src/App.tsx`

Add a short (e.g. 3s) cooldown after a submission completes. Implementation:
keep `requestingSongId` set until a `setTimeout` clears it. Keep the existing
success/error feedback.

## Implementation Plan

### Step 1: Add validator module + tests

**Files:**

- `netlify/functions/_validate.ts` (new)
- `netlify/functions/__tests__/_validate.test.ts` (new)

**Tests:**

- missing `song` → error
- missing `song.id` / `song.title` / `song.artist` → error each
- missing `requester.name` → error
- non-string types → error
- over-length (>500 chars) → error
- valid minimal payload (required only) → `ok: true` with nulls for optional
- valid full payload → `ok: true` with all fields

### Step 2: Add rate limiter module + tests

**Files:**

- `netlify/functions/_rateLimit.ts` (new)
- `netlify/functions/__tests__/_rateLimit.test.ts` (new)

**Tests:**

- 5 requests allowed in same window
- 6th request blocked, returns `retryAfterSeconds >= 1`
- Request outside window resets count
- `resolveClientKey` parses `x-forwarded-for`, takes left-most, falls back

### Step 3: Wire into request handler + tests

**Files:**

- `netlify/functions/request.ts`
- `netlify/functions/__tests__/request.test.ts`

**Changes:**

- Import validator + rate limiter.
- Call `resetRateLimit()` in existing `beforeEach` test hook.
- Add rate limit check and validation branch with appropriate status codes.

**New/updated tests:**

- Existing "missing song payload" test still asserts 400 via new validator error.
- Add: missing `song.id` returns 400.
- Add: missing `requester.name` returns 400.
- Add: 6th rapid submission from same IP is rejected with 429 and
  `Retry-After` header.
- Update happy-path payloads to include `requester.name` (required).

### Step 4: Client cooldown

**Files:**

- `src/App.tsx`
- `src/__tests__/App.test.tsx` (if exists; otherwise skip — no existing App
  unit test)

**Changes:**

- After `submitSongRequest` resolves/rejects, keep button disabled for ~3s
  via `setTimeout`.
- Clear timer on unmount.

## Testing Strategy

### Unit Testing (Vitest)

- New `_validate.test.ts` covers validator cases above.
- New `_rateLimit.test.ts` covers limiter windowing and IP extraction.
- `request.test.ts` extended for 400/429 paths.

### Regression Testing

- Existing happy path still passes with `requester.name` supplied.
- CORS header tests still pass.
- 502 on Google Form failure still passes.

### Manual / E2E

- Playwright smoke (`tests/e2e/request.spec.ts`) should still succeed
  provided the UI supplies `requester.name` (or we keep requester optional
  until UI collects it — see **Open Question** below).

## Open Question (flag during research review)

The current UI (`src/App.tsx`) **does not collect requester name** — it only
sends `song`. If we make `requester.name` strictly required at the backend,
the current UI submission will start failing with 400. Options:

1. Keep `requester.name` **optional** (fall back to `'Anonymous'` when
   missing) — matches current behaviour, issue wording "Required:
   `requester.name`" may be aspirational.
2. Update the UI to collect requester name before making it required.

**Recommended:** Option 1 for this PR (validation + rate-limit scope only) —
surface the UI gap as a follow-up enhancement issue during Phase 4.5.

## Success Criteria

- [ ] Validator module + tests added
- [ ] Rate limiter module + tests added
- [ ] `request.ts` returns 400 on invalid payload (missing required fields,
      wrong types, over-length)
- [ ] `request.ts` returns 429 with `Retry-After` after 5 requests/minute
      from same IP
- [ ] `src/App.tsx` has post-submit cooldown
- [ ] All existing tests still pass
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` coverage meets project bar

## Files Modified

1. `netlify/functions/_validate.ts` — new validator
2. `netlify/functions/_rateLimit.ts` — new in-memory rate limiter
3. `netlify/functions/request.ts` — wire validator + rate limiter
4. `netlify/functions/__tests__/_validate.test.ts` — validator tests
5. `netlify/functions/__tests__/_rateLimit.test.ts` — rate limiter tests
6. `netlify/functions/__tests__/request.test.ts` — 400/429 path tests + adjust
   existing payloads
7. `src/App.tsx` — post-submit cooldown

## References

- [GitHub Issue #32](https://github.com/denhamparry/djrequests/issues/32)
- `netlify/functions/request.ts` (current handler)
- `CLAUDE.md` — Known Issues → Google Form Integration

## Notes

### Key Insights

- Limiter state is instance-local; this is a speed bump, not a wall.
  Documented in module comment.
- Validator returns a normalised `ValidatedRequest` so the handler no longer
  needs `?? ''` fallbacks when populating form fields.

### Alternative Approaches Considered

1. **Add `zod`** — rejected: new dep for a tiny shape.
2. **Netlify Edge rate limiting (external provider)** — rejected: out of scope
   for a no-infra fix.
3. **Require `requester.name` strictly in this PR** — deferred: UI doesn't
   collect it yet; would break current submissions.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation (addressing the Required
  Changes inline during Phase 3)

### Strengths

- Module naming (`_validate.ts`, `_rateLimit.ts`) matches the existing
  `_cors.ts` convention — Netlify treats underscore-prefixed files as
  utilities, not deployable functions.
- Vitest `include` glob `netlify/functions/__tests__/**/*.test.ts` (verified in
  `vite.config.ts`) will pick up the proposed test files without config
  changes.
- Validator returns a normalised `ValidatedRequest` so the handler can drop
  the `?? ''` fallbacks — good reduction in branching.
- Correctly identifies the in-memory limiter's weakness (not shared across
  cold starts / instances) and proposes documenting it rather than papering
  over it.
- Sensible call order: cheap checks → rate limit → validation → form post.
- Correct handling of the `requester.name` tension between the issue's
  "required" wording and the current UI not collecting a name. Deferring the
  strict requirement and raising a follow-up is the right call given this
  PR's scope.

### Gaps Identified

1. **Gap 1: In-memory `hits` Map has no eviction.**
   - **Impact:** Low
   - **Recommendation:** Keep this gap explicit in the module's file-level
     comment. Under the expected threat model (single bar event, tens of
     guests) the entry count is trivial, but a one-line "entries are pruned
     only when the same key is touched" note prevents future confusion.

2. **Gap 2: Plan does not specify behaviour when `x-forwarded-for` is
   missing.**
   - **Impact:** Low
   - **Recommendation:** The sketched `resolveClientKey` returns `'unknown'`
     in that case, which would collapse all such requests onto one bucket —
     acceptable. Add a test asserting missing-header requests share the
     `'unknown'` bucket so the behaviour is pinned.

### Edge Cases Not Covered

1. **Empty-string optional fields vs. missing optional fields.**
   - **Current Plan:** `optionalString` returns `null` for `undefined`,
     `null`, or `''` — good. But the validator then passes `null` where the
     current handler passed `''` into `appendField`. The handler uses
     `appendField(params, id, value ?? '')`, so `null` still becomes `''` on
     the wire. ✅ No change needed, but add a test asserting a submitted
     form with `album: ''` produces an empty `entry.<album>` param (no
     regression).

2. **Test state leakage between the new rate-limit tests and existing
   request tests.**
   - **Current Plan:** Plan mentions calling `resetRateLimit()` in
     `beforeEach`.
   - **Recommendation:** Also call it in the new `_rateLimit.test.ts` file's
     `beforeEach` to stop ordering-dependent flakes when running in parallel
     with the handler suite.

3. **Non-string `song`/`requester` (e.g. an array).**
   - **Current Plan:** `typeof song !== 'object'` check — but arrays are
     `object`. An array would slip through to property access and fail
     silently on `song.id` (undefined → 400 via requireString). Functional,
     but tighten by rejecting arrays explicitly or note the behaviour is
     acceptable because the final error surface is still a 400.
   - **Recommendation:** Non-blocking. Add an `Array.isArray(song)` guard
     for defense-in-depth, or leave and rely on the downstream 400.

### Alternative Approaches (Reviewer Perspective)

1. **Netlify `@netlify/plugin-rate-limit` or Edge Functions.**
   - **Pros:** Cross-instance state.
   - **Cons:** New infrastructure; out of scope.
   - **Verdict:** Plan's in-memory approach is correct for the stated
     threat model.

2. **Use `zod` for the validator.**
   - **Pros:** Less custom parsing code; better error messages.
   - **Cons:** Adds a dependency to a currently dep-free function; marginal
     value for ~6 fields.
   - **Verdict:** Plan's hand-rolled choice is correct here.

### Risks and Concerns

1. **Risk: Updating the `request.test.ts` happy-path payload to include
   `requester.name` is not strictly required if the plan keeps
   `requester.name` optional (Option 1).**
   - **Likelihood:** Medium (plan says "Update happy-path payloads to include
     `requester.name` (required)" but also recommends Option 1 elsewhere).
   - **Impact:** Low — inconsistent wording only.
   - **Mitigation:** Clarify in Phase 3 that `requester.name` is **not**
     made required in this PR; tests can either add it or leave it absent.
     See Required Change #1.

2. **Risk: Existing "missing song payload" test asserts error message matches
   `/song information/i`.**
   - **Likelihood:** High (the new validator returns `'Song information is
     required'` — that matches).
   - **Impact:** None.
   - **Mitigation:** Keep the validator error message literal stable.

3. **Risk: Shared limiter state across tests could mask a bug where the
   limiter state leaks between functions (e.g. if `search.ts` were ever
   wired to the same limiter).**
   - **Likelihood:** Low (plan scopes the limiter to `request.ts` only).
   - **Impact:** Low.
   - **Mitigation:** None needed; noted for awareness.

### Required Changes

**Changes that must be addressed during implementation (not a plan revision):**

- [ ] Clarify that `requester.name` stays **optional** in this PR (falls
      back to `'Anonymous'` or empty string when missing). Do not update
      existing happy-path tests to add `requester.name`; instead add a
      *new* test asserting a payload without a requester block still
      succeeds, and another asserting a payload with `requester: { name: 'A' }`
      succeeds. This resolves the self-conflicting wording between Step 3's
      "Update happy-path payloads to include `requester.name` (required)"
      and the Open Question's "Recommended: Option 1".
- [ ] Add a test for the missing-`x-forwarded-for` path so the fallback
      key is pinned.
- [ ] Ensure `_rateLimit.test.ts` calls `resetRateLimit()` in `beforeEach`.

### Optional Improvements

- [ ] Add an `Array.isArray(song)` explicit reject for defence-in-depth.
- [ ] Include a short module-level comment on `_rateLimit.ts` documenting
      the lack of TTL eviction (size is bounded by unique IP count only).
- [ ] Consider returning `{ error, field }` from the validator so the client
      could surface which field failed; not required for this PR.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered (with the
      `requester.name` strictness deferral called out)
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (`_cors.ts` convention
      confirmed; vitest include glob verified)
- [x] Security implications considered and addressed (input validation,
      length caps, rate limiting)
- [x] Performance impact assessed (O(k) per request where k ≤ 5)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (module comments)
- [x] Related issues/dependencies identified (UI does not collect
      `requester.name` — flagged as follow-up)
- [x] Breaking changes documented (400s for malformed payloads — previously
      accepted silently)
