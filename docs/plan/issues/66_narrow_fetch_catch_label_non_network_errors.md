# GitHub Issue #66: narrow fetch catch and label non-network errors distinctly

**Issue:** [#66](https://github.com/denhamparry/djrequests/issues/66)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The `catch` block around `fetch(...)` in `netlify/functions/request.ts` labels
every thrown error as `"Google Form network error"`. Even with a narrow try,
`fetch` can throw for reasons unrelated to network transport — `AbortError`,
or `TypeError` with a programmer-level cause — so a single static label
misleads log triage.

### Current Behavior

- `request.ts:136-141` catches any `fetch` throw and logs
  `[request] Google Form network error: <err>` regardless of error shape.
- A malformed URL, an abort, and an actual DNS/connection failure all surface
  with the same log prefix.

### Expected Behavior

- Distinct log labels for (a) aborts, (b) true upstream network failures, and
  (c) programmer/invocation errors, so grep-based triage is accurate.
- Client-facing 502 response body stays redacted (no upstream detail) — the
  protection added in #60 / PR #65 must not regress.

## Current State Analysis

### Relevant Code

`netlify/functions/request.ts:128-141`:

```ts
try {
  response = await fetch(formConfig.responseUrl, { ... });
} catch (networkError) {
  console.error('[request] Google Form network error:', networkError);
  return jsonResponse(502, { error: 'Failed to reach the request service.' });
}
```

The try is already narrow (scoped to the `fetch` call alone). What needs to
change is the classification inside the catch, not the try boundary.

### Related Context

- Issue surfaced during PR #65 review by `silent-failure-hunter` agent.
- Existing test `request.test.ts:211-235` asserts a 502 with redacted body and
  that `console.error` is called exactly once.

## Solution Design

### Approach

Classify the caught error inside the existing catch and branch the log label:

- `error.name === 'AbortError'` → `"[request] Google Form fetch aborted"`
- `TypeError` with a `.cause` (Node undici's "fetch failed" wrapper) → treat as
  network and log `"[request] Google Form network error"`
- Anything else → `"[request] Google Form fetch invocation error"` (programmer
  bug — bad URL string, bad options, etc.)

The HTTP response stays the same (502 with redacted body) for all three — the
differentiation is purely server-side for log triage.

### Why this approach

- Preserves the `#60` redaction invariant (client body unchanged).
- No new response codes or types — minimal surface change.
- Uses Node's actual fetch error shapes (undici wraps transport errors in
  `TypeError` with `.cause`), not a fictional ideal.

## Implementation Plan

### Step 1: Extract classifier + update catch block

**File:** `netlify/functions/request.ts`

Add a small helper that returns a log label for a caught fetch error, then
use it in the catch:

```ts
const classifyFetchError = (error: unknown): string => {
  if (error instanceof Error && error.name === 'AbortError') {
    return '[request] Google Form fetch aborted';
  }
  if (error instanceof TypeError && 'cause' in error && (error as { cause?: unknown }).cause !== undefined) {
    return '[request] Google Form network error';
  }
  return '[request] Google Form fetch invocation error';
};
```

Update the catch:

```ts
} catch (fetchError) {
  console.error(classifyFetchError(fetchError), fetchError);
  return jsonResponse(502, { error: 'Failed to reach the request service.' });
}
```

### Step 2: Add tests for the three branches

**File:** `netlify/functions/__tests__/request.test.ts`

Add three cases (alongside the existing network-error test):

1. AbortError → 502, body redacted, log label contains "fetch aborted".
2. TypeError with cause (simulating undici "fetch failed") → 502, body
   redacted, log label contains "network error".
3. Plain Error (e.g. programmer misuse) → 502, body redacted, log label
   contains "fetch invocation error".

All three must still assert the redaction invariant from #60.

## Testing Strategy

### Unit Testing

- Extend `request.test.ts` with the three cases above.
- Keep the existing DNS-error test (covers backward-compatible "network"
  labelling with the `cause`-bearing TypeError shape undici produces).

### Regression Testing

- `npm run test:unit` passes.
- `npm run lint` passes.
- Existing 502 redaction test still passes unchanged.

## Success Criteria

- [ ] `classifyFetchError` produces the three distinct labels.
- [ ] Catch block uses the classifier; no change to returned status/body.
- [ ] Three new tests cover AbortError, TypeError-with-cause, and plain Error.
- [ ] 502 response body for all three is `"Failed to reach the request service."`.
- [ ] `console.error` still called exactly once per failure.
- [ ] Lint + unit tests green.

## Files Modified

1. `netlify/functions/request.ts` — classifier helper + catch-block label.
2. `netlify/functions/__tests__/request.test.ts` — three new cases.

## Related

- Original issue: #60 (redaction)
- PR that introduced the redaction: #65
- Source of this suggestion: `silent-failure-hunter` review of #65

## Notes

### Alternative Approaches Considered

1. **Narrow the try further** — the try already wraps only `fetch(...)`. No
   further narrowing is meaningful. ❌
2. **Change response body per error class** — breaks the #60 redaction
   invariant (leaks internal classification to clients). ❌
3. **Branch log label on error type** — chosen. Server-side only, preserves
   redaction, improves triage. ✅
