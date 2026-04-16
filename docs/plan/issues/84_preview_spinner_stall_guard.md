# GitHub Issue #84: fix(ui): preview spinner may stall if media events do not fire on slow networks

**Issue:** [#84](https://github.com/denhamparry/djrequests/issues/84)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

In `src/App.tsx`, `loadingSongId` is cleared only when `playing`, `pause`,
`ended`, or `error` fires on the shared `<audio>` element. On stalled-network
edge cases (some mobile Safari, backgrounded tabs), `play()` can resolve
without any of those events firing promptly — the button stays in its
loading spinner state indefinitely.

### Current Behavior

- User taps preview on a flaky network.
- Spinner spins; never advances to `playing` (because media data never
  buffers) and never errors (because the socket hasn't timed out yet).
- Button appears broken until the user clicks it again or navigates away.

### Expected Behavior

- If the audio element cannot start playback within a reasonable window,
  the spinner clears and the button returns to idle.
- User can try again without refreshing.

## Current State Analysis

### Relevant Code

- **`src/App.tsx`** `ensureAudio()` (lines 28–44) wires listeners for
  `playing`, `ended`, `pause`, `error`. No listener for `stalled`.
- **`togglePreview()`** (lines 46–69) sets `loadingSongId = song.id`
  before `audio.play()`. There is no bounded timeout guarding the
  transition from loading → playing.

### Related Context

- `HTMLMediaElement` fires `stalled` when the browser is trying to fetch
  media data but cannot make progress. Firing it does not terminate
  the load — it is diagnostic. That makes it the right signal for a
  "user-visible reset" without also forcibly aborting the fetch.
- A bounded safety timeout (e.g. 8 s) is cheap belt-and-braces and
  covers the "events never fire at all" worst case.

## Solution Design

### Approach

Apply **both** guards — they handle different failure modes and their
costs are trivial:

1. **`stalled` event listener** — clears `loadingSongId` when the
   browser signals lack of progress. The audio element keeps trying; if
   data eventually arrives, `playing` fires normally.
2. **Safety timeout** — set when `loadingSongId` flips to a song id;
   clears `loadingSongId` after a ceiling (8 s). Cleared on `playing`,
   `pause`, `ended`, `error`, and on unmount. Ref-stored so we can
   cancel it.

Both guards clear only `loadingSongId`, never `playingSongId` — the
playing-state invariant is owned by `pause`/`ended`/`error`.

### Trade-offs

- **`stalled` alone**: may not fire in all browsers / failure modes. ❌
- **Timeout alone**: works but has to fire even in healthy cases if the
  user's connection is just slow. ❌
- **Both**: stalled fires fast when available; timeout is a last-resort
  ceiling. ✅

### Benefits

- Preview button always recovers within ≤ 8 s worst case.
- No new dependencies; minimal code.

## Implementation Plan

### Step 1: Add `stalled` listener + safety timeout ref

**File:** `src/App.tsx`

**Changes:**

- Add `const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);`.
- Extract a tiny helper `clearLoadingTimer()` that clears and nulls the
  ref — used in 4 places.
- In `ensureAudio`, add:
  - `audio.addEventListener('stalled', () => setLoadingSongId(null));`
  - The existing `playing`, `pause`, `ended`, `error` listeners also
    call `clearLoadingTimer()`.
- In `togglePreview` at the play-branch (after `setLoadingSongId(song.id)`),
  clear any existing timer and start a new one:

  ```ts
  clearLoadingTimer();
  loadingTimer.current = setTimeout(() => {
    setLoadingSongId(null);
    loadingTimer.current = null;
  }, PREVIEW_LOADING_TIMEOUT_MS);
  ```

- Add a module-level constant `const PREVIEW_LOADING_TIMEOUT_MS = 8000;`.
- In the unmount `useEffect` return, call `clearLoadingTimer()` too.

### Step 2: Tests

**File:** `src/__tests__/PreviewButton.test.tsx`

**Changes:**

- Add two new cases:
  1. **`stalled` event clears the loading state** — click preview, do
     not dispatch `playing`, dispatch `stalled` instead; assert the
     button has `data-state="idle"` (loading cleared). Note:
     `aria-pressed` must remain `true` — playing state still holds
     until the element itself transitions.
  2. **Safety timeout clears the loading state after 8 s** — use
     `vi.useFakeTimers()`; click preview; advance time by 8000 ms; stub
     `play()` so `playing` never dispatches; assert `data-state="idle"`.

Existing tests remain untouched — the `play` spy auto-dispatches
`playing`, so the timer never fires and is always cleared by the
`playing` listener.

### Step 3: Playwright

No Playwright change needed — existing smoke covers the happy path;
stall behaviour is not worth an E2E-level assertion (timing-sensitive,
not user-visible on a green connection).

## Testing Strategy

### Unit Testing

Covered by Step 2. 2 new cases; all existing 91 tests must still pass
without modification.

### Integration Testing

Manual: throttle network to "Slow 3G" in Chrome DevTools, tap a preview,
observe the spinner clears within 8 s even if no playback starts.

### Regression Testing

- The existing `toggles play and pause on click` test's `play` stub
  dispatches `playing` via `queueMicrotask`; the `playing` listener
  will call `clearLoadingTimer` — no change in behaviour.
- The single-player test rapidly clicks between two tracks; each call
  resets the timer. Safe.

## Success Criteria

- [ ] `stalled` event listener added
- [ ] Safety timeout (8 s) added, cleared in all exit paths
- [ ] 2 new unit tests pass
- [ ] All existing 91 tests still pass
- [ ] `npm run lint && npm run test:unit && npm run build` green
- [ ] pre-commit passes

## Files Modified

1. `src/App.tsx` — `stalled` listener + `loadingTimer` ref + constant
2. `src/__tests__/PreviewButton.test.tsx` — 2 new cases
3. `docs/plan/issues/84_preview_spinner_stall_guard.md` — this plan

## Related Issues and Tasks

### Related

- #83 — introduced the preview overlay (merged in #86)
- #85 — user-visible feedback for playback errors (complementary)

## References

- [GitHub Issue #84](https://github.com/denhamparry/djrequests/issues/84)
- [MDN: HTMLMediaElement `stalled` event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/stalled_event)

## Notes

### Key Insights

- `stalled` is diagnostic, not terminal — it does not abort the load.
  Using it to clear the spinner is exactly right: "we don't have data
  *yet*; stop lying to the user about progress." If data arrives later,
  `playing` will fire normally.
- The safety timeout must not reset `playingSongId` — that would
  desync the UI from actual audio state if the audio *does* eventually
  start playing. Only the loading indicator is a UI concern.

### Alternative Approaches Considered

1. **Listen for `waiting` instead of `stalled`** — `waiting` fires when
   playback pauses for buffering *after* playback started. Wrong
   signal for our "never started" case. ❌
2. **Abort the load on timeout** — too aggressive; `stalled` can be
   transient. ❌
3. **Both `stalled` + 8 s timeout** — chosen. ✅

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved (with one required UX correction)
- **Confidence Level:** High

### Required Changes

- [ ] On `stalled` or the 8 s timeout firing, call `audio.pause()` and
      clear BOTH `loadingSongId` and `playingSongId`. Clearing only
      `loadingSongId` would leave the button showing the pause icon
      (`aria-pressed="true"`) even though no audio is playing — worse
      UX than a stuck spinner.
- [ ] `clearLoadingTimer()` must be called in every path that
      transitions `loadingSongId` away from a song id — including the
      toggle-off pause branch of `togglePreview`.

### Optional Improvements

- [ ] Add a test exercising rapid-toggle timer cleanup (click A → click
      B → click B off) to pin the invariant that only one timer is
      ever alive.

### Verification Checklist

- [x] Root cause addressed (events don't fire → two independent guards)
- [x] File paths / line numbers verified
- [x] Test strategy covers new guards
- [x] No security implications
- [x] Performance: trivial

**Status change:** Planning → Reviewed (Approved)
