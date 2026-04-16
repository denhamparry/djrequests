# GitHub Issue #75: test(client): extract shared helper for SearchView request-flow tests

**Issue:** [#75](https://github.com/denhamparry/djrequests/issues/75)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The request-flow tests in `src/__tests__/SearchView.test.tsx` repeat the same
MSW setup + type-name-click-request sequence in every case. The two cases added
in #71 (ref-banner present and absent) each duplicate ~30 lines of boilerplate,
and the other request-flow tests share the same shape.

### Current Behavior

- Each request-flow test in `SearchView.test.tsx` hand-rolls:
  - A `server.use(http.get(searchEndpoint, ...))` returning a single-track
    response
  - A `server.use(http.post(requestEndpoint, ...))` handler
  - `userEvent.setup()` + `render(<App />)`
  - `user.type` the requester name, `user.type` the search input
  - `user.click` on the track's `Request "..."` button
- The tests that follow this pattern include at minimum:
  - "submits the song request through the backend and shows confirmation"
  - "trims leading/trailing whitespace from the requester name before
    submitting"
  - "includes the (ref: <id>) suffix when the submission fails with a requestId"
  - "does not include (ref: ...) when the submission fails without a requestId"
- Adding a new case (e.g. a 500-error banner) means copying another 25–30 lines.

### Expected Behavior

- A small helper encapsulates the shared setup so new request-flow cases can be
  expressed in a few lines.
- All existing assertions continue to pass unchanged — this is a refactor,
  not a behaviour change.
- The file is shorter and easier to scan.

## Current State Analysis

### Relevant Code/Config

- `src/__tests__/SearchView.test.tsx` — contains the duplicated setup. The
  request-flow tests at lines 119–272 are the primary refactor targets. The
  non-request-flow tests (search results, error banners, no-results, button
  disabled) are NOT in scope because they either don't POST to `request` or
  have distinct shapes.
- `src/test/msw-server.ts` — existing MSW server; unchanged.
- `src/App.tsx` — source under test; unchanged.

### Related Context

- #71 introduced the two ref-banner cases and surfaced the duplication.
- CLAUDE.md's guidance: "Pure functions: Isolate business logic for testability"
  — the helper itself is a thin wrapper, not business logic, but the principle
  of isolating repeated setup is the same.
- `vitest` + `@testing-library/react` + `msw` are already in the test stack.

## Solution Design

### Approach

Add a single module-scoped helper `renderAndRequest` inside the test file (not
a new file) that:

1. Accepts a `title` string and a `postHandler` (the MSW POST handler body) —
   matches the shape proposed in the issue.
2. Optionally accepts a partial track override so individual tests can set
   distinctive `id`, `artist`, `album`, etc. where they assert on those fields.
3. Registers `server.use(...)` with a GET stub returning a single track built
   from defaults + override, and the POST handler.
4. Calls `userEvent.setup()`, renders `<App />`, types the requester name
   (default `'Avery'`, overridable) and the search term (default `'anything'`,
   overridable), clicks the `Request "<title>"` button, and returns the
   `user` instance plus anything tests still need.

The helper lives in the test file to keep locality — it isn't reused outside
this suite. If future suites want it, extraction to `src/test/` can happen
later.

### Why not a separate file under `src/test/`?

- Only one suite uses it today. Premature extraction violates CLAUDE.md's
  "Don't … introduce abstractions beyond what the task requires."
- Keeping it local keeps the refactor scope tight and the diff reviewable.

### Implementation sketch

```ts
type TrackOverride = Partial<{
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
}>;

const defaultTrack = {
  id: '1',
  artist: 'A',
  album: null as string | null,
  artworkUrl: null as string | null,
  previewUrl: null as string | null
};

const renderAndRequest = async (
  title: string,
  postHandler: Parameters<typeof http.post>[1],
  opts: { name?: string; searchTerm?: string; track?: TrackOverride } = {}
) => {
  const { name = 'Avery', searchTerm = 'anything', track } = opts;
  const merged = { ...defaultTrack, title, ...track };

  server.use(
    http.get(searchEndpoint, () => HttpResponse.json({ tracks: [merged] })),
    http.post(requestEndpoint, postHandler)
  );

  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/Your name/i), name);
  await user.type(screen.getByLabelText(/Search songs/i), searchTerm);
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`Request "${title}"`) })
  );

  return { user };
};
```

### Benefits

- Each refactored request-flow test drops from ~25–35 lines to ~8–12 lines.
- Adding the mentioned "500-error banner" or similar future cases becomes a
  one-liner handler plus an assertion.
- The intent of each test (what the POST handler asserts, what the banner
  should say) becomes more prominent because boilerplate is gone.

## Implementation Plan

### Step 1: Add the `renderAndRequest` helper

**File:** `src/__tests__/SearchView.test.tsx`

**Changes:**

- Add `defaultTrack`, `TrackOverride` type, and `renderAndRequest` helper near
  the top of the file (just below the endpoint constants).

### Step 2: Refactor the request-flow tests

**File:** `src/__tests__/SearchView.test.tsx`

Refactor these tests to use `renderAndRequest` while preserving all existing
assertions (the POST handler assertions, the banner text assertions, etc.):

1. "submits the song request through the backend and shows confirmation"
2. "trims leading/trailing whitespace from the requester name before
   submitting"
3. "includes the (ref: <id>) suffix when the submission fails with a
   requestId"
4. "does not include (ref: ...) when the submission fails without a
   requestId"

The whitespace-trim test needs `name: '  Avery  '` passed through so the POST
handler still receives `'Avery'` (the assertion stays exactly as it is).

### Step 3: Leave out-of-scope tests alone

Do NOT refactor these — they don't match the request-flow shape or would be
obscured by the helper:

- "shows results after a debounced search"
- "shows an error when the API responds with an error"
- "shows a friendly outage message when the upstream is unavailable"
- "shows a helpful message when there are no results"
- "disables request buttons until a requester name is entered"

### Step 4: Run tests + lint

```bash
npm run test:unit -- --run src/__tests__/SearchView.test.tsx
npm run lint
```

All refactored tests must pass with the same assertions. No snapshot or
behaviour changes expected.

## Testing Strategy

### Unit Testing

- Run the SearchView suite and confirm all 9 tests still pass.
- Confirm the 4 refactored tests still assert on:
  - Request body (song.id, song.title, requester.name) where applicable
  - Whitespace trimming of the requester name
  - `(ref: abc12345)` appearing in the error banner
  - `(ref:` NOT appearing when no requestId is returned

### Regression Testing

- Full `npm run test:unit` to confirm no collateral breakage.
- `npm run lint` to confirm ESLint is clean.

### What we deliberately do not test

- No new test cases are added in this issue. The scope is pure refactor. If a
  future issue wants a 500-error case, it can be added as a one-liner using the
  new helper.

## Success Criteria

- [ ] `renderAndRequest` helper exists in `src/__tests__/SearchView.test.tsx`.
- [ ] 4 request-flow tests use the helper.
- [ ] All existing assertions are preserved verbatim.
- [ ] `npm run test:unit` passes.
- [ ] `npm run lint` passes.
- [ ] File line count is lower than before (directional check — not a hard
      gate).

## Files Modified

1. `src/__tests__/SearchView.test.tsx` — add `renderAndRequest` helper and
   refactor 4 request-flow tests to use it.

## Related Issues and Tasks

### Depends On

- None. #71 is already merged.

### Related

- #71 — original PR whose code review surfaced this enhancement.

### Enables

- Easier addition of future request-flow cases (e.g. 500-error banner).

## References

- [GitHub Issue #75](https://github.com/denhamparry/djrequests/issues/75)
- `src/__tests__/SearchView.test.tsx` (current implementation)
- CLAUDE.md — "Pure functions" and "Don't add abstractions beyond what the
  task requires"

## Notes

### Key Insights

- The helper must accept a `track` override because tests assert on
  `song.id` and `song.title` — a one-size-fits-all fixture would lose
  fidelity.
- The whitespace-trim test needs a configurable `name` so the helper isn't
  tied to `'Avery'`.
- Keeping the helper in the test file (not in `src/test/`) matches the
  one-consumer rule and keeps the diff small.

### Alternative Approaches Considered

1. **Extract helper to `src/test/renderAndRequest.ts`** — Rejected ❌.
   Premature; only one consumer. Adds import noise without a second caller.
2. **Parameterise with a full MSW handler factory** — Rejected ❌. The
   proposed shape (title + postHandler + optional overrides) is what the issue
   asks for and what the call sites need.
3. **Refactor all tests in the suite (including non-request-flow)** —
   Rejected ❌. The search/error/no-results tests don't share the request-flow
   shape; forcing them through the helper would obscure intent.

### Best Practices

- Keep the helper in the test file until a second consumer shows up.
- Preserve every existing assertion — this is a refactor, not a behaviour
  change.
- Use sensible defaults (`name = 'Avery'`, `searchTerm = 'anything'`) so
  most call sites can omit those args.
