# GitHub Issue #90: enhancement(a11y): announce preview errors via aria-live region

**Issue:** [#90](https://github.com/denhamparry/djrequests/issues/90)
**Status:** Planning
**Date:** 2026-04-17

## Problem Statement

The preview error indicator added in #85 communicates failure through a visual
icon (`data-state="error"`) and an updated `aria-label` on the preview button
("Preview failed for {track}, tap to retry"). Screen readers generally do not
announce `aria-label` changes on a button unless that button currently has
focus — so assistive-tech users clicking Preview, then moving on, may never
learn the preview failed. The visual indicator has no audible parity.

### Current Behavior

- `flashPreviewError` (`src/App.tsx:56-63`) sets `erroredSongId` so
  `previewStateFor` returns `'error'` for that track.
- `PreviewButton` (`src/components/PreviewButton.tsx:17-20`) swaps the
  `aria-label` to "Preview failed for {track}, tap to retry".
- No `aria-live` region is populated, so the change is silent for AT users
  whose focus moved off the button (or who never focused it to begin with —
  e.g. after a pointer click).

### Expected Behavior

- When a preview fails, a visually-hidden polite live region near the result
  list announces: "Preview for {track} failed." once.
- The announcement fires without pulling focus.
- The existing visual indicator and button `aria-label` remain unchanged.

## Current State Analysis

### Relevant Code/Config

- `src/App.tsx:56-63` — `flashPreviewError` sets `erroredSongId` with a 2 s
  auto-clear timer. This is the single trigger point for error UI.
- `src/App.tsx:263-287` — the block of existing status/alert regions
  (`role="status"`, `role="alert"`, and the request-feedback live region).
  New live region should live alongside these for consistency.
- `src/App.tsx:149-156` — effect that clears `erroredSongId` when results no
  longer contain the track. The announcement should naturally follow the
  same lifecycle by keying off `erroredSongId`.
- `src/components/PreviewButton.tsx:17-20` — existing `aria-label` swap;
  preserved unchanged.
- `src/styles.css` — no existing `sr-only` / visually-hidden utility (the
  app uses `role`+`aria-live` on visible paragraphs so far). A new utility
  class is needed to hide the live region without `display: none` (which
  suppresses AT announcements).
- `src/__tests__/PreviewButton.test.tsx:180-190` — reference for the error
  flow test harness (fake timers + play-spy). Useful as a template when
  testing the new live region from the App level.

### Related Context

- Issue #85 introduced the visual error state.
- Issue #90 itself flags the a11y gap and proposes the fix.
- #85 plan already anticipated this follow-up ("AT users may miss the
  error" — documented as nice-to-have).

## Solution Design

### Approach

Add a single visually-hidden polite live region rendered unconditionally near
the other status regions in `App.tsx`. The region's text derives from
`erroredSongId` and `results`:

```tsx
const erroredSong = erroredSongId
  ? results.find((s) => s.id === erroredSongId)
  : null;
const previewErrorAnnouncement = erroredSong
  ? `Preview for ${erroredSong.title} failed.`
  : '';

<p role="status" aria-live="polite" className="sr-only">
  {previewErrorAnnouncement}
</p>;
```

Rationale:

- **Polite, not assertive:** preview failure is low-priority; it must not
  interrupt other announcements.
- **Derived from existing state (`erroredSongId`):** no new state variable,
  no new timer, no duplication of the 2 s auto-clear logic. When the
  existing timer clears `erroredSongId`, the region empties and the next
  error announces normally.
- **Always-rendered node:** screen readers typically only announce updates
  to live regions that existed before the update. Rendering the `<p>`
  unconditionally (empty when idle) avoids AT skipping the first
  announcement.
- **`role="status"` + `aria-live="polite"`:** redundant-but-safe pairing —
  some AT implementations only honour one or the other. Matches the
  existing request-feedback region (`src/App.tsx:279-287`).

### Trade-offs

- **Visually-hidden utility vs. inline style:** A reusable `.sr-only` class
  is the standard approach (Tailwind, Bootstrap) and keeps `App.tsx` tidy.
  Inline style would work but couples presentation to JSX.
- **Single region for all errors vs. per-track:** single region is simpler,
  and the 2 s auto-clear gives natural rate-limiting. A per-track region
  would spam AT with stale nodes in the DOM.
- **Include "tap to retry" hint vs. plain failure message:** keep plain —
  the `aria-label` already carries the retry hint, and the live region's
  job is to announce the event, not teach recovery.

### Implementation

Two files change:

1. `src/App.tsx` — derive announcement text from `erroredSongId`/`results`;
   render the `sr-only` live region.
2. `src/styles.css` — add a `.sr-only` utility class using the standard
   visually-hidden pattern (clip + absolute positioning).

No new state, no new timers, no new props on `PreviewButton`.

### Benefits

- Parity between visual and audible failure feedback.
- Zero impact on sighted users (region is visually hidden).
- Reuses existing error lifecycle → no new cleanup path.

## Implementation Plan

### Step 1: Add `.sr-only` utility class

**File:** `src/styles.css`

**Changes:** Append the standard visually-hidden utility:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

**Testing:** visual inspection — no visible element produced; devtools
shows the `<p>` node is present but not rendered in the layout.

### Step 2: Render the announcement region

**File:** `src/App.tsx`

**Changes:**

1. Derive the announcement text inside the component (after the existing
   `hasName` derivation, before `return`):

   ```tsx
   const erroredSong =
     erroredSongId != null
       ? (results.find((song) => song.id === erroredSongId) ?? null)
       : null;
   const previewErrorAnnouncement = erroredSong
     ? `Preview for ${erroredSong.title} failed.`
     : '';
   ```

2. Render the live region alongside the other status blocks (e.g.
   immediately before the `requestFeedback` paragraph, around
   `src/App.tsx:279`):

   ```tsx
   <p role="status" aria-live="polite" className="sr-only">
     {previewErrorAnnouncement}
   </p>
   ```

**Testing:** unit test verifies the region populates when an error fires
and clears after the 2 s timeout (see Step 3).

### Step 3: Add unit coverage

**File:** `src/__tests__/PreviewButton.test.tsx` (extend the existing
error-state test that already drives the App + play-spy harness).

**Changes:** After the existing assertion that the button flips to
`data-state="error"`, assert:

```tsx
const liveRegion = screen.getByRole('status', { name: '' });
// or: container.querySelector('.sr-only') as HTMLElement
await vi.waitFor(() =>
  expect(
    screen.getByText(/Preview for Song One failed\./i)
  ).toBeInTheDocument()
);

vi.advanceTimersByTime(2000);

await vi.waitFor(() =>
  expect(
    screen.queryByText(/Preview for Song One failed\./i)
  ).not.toBeInTheDocument()
);
```

Note: there are multiple `role="status"` nodes in the DOM — select the
announcement by its text content to avoid coupling the test to query
ordering.

**Testing:**

```bash
npm run test:unit -- --run src/__tests__/PreviewButton.test.tsx
```

### Step 4: Verify no regression in AbortError path

**File:** `src/__tests__/PreviewButton.test.tsx` (the existing
"does not flip to error state for AbortError" test — no change needed,
but extend it to assert the live region remains empty).

**Changes:**

```tsx
expect(
  screen.queryByText(/Preview for .* failed\./i)
).not.toBeInTheDocument();
```

**Testing:**

```bash
npm run test:unit
```

## Testing Strategy

### Unit Testing

- Assert the live region populates with "Preview for {title} failed." when
  `audio.play()` rejects with a non-AbortError.
- Assert the live region clears after `PREVIEW_ERROR_DISPLAY_MS` (2 s).
- Assert the live region stays empty when the rejection is an `AbortError`.
- Assert the live region clears if the erroring track disappears from
  `results` before the timer elapses (covered implicitly by the existing
  `useEffect` at `src/App.tsx:149-156`, but worth a targeted test).

### Integration / Manual Testing

**Test Case 1: error announces politely**

1. Run `npm run dev`; open in VoiceOver/NVDA.
2. Search for a track, click its preview.
3. Force a failure (disable network or block `*.itunes.apple.com`).
4. Expected: "Preview for {title} failed." announced once without focus
   change.

**Test Case 2: no announcement on normal pause**

1. Play a preview successfully, then click to pause.
2. Expected: no live-region announcement (only the button state changes).

**Test Case 3: no duplicate announcement on retry**

1. Trigger an error, then click the same button within 2 s.
2. Expected: retry starts; no stale announcement from the prior attempt
   remains in the DOM after the error clears.

### Regression Testing

- All `PreviewButton.test.tsx` tests pass.
- `tests/e2e/request.spec.ts` smoke test unaffected (does not touch the
  preview flow).
- `npm run lint` passes.

## Success Criteria

- [ ] `.sr-only` utility class added to `src/styles.css`.
- [ ] Live region rendered in `src/App.tsx` with `role="status"` +
      `aria-live="polite"`.
- [ ] Announcement text derives from `erroredSongId` + `results` — no new
      state.
- [ ] Unit tests cover: error fires → region populates; 2 s later →
      region empties; AbortError → region stays empty.
- [ ] Existing visual-indicator and button `aria-label` behaviour
      unchanged.
- [ ] `npm run test:unit`, `npm run lint`, and `npm run build` all pass.

## Files Modified

1. `src/App.tsx` — derive announcement text; render `sr-only` live region.
2. `src/styles.css` — add `.sr-only` utility class.
3. `src/__tests__/PreviewButton.test.tsx` — extend error-state tests to
   assert live-region text; extend AbortError test to assert region
   remains empty.

## Related Issues and Tasks

### Depends On

- #85 (visual preview error indicator) — already merged; provides the
  `erroredSongId` state this plan reuses.

### Related

- #87 (preview overlay coverage) — this PR adds further coverage in the
  same area.
- #88 (discriminated union for playback state) — recently merged;
  unrelated to `erroredSongId` which is a separate piece of state.

### Enables

- Full WCAG 2.1 SC 4.1.3 (Status Messages) compliance for the preview
  feature.

## References

- [GitHub Issue #90](https://github.com/denhamparry/djrequests/issues/90)
- [WCAG 2.1 SC 4.1.3 — Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages)
- [MDN: ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions)

## Notes

### Key Insights

- The existing `erroredSongId` state already encodes everything we need;
  the a11y fix is a pure render-side addition.
- Live regions must exist in the DOM **before** their text changes for AT
  to announce the first update reliably — hence the always-rendered empty
  `<p>`.
- `display: none` and `visibility: hidden` suppress AT announcements; the
  clip-based `.sr-only` pattern is the established fix.

### Alternative Approaches Considered

1. **Mirror the error text inside `PreviewButton`** (e.g. a nested
   `sr-only` span). ❌ Couples the live-region lifecycle to the button's
   remount — risky if React reconciles the node.
2. **Use `aria-describedby` pointing to a hidden element per row.** ❌
   Requires one element per result; noisier DOM, harder to test, no
   benefit over a single shared region.
3. **Re-use the existing request-feedback region.** ❌ Conflates two
   unrelated user actions; a rapid preview error then a request success
   would clobber each other.
4. **Chosen: single always-rendered `sr-only` region driven by
   `erroredSongId`.** ✅ Minimal state, reuses existing lifecycle,
   matches established pattern from `request-feedback`.

### Best Practices

- Prefer `role="status"` + `aria-live="polite"` for non-urgent status
  changes. Reserve `role="alert"` / `aria-live="assertive"` for genuinely
  interruptive events.
- Always render live regions before populating them.
- Announce the event, not the remedy — the button's `aria-label` already
  tells focused users how to retry.
