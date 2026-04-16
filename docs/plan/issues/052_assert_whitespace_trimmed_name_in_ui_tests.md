# GitHub Issue #52: assert whitespace-trimmed name is sent to /request in UI tests

**Issue:** [#52](https://github.com/denhamparry/djrequests/issues/52)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

`App.tsx` trims `requesterName` client-side (line 20: `const trimmedName = requesterName.trim();`) before passing it into `submitSongRequest`. Server-side validation in `netlify/functions/request.ts` also trims, so correctness is covered — but there is no UI-level test asserting the contract that _what the user types_ with leading/trailing whitespace arrives _trimmed_ at the request endpoint.

### Current Behavior

- `src/__tests__/SearchView.test.tsx` covers the happy submission path with `await user.type(..., 'Avery')` — no whitespace variant.
- A future refactor that drops the client-side trim would still pass all existing UI tests (server compensates), silently shifting the UX contract.

### Expected Behavior

- A UI test that types a name with surrounding whitespace (e.g. `"  Avery  "` (two leading/trailing spaces)) into the "Your name" input.
- The MSW `/.netlify/functions/request` handler asserts `body.requester.name === 'Avery'` (trimmed).
- Removing the `.trim()` at `App.tsx:20` causes this test to fail, locking the UX contract.

## Current State Analysis

### Relevant Code/Config

- `src/App.tsx:20` — `const trimmedName = requesterName.trim();`
- `src/App.tsx:51-54` — passes `trimmedName` into `submitSongRequest` as `requester.name`.
- `src/__tests__/SearchView.test.tsx:119-161` — existing submission test, MSW handler already asserts `body.requester.name === 'Avery'` but input has no whitespace.

### Related Context

- Issue #51 / commit `d061b50` — made `Requester.name` required at compile time.
- Server-side trim is in `netlify/functions/request.ts` (validation layer).
- Issue is labelled `enhancement` + `nice-to-have`.

## Solution Design

### Approach

Add a single new `it(...)` block to `src/__tests__/SearchView.test.tsx` that mirrors the existing "submits the song request" test, but:

1. Types `"  Avery  "` (two leading/trailing spaces) into "Your name" (user-event preserves whitespace).
2. The MSW POST handler asserts the received `body.requester.name` is exactly `'Avery'` (no whitespace).

A standalone test (rather than extending the existing one) keeps each test focused on one contract — easier to read when it fails.

### Implementation

One new test in `src/__tests__/SearchView.test.tsx` added alongside the existing submission test. No production code changes.

### Benefits

- Locks the client-side trim as a UX contract.
- Fails loudly if `App.tsx:20` trim is removed in future refactors.
- Zero runtime cost; aligns with the TDD ethos already documented in `CLAUDE.md`.

## Implementation Plan

### Step 1: Add whitespace-trim UI test

**File:** `src/__tests__/SearchView.test.tsx`

**Changes:**

Add the following `it(...)` block inside the `describe('Song search experience', ...)` block, after the existing "submits the song request..." test:

```tsx
it('trims leading/trailing whitespace from the requester name before submitting', async () => {
  const user = userEvent.setup();

  server.use(
    http.get(searchEndpoint, () =>
      HttpResponse.json({
        tracks: [
          {
            id: '777',
            title: 'Harder Better Faster Stronger',
            artist: 'Daft Punk',
            album: 'Discovery',
            artworkUrl: null,
            previewUrl: null
          }
        ]
      })
    ),
    http.post(requestEndpoint, async ({ request }) => {
      const body = (await request.json()) as { requester: { name: string } };
      expect(body.requester.name).toBe('Avery');
      return HttpResponse.json({ message: 'Song request submitted successfully.' });
    })
  );

  render(<App />);

  await user.type(screen.getByLabelText(/Your name/i), '  Avery  ');
  await user.type(screen.getByLabelText(/Search songs/i), 'daft punk');

  const requestButton = await screen.findByRole('button', {
    name: /Request "Harder Better Faster Stronger"/i
  });
  await user.click(requestButton);

  expect(
    await screen.findByText(/Request for "Harder Better Faster Stronger" sent to the DJ queue./i)
  ).toBeInTheDocument();
});
```

**Testing:**

```bash
npm run test:unit -- src/__tests__/SearchView.test.tsx
```

### Step 2: Verify the test catches regressions

Temporarily remove `.trim()` from `src/App.tsx:20` (`const trimmedName = requesterName;`), re-run the test, confirm it fails with a clear message. Restore the trim before committing.

**Testing:**

```bash
npm run test:unit -- src/__tests__/SearchView.test.tsx
```

## Testing Strategy

### Unit Testing

- New Vitest test in `SearchView.test.tsx` asserts MSW-captured body matches trimmed name.
- Run: `npm run test:unit` — all existing tests plus new one must pass.

### Regression Testing

- Existing "submits the song request" test remains untouched.
- Lint: `npm run lint` must pass.
- Full suite: `npm run test:unit` must pass with coverage unchanged or higher.

## Success Criteria

- [ ] New test added to `src/__tests__/SearchView.test.tsx`
- [ ] Test passes with current `App.tsx` trim in place
- [ ] Test fails if `.trim()` is removed from `App.tsx:20` (manually verified)
- [ ] `npm run test:unit` green
- [ ] `npm run lint` green
- [ ] Pre-commit hooks pass

## Files Modified

1. `src/__tests__/SearchView.test.tsx` — add one `it(...)` block asserting trim contract
2. `docs/plan/issues/052_assert_whitespace_trimmed_name_in_ui_tests.md` — this plan

## Related Issues and Tasks

### Related

- Issue #51 (closed in `d061b50`) — made `Requester.name` required
- PR #44 context — original client-side trim introduction

### Enables

- Safe future refactors around requester name handling (test will catch UX regressions)

## References

- [GitHub Issue #52](https://github.com/denhamparry/djrequests/issues/52)
- `src/App.tsx` line 20 — client-side trim
- `src/__tests__/SearchView.test.tsx` — existing UI test suite

## Notes

### Key Insights

- Server-side trim alone isn't enough to lock UX: the client trim governs what the user sees echoed back and what's sent over the wire. A test at the boundary where MSW observes the request body is the right layer.

### Alternative Approaches Considered

1. **Extend the existing "submits" test with whitespace** — rejected; overloading one test makes failure diagnosis harder.
2. **Add an `App.tsx`-unit test on the `trimmedName` derived value** — rejected; derived state isn't exposed, and testing via the real input-to-network path is stronger.
3. **Chosen: new focused `it(...)` block** ✅ — single responsibility, clear failure mode.
