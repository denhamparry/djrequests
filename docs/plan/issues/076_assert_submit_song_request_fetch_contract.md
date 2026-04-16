# GitHub Issue #76: test(client): assert submitSongRequest fetch URL/method/body on success path

**Issue:** [#76](https://github.com/denhamparry/djrequests/issues/76)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

The success-path test in `src/lib/__tests__/googleForm.test.ts` only asserts the
parsed payload shape. It does not lock in the wire contract between the client
(`submitSongRequest`) and the Netlify function (`netlify/functions/request.ts`).

### Current Behavior

- `returns the parsed payload on success` asserts only `result ===
  { message: '...' }`.
- Nothing asserts `fetch` was called with the expected URL, method, headers, or
  body shape.
- A refactor that reshapes the body (for example wrapping in
  `{ payload: { song, ... } }`) or flips the method to `PUT` would still pass
  this test.

### Expected Behavior

- Success-path test additionally asserts, via `fetchMock.mock.calls[0]`:
  - URL argument is `/.netlify/functions/request`.
  - Method is `POST`.
  - `Content-Type` header is `application/json`.
  - Body is `JSON.stringify({ song, requester })` (matching the object the
    Netlify function consumes).
- The assertion pins the full request contract so future drift fails CI.

## Current State Analysis

### Relevant Code/Config

- `src/lib/googleForm.ts:21-30` — `submitSongRequest` calls
  `fetch('/.netlify/functions/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ song, requester: details }) })`.
- `src/lib/__tests__/googleForm.test.ts:27-36` — success-path test that only
  checks the resolved payload.
- `netlify/functions/request.ts` — server side consumes
  `{ song, requester }` from `JSON.parse(body)`.

### Related Context

- Issue surfaced in code review of PR for #71 (client-side tests for
  request-error and reference-banner flows).
- Error-path tests already exist (#71) — this plan extends coverage to the
  request side of the wire contract, not the response side.

## Solution Design

### Approach

Augment the existing `returns the parsed payload on success` test with
assertions on `fetchMock.mock.calls[0]`. Keep it a single test — the wire
contract and the success-response parse are two facets of the same behaviour,
and splitting them would just duplicate mock setup.

### Implementation

- After `await submitSongRequest(song, requester)`:
  - Assert `fetchMock` was called exactly once.
  - Destructure `[url, init]` from `fetchMock.mock.calls[0]`.
  - Assert `url === '/.netlify/functions/request'`.
  - Assert `init.method === 'POST'`.
  - Assert
    `init.headers['Content-Type'] === 'application/json'` (object form,
    matching the production code; no need to cover `Headers` instance form
    since the code path does not produce one).
  - Assert `init.body === JSON.stringify({ song, requester })` — use string
    equality against the exact serialisation so property-order drift also
    fails.

### Benefits

- Pins the client ↔ Netlify function contract on the client side.
- Detects regressions like body reshape, method flip, or URL typo in a
  single fast unit test.
- No production code changes — pure test addition.

## Implementation Plan

### Step 1: Extend success-path test with fetch-call assertions

**File:** `src/lib/__tests__/googleForm.test.ts`

**Changes:**

Replace the body of the `returns the parsed payload on success` test with:

```ts
it('returns the parsed payload on success', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ message: 'Song request submitted successfully.' })
  });

  const result = await submitSongRequest(song, requester);

  expect(result).toEqual({ message: 'Song request submitted successfully.' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/.netlify/functions/request');
  expect(init).toMatchObject({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  expect(init.body).toBe(JSON.stringify({ song, requester }));
});
```

**Testing:**

```bash
npx vitest run src/lib/__tests__/googleForm.test.ts
```

## Testing Strategy

### Unit Testing

- Run `npx vitest run src/lib/__tests__/googleForm.test.ts` — the existing
  three error-path tests must still pass; the success-path test must now
  also verify the fetch call.
- Sanity-check the assertion fails when the production code drifts: mentally
  (or locally) swap `body: JSON.stringify({ song, requester: details })` for
  `JSON.stringify({ payload: { song, requester: details } })` and confirm
  the test fails. Do not commit that change.

### Integration Testing

Not required — the Netlify function has its own unit tests, and this change
is scoped to the client-side contract.

### Regression Testing

- Full suite: `npm run test:unit`.
- Lint: `npm run lint`.

## Success Criteria

- [ ] Success-path test asserts fetch URL, method, headers, and body.
- [ ] `npx vitest run src/lib/__tests__/googleForm.test.ts` passes.
- [ ] `npm run test:unit` passes.
- [ ] `npm run lint` passes.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `src/lib/__tests__/googleForm.test.ts` — extend success-path test with
   `fetchMock.mock.calls[0]` assertions pinning URL, method, headers, body.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #71 — original PR that introduced the error-path tests; this issue was
  raised during its code review.

### Enables

- Safer future refactors of `submitSongRequest` body shape or transport.

## References

- [GitHub Issue #76](https://github.com/denhamparry/djrequests/issues/76)
- `src/lib/googleForm.ts`
- `netlify/functions/request.ts`

## Notes

### Key Insights

- The production code passes a plain object literal for `headers`, so the
  test can safely index `init.headers['Content-Type']` without worrying
  about the `Headers` class form.
- `JSON.stringify` property order in V8 follows insertion order for
  string-keyed properties, so `JSON.stringify({ song, requester })` in the
  test matches `JSON.stringify({ song, requester: details })` in the code
  (both insert `song` first, then `requester`). String-equality is therefore
  safe and stronger than a `toMatchObject` on the parsed body.

### Alternative Approaches Considered

1. **Split into a separate `sends the expected request` test** — doubles the
   mock-setup boilerplate for no extra coverage. ❌
2. **Parse `init.body` back with `JSON.parse` and `toEqual`** — weaker than
   string equality; would miss property-order drift. ❌
3. **Pinned string-equality on the serialised body** — chosen. ✅

### Best Practices

- When a client function crosses a process boundary, tests should pin both
  the request shape (what we send) and the response handling (what we do
  with the reply). This plan closes the request-shape gap.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Scope is minimal and correct: a test-only change that pins the client wire
  contract. No production code touched.
- Chosen assertion style (`const [url, init] = fetchMock.mock.calls[0]`)
  matches the established convention in
  `netlify/functions/__tests__/request.test.ts:102` — consistent with the
  codebase.
- Plan correctly identifies that string-equality on the serialised body is
  stronger than `toMatchObject` of a parsed body (catches property-order
  drift).
- Plan verifies the production code reads `{ song, requester: details }` —
  insertion order `song, requester` — which matches the test's
  `JSON.stringify({ song, requester })`, so the string-equality assertion
  is sound.

### Gaps Identified

None of material impact.

### Edge Cases Not Covered

1. **Headers as `Headers` instance.** If `submitSongRequest` is ever
   refactored to pass a `Headers` instance, `init.headers['Content-Type']`
   would become `undefined` and the test would fail — which is correct,
   forcing the test to be updated alongside the refactor. No change needed.

### Alternative Approaches Re-considered

1. **`toHaveBeenCalledWith(url, expect.objectContaining(...))`** — equally
   idiomatic, but the explicit destructure makes the body string-equality
   read more clearly. Current approach is preferable.

### Risks and Concerns

None.

### Required Changes

None.

### Optional Improvements

- [ ] Consider also asserting `init.body` parses back to
      `{ song, requester }` via `JSON.parse` for a human-readable failure
      message. Skip — string equality is sufficient and the diff output
      from Vitest is already readable.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified
      `src/lib/googleForm.ts:21-30` and test file at cited lines)
- [x] Security implications considered (none — test-only change)
- [x] Performance impact assessed (negligible — single extra test block)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (none needed)
- [x] Related issues/dependencies identified (#71)
- [x] Breaking changes documented (none)
