# GitHub Issue #71: test(request): add client-side tests for RequestError and UI ref banner

**Issue:**
[#71](https://github.com/denhamparry/djrequests/issues/71)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

The `requestId` correlation-ID feature (introduced in #67 / PR #70) is well
tested on the Netlify-function side but has **no client-side coverage**. Two
gaps:

1. `src/lib/googleForm.ts` has no test directory at all. The `RequestError`
   class is the function↔UI contract, and silent refactors (renaming the
   class, dropping the `.requestId` property, reading
   `payload.request_id` instead of `payload.requestId`) would pass CI today.
2. `src/__tests__/SearchView.test.tsx` does not assert the `(ref: <id>)`
   suffix on the feedback banner. A regression that stops rendering the ref
   would ship unnoticed.

### Current Behavior

- `googleForm.ts` has 0% line coverage (coverage report earlier showed
  `src/lib/googleForm.ts` uncovered).
- `SearchView.test.tsx` has 7 tests, none of which touch the error-feedback
  branch or the `(ref: …)` suffix.

### Expected Behavior

- `RequestError` contract is pinned by direct unit tests against
  `submitSongRequest`.
- The UI feedback banner is asserted to include `(ref: <id>)` when the
  function returns `requestId`, and to omit the `(ref:` substring when it
  does not.

## Current State Analysis

### Relevant Code/Config

- `src/lib/googleForm.ts` — defines `RequestError` (with optional
  `requestId`) and `submitSongRequest`. `requestId` is type-guarded:
  `typeof payload?.requestId === 'string' ? payload.requestId : undefined`.
- `src/App.tsx` (lines 59–68) — builds the feedback message:
  `errorMessage = requestId ? ${baseMessage} (ref: ${requestId}) : baseMessage`.
- `src/__tests__/SearchView.test.tsx` — existing MSW-based React tests for
  `App`. Uses `http.post(requestEndpoint, …)` to mock the submission endpoint.
- `src/test/msw-server.ts` — shared MSW setup.
- `netlify/functions/__tests__/request.test.ts` — precedent for stubbing
  `fetch` with `vi.stubGlobal`.

### Related Context

- #67 / PR #70 — introduced correlation ID, `RequestError.requestId`, and
  the `(ref: <id>)` UI suffix.
- #68 — extended logs with `trackId`; client-side contract unchanged.
- Vitest config: `vite.config.ts` drives coverage; `src/test/msw-server.ts`
  is the existing mock hub.

## Solution Design

### Approach

Two test-only additions — no production-code change:

1. **New file** `src/lib/__tests__/googleForm.test.ts` — unit-test
   `submitSongRequest` and `RequestError` with `fetch` stubbed via
   `vi.stubGlobal`. Four cases (drawn directly from the issue body):
   - `!response.ok` with `{ error, requestId }` → throws `RequestError`
     with `.requestId` set and `.name === 'RequestError'`.
   - `!response.ok` with `{ error }` only → `.requestId === undefined`.
   - `!response.ok` with non-string `requestId` (e.g. `123`) →
     `.requestId === undefined` (defensive type guard).
   - Success path returns parsed payload unchanged.

2. **Extend** `src/__tests__/SearchView.test.tsx` with two MSW-driven cases:
   - 502 + `{ error, requestId: 'abc12345' }` → banner contains
     `(ref: abc12345)`.
   - 400 + `{ error }` (no `requestId`) → banner shows base message with
     no `(ref:` substring.

### Trade-offs Considered

1. **Put client lib tests inside `src/__tests__/`** — Rejected. Project
   convention collocates tests next to source in `__tests__/` subdirs
   (see `apps-script/__tests__/`, `netlify/functions/__tests__/`).
2. **Use MSW for googleForm unit tests** — Rejected. MSW is an interceptor
   for the network boundary; for direct client-library unit tests with no
   React component, a `vi.stubGlobal('fetch', …)` mock is simpler, faster,
   and mirrors the existing `request.test.ts` pattern.
3. **Chosen: vitest + fetch stub for lib; MSW for UI** — Matches two
   existing precedents already in the repo.

### Benefits

- Future refactors that drop `RequestError.requestId`, rename the class, or
  break the JSON shape fail CI.
- UI regression that removes the `(ref: <id>)` suffix fails CI.
- Unblocks confident iteration on the logging/correlation-ID surface area.

## Implementation Plan

### Step 1: Add googleForm unit tests

**File:** `src/lib/__tests__/googleForm.test.ts` (new)

**Changes:**

Create the test file with a `vi.stubGlobal('fetch', …)` setup:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError, submitSongRequest } from '../googleForm';
import type { Requester, Song } from '../../../shared/types';

const song: Song = { id: '1', title: 'T', artist: 'A' };
const requester: Requester = { name: 'Avery' };

describe('submitSongRequest', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the parsed payload on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Song request submitted successfully.' })
    });

    const result = await submitSongRequest(song, requester);
    expect(result).toEqual({ message: 'Song request submitted successfully.' });
  });

  it('throws RequestError with requestId when the function returns one', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Upstream failed.', requestId: 'abc12345' })
    });

    await expect(submitSongRequest(song, requester)).rejects.toMatchObject({
      name: 'RequestError',
      message: 'Upstream failed.',
      requestId: 'abc12345'
    });
  });

  it('throws RequestError with undefined requestId when none is returned', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad input.' })
    });

    try {
      await submitSongRequest(song, requester);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequestError);
      expect((err as RequestError).requestId).toBeUndefined();
      expect((err as RequestError).message).toBe('Bad input.');
    }
  });

  it('treats non-string requestId as undefined (defensive type guard)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Oops.', requestId: 123 })
    });

    try {
      await submitSongRequest(song, requester);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as RequestError).requestId).toBeUndefined();
    }
  });
});
```

**Testing:**

```bash
npm run test:unit -- --run src/lib/__tests__/googleForm.test.ts
```

### Step 2: Extend SearchView tests with ref-banner coverage

**File:** `src/__tests__/SearchView.test.tsx`

Add two new `it` blocks inside the existing `describe('Song search experience', …)` block.

```tsx
it('includes the (ref: <id>) suffix when the submission fails with a requestId', async () => {
  const user = userEvent.setup();

  server.use(
    http.get(searchEndpoint, () =>
      HttpResponse.json({
        tracks: [
          { id: '1', title: 'T', artist: 'A', album: null, artworkUrl: null, previewUrl: null }
        ]
      })
    ),
    http.post(requestEndpoint, () =>
      HttpResponse.json(
        { error: 'Failed to reach the request service.', requestId: 'abc12345' },
        { status: 502 }
      )
    )
  );

  render(<App />);
  await user.type(screen.getByLabelText(/Your name/i), 'Avery');
  await user.type(screen.getByLabelText(/Search songs/i), 'anything');
  await user.click(await screen.findByRole('button', { name: /Request "T"/i }));

  expect(
    await screen.findByText(/\(ref: abc12345\)/)
  ).toBeInTheDocument();
});

it('does not include (ref: ...) when the submission fails without a requestId', async () => {
  const user = userEvent.setup();

  server.use(
    http.get(searchEndpoint, () =>
      HttpResponse.json({
        tracks: [
          { id: '2', title: 'T2', artist: 'A', album: null, artworkUrl: null, previewUrl: null }
        ]
      })
    ),
    http.post(requestEndpoint, () =>
      HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    )
  );

  render(<App />);
  await user.type(screen.getByLabelText(/Your name/i), 'Avery');
  await user.type(screen.getByLabelText(/Search songs/i), 'anything');
  await user.click(await screen.findByRole('button', { name: /Request "T2"/i }));

  const banner = await screen.findByText(/Invalid JSON payload/);
  expect(banner).toBeInTheDocument();
  expect(banner.textContent).not.toMatch(/\(ref:/);
});
```

**Testing:**

```bash
npm run test:unit -- --run src/__tests__/SearchView.test.tsx
```

## Testing Strategy

### Unit Testing

- New `googleForm.test.ts` covers four branches (success + three error
  shapes); all use `vi.stubGlobal('fetch', …)`.
- No new dependencies.

### Integration Testing

- Extended `SearchView.test.tsx` cases exercise the full React →
  `submitSongRequest` → feedback-banner path with MSW.

### Regression Testing

- The seven existing `SearchView.test.tsx` cases stay untouched; only two
  are added.
- `googleForm.ts` is imported by `App.tsx`; existing App tests already
  exercise the success path end-to-end.

## Success Criteria

- [ ] New file `src/lib/__tests__/googleForm.test.ts` with 4 passing tests
- [ ] Two new passing tests in `src/__tests__/SearchView.test.tsx`
- [ ] `npm run test:unit` passes end-to-end
- [ ] `npm run lint` clean
- [ ] Pre-commit hooks pass
- [ ] `googleForm.ts` coverage rises from 0% to ≥ 80% lines

## Files Modified

1. `src/lib/__tests__/googleForm.test.ts` — new file (4 tests)
2. `src/__tests__/SearchView.test.tsx` — add 2 tests

## Related Issues and Tasks

### Depends On

- #67 / PR #70 — introduced `RequestError` / `requestId` / `(ref: …)`
  banner that these tests pin.

### Related

- #50, #60, #65, #66, #68 — adjacent logging / redaction / correlation-ID
  hardening.

### Enables

- Confident future refactors of the client↔function error contract.

## References

- [GitHub Issue #71](https://github.com/denhamparry/djrequests/issues/71)
- PR #70 — correlation-ID UI surface

## Notes

### Key Insights

- `RequestError.requestId` is the whole contract — pinning it by name,
  class identity, and the non-string-guard branch is what prevents the
  three failure modes listed in the issue.
- Using `vi.stubGlobal('fetch', …)` avoids pulling `App.tsx` into the
  library-level test and keeps these tests snappy.

### Best Practices

- Prefer `toMatchObject` for error assertions when you care about specific
  fields but not strict equality of the whole object (errors often carry
  stack traces and prototype chain metadata).

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Test-only scope with zero production-code risk.
- Mirrors two existing test precedents (`request.test.ts` for `vi.stubGlobal`,
  `SearchView.test.tsx` for MSW) — no new patterns introduced.
- Four `googleForm` cases map 1:1 to the issue body's requirements,
  including the non-string-`requestId` defensive branch.
- Pins `.name === 'RequestError'` via `toMatchObject({ name: 'RequestError' })`
  — catches the exact refactor scenarios the issue calls out.

### Gaps Identified

1. **Fetch-throws branch not covered.**
   - **Impact:** Low
   - **Observation:** The plan covers `!response.ok` and the success path,
     but not `fetch` itself rejecting (network error). Currently
     `submitSongRequest` does not catch this — it lets the raw `TypeError`
     bubble up — so the App-side `instanceof RequestError` check evaluates
     to false and `.requestId` ends up undefined. This is existing
     behaviour and out of scope for the issue.
   - **Recommendation:** Do not extend scope here. If this becomes a
     concern, track it as a follow-up.

### Edge Cases Not Covered

None blocking. The three failure-mode shapes the issue enumerates are
covered.

### Alternative Approaches Considered

1. **Also add an E2E Playwright test for the banner.**
   - **Pros:** End-to-end browser assertion.
   - **Cons:** Slower; MSW + jsdom already exercises the same code path.
   - **Verdict:** Over-engineered for a test-only enhancement.

### Risks and Concerns

None of note. Test-only PR, no runtime behaviour change.

### Required Changes

None.

### Optional Improvements

- [ ] Consider adding a `fetch`-rejects branch test in a follow-up if the
      team later chooses to surface network errors as `RequestError` too.

### Verification Checklist

- [x] Solution addresses gap identified in GitHub issue
- [x] All four `googleForm` cases from issue body covered
- [x] Both UI assertions (with-id / without-id) covered
- [x] File paths and code references are accurate
- [x] No production-code change (test-only)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (N/A — test-only)
- [x] Breaking changes documented (none)
