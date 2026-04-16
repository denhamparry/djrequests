# GitHub Issue #36: Song search returns 404 on production (iTunes Search API upstream failure)

**Issue:** [#36](https://github.com/denhamparry/djrequests/issues/36)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

Song search on <https://dj.squirrels.team> fails end-to-end because the upstream
iTunes Search API intermittently returns HTTP 404 with a `[newNullResponse]`
body. Our `netlify/functions/search.ts` correctly detects the non-OK response
and maps it to a 502, but:

1. There is **no retry** — a single transient upstream failure takes search
   down for that query.
2. The UI renders the raw developer error string (`"iTunes Search API returned
   status 404"`) with no guidance, making the outage look like an app bug.

### Current Behavior

- `GET /.netlify/functions/search?term=beatles` returns `502` with body
  `{"tracks":[],"error":"iTunes Search API returned status 404"}` whenever
  Apple returns a transient 404.
- Users see the raw error string in the UI with no retry guidance.
- All song searches fail during the Apple outage window; users cannot submit
  requests.

### Expected Behavior

- The function retries transient upstream failures (404 with null-response
  body, and 5xx) a small number of times with backoff before giving up.
- When retries are exhausted (or the error is definitively not retryable), the
  UI shows a user-friendly message distinguishing "upstream search provider is
  having issues, please try again shortly" from "no songs found".

## Current State Analysis

### Relevant Code/Config

- **`netlify/functions/search.ts`** — proxies iTunes Search API. Single
  `fetch` call, no retry. On `!response.ok` returns 502 with raw status in the
  error message (lines 78–83).
- **`src/hooks/useSongSearch.ts`** — on non-OK response, throws
  `new Error(payload?.error ?? 'Search failed')` (lines 65–67). The thrown
  message is stored in `state.error` and rendered verbatim in the UI.
- **`src/App.tsx`** (lines 75–79) — displays `state.error` inside a
  `role="alert"` paragraph with no friendly mapping.
- **`netlify/functions/__tests__/search.test.ts`** — covers: missing term
  (400), happy path (200), empty results (200 with message), 429 throttle
  (503). No coverage for transient 404/5xx retry behaviour.

### Related Context

- **iTunes Search API `[newNullResponse]` failure** is a documented,
  intermittent upstream issue. It presents as HTTP 404 with an HTML error body
  — transient, not a "not found" for the query.
- Rate-limit handling (429 → 503) is already in place and must be preserved —
  do not retry 429s.
- Function is called via the browser on every debounced keystroke, so any
  retry strategy must keep total latency bounded (well under the Netlify
  26-second function timeout, ideally <5s total).

## Solution Design

### Approach

Two complementary changes, both inside this single bug fix:

1. **Server-side retry with bounded backoff** in `netlify/functions/search.ts`
   for transient upstream failures: 404 (matches the observed
   `[newNullResponse]` mode) and 5xx. Do **not** retry 429 — preserve the
   existing throttle → 503 behaviour.
2. **Client-side friendly error mapping** in `useSongSearch.ts` (or `App.tsx`):
   when the function returns a 502/503 with an upstream-outage shape, surface
   a user-facing message ("Search is temporarily unavailable — please try
   again in a moment.") rather than the raw developer string.

To let the client distinguish upstream-outage 502s from other errors without
string-matching, the function will include a stable `code` field on upstream
failure responses (e.g. `code: 'upstream_unavailable'`). The client branches on
`code`, not on the human-readable `error` string.

### Implementation

**Retry strategy in `search.ts`:**

- Max 2 retries (3 total attempts).
- Backoff: 250ms, 500ms (linear, small — keep total latency budget ~1s).
- Retry triggers: network error (catch branch), HTTP 404, HTTP 5xx.
- Do **not** retry: 2xx, 3xx (not reachable here), 429.
- After retries exhausted, return 502 with `code: 'upstream_unavailable'`.

**Response shape change:**

Add an optional `code` field to `SearchResponse`. Existing fields
(`tracks`, `message`, `error`) are unchanged — this is a superset.

**Client mapping:**

In `useSongSearch.ts`, read `payload.code` alongside `payload.error` and map
`upstream_unavailable` → friendly message. Fallback to existing behaviour for
unknown codes.

### Benefits

- Eliminates the most common failure mode (a single transient Apple 404) by
  retrying silently.
- Users see actionable guidance instead of a cryptic status code.
- Preserves all existing behaviour (throttle mapping, empty-results message,
  missing-term 400).
- Adds test coverage for the retry path, which was previously untested.

## Implementation Plan

### Step 1: Add retry helper and wire into `search.ts`

**File:** `netlify/functions/search.ts`

**Changes:**

- Extract the `fetch` call into an internal helper that retries transient
  failures.
- Add constants for max retries and backoff delays.
- Add a `code` field to the error response when retries are exhausted.

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/search.test.ts
```

### Step 2: Extend `search.test.ts` with retry coverage

**File:** `netlify/functions/__tests__/search.test.ts`

**Changes:**

- Case: upstream 404 once then 200 → client sees 200 with tracks (retry
  succeeded).
- Case: upstream 404 three times → 502 with `code: 'upstream_unavailable'`.
- Case: upstream 500 once then 200 → 200 with tracks.
- Case: upstream 429 → 503 (retry NOT attempted; preserve existing
  behaviour).
- Case: network error once then 200 → 200 with tracks.

Use `vi.useFakeTimers()` to avoid real wall-clock delays during backoff.

**Testing:**

```bash
npm run test:unit
```

### Step 3: Map upstream outage to friendly message in `useSongSearch.ts`

**File:** `src/hooks/useSongSearch.ts`

**Changes:**

- Read `payload?.code` in the non-OK branch.
- When `code === 'upstream_unavailable'`, set
  `error: 'Search is temporarily unavailable — please try again in a moment.'`.
- Otherwise preserve existing behaviour (use `payload?.error` or fallback
  string).

**Testing:**

```bash
npm run test:unit -- src/__tests__
```

### Step 4: Add a hook test for the friendly-message mapping

**File:** `src/__tests__/useSongSearch.test.tsx` (existing or new)

**Changes:**

- Using MSW, stub `/.netlify/functions/search` to return
  `502 { code: 'upstream_unavailable', error: '...' }` and assert the hook
  surfaces the friendly string.

**Testing:**

```bash
npm run test:unit
```

### Step 5: Verify lint and full test suite

```bash
npm run lint
npm run test:unit
```

## Testing Strategy

### Unit Testing

- `search.ts` retry helper: covered by the five cases in Step 2 above.
- `useSongSearch` mapping: covered by Step 4.
- All existing tests must continue to pass unchanged (no regressions in
  400/429/empty-results/happy-path).

### Integration Testing

**Test Case 1: Transient upstream failure recovers silently**

1. Mock `fetch` to fail once (404 or 500), then succeed.
2. Call handler with a valid term.
3. Expect `statusCode: 200` and normalised tracks — no error surfaced.

**Test Case 2: Persistent upstream failure surfaces friendly error**

1. Mock `fetch` to fail on all attempts (404).
2. Call handler.
3. Expect `statusCode: 502` with body including
   `code: 'upstream_unavailable'`.
4. Hook test: wire MSW to return the same, assert the UI message is the
   friendly mapped one.

**Test Case 3: Throttle (429) is unchanged**

1. Mock `fetch` to return 429 once.
2. Expect `statusCode: 503`, existing error message, and fetch called
   **exactly once** (no retries).

### Regression Testing

- 400 "Missing search term" — unchanged.
- 200 happy path — unchanged.
- 200 empty-results message — unchanged.
- 503 rate-limit path — unchanged (no retries).
- E2E smoke test (`tests/e2e/request.spec.ts`) — unaffected, should still
  pass.

## Success Criteria

- [ ] `search.ts` retries 404 and 5xx up to 2 times with linear backoff
      before surfacing an error.
- [ ] `search.ts` never retries 429 (throttle → 503 preserved).
- [ ] Failure response includes a stable `code: 'upstream_unavailable'` field
      that clients can branch on.
- [ ] `useSongSearch` maps `upstream_unavailable` to a user-friendly message.
- [ ] New tests cover retry-succeeds, retry-exhausted, 429-no-retry, and the
      hook's friendly-message mapping.
- [ ] `npm run lint` and `npm run test:unit` both pass.
- [ ] No changes to the Google Form submission path, Apps Script, or
      environment variables.

## Files Modified

1. `netlify/functions/search.ts` — add retry helper + `code` field on
   upstream-outage errors.
2. `netlify/functions/__tests__/search.test.ts` — add retry coverage.
3. `src/hooks/useSongSearch.ts` — branch on `payload.code` for friendly
   message mapping.
4. `src/__tests__/useSongSearch.test.tsx` (new or extended) — hook test for
   the mapping.
5. `docs/plan/issues/36_song_search_returns_404_on_production.md` — this
   plan.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- Issue #36 suggested actions 1 (persistence check), 3 (fallback provider),
  and 5 (uptime monitoring) are **explicitly out of scope** for this fix;
  each warrants its own issue if pursued.

### Enables

- A clean seam (the `code` field) for a future fallback-provider change —
  the client already treats `upstream_unavailable` as a distinct state.

## References

- [GitHub Issue #36](https://github.com/denhamparry/djrequests/issues/36)
- `netlify/functions/search.ts`
- `src/hooks/useSongSearch.ts`
- iTunes Search API `[newNullResponse]` behaviour (documented intermittent
  upstream failure mode)

## Notes

### Key Insights

- The `[newNullResponse]` 404 is an **upstream bug masquerading as a
  not-found**, so retry is the correct mitigation; it's not a semantic 404.
- Adding a machine-readable `code` on error responses is a small API contract
  extension that avoids fragile string-matching on the client and leaves room
  for future error categories.

### Alternative Approaches Considered

1. **Add a fallback provider (Deezer / MusicBrainz)** ❌ — large change:
   new provider, new auth story, result shape normalisation, new test
   surface. Warrants its own issue.
2. **Retry on the client** ❌ — duplicates logic across every consumer,
   wastes network on each retry, and the function is the single choke point
   that all clients share.
3. **Retry on the server with bounded backoff** ✅ — smallest fix that
   directly addresses the observed failure mode, keeps the API contract
   stable, and is fully unit-testable.

### Best Practices

- Keep retry budget tight (~1s total) to stay well inside the browser's
  tolerance for a debounced search.
- Never retry 429 — retrying a throttle makes things worse.
- Use fake timers in tests so backoff delays don't slow the suite.
