# GitHub Issue #67: enhancement(request): add correlation/request ID to 5xx client responses and server logs

**Issue:** [#67](https://github.com/denhamparry/djrequests/issues/67)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

After PRs #59 and #65, the `/.netlify/functions/request` endpoint deliberately
returns generic 5xx messages ("Request service is temporarily unavailable.",
"Failed to reach the request service.", "Google Form responded with status
…"). The redaction fixed a leakage concern but closed off the diagnostic bridge
between a user's complaint and the matching server log line.

### Current Behavior

- On a 500 or 502, the client receives `{ error: '<generic message>' }`.
- The server logs `console.error('[request] …', error)` with no shared
  identifier.
- An operator triaging "my request failed" has no way to locate the specific
  log line that corresponds to the user's failed invocation.

### Expected Behavior

- Every invocation that reaches the `request` handler gets a short correlation
  ID (e.g. `crypto.randomUUID().slice(0, 8)`).
- The correlation ID is included in the server log line for any 5xx-producing
  branch (config failure, fetch failure, non-ok Google Form response).
- The correlation ID is returned to the client in the 5xx JSON body as
  `requestId`.
- The frontend surfaces the `requestId` in the error toast/message so users can
  quote it in support conversations.

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/request.ts`
  - `jsonResponse(statusCode, payload, extraHeaders)` helper is the single
    chokepoint for every response — the correlation ID can be added here or,
    more precisely, only to the 5xx branches to avoid noisy `requestId` on
    success/400/429.
  - Three distinct 5xx branches exist today:
    1. Config error → 500, logged as
       `[request] Google Form configuration error:`.
    2. `fetch` throws → 502, logged via `classifyFetchError` (`[request]
Google Form fetch aborted` / `network error` / `fetch invocation error`).
    3. `!response.ok` → 502, currently not logged at all.
  - **Gap:** the third branch (non-ok upstream response) has no `console.error`
    today; the correlation ID work should also add a log line so the ID is
    actually useful for that branch.

- `netlify/functions/__tests__/request.test.ts`
  - Exhaustive coverage of the 5xx branches exists (config missing, network
    error, abort, invocation error, non-ok response). Each asserts on
    `errorSpy.mock.calls[0][0]` (the first argument). The new log line now
    carries the correlation ID, so tests must assert the log includes a
    `requestId=…` marker **without** pinning a specific value.

- `src/lib/googleForm.ts`
  - Already calls `response.json().catch(() => ({}))` and throws with
    `payload.error`. It must also surface `payload.requestId` on failure (via
    an `Error` subclass or property) without changing the happy-path return
    type.

- `src/App.tsx`
  - `handleRequest` catches the thrown error and shows `error.message` in the
    feedback banner. It will append the `requestId` when present.

### Related Context

- #50 introduced the 500 config-error redaction and server-side logging.
- #60 introduced the 502 fetch redaction.
- #66 split the fetch catch into distinct labels (abort / network /
  invocation).
- Issue #67 (this plan) was surfaced by `silent-failure-hunter` during review
  of #65.

## Solution Design

### Approach

Generate a correlation ID once at the top of the handler, pass it through the
5xx response path, and include it in every server log line that could be the
target of a user-reported 5xx.

**Design choices:**

- **ID source:** `crypto.randomUUID().slice(0, 8)` — Node 20+ (Netlify runtime)
  has `crypto.randomUUID` on the global `crypto`. 8 hex chars ≈ 32 bits of
  entropy, enough to disambiguate log lines within a reasonable time window
  while staying short enough to read aloud / paste into a support message.
- **ID placement in response:** only on 5xx responses. 2xx/4xx/429 do not need
  it (success is success; 400 comes with a specific message; 429 is
  rate-limited, not a failure the user would triage). This keeps the client
  API contract minimal.
- **Logging format:** prefix each log line with `requestId=<id>` after the
  existing `[request] …` label, e.g.
  `[request] Google Form network error (requestId=abc12345)`.
  Keeping the label stable preserves the existing log-grep workflow.
- **Client surfacing:** `submitSongRequest` throws a `RequestError` that
  carries `requestId` as a property, preserving the `Error.message` that the
  UI already renders. The UI appends `(ref: abc12345)` to the error banner.

### Implementation

1. Extract a tiny `generateRequestId()` helper in `request.ts` (not a new
   module — a top-level function suffices, easy to mock in tests if needed).
2. Call `const requestId = generateRequestId();` after method/body checks but
   before the first branch that could return a 5xx (i.e. just before the
   config block).
3. Thread `requestId` into:
   - `console.error('[request] Google Form configuration error (requestId=' +
     requestId + '):', configError)`
   - `console.error(\`${classifyFetchError(fetchError)} (requestId=${requestId})\`, fetchError)`
   - A **new** `console.error` before the non-ok 502 return so that branch is
     also traceable.
   - The `jsonResponse(500|502, { error: '…', requestId })` payloads.
4. In `src/lib/googleForm.ts`, export a `RequestError` (or extend the thrown
   `Error` with a `requestId` property) so `App.tsx` can render it without a
   type gymnastics.
5. In `src/App.tsx`, adjust the error path of `handleRequest` to append
   `(ref: ${requestId})` when present.

### Benefits

- Operator can grep Netlify function logs for
  `requestId=abc12345` to find the exact failing invocation.
- Users can quote the ref in a Slack/DM message to the DJ.
- No re-introduction of upstream error details — the ID is
  server-generated and carries no sensitive information.

## Implementation Plan

### Step 1: Add correlation ID to `request.ts`

**File:** `netlify/functions/request.ts`

**Changes:**

- Add a helper near the top:

  ```ts
  const generateRequestId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  ```

  The fallback keeps tests portable even if a runtime strips `crypto` (current
  Node test runner has it, but belt-and-braces is cheap).

- In `handler`, after `validateRequestBody` succeeds, generate
  `const requestId = generateRequestId();`.

- Update the three 5xx branches to:
  1. Config error: log
     `console.error(\`[request] Google Form configuration error (requestId=${requestId}):\`, configError)`
     and return
     `jsonResponse(500, { error: '…', requestId })`.
  2. Fetch error: log
     `console.error(\`${classifyFetchError(fetchError)} (requestId=${requestId})\`, fetchError)`
     and return
     `jsonResponse(502, { error: '…', requestId })`.
  3. Non-ok response: add
     `console.error(\`[request] Google Form responded with status ${response.status} (requestId=${requestId})\`)`
     and return
     `jsonResponse(502, { error: \`Google Form responded with status ${response.status}\`, requestId })`.

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/request.test.ts
```

### Step 2: Update `request.test.ts`

**File:** `netlify/functions/__tests__/request.test.ts`

**Changes:**

- For the four 5xx tests that currently exist (config missing, network error,
  abort, invocation error, non-ok response), assert:
  - `JSON.parse(response.body).requestId` is a string of length 8.
  - `errorSpy.mock.calls[0][0]` matches
    `/\(requestId=[0-9a-f]{8}\)/` **and** still contains the original label
    (e.g. `[request] Google Form network error`).
- Add a new assertion in the "returns error when Google Form submission fails"
  test that the new log line is emitted (it wasn't logged before) with the
  `requestId=` marker.
- Optionally assert that 2xx / 400 / 429 responses do **not** include
  `requestId` to pin the API contract.

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/request.test.ts
```

### Step 3: Expose `requestId` to the frontend

**File:** `src/lib/googleForm.ts`

**Changes:**

- Define an internal `RequestError extends Error` that accepts
  `{ message, requestId }` and exposes `requestId?: string`.
- In the `!response.ok` branch, read `payload?.requestId` (string or
  undefined) and throw a `RequestError` carrying both fields.

**Testing:**

- Existing tests in `src/__tests__/googleForm.test.ts` (if any) continue to
  pass; add a new test asserting `requestId` propagates on failure.

### Step 4: Surface `requestId` in the UI

**File:** `src/App.tsx`

**Changes:**

- In the `catch` block of `handleRequest`, read `submissionError.requestId`
  (narrowing via `instanceof RequestError` or `in` check) and, when present,
  append `(ref: ${requestId})` to the feedback message.

**Testing:**

- Extend an existing component test (or add one) to assert the banner text
  contains the ref when the mocked request fails with a `requestId`.

### Step 5: Update `CLAUDE.md` "Known Issues" if helpful

Optional — if the ref format is user-visible support advice ("quote the ref
after your error"), add a short note under the Google Form Integration
section. Keep it terse; the primary documentation is the code itself.

## Testing Strategy

### Unit Testing

- `request.ts`: all 5xx branches assert the presence of
  `requestId` in the client body and `(requestId=…)` in the server log.
- `googleForm.ts`: assert `RequestError.requestId` is populated when the
  server returns it.

### Integration Testing

**Test Case 1: Config missing → 500 with ref**

1. Unset both env vars.
2. Call handler.
3. Assert `statusCode === 500`, `body.requestId` matches `/^[0-9a-f]{8}$/`,
   and the server log line includes that same ID.

**Test Case 2: Fetch rejects (network) → 502 with ref**

1. Mock fetch to reject with `TypeError('fetch failed')` + cause.
2. Assert `statusCode === 502`, `body.requestId` present, log line contains
   `[request] Google Form network error (requestId=<body.requestId>)`.

**Test Case 3: Upstream non-ok → 502 with ref**

1. Mock fetch to resolve with `{ ok: false, status: 500 }`.
2. Assert `statusCode === 502`, `body.requestId` present, and a new log line
   exists with the same ref.

### Regression Testing

- 2xx happy-path submission still returns only `{ message: … }` (no
  `requestId` leakage).
- 400 validation failures still return only `{ error: … }`.
- 429 rate-limit response unchanged.
- Playwright e2e smoke test still passes — no user-visible change on the
  happy path.

## Success Criteria

- [ ] `request.ts` generates a short correlation ID per invocation and
      includes it in all three 5xx log branches.
- [ ] All 5xx JSON bodies include `requestId`; 2xx/400/429 do not.
- [ ] New 502 log line added for the non-ok Google Form branch.
- [ ] `submitSongRequest` surfaces `requestId` to the UI via a typed error.
- [ ] Error banner in `App.tsx` displays `(ref: …)` when a `requestId` is
      present.
- [ ] Unit tests cover all 5xx branches (server + client).
- [ ] `npm run test:unit` and `npm run test:e2e` both pass.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `netlify/functions/request.ts` — add `generateRequestId`, thread ID into
   logs and 5xx responses, add log line for non-ok branch.
2. `netlify/functions/__tests__/request.test.ts` — assert `requestId` in body
   and logs for 5xx branches; cover new log line.
3. `src/lib/googleForm.ts` — throw `RequestError` carrying `requestId`.
4. `src/App.tsx` — append `(ref: …)` to error feedback when present.
5. `docs/plan/issues/67_add_correlation_id_to_5xx_responses_and_logs.md` —
   this plan document.

Optionally:

6. A new/updated test under `src/__tests__/` to cover the UI ref append.

## Related Issues and Tasks

### Depends On

- Nothing — standalone enhancement.

### Blocks

- None.

### Related

- #50 — established config-error redaction pattern.
- #60 — established 502 redaction pattern.
- #65 — PR that implemented #60 and surfaced this suggestion.
- #66 — labelled fetch failures distinctly (log format this plan extends).

### Enables

- Future work to emit correlation IDs into the `search` function for full
  cross-function traceability.

## References

- [GitHub Issue #67](https://github.com/denhamparry/djrequests/issues/67)
- [PR #65 review comment from silent-failure-hunter](https://github.com/denhamparry/djrequests/pull/65)
- Node `crypto.randomUUID` — Node 19+ exposes it on the global `crypto`.

## Notes

### Key Insights

- The non-ok upstream branch was the weakest link: it returned a 502 but
  emitted no log line. Adding the correlation ID is a natural excuse to fix
  that regression too.
- Keeping `requestId` off 2xx/400/429 responses keeps the API contract tight
  and avoids tempting clients to treat it as a generic trace ID.

### Alternative Approaches Considered

1. **Reuse Netlify's `x-nf-request-id` header** — rejected ❌. Not every
   runtime surfaces it into `event.headers` reliably, and it is longer than a
   human-quotable ref.
2. **Full UUID** — rejected ❌. 36 characters is unwieldy in a user-visible
   error toast; 8 hex chars is enough to disambiguate a handful of
   near-simultaneous failures.
3. **Thread the ID via `AsyncLocalStorage`** — rejected ❌. Overkill for a
   single function with three explicit log sites; a local variable is
   clearer.

### Best Practices

- Never re-introduce upstream error details into the client payload — the
  correlation ID is the whole point.
- When logging, put the ref in parentheses at the end of the label so
  existing grep patterns (`rg '\[request\] Google Form network error'`) still
  match.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation with the minor required
  changes below addressed inline (no plan re-revision needed).

### Strengths

- Scope matches the issue (#67) exactly — no scope creep into the search
  function or into 2xx/400/429 responses.
- Correctly identifies a latent gap: the `!response.ok` branch currently emits
  no `console.error`, and this plan fixes that as a side-effect of adding the
  correlation ID.
- Preserves the existing log-label prefixes (`[request] Google Form network
  error`, etc.), so existing `rg` / grep runbooks keep working.
- Test strategy is concrete: `/\(requestId=[0-9a-f]{8}\)/` for the log line,
  `length === 8` for the body field, and an explicit regression check that
  `requestId` does NOT appear on 2xx/400/429.
- Good choice of ID length (8 hex chars, ~32 bits) — short enough to quote
  verbally, long enough to disambiguate near-simultaneous failures.

### Gaps Identified

1. **Plan mentions "four 5xx tests" then lists five.**
   - **Impact:** Low (cosmetic)
   - **Recommendation:** During implementation, just update all five: config
     missing, network error, abort, invocation error, non-ok response.

### Edge Cases Not Covered

1. **Two requests generate the same 8-char ID within the same log window.**
   - **Current Plan:** Treats 32 bits as "enough to disambiguate". For DJ
     Requests scale (tens of requests per event) this is fine — birthday
     collision around ~65k.
   - **Recommendation:** No change required. Document collision probability
     only if operators ask.

2. **Log line is `[request] Google Form network error (requestId=abc12345)`
   but the error object's `.stack` is still passed as the second `console.error`
   argument.**
   - **Current Plan:** Unchanged — second arg is still the error.
   - **Recommendation:** Fine; Netlify's log backend flattens both args into
     the same line. No change.

### Alternative Approaches (review-level)

1. **Use Netlify's `x-nf-request-id` header instead of generating one.**
   - **Pros:** Zero-cost, already unique per invocation, survives into
     Netlify's own observability UI.
   - **Cons:** Long (36 char UUID-ish), not guaranteed present in `netlify
dev`, couples the client-visible ref to Netlify's internal format.
   - **Verdict:** Plan's choice (`crypto.randomUUID().slice(0, 8)`) is
     better — shorter, portable across local/test/prod.

2. **Attach a property to a plain `Error` vs. subclass `RequestError`.**
   - **Pros (plain property):** Zero type gymnastics, works with `(err as
any).requestId`.
   - **Pros (subclass):** Type-safe `instanceof RequestError`, exported
     contract.
   - **Verdict:** Plan mentions both. Recommend going with the subclass for
     the `instanceof` narrowing in `App.tsx` — cleaner and matches the small
     amount of public API already in `googleForm.ts`.

### Risks and Concerns

1. **Fallback `Math.random().toString(16).slice(2, 10)` is unreachable
   code.**
   - **Likelihood:** High (that it's unreachable)
   - **Impact:** Low (it's just dead code)
   - **Mitigation:** Node 22 types are already installed (`@types/node:
^22.5.1`) and Netlify runs Node 20+; `crypto.randomUUID` is always present.
     Project CLAUDE.md policy discourages fallbacks for scenarios that
     cannot happen. **Required change:** drop the fallback and call
     `crypto.randomUUID().slice(0, 8)` directly.

2. **The plan's `(requestId=…)` placement after the label string means the
   existing test assertion `errorSpy.mock.calls[0][0]` is no longer an
   equality match.**
   - **Likelihood:** High
   - **Impact:** Medium (tests fail until updated)
   - **Mitigation:** Plan already calls this out — the implementation step
     must update assertions to `toContain(...)` + regex match. Flagging here
     so it isn't skipped.

3. **Extending the thrown error to carry `requestId` via a subclass must be
   exported from `googleForm.ts` and imported in `App.tsx`.**
   - **Likelihood:** Medium (easy to forget)
   - **Impact:** Low (TypeScript will catch it)
   - **Mitigation:** Ensure `RequestError` is exported.

### Required Changes

**Changes that must be made during implementation (no plan re-revision):**

- [ ] Drop the `Math.random` fallback in `generateRequestId` — call
      `crypto.randomUUID().slice(0, 8)` directly.
- [ ] Commit to the `RequestError` subclass approach (rather than ad-hoc
      property on `Error`) and export it from `src/lib/googleForm.ts`.
- [ ] Update all five existing 5xx tests (not four) to assert `requestId` in
      body and `(requestId=...)` in logs.

### Optional Improvements

- [ ] Add a tiny util-level test for `generateRequestId` asserting
      `/^[0-9a-f]{8}$/` — trivial but documents intent.
- [ ] Consider a `Ref:` prefix (localised friendlier) in the UI instead of
      `ref:`. Not required.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified
      `netlify/functions/request.ts`, `src/lib/googleForm.ts`, `src/App.tsx`,
      and the 5xx test cases)
- [x] Security implications considered (no leakage re-introduced; the ID is
      server-generated and content-free)
- [x] Performance impact assessed (one `randomUUID` call per invocation —
      negligible)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (plan mentions optional CLAUDE.md note)
- [x] Related issues/dependencies identified (#50, #60, #65, #66)
- [x] Breaking changes documented (none — new optional field on 5xx bodies)
