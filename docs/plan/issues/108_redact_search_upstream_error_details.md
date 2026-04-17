# GitHub Issue #108: fix(search) — don't return raw upstream error details to the client

**Issue:** [#108](https://github.com/denhamparry/djrequests/issues/108)
**Status:** Reviewed (Approved)
**Branch:** denhamparry.co.uk/fix/gh-issue-108
**Date:** 2026-04-17

## Context

In `netlify/functions/search.ts`, the `kind: 'failed'` branch (line 123–129)
returns `outcome.detail` directly to the client. `outcome.detail` is built up
inside `fetchFromItunes()` and can contain:

- Raw Node `fetch()` error messages: `network error: ${error.message}`
  (search.ts:60–62) — could leak internal hostnames, DNS resolution detail,
  TLS errors, proxy detail, etc.
- Raw iTunes HTTP status codes: `iTunes Search API returned status ${status}`
  (search.ts:79).

This is the same class of issue as #50 (already fixed for `request.ts`):
internal failure detail belongs in `console.error`, not in the response body.
The frontend in `src/hooks/useSongSearch.ts:60–63` already keys off the
`code: 'upstream_unavailable'` field for friendly UX, so removing the raw
detail does not affect the user experience.

The companion `request.ts` function already follows the right pattern:
generate a `requestId`, log with a sanitised context string, return a generic
friendly message + `requestId` to the client. We mirror that pattern here.

Surfaced by Shoulder.dev scan and audit (see issue body).

## Approach

In `search.ts`:

1. Generate a short request ID (mirror `request.ts:8` —
   `crypto.randomUUID().slice(0, 8)`).
2. In the `kind: 'failed'` branch:
   - `console.error` the raw `outcome.detail` with a stable prefix and the
     request ID, so the entry is greppable in Netlify logs.
   - Return a generic friendly message + `code: 'upstream_unavailable'` +
     `requestId`.
3. The `kind: 'throttled'` branch already returns a friendly message — no
   change beyond also adding a `requestId` for consistency (low value but
   cheap and aids correlation).
4. Keep `outcome.detail` typed as before; only the client surface changes.

The `requestId` is included in the response so a user reporting "search is
broken" can quote it and an operator can grep logs.

## Files Modified

- `netlify/functions/search.ts` — generate requestId, log raw `outcome.detail`
  via `console.error`, replace client-facing detail with generic string.
- `netlify/functions/__tests__/search.test.ts` — update the existing
  "exhausted retries" test (line 240–246) which currently asserts
  `payload.error` matches `/404/`; new assertions cover (a) absence of raw
  status / fetch detail in the body, (b) `console.error` called with the raw
  detail, (c) `requestId` present in the body and matches log entry.

## Implementation

```ts
// near the top of search.ts (after imports)
const generateRequestId = (): string => crypto.randomUUID().slice(0, 8);

// in the handler, replace the kind: 'failed' branch:
if (outcome.kind === 'failed') {
  const requestId = generateRequestId();
  console.error(
    `[search] iTunes upstream failure (requestId=${requestId}): ${outcome.detail}`
  );
  return jsonResponse(503, {
    tracks: [],
    error: 'Search is temporarily unavailable. Please try again shortly.',
    code: 'upstream_unavailable',
    requestId
  });
}
```

The `SearchResponse` type already has an optional `error` and `code` field;
add an optional `requestId?: string` field.

## Tasks

1. Update `SearchResponse` type in `search.ts` to include `requestId?: string`.
2. Add `generateRequestId` helper in `search.ts` (mirror `request.ts:8`).
3. Update the `kind: 'failed'` branch to log + return generic message +
   requestId.
4. Update existing test "returns 503 with upstream_unavailable code after
   retries are exhausted" (`search.test.ts:227`):
   - Spy on `console.error` (use `vi.spyOn(console, 'error').mockImplementation(() => {})`
     in beforeEach + restore in afterEach).
   - Replace `expect(payload.error).toMatch(/404/)` with assertions that the
     body's `error` is the generic friendly string and does **not** contain
     "404" or "iTunes Search API returned status".
   - Assert `payload.code === 'upstream_unavailable'`.
   - Assert `typeof payload.requestId === 'string'` and length is 8.
   - Assert `console.error` was called with a string containing the raw
     "404" detail and the same requestId.
5. Add a second test covering the network-error exhaustion path: three
   mocked `fetchMock.mockRejectedValue(new Error('socket hang up'))` in a
   row, then assert the body does **not** contain "socket hang up" but
   `console.error` was called with it.
6. Run `npm run test:unit`, `npm run lint`, pre-commit.
7. Commit + open PR.

## Acceptance Criteria

- The `kind: 'failed'` response body in `search.ts` contains only a generic
  friendly string + `code: 'upstream_unavailable'` + `requestId`. No raw
  status code, no raw fetch error message.
- `console.error` is called with the raw `outcome.detail` and the same
  `requestId` that the client receives.
- Existing tests in `search.test.ts` continue to pass after the assertion
  update for the retries-exhausted case.
- New tests cover both upstream-status and network-error redaction.
- `useSongSearch.ts` UX is unchanged (the `code === 'upstream_unavailable'`
  branch was already wired in `useSongSearch.ts:60–63`).

## Out of Scope

- Changes to `request.ts:190` (`Google Form responded with status …`) — minor
  status leak, low value to attackers, separate concern.
- Changes to the throttled-branch message — already friendly; adding a
  requestId there is optional polish, not required for acceptance.
- Logging infrastructure changes (structured logging, log aggregation, etc.).

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Mirrors the established pattern from #50 (already shipped for `request.ts`),
  so reviewers and operators have a familiar shape (`requestId`, `[search]`
  log prefix, generic friendly message + machine-readable `code`).
- Explicitly preserves the frontend contract: `useSongSearch.ts:60–63` keys
  off `code: 'upstream_unavailable'`, so the user-visible message is
  unchanged. No frontend changes required.
- Test plan covers both leak vectors: upstream HTTP status (existing test
  retro-fitted) and raw network error (new test). Spying on `console.error`
  with `mockImplementation` keeps test output clean and verifies the log
  side-effect.
- Scope is correctly tight — `request.ts:190` and the throttled branch are
  called out as out-of-scope rather than silently expanded.

### Verified Code References

- `netlify/functions/search.ts:60-62` — raw `error.message` interpolated into
  `lastDetail`. ✅
- `netlify/functions/search.ts:79` — raw HTTP status interpolated into
  `lastDetail`. ✅
- `netlify/functions/search.ts:123-129` — `kind: 'failed'` returns
  `outcome.detail`. ✅
- `netlify/functions/__tests__/search.test.ts:227-246` — existing
  retries-exhausted test asserts `payload.error` matches `/404/`; will need
  the assertion update described in Task 4. ✅
- `netlify/functions/request.ts:8` — `generateRequestId` helper to mirror. ✅
- `src/hooks/useSongSearch.ts:60-63` — friendly-message branch keys off
  `code === 'upstream_unavailable'`, so generic backend error string is not
  shown to users. ✅

### Gaps Identified

None blocking. Two minor observations:

1. **Throttled branch left without a requestId.** Acknowledged as out of
   scope. Operators triaging a "search throttled" report won't have a log
   correlation ID. Acceptable — throttling is self-limiting and the friendly
   message is unambiguous.
   - **Impact:** Low
   - **Recommendation:** Leave as-is; revisit only if support load suggests
     correlation is needed.

### Edge Cases Not Covered

None of concern. The plan covers both leak vectors. The
`requestId` itself is non-sensitive (random 8-char hex slice of a UUID) and
poses no information-disclosure risk.

### Risks and Concerns

- **Risk:** Test for `console.error` could pass spuriously if Vitest is
  configured to swallow console output. Plan mitigates by using
  `vi.spyOn(console, 'error').mockImplementation(() => {})` and asserting
  call args directly. ✅
- **Risk:** Bundle size impact — `crypto.randomUUID` is already used in
  `request.ts`, so no new global dependency. ✅

### Required Changes

None.

### Optional Improvements

- **Naming polish:** Consider hoisting `generateRequestId` into a tiny
  shared util (`netlify/functions/_requestId.ts`) since both `search.ts` and
  `request.ts` now use the identical helper. Not required — duplication of
  one line is fine, and the existing CLAUDE.md guidance discourages
  premature abstraction.

### Verification Checklist

- [x] Solution addresses root cause (raw upstream detail in client response)
- [x] All acceptance criteria from issue #108 are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified above)
- [x] Security implications considered (requestId disclosure is benign)
- [x] Performance impact assessed (generating one UUID per failed call —
      negligible)
- [x] Test strategy covers both leak vectors and the log side-effect
- [x] No documentation changes required (CLAUDE.md already documents the
      pattern via #50)
- [x] Frontend contract preserved (`code: 'upstream_unavailable'` still
      drives UX)
- [x] No breaking changes
