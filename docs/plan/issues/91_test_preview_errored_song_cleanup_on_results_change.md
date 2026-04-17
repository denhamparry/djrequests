# GitHub Issue #91: test(preview): cover erroredSongId cleanup when results change

**Issue:** [#91](https://github.com/denhamparry/djrequests/issues/91)
**Status:** Complete
**Date:** 2026-04-17

## Problem Statement

The `useEffect` at `src/App.tsx:157-164` clears `erroredSongId` when the errored
song is no longer present in `results`. It has no dedicated unit test, so a
refactor that removes or breaks the effect (e.g. consolidating the two results-
watching effects) would not be caught by CI — the 2s auto-clear timer would
still eventually clear the flag, masking the regression.

### Current Behavior (verified)

- `flashPreviewError` (`src/App.tsx:64-71`) sets `erroredSongId` and starts a
  2s auto-clear timer.
- A dedicated effect (`src/App.tsx:157-164`) watches `[results, erroredSongId]`
  and clears the flag + timer when the errored track disappears from results.
- The live region at `src/App.tsx:293-295` derives its announcement from
  `erroredSong`, so the announcement also disappears once the flag clears.

### Expected Behavior Under Test

- After a preview error flashes on track A, changing the search term so A is
  no longer in `results` must clear the error state immediately (before the
  2s timer fires) — preview button returns to `data-state="idle"`, and the
  live-region announcement ("Preview for {track} failed.") is removed.

## Current State Analysis

### Relevant Code

- `src/App.tsx:64-71` — `flashPreviewError` (error trigger).
- `src/App.tsx:157-164` — cleanup effect under test.
- `src/App.tsx:293-295` — live-region paragraph, key derived from
  `erroredSong`.
- `src/__tests__/PreviewButton.test.tsx:162-198` — existing test "shows error
  state when play() rejects with a non-AbortError" is the closest template
  (fake timers, `NotAllowedError` rejection).
- `src/__tests__/PreviewButton.test.tsx:282-312` — existing test "pauses and
  resets when the playing track drops out of results" shows the pattern for
  swapping MSW handlers to simulate a results change via typing more input.

## Proposed Solution

Add a single unit test in `src/__tests__/PreviewButton.test.tsx` following the
patterns already established in that file. Use real timers (not fake) so we
can assert that cleanup happens **before** the 2s auto-clear would fire —
fake timers would make the assertion ambiguous.

### Test Outline

```text
it('clears the error state when the errored track drops out of results', ...)
  1. Mock play() to reject with NotAllowedError.
  2. Render with tracks [Song One].
  3. Click Preview Song One, wait for data-state="error" and the live-region
     announcement "Preview for Song One failed."
  4. Swap MSW handler so the next fetch returns [Song Two] only.
  5. Type more input to trigger a new debounced search.
  6. Wait for Song One to disappear from the DOM.
  7. Assert the live-region announcement is gone and Song Two's preview
     button is data-state="idle" (no button in error state).
```

### Why real timers?

The 2s `PREVIEW_ERROR_DISPLAY_MS` timer would also clear `erroredSongId` on
its own. With fake timers we would have to carefully advance just less than
2000 ms to prove the effect — not the timer — did the work. With real timers,
the results-change cleanup happens synchronously on the next render (well
under 2s in test), and we avoid `vi.useFakeTimers` ceremony.

## Implementation Steps

1. Add the test described above to
   `src/__tests__/PreviewButton.test.tsx` (grouped alongside the existing
   error-state tests).
2. Run `npm run test:unit` and confirm the new test passes.
3. Confirm ESLint passes: `npm run lint`.

## Files Modified

- `src/__tests__/PreviewButton.test.tsx` — one new test case added.

## Acceptance Criteria

- [x] New test added that exercises the `src/App.tsx:157-164` cleanup effect.
- [x] Test passes locally under `npm run test:unit`.
- [x] Test would fail if the cleanup effect were removed (manually verified
      during authoring).
- [x] No changes to production code under `src/`.
- [x] `npm run lint` passes.

## Out of Scope

- Refactoring the two results-watching effects (`src/App.tsx:148-155` and
  `src/App.tsx:157-164`) into one — tracked separately if desired.
- Adding an equivalent Playwright e2e test — unit coverage is sufficient for
  this internal state-sync concern.
