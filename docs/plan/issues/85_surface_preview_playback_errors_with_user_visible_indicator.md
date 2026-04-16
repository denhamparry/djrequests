# GitHub Issue #85: feat(ui): surface preview playback errors with a user-visible indicator

**Issue:** [#85](https://github.com/denhamparry/djrequests/issues/85)
**Status:** Planning
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
