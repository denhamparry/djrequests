# GitHub Issue #68: enhancement(request): include structured context (track ID) in server-side error logs

**Issue:**
[#68](https://github.com/denhamparry/djrequests/issues/68)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

Server-side error logs in `netlify/functions/request.ts` include only the raw
error and a correlation ID. When an operator triages a failed submission, they
cannot correlate the failure with the track the guest was requesting. The iTunes
track ID is a safe, stable, non-PII key that lets the operator look up the track
in the iTunes catalogue and cross-check downstream Form/Sheet/Doc state.

### Current Behavior

All five 5xx log sites in `request.ts` emit the `[request]` prefix, a short
error label, and the `requestId`, but not the track ID:

- `[request] Google Form configuration error (requestId=...)`
- `[request] Google Form network error (requestId=...)`
- `[request] Google Form fetch aborted (requestId=...)`
- `[request] Google Form fetch invocation error (requestId=...)`
- `[request] Google Form responded with status N (requestId=...)`

### Expected Behavior

Each log line additionally carries `trackId=<song.id>` so logs can be grepped by
track and the operator can identify which submission failed.

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/request.ts` — five `console.error` call sites (lines ~124,
  ~157, ~167) all fire **after** `validateRequestBody` returns `{ song,
requester }`, so `song.id` (a non-empty string, enforced by validator) is
  always available at every log site.
- `netlify/functions/__tests__/request.test.ts` — five tests assert the exact
  first argument passed to `console.error` for the matching log sites (config
  error, network error, abort, invocation error, upstream 5xx).
- `shared/types.ts` — `Song.id` is a required `string`.

### Related Context

- PR #65 (commit `ea5bda6`) introduced `requestId` in these same logs — this
  issue extends that structured-context pattern.
- Upstream request from `silent-failure-hunter` agent during PR #65 review.
- PII constraint from issue body: **do not** log requester name, contact, or
  dedication. Only the track ID is safe.

## Solution Design

### Approach

Extend each `[request] …` error log line with a `trackId=<song.id>` suffix,
keeping the existing `(requestId=<id>)` segment. This is the minimal, additive
change that matches the existing format convention.

Chosen format:

```text
[request] Google Form network error (requestId=abc12345 trackId=1234567890)
```

Rationale: a single parenthesised context block with space-separated key=value
pairs is grep-friendly, doesn't break existing filters, and mirrors how
structured key=value logging is typically emitted in plain-text logs.

### Trade-offs Considered

1. **JSON structured logging** — Rejected. Would require changing every log
   line's shape, break existing test assertions, and is out of scope for a
   nice-to-have enhancement.
2. **Separate trailing field** (e.g. `… (requestId=…) trackId=…`) — Rejected.
   Less cohesive; splitting context across two groups is harder to parse.
3. **Chosen: inline within the same parenthesised block** — All context lives
   in one group, additive to existing format.

### Implementation

Introduce a single helper `formatLogContext(requestId, trackId)` that returns
`(requestId=X trackId=Y)` and use it at every `console.error` site. This keeps
the five call sites consistent and means any future context addition is a
one-line change.

### Benefits

- Operators can `grep 'trackId=<id>'` to find every log line for a specific
  track submission.
- Keeps PII out of logs by design (only `song.id` is logged, never requester
  fields).
- Matches the existing structured-context pattern from PR #65.

## Implementation Plan

### Step 1: Add a context-formatter helper

**File:** `netlify/functions/request.ts`

**Changes:**

Add near the top of the file (alongside `generateRequestId`):

```ts
const formatLogContext = (requestId: string, trackId: string): string =>
  `(requestId=${requestId} trackId=${trackId})`;
```

### Step 2: Update the five `console.error` sites

**File:** `netlify/functions/request.ts`

Update each log line so the parenthesised context block becomes
`(requestId=... trackId=...)`:

- Config-error branch (currently `(requestId=${requestId})`)
- Network / abort / invocation fetch-error branch (via `classifyFetchError`
  concatenation)
- Upstream non-OK status branch

For the fetch-error branch, the current pattern is:

```ts
console.error(
  `${classifyFetchError(fetchError)} (requestId=${requestId})`,
  fetchError
);
```

Becomes:

```ts
console.error(
  `${classifyFetchError(fetchError)} ${formatLogContext(requestId, song.id)}`,
  fetchError
);
```

Apply the same shape to the config-error and status-error sites.

**Note:** The config-error site (line ~124) fires *after* `song` has been
destructured from `validation.value`, so `song.id` is in scope there too.

### Step 3: Update existing tests and add a positive trackId assertion

**File:** `netlify/functions/__tests__/request.test.ts`

Five existing tests pin the exact log line:

- `logs config errors server-side and returns a generic client message`
- `logs true network errors with a network label and returns a redacted 502`
- `labels AbortError distinctly from network errors`
- `labels non-network fetch failures as invocation errors`
- `returns error when Google Form submission fails`

For each, update the expected log string to include `trackId=<id>` inside the
parenthesised block (with a leading space after `requestId=…`). Example (network-error test, song.id is `'1'`):

```ts
expect(errorSpy.mock.calls[0][0]).toBe(
  `[request] Google Form network error (requestId=${body.requestId} trackId=1)`
);
```

Add **one new** regression test that is explicitly PII-negative:

```ts
it('does not include requester PII in server-side error logs', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await handler(
    makeEvent({
      body: JSON.stringify({
        song: { id: '99', title: 'T', artist: 'A' },
        requester: {
          name: 'Avery Secret',
          contact: 'avery@private.test',
          dedication: 'personal message'
        }
      })
    }),
    {} as any
  );

  const logLine = errorSpy.mock.calls[0][0] as string;
  expect(logLine).toContain('trackId=99');
  expect(logLine).not.toMatch(/Avery Secret/);
  expect(logLine).not.toMatch(/avery@private.test/);
  expect(logLine).not.toMatch(/personal message/);

  errorSpy.mockRestore();
});
```

**Testing:**

```bash
npm run test:unit -- --run netlify/functions/__tests__/request.test.ts
npm run lint
```

## Testing Strategy

### Unit Testing

Vitest coverage for `request.ts` already exercises all five error branches. We
update the five assertions to pin the new format and add one PII-negative
regression test. No new external mocks required.

### Integration Testing

**Test Case 1: Config error with track ID**

1. Unset `GOOGLE_FORM_URL` / `VITE_GOOGLE_FORM_URL`
2. Submit a valid payload with `song.id = "42"`
3. Log line must be
   `[request] Google Form configuration error (requestId=<8hex> trackId=42): Error: ...`
4. Client response still generic (no regression).

**Test Case 2: Network error with track ID**

1. Mock `fetch` to reject with `TypeError('fetch failed')` + `cause`
2. Submit a valid payload with `song.id = "1"`
3. Log line must be
   `[request] Google Form network error (requestId=<8hex> trackId=1)`
4. Client response remains generic (no regression).

**Test Case 3: PII not leaked**

1. Submit a payload with populated `requester.name`, `contact`, `dedication`
2. Force any 5xx branch
3. Log line must contain `trackId=…` but must not contain any requester field
   substring.

### Regression Testing

- 200 success path: no log emitted (existing behaviour).
- 400 validation failures: no log emitted (existing behaviour — no `song.id`
  available pre-validation).
- 429 rate limit: no log emitted (existing behaviour).
- Client-facing response bodies unchanged at every 5xx branch (no regression in
  redaction work from #60/#65).

## Success Criteria

- [ ] `formatLogContext` helper added to `request.ts`
- [ ] All five `console.error` sites use the helper and include `trackId`
- [ ] Five existing log-assertion tests updated
- [ ] One new PII-negative regression test added
- [ ] `npm run test:unit` passes
- [ ] `npm run lint` passes
- [ ] Pre-commit hooks pass
- [ ] Client response shapes unchanged (PII redaction from #65 preserved)

## Files Modified

1. `netlify/functions/request.ts` — add helper, update five log sites
2. `netlify/functions/__tests__/request.test.ts` — update five assertions, add
   one PII-negative test

## Related Issues and Tasks

### Depends On

- PR #65 (`ea5bda6`) — introduced `requestId` pattern this extends

### Related

- Issue #60 — original silent-failure hardening that surfaced this suggestion

### Enables

- Future structured-logging work (if a JSON log format is adopted, the helper
  is the single replacement point)

## References

- [GitHub Issue #68](https://github.com/denhamparry/djrequests/issues/68)
- PR #65 — correlation ID rollout (commit `ea5bda6`)

## Notes

### Key Insights

- `song.id` is guaranteed non-empty at every 5xx log site because
  `validateRequestBody` runs first and rejects missing IDs with a 400 (no log).
- The three 5xx log-site groups (config / fetch-error family / upstream status)
  all live in one file, so a single helper fully eliminates format drift.

### Best Practices

- Never log `requester.name`, `requester.contact`, or `requester.dedication` —
  PII constraint from the issue body.
- Prefer one helper over sprinkling template strings; it keeps the five sites
  in lockstep.
