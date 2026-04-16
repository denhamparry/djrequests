# GitHub Issue #60: fix(request): redact network-error details from 502 client response

**Issue:** [#60](https://github.com/denhamparry/djrequests/issues/60)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The 502 network-error branch in `netlify/functions/request.ts` returns the
upstream `fetch` error message verbatim to the client. This leaks internal
details (DNS resolution errors, TLS failures, raw URL fragments, or Node
runtime error strings) that are operator-only concerns.

### Current Behavior

When `fetch(formConfig.responseUrl, ...)` throws (e.g. DNS failure, connection
reset, timeout), the handler returns:

```ts
return jsonResponse(502, {
  error: `Failed to submit to Google Form: ${
    networkError instanceof Error ? networkError.message : 'Unknown error'
  }`
});
```

The client sees messages such as
`Failed to submit to Google Form: getaddrinfo ENOTFOUND docs.google.com` or
`Failed to submit to Google Form: fetch failed`. The error is not logged
server-side, so operators lose diagnostic context while clients gain noise
they cannot act on.

### Expected Behavior

Mirror the 500 config-error branch (introduced in PR #59):

- Log the raw `networkError` server-side with a `[request]` prefix so existing
  log filters continue to work.
- Return a generic, stable client message — no upstream detail — with the
  existing 502 status preserved.

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/request.ts:136-142` — the 502 branch being changed.
- `netlify/functions/request.ts:104-112` — the 500 config-error branch already
  follows the desired pattern (log with `[request]` prefix, return generic
  message).
- `netlify/functions/__tests__/request.test.ts:185-209` — existing test for
  the config-error branch that asserts the generic message and that the
  server logs once. This is the template for the new 502 test.
- `netlify/functions/__tests__/request.test.ts:211-226` — existing 502 test
  for the `!response.ok` branch (HTTP status case), which is a separate path
  and should remain unchanged.

### Related Context

- Original bug: #50 (config-error leakage)
- Prior PR: #59 (introduced the config-error redaction pattern)
- No test currently covers the `fetch` throw path — adding one closes a gap.

## Solution Design

### Approach

Apply the exact pattern from the config-error branch: `console.error` the raw
error server-side, return a generic 502 body. Keep the HTTP status at 502 so
existing client behaviour (user-facing retry/toast) and any CI/monitoring
that keys on the status code remain unchanged.

### Implementation

Replace the catch body. Client message mirrors issue wording
(`'Failed to reach the request service.'`) — it distinguishes this from the
500 config-error's `'Request service is temporarily unavailable.'` so the
two failure modes remain distinguishable to clients/UX copy without leaking
internals.

### Benefits

- Removes the last operator-only leak from this handler's catch branches.
- Consistent `[request]` log prefix makes log filtering useful across all
  failure modes.
- Adds regression coverage for a previously untested throw path.

## Implementation Plan

### Step 1: Redact the 502 network-error client body

**File:** `netlify/functions/request.ts`

**Changes:** Replace the `} catch (networkError) { ... }` block (lines
136–142) with:

```ts
} catch (networkError) {
  console.error('[request] Google Form network error:', networkError);
  return jsonResponse(502, {
    error: 'Failed to reach the request service.'
  });
}
```

**Testing:** Unit test added in Step 2.

### Step 2: Add regression test for the redaction

**File:** `netlify/functions/__tests__/request.test.ts`

**Changes:** Add a test alongside the existing config-error test (after line
209). Model it on `'logs config errors server-side and returns a generic
client message'`:

```ts
it('logs network errors server-side and returns a generic client message', async () => {
  fetchMock.mockRejectedValueOnce(
    new Error('getaddrinfo ENOTFOUND docs.google.com')
  );
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const response = await handler(
    makeEvent({
      body: JSON.stringify({
        song: { id: '1', title: 'T', artist: 'A' },
        requester: { name: 'Avery' }
      })
    }),
    {} as any
  );

  expect(response.statusCode).toBe(502);
  const body = JSON.parse(response.body);
  expect(body.error).toBe('Failed to reach the request service.');
  expect(body.error).not.toMatch(/ENOTFOUND/);
  expect(body.error).not.toMatch(/getaddrinfo/);
  expect(errorSpy).toHaveBeenCalledTimes(1);

  errorSpy.mockRestore();
});
```

**Testing:**

```bash
npx vitest run netlify/functions/__tests__/request.test.ts
```

### Step 3: Run full check

```bash
npm run test:unit
npm run lint
```

## Testing Strategy

### Unit Testing

- New test asserts: 502 status preserved, generic body returned, raw error
  details absent, server-side `console.error` called exactly once.
- Existing config-error and `!response.ok` 502 tests continue to pass
  unchanged.

### Integration Testing

No integration/E2E changes. The Playwright smoke test covers the happy path
only and does not exercise fetch-throw behaviour.

### Regression Testing

- Verify the `!response.ok` 502 test
  (`returns error when Google Form submission fails`) still passes — it uses
  `fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })`, a disjoint
  code path from the throw branch.
- Verify CORS, rate-limit, and validation tests are unaffected.

## Success Criteria

- [ ] `netlify/functions/request.ts` 502 catch branch logs server-side and
      returns a generic body.
- [ ] New unit test added and passing.
- [ ] All existing unit tests pass (`npm run test:unit`).
- [ ] Lint passes (`npm run lint`).
- [ ] Pre-commit hooks pass.

## Files Modified

1. `netlify/functions/request.ts` — redact 502 network-error body, add
   `console.error` with `[request]` prefix.
2. `netlify/functions/__tests__/request.test.ts` — add regression test for
   the new behaviour.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #50 — original config-error leak
- #59 — PR that introduced the redaction pattern being extended here

### Enables

- Closes the final identified leakage path in this handler; no follow-ups
  anticipated.

## References

- [GitHub Issue #60](https://github.com/denhamparry/djrequests/issues/60)
- `netlify/functions/request.ts:104-112` (reference implementation)

## Notes

### Key Insights

- The two catch branches signal different failure classes (transient upstream
  vs. permanent misconfig). Using distinct generic messages preserves that
  distinction for client UX without leaking internals.
- No new dependencies, no behavioural change for the happy path, no change
  to HTTP status codes — risk is minimal.

### Alternative Approaches Considered

1. **Reuse the config-error message verbatim** ❌ — loses the client-side
   distinction between transient and permanent failures.
2. **Return the error as a structured field (`error`, `detail`)** ❌ —
   overkill for a one-line redaction; the issue asks for parity with the
   existing pattern.
3. **Chosen: Mirror the config-error pattern with a distinct generic
   message** ✅ — minimal, consistent, and matches the issue's guidance.

### Best Practices

- Keep all server-side logs in this handler behind the `[request]` prefix so
  log filters remain useful.
- When redacting, preserve HTTP status codes — they are part of the public
  contract with the client and with any upstream monitoring.
