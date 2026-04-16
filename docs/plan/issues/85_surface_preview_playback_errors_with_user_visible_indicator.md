# GitHub Issue #85: feat(ui): surface preview playback errors with a user-visible indicator

**Issue:** [#85](https://github.com/denhamparry/djrequests/issues/85)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

When the iTunes preview audio fails to play for any reason other than an
`AbortError` (e.g. network failure, CORS, decode error), the preview button
silently snaps back to its idle state while a `console.warn` is emitted. End
users get no visible feedback — the button just appears unresponsive.

### Current Behavior

- `togglePreview` (`src/App.tsx:91-97`) catches `audio.play()` rejections.
- `AbortError` is swallowed (correct — this fires when a second click pauses
  an in-flight load).
- Any other error calls `resetPreviewState()` and logs a `console.warn`.
- The button returns to `idle` with no indication that anything went wrong.

### Expected Behavior

- Non-`AbortError` failures surface a brief UI signal (~2 s) on the preview
  button (a ⚠ icon), then the button returns to idle.
- No `console.warn` is necessary once the UI communicates the failure; logs
  remain clean.
- The error state is per-track: clicking another preview while one is in its
  error window should not carry the warning over.

## Current State Analysis

### Relevant Code/Config

- `src/App.tsx:91-97` — the silent-failure site.
- `src/App.tsx:37-41` — `resetPreviewState` clears `playingSongId` and
  `loadingSongId`.
- `src/App.tsx:123-127` — `previewStateFor` derives `PreviewState` per song.
- `src/components/PreviewButton.tsx:3` — `PreviewState = 'idle' | 'loading'
| 'playing'` (needs a fourth variant).
- `src/components/PreviewButton.tsx:26-66` — icon branching by state.
- `src/styles.css:125-155` — `.preview-button` + `[data-state='playing']`
  styling (no `[data-state='error']` rule yet).
- `src/__tests__/PreviewButton.test.tsx` — existing coverage for idle,
  loading, playing, and stall timeout paths.

### Related Context

- Original feature added in PR #83 (play-preview overlay).
- Loading-spinner safety net added in PR #84 (`PREVIEW_LOADING_TIMEOUT_MS`).
- Issue #85 was surfaced during that PR's code review as a nice-to-have.

## Solution Design

### Approach

Extend the state machine with a new `'error'` variant and auto-clear it
after a short display window (2 s, matching the issue's suggestion).

Rationale:

- A dedicated variant composes naturally with the existing
  `previewStateFor` derivation — no orthogonal boolean flag needed.
- The existing `data-state` attribute already drives CSS variants, so the
  styling hook is free.
- Auto-clear keeps the affordance "fire-and-forget" — nothing for the user
  to dismiss; re-clicking simply re-tries.

### Trade-offs

- **Inline message vs. icon-only:** An icon-only ⚠ is less intrusive and
  matches the current overlay style. The artwork overlay has no space for a
  text message without re-laying out. Chosen: icon-only, with an accessible
  label update ("Preview failed, tap to retry").
- **Clear on next interaction vs. timeout:** Timeout keeps it automatic and
  matches the issue's suggested "2 s then idle". Additionally, clicking the
  same button during the error window retries immediately (clears the
  timer and starts a new `togglePreview`).
- **Keep `console.warn` vs. remove:** Remove. The UI now communicates the
  failure; retaining a warn adds noise for a handled case.

### Implementation

1. Add `'error'` to `PreviewState` union.
2. Add `erroredSongId` state and `errorTimer` ref in `App.tsx`.
3. On non-`AbortError` rejection:
   - Clear loading/playing state (via existing `resetPreviewState`).
   - Set `erroredSongId = song.id`.
   - Start a 2 s timer to clear `erroredSongId`.
   - Drop the `console.warn` call.
4. Clear the error timer in the existing unmount cleanup and when
   `erroredSongId` is superseded (new click, new song, results change).
5. Render a warning icon in `PreviewButton` when `state === 'error'` and
   update the `aria-label` to hint retry.
6. Add CSS for `[data-state='error']` (muted red overlay + icon tint).
7. Extend `PreviewButton.test.tsx` with an error-path test.

### Benefits

- Users get immediate, accessible feedback for preview failures.
- Aligns with the "graceful error handling" pattern called out in
  `CLAUDE.md`.
- Clears from the log noise that a handled error doesn't belong in.

## Implementation Plan

### Step 1: Extend `PreviewState` union

**File:** `src/components/PreviewButton.tsx`

**Changes:**

Change the `PreviewState` union from three variants to four:

```ts
export type PreviewState = 'idle' | 'loading' | 'playing' | 'error';
```

- Add a fourth icon branch for `state === 'error'`: render a warning
  triangle (`<svg>` with a `⚠` glyph path, same 20×20 footprint as the
  other icons).
- When `state === 'error'`, override the `aria-label` to
  `Preview failed for ${trackLabel}, tap to retry` so the announcement
  reflects the state change.
- Keep `aria-pressed={state === 'playing'}` unchanged (error is not
  pressed).

### Step 2: Track error state in `App.tsx`

**File:** `src/App.tsx`

**Changes:**

Add a module-level constant alongside `PREVIEW_LOADING_TIMEOUT_MS`:

```ts
const PREVIEW_ERROR_DISPLAY_MS = 2000;
```

Add new state and a timer ref inside `App`:

```ts
const [erroredSongId, setErroredSongId] = useState<string | null>(null);
const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Add helpers (mirroring `clearLoadingTimer`):

```ts
const clearErrorTimer = () => {
  if (errorTimer.current) {
    clearTimeout(errorTimer.current);
    errorTimer.current = null;
  }
};
const flashPreviewError = (songId: string) => {
  clearErrorTimer();
  setErroredSongId(songId);
  errorTimer.current = setTimeout(() => {
    errorTimer.current = null;
    setErroredSongId(null);
  }, PREVIEW_ERROR_DISPLAY_MS);
};
```

Update the `togglePreview` catch block (and drop the `console.warn`):

```ts
audio.play().catch((err: unknown) => {
  if (err instanceof Error && err.name === 'AbortError') return;
  resetPreviewState();
  flashPreviewError(song.id);
});
```

Update `previewStateFor`:

```ts
const previewStateFor = (songId: string): PreviewState => {
  if (loadingSongId === songId) return 'loading';
  if (playingSongId === songId) return 'playing';
  if (erroredSongId === songId) return 'error';
  return 'idle';
};
```

Other touches:

- At the start of `togglePreview` (after the `!song.previewUrl` guard), if
  `erroredSongId === song.id`, clear the error timer and reset
  `erroredSongId` so a retry click immediately drops the warning state.
- Extend the existing unmount cleanup effect to call `clearErrorTimer()`.
- Extend the "results changed" effect so that if `erroredSongId` is not in
  the current results, it is cleared (same pattern as `playingSongId`).

### Step 3: Style the error variant

**File:** `src/styles.css`

**Changes:**

After the existing `.preview-button[data-state='playing']` rule, add:

```css
.preview-button[data-state='error'] {
  background: rgba(153, 27, 27, 0.7);
  color: #fee2e2;
}
```

Keep spinner rule and hover styles unchanged — hover still applies.

### Step 4: Tests

**File:** `src/__tests__/PreviewButton.test.tsx`

**Changes:**

- Add a test: "shows error state when play() rejects with a non-AbortError".
  - Mock `play` to `Promise.reject(new Error('NotAllowedError'))` (use a
    `DOMException`-ish plain Error with `.name = 'NotAllowedError'`).
  - Click the preview button.
  - Assert `data-state` transitions to `'error'` and `aria-label` includes
    "tap to retry".
  - Advance fake timers by 2000 ms and assert `data-state` returns to
    `'idle'`.
- Add a test: "AbortError does not flip to error state".
  - Mock `play` to reject with `Object.assign(new Error('aborted'), { name:
    'AbortError' })`.
  - Assert `data-state` never becomes `'error'` (stays idle after reset).
- Add a test: "clicking during the error window retries".
  - First click rejects (error state).
  - Before the 2 s timer fires, second click with a happy `play`.
  - Assert error state clears and `aria-pressed` becomes `true`.

### Step 5: Verify existing behaviour still holds

No changes to `tests/e2e/request.spec.ts` are required — the e2e test stubs
`play` as a resolved promise and never exercises the rejection branch.

## Testing Strategy

### Unit Testing

- New tests in `src/__tests__/PreviewButton.test.tsx` cover the three
  branches above (happy error, AbortError exclusion, retry during window).
- Use `vi.useFakeTimers({ shouldAdvanceTime: true })` matching the existing
  timeout test's pattern so the 2 s window can be deterministically
  advanced.

### Integration Testing

**Test Case 1: Error displays and auto-clears**

1. Render App with one track.
2. Stub `HTMLMediaElement.prototype.play` to reject.
3. Click preview.
4. Expect `data-state='error'` within a tick.
5. Advance timers 2000 ms.
6. Expect `data-state='idle'`.

**Test Case 2: AbortError stays silent**

1. Same setup, reject with `name: 'AbortError'`.
2. Expect `data-state` to end at `'idle'` and never pass through
   `'error'`.

**Test Case 3: Retry during error window**

1. First click rejects → error state.
2. Second click (still within 2 s) resolves.
3. Expect `aria-pressed='true'` and no lingering warning icon.

### Regression Testing

- Existing "toggles play and pause" test must still pass unchanged.
- Existing "clears the loading spinner when the audio stalls" test must
  still pass (stall path does not go through the error timer).
- Existing 8 s loading-timeout test must still pass.

## Success Criteria

- [ ] `PreviewState` includes `'error'` variant
- [ ] `console.warn` removed from `togglePreview` failure path
- [ ] Error state auto-clears after 2 s
- [ ] Preview button renders a warning icon and updated `aria-label` in
      error state
- [ ] CSS provides a distinct visual for `[data-state='error']`
- [ ] New unit tests cover error display, AbortError exclusion, retry
- [ ] `npm run lint`, `npm run test:unit`, `npm run test:e2e` all pass
- [ ] Pre-commit hooks pass

## Files Modified

1. `src/components/PreviewButton.tsx` — add `'error'` variant, warning icon
   branch, updated aria-label
2. `src/App.tsx` — `erroredSongId` state + 2 s timer, drop `console.warn`,
   extend `previewStateFor` and cleanup effects
3. `src/styles.css` — `.preview-button[data-state='error']` rule
4. `src/__tests__/PreviewButton.test.tsx` — three new tests for error path

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #83 — original preview-overlay feature
- #84 — preview spinner stall guard (the PR that surfaced this enhancement)

### Enables

- Future work on richer per-track feedback (e.g. network vs. decode error
  messages) can slot into the same `'error'` variant.

## References

- [GitHub Issue #85](https://github.com/denhamparry/djrequests/issues/85)
- `src/App.tsx:68-98` — `togglePreview`
- `src/components/PreviewButton.tsx` — state-driven icon rendering
- `CLAUDE.md` — "graceful error handling" pattern

## Notes

### Key Insights

- The state machine already has three variants driven by a single
  `data-state` attribute; adding `'error'` costs one CSS rule and one icon
  branch, with no structural change to `PreviewButton`'s props.
- Clearing the error timer on retry prevents a race where the user clicks
  again within the window and sees the warning icon flash back to idle
  mid-playback.

### Alternative Approaches Considered

1. **Toast / global banner** — more prominent but pulls focus away from
   the track being previewed, and the project has no toast system yet ❌
2. **Inline text below the track** — requires layout changes and clutters
   the list ❌
3. **Per-track ⚠ overlay icon with auto-clear** — minimal footprint, uses
   existing overlay real estate, composable with state machine ✅

### Best Practices

- Keep the error timeout constant (`PREVIEW_ERROR_DISPLAY_MS`) defined
  alongside `PREVIEW_LOADING_TIMEOUT_MS` for discoverability.
- Mirror the existing cleanup pattern (`clearLoadingTimer`) for the new
  timer so future maintainers see a consistent idiom.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- File and line references are accurate — I re-read `src/App.tsx:91-97`,
  `src/components/PreviewButton.tsx:3`, and `src/styles.css:125-155` and
  confirm they match the plan.
- Extending `PreviewState` with a fourth variant composes cleanly with the
  existing `data-state` attribute and `previewStateFor` derivation — no
  orthogonal boolean flag.
- Cleanup story is complete: new timer is cleared in the unmount effect
  and when results change, mirroring `loadingTimer`.
- Retry-during-window behaviour is thought through (clear error timer at
  top of `togglePreview` before starting the new play).

### Gaps Identified

1. **Gap 1: `<audio>` `error` event does not feed the new flash**
   - **Impact:** Low
   - The existing `audio.addEventListener('error', resetPreviewState)`
     covers load/decode errors that don't surface through the
     `audio.play()` promise rejection. The plan routes only the
     `play().catch` path through `flashPreviewError`. This is consistent
     with the issue body (which specifies the `play()` rejection path),
     so this is a scope observation rather than a blocker.
   - **Recommendation:** Acceptable as-is. Optionally, during
     implementation, also call `flashPreviewError` from the `error`
     listener for uniform UX. Document the decision either way.

### Edge Cases Not Covered

1. **Edge Case 1: `stalled` → error interplay**
   - **Current Plan:** `stalled` handler (`src/App.tsx:60-63`) continues
     to call `resetPreviewState()` without flashing error.
   - **Recommendation:** Keep as-is. A stall is user-visible (spinner
     disappears) and the 8 s safety timeout already covers pathological
     cases. Adding an error flash on stall would widen scope and risk
     false positives on flaky networks.

2. **Edge Case 2: Error flash for track A while track B plays**
   - **Current Plan:** `erroredSongId` is per-track; if the user plays A
     (errors), then plays B (succeeds), A's error icon keeps flashing
     for the remainder of the 2 s window.
   - **Recommendation:** Acceptable and arguably correct — each button
     reflects its own last result. Implementation need only ensure the
     single-player invariant (pause-on-switch) still holds, which it
     does because `togglePreview` for B does not clear A's error timer.

3. **Edge Case 3: Fake-timer test interaction with `queueMicrotask`**
   - **Current Plan:** Uses `vi.useFakeTimers({ shouldAdvanceTime: true
})` in the retry test.
   - **Recommendation:** The existing 8 s-timeout test (`PreviewButton.
test.tsx:162-187`) establishes this pattern works. Follow the same
     `try/finally` with `vi.useRealTimers()` cleanup. Note that
     `queueMicrotask`-based `playing` dispatch from `beforeEach` is
     unaffected by fake timers — good.

### Alternative Approaches Re-examined

1. **Toast notification**
   - **Pros:** More prominent feedback.
   - **Cons:** No existing toast infrastructure; adds a new global
     surface area; pulls focus from the track.
   - **Verdict:** Not worth the overhead for a 2 s indicator. Plan's
     choice is better.

2. **Persistent error banner below the track**
   - **Pros:** Allows a text message explaining the failure.
   - **Cons:** Requires layout changes in `.results` list items;
     clutters the list; requires manual dismissal or competing timeout.
   - **Verdict:** Plan's icon-only overlay is the right trade-off for
     MVP.

3. **Clear error on next interaction (no timer)**
   - **Pros:** Simpler state machine; no timer to manage.
   - **Cons:** Error state could linger indefinitely if user never
     clicks again; issue explicitly requests auto-clear.
   - **Verdict:** Timer approach matches the issue spec.

### Risks and Concerns

1. **Risk 1: setState on unmounted component via error timer**
   - **Likelihood:** Low
   - **Impact:** Low (warning only, no user-visible bug)
   - **Mitigation:** Plan extends the unmount cleanup effect to call
     `clearErrorTimer()`. Verified adequate.

2. **Risk 2: Accessibility — screen readers may not announce aria-label
   change**
   - **Likelihood:** Medium
   - **Impact:** Low
   - **Mitigation:** Some AT implementations do announce aria-label
     changes on focused controls; others don't. Acceptable for a 2 s
     transient indicator. Consider adding `aria-live="polite"` on a
     hidden span near the button as a future enhancement if users
     report issues.

3. **Risk 3: Warning icon confused with "not-allowed" state**
   - **Likelihood:** Low
   - **Impact:** Low
   - **Mitigation:** The muted-red background and updated aria-label
     ("tap to retry") make the intent clear. Visual design should match
     existing error styling where possible.

### Required Changes

None. The plan is approved as written.

### Optional Improvements

- [ ] Consider routing the `audio.addEventListener('error', ...)` path
      through `flashPreviewError` as well, for uniform UX across both
      play-rejection and load/decode failures (Gap 1 above).
- [ ] Add a brief comment above `flashPreviewError` explaining the 2 s
      window and why it is independent of the 8 s loading timeout.
- [ ] When adding the warning SVG to `PreviewButton`, keep the viewBox
      and dimensions identical to the existing icons to avoid layout
      shift as state transitions.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered (none — no user input involved)
- [x] Performance impact assessed (negligible — one more timer)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (plan doc itself; no user-facing
      docs required)
- [x] Related issues/dependencies identified (#83, #84)
- [x] Breaking changes documented (none — `PreviewState` is internal)
