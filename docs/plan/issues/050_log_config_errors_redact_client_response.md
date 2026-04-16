# GitHub Issue #50: log config errors server-side and redact details from client response

**Issue:** [#50](https://github.com/denhamparry/djrequests/issues/50)
**Status:** Planning
**Branch:** denhamparry.co.uk/feat/gh-issue-050
**Date:** 2026-04-16

## Context

In `netlify/functions/request.ts`, `deriveFormResponseConfig()` throws when
`GOOGLE_FORM_URL` / `VITE_GOOGLE_FORM_URL` is missing or malformed. The catch
block (lines 104–111) returns the raw `configError.message` to the client and
never writes to `console.error`, so:

1. **No operator trail.** A misconfigured deploy produces 500s with no log
   entry, making it hard to diagnose from Netlify function logs.
2. **Internal details leak to clients.** The thrown messages name the
   environment variables (`"Set GOOGLE_FORM_URL or VITE_GOOGLE_FORM_URL."`)
   and describe the expected URL shape. That is implementation detail that
   should not reach end users.

Surfaced during review of PR #47 — not introduced by that PR.

## Approach

In the config-error catch branch:

- `console.error(...)` the original error (with a stable prefix so it is easy
  to grep in Netlify logs), including the `Error` instance so the stack is
  preserved.
- Return a generic 500 response with a user-facing message that reveals
  nothing about env vars or URL parsing:
  `"Request service is temporarily unavailable."`

No other error branches change. The network-failure (502) and non-OK Google
Form response (502) branches already return shape-appropriate messages; the
network branch does leak `networkError.message` but that is out of scope for
this issue (operator-triggered config errors are the concern here).

## Files Modified

- `netlify/functions/request.ts` — add `console.error`, replace client-facing
  message with a generic string.
- `netlify/functions/__tests__/request.test.ts` — add a test covering the
  missing-env-var case: asserts 500 status, generic message (no env var name
  leak), and that `console.error` was called.

## Implementation

```ts
let formConfig: ReturnType<typeof deriveFormResponseConfig>;
try {
  formConfig = deriveFormResponseConfig();
} catch (configError) {
  console.error('[request] Google Form configuration error:', configError);
  return jsonResponse(500, {
    error: 'Request service is temporarily unavailable.'
  });
}
```

## Tasks

1. Add failing test in `request.test.ts` for missing `VITE_GOOGLE_FORM_URL`:
   - Clear both `GOOGLE_FORM_URL` and `VITE_GOOGLE_FORM_URL` in the test.
   - Spy on `console.error` and assert it was called once.
   - Assert `response.statusCode === 500`.
   - Assert response body message does **not** include "GOOGLE_FORM_URL" or
     "VITE_GOOGLE_FORM_URL".
   - Assert response body message matches "temporarily unavailable".
2. Update `request.ts` to log and return the generic message.
3. Run `npm run test:unit`, `npm run lint`, pre-commit.
4. Commit + open PR.

## Acceptance Criteria

- Missing/invalid `GOOGLE_FORM_URL` produces a `console.error` entry in
  Netlify logs.
- Client response for the config-error path contains no env var names, URL
  parsing hints, or the underlying `Error.message`.
- Response status remains 500 (operator must still fix the deploy).
- New test covers both the log side-effect and the redacted body.
- Existing tests pass unchanged.

## Out of Scope

- Redacting the 502 network-error branch (`networkError.message` leak). A
  separate issue if desired — the failure surface differs (transient upstream
  vs. permanent misconfig).
- Structured logging / observability stack (log shipping, metrics).
- Changing the status code from 500 to something else.

## Risks

- **Very low.** Behaviour change is purely in the error-response body; status
  code, headers, and happy-path unchanged.
- One visible risk: if an operator was scraping the previous verbose message
  out of the response body to diagnose, they lose that signal. Mitigated by
  the new `console.error` — Netlify function logs are the correct place for
  that detail.

## References

- [GitHub Issue #50](https://github.com/denhamparry/djrequests/issues/50)
- Prior art for the pattern: existing 502 network-error branch already
  returns a structured message; this change brings the 500 config branch in
  line with "log details, return generic string".
