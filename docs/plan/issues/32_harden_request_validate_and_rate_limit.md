# GitHub Issue #32: Harden request.ts — validate payload shape and rate-limit submissions

**Issue:** [#32](https://github.com/denhamparry/djrequests/issues/32)
**Status:** Planning
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
