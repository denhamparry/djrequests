# GitHub Issue #83: feat(ui): add play-preview overlay on album artwork

**Issue:** [#83](https://github.com/denhamparry/djrequests/issues/83)
**Status:** Complete
**Date:** 2026-04-16

## Problem Statement

The iTunes Search response already exposes a 30-second AAC preview URL per
track (surfaced as `previewUrl` on each `Song` by
`netlify/functions/search.ts`). Today this field is returned to the client
but unused in the UI — guests have no way to sample a track before
dispatching a request to the DJ.

### Current Behavior

- `src/App.tsx` renders each result with `<img>` artwork (56×56), song title,
  meta line, and a `Request "…"` button.
- `previewUrl` is read from the search response (and round-tripped to the
  request submission) but never played anywhere.

### Expected Behavior

- When a track has a `previewUrl`, a circular play button overlays the
  album artwork.
- Tapping the overlay plays the 30-second preview inline.
- Tapping again (or starting a preview for a different track) stops the
  currently-playing preview — only one preview plays at a time.
- The button toggles between play/pause icons and resets to play when the
  audio ends.
- Tracks without a `previewUrl` render the artwork without an overlay (no
  disabled control).
- Feature must feel good on mobile: 44×44 px tap target, proper aria
  labels, `preload="none"` so scrolling doesn't burn data.

## Current State Analysis

### Relevant Code/Config

- **`src/App.tsx`** (lines 154–190) — renders the `<ul class="results">`
  list. Artwork is a plain `<img>` sibling of the request button. No click
  handler on the card itself — `handleRequest` is bound to the dedicated
  button, so bubbling from the overlay to the card is **not** a real
  concern (despite the issue's wording). `e.stopPropagation()` is still
  belt-and-braces defensive.
- **`shared/types.ts`** — `Song.previewUrl: string | null`. Type already
  correct; no change needed.
- **`netlify/functions/search.ts`** — already normalises `previewUrl`.
- **`src/styles.css`** — `.results img, .artwork-placeholder` is a 56×56
  block at all breakpoints. Grid collapses to two rows on `max-width:
  480px` with artwork on the left of row 1.

### Related Context

- Vitest config (`vite.config.ts`) uses jsdom. jsdom does **not**
  implement `HTMLMediaElement.play()` / `pause()` / `load()` — calling
  them in tests throws "Not implemented". We will stub these on the
  prototype inside the test file (or a small `src/test/setup.ts` wired
  via `setupFiles`).
- MSW setup lives in `src/test/msw-server.ts` and is reused across tests.
- No existing vitest `setupFiles` entry — we can add one or stub inline
  in the new test file. Inline stubbing is lower-blast-radius; prefer it.
- The existing `request.spec.ts` Playwright smoke test uses
  `id=321 / title="Digital Love"` with a `previewUrl` — a good hook for
  the e2e assertion we add.

## Solution Design

### Approach

1. **Extract a `PreviewButton` component** under `src/components/` to
   keep `App.tsx` readable. This is the project's first component under
   `src/`; acceptable because CLAUDE.md notes the current
   "no `src/components/`" rule is for simplicity, not a ban.
2. **Single shared `<audio>` element** — held via `useRef` at `App.tsx`
   level, plus `playingId: string | null` state. Starting a new preview
   pauses the current audio, updates `src`, calls `play()`. This
   trivially enforces the single-player invariant.
3. **Artwork wrapper** — convert the `<img>` into a `<div class="artwork">`
   containing the `<img>` plus (conditionally) a `<PreviewButton>`. The
   placeholder branch also gains the same wrapper shape so the grid
   column stays consistent.
4. **Icons** — inline SVG play/pause triangles. Avoid adding an icon
   dependency.
5. **Loading state** — while `readyState < HAVE_FUTURE_DATA` after
   `play()`, show a small spinner on the button. Implemented with a
   `loadingId: string | null` that is set on `play()` and cleared on the
   `playing` event (or on error).

### Trade-offs

- **Inline SVG vs icon lib**: inline keeps the bundle small and avoids a
  new dep. ✅
- **Per-card `<audio>` vs shared**: shared avoids N audio elements and
  makes the invariant free. ✅
- **`preload="none"` vs `preload="metadata"`**: none saves mobile data;
  first play incurs a buffering moment (the loading spinner covers it). ✅
- **iOS mute switch** — `<audio>` is silenced by the hardware ringer
  switch with no visible feedback. Acceptable for MVP per the issue; a
  `<video playsinline>` workaround is noted as a follow-up in the issue
  itself. Document in CLAUDE.md "Known Issues".

### Benefits

- Uses existing `previewUrl` data with no API changes.
- Accessibility: proper button semantics, aria labels, keyboard-reachable.
- No new runtime deps.

## Implementation Plan

### Step 1: Add `PreviewButton` component

**File:** `src/components/PreviewButton.tsx` (new)

**Changes:**

- Props: `{ state: 'idle' | 'loading' | 'playing'; trackLabel: string;
  onClick: (e: React.MouseEvent) => void }`.
- Renders `<button type="button" class="preview-button"
  aria-label="Preview {trackLabel}" aria-pressed={state === 'playing'}>`
  with inline SVG for play/pause and a small spinner for loading.
- `onClick` calls `e.stopPropagation()` then `props.onClick(e)`.

### Step 2: Wire shared audio + state in `App.tsx`

**File:** `src/App.tsx`

**Changes:**

- Add `const audioRef = useRef<HTMLAudioElement | null>(null);` — we
  create the element imperatively in a lazy-init `useEffect` to avoid
  SSR concerns (none today, but keeps it isolated).
- Add `const [playingId, setPlayingId] = useState<string | null>(null);`
  and `const [loadingId, setLoadingId] = useState<string | null>(null);`.
- `ensureAudio()` helper lazily creates `new Audio()`, sets
  `preload = 'none'`, attaches `ended`, `pause`, `playing`, and `error`
  listeners that clear `playingId`/`loadingId` as appropriate.
- `togglePreview(song)`:
  - If `playingId === song.id`: call `audio.pause()`, clear `playingId`.
  - Else: if something else is playing, `audio.pause()`; set
    `audio.src = song.previewUrl`; `setLoadingId(song.id)`;
    `audio.play()` — handle rejection by clearing loadingId/playingId
    and logging (no user-facing error for MVP).
- Cleanup: on unmount, pause and nuke the audio element (existing
  `useEffect` return).

### Step 3: Render the overlay in the results list

**File:** `src/App.tsx`

**Changes:**

- Replace the current `<img>` / placeholder ternary with a single
  `<div class="artwork">` wrapper containing:
  - the image (or placeholder),
  - a conditional `<PreviewButton>` when `song.previewUrl` is truthy,
    passing `state` derived from `playingId`/`loadingId` and
    `onClick={() => togglePreview(song)}`.

### Step 4: CSS for the overlay

**File:** `src/styles.css`

**Changes:**

- Add `.artwork { position: relative; width: 56px; height: 56px; }` —
  and update the `.results img, .artwork-placeholder` rule to keep
  the 56×56 sizing (already correct).
- `.preview-button`:
  - `position: absolute; inset: 0; display: flex; align-items: center;
    justify-content: center;` — centres the icon over the artwork.
  - Minimum `width: 44px; height: 44px;` tap target via `min-width` /
    `min-height` — the artwork is 56×56 so the visible target is
    already ≥44.
  - `border: 0; background: rgba(0, 0, 0, 0.45); color: #fff;
    border-radius: inherit;` plus a subtle hover state.
  - Focus ring: `outline: 2px solid #fff; outline-offset: -2px` on
    `:focus-visible`.
  - `.preview-button svg { width: 20px; height: 20px; }`.
- `.preview-spinner { animation: spin 0.9s linear infinite; }` plus
  `@keyframes spin`.
- Mobile (`max-width: 480px`): no override needed; artwork stays 56×56.

### Step 5: Stub jsdom `HTMLMediaElement` in new test file

**File:** `src/__tests__/PreviewButton.test.tsx` (new)

**Changes:**

- `beforeAll` stubs `HTMLMediaElement.prototype.play` to a mock that
  returns `Promise.resolve()` and synchronously dispatches a `playing`
  event on the element. `pause` is stubbed to dispatch a `pause` event.
  `load` to a no-op.
- Cover these cases:
  1. **Button hidden when no previewUrl** — render a result with
     `previewUrl: null`, assert no `Preview …` button in the document.
  2. **Button visible + toggles play/pause** — render a result with a
     preview URL; click the button; assert `aria-pressed="true"` and
     that `audio.src` was set; click again; assert `aria-pressed="false"`.
  3. **Single-player invariant** — render two results, both with
     `previewUrl`; click A; click B; assert A's button is idle and B's
     is pressed.
  4. **Ended event resets state** — dispatch an `ended` event on the
     shared audio element; assert B's button returns to idle.
  5. **Click does not submit request** — click preview on a result while
     `requesterName` is set; assert no POST to `/.netlify/functions/request`
     was made (MSW handler spy, or just assert the request-feedback
     banner does not appear).

### Step 6: Playwright smoke assertion

**File:** `tests/e2e/request.spec.ts`

**Changes:**

- Extend the existing test (or add a new `test(...)` block) that, after
  the search results are visible, clicks the preview button on the
  `Digital Love` card and asserts `aria-pressed="true"`. No audio
  playback assertion — Playwright running on Chromium with autoplay
  permissions is flaky for real audio assertions and unnecessary for
  this smoke.
- Use `page.addInitScript` to stub `HTMLMediaElement.prototype.play`
  to a resolved Promise that dispatches `playing`, so Chromium's
  autoplay heuristics don't interfere.

### Step 7: Document iOS mute caveat in CLAUDE.md

**File:** `CLAUDE.md`

**Changes:**

- Under "Known Issues & Gotchas", add a new "Preview playback on iOS"
  block noting that the hardware ringer switch silences `<audio>`
  playback with no visible feedback, and that `<video playsinline>`
  is the known workaround if users complain.

## Testing Strategy

### Unit Testing

Covered by Step 5 above — 5 cases via Vitest + React Testing Library,
with `HTMLMediaElement.prototype.play/pause/load` stubbed on the
prototype.

### Integration Testing

**Test case 1: Preview + request co-exist**

1. Name + search → results appear.
2. Click preview on track A.
3. Click `Request "A"`.
4. Expect request POST to fire and feedback banner to show. Preview
   button state is irrelevant to the request path.

**Test case 2: Missing previewUrl does not break**

1. Mock a search result with `previewUrl: null`.
2. Assert artwork renders; assert no preview button in DOM.

### Regression Testing

- All existing `SearchView.test.tsx` cases must still pass. Notably:
  - "shows results after a debounced search" — result has a
    `previewUrl` so a preview button will now render; update the test
    only if it breaks due to new button affecting `getByRole('button')`
    disambiguation. (Request button is `name: /Request "…"/`, preview
    is `name: /Preview …/` — unique.)
  - "disables request buttons until a requester name is entered" — that
    result has `previewUrl: null`; preview button should NOT render;
    existing assertions stay green.
- Playwright smoke: existing assertions must still pass with the new
  DOM.

## Success Criteria

- [ ] `PreviewButton` component exists with play/pause/loading states
- [ ] Single shared `<audio>` element; only one preview plays at a time
- [ ] Overlay hidden when `previewUrl` is null
- [ ] `aria-label="Preview {title}"` and `aria-pressed` set correctly
- [ ] `preload="none"` on the audio element
- [ ] Tap target ≥ 44×44
- [ ] 5 new unit tests pass
- [ ] Playwright smoke extended with preview toggle assertion
- [ ] CLAUDE.md documents iOS mute caveat
- [ ] `npm run lint && npm run test:unit && npm run test:e2e && npm run build` all green
- [ ] pre-commit hooks pass

## Files Modified

1. `src/components/PreviewButton.tsx` — new component (inline SVG icons, aria)
2. `src/App.tsx` — shared audio ref, playingId/loadingId state, artwork wrapper
3. `src/styles.css` — `.artwork` wrapper, `.preview-button`, spinner keyframe
4. `src/__tests__/PreviewButton.test.tsx` — new test file with jsdom stubs
5. `tests/e2e/request.spec.ts` — add preview-click assertion + init script
6. `CLAUDE.md` — iOS mute switch gotcha
7. `docs/plan/issues/83_preview_button_overlay_on_album_artwork.md` — this plan

## Related Issues and Tasks

### Depends On

- None. `previewUrl` already plumbed end-to-end.

### Related

- #83 (this) — issue.
- Out-of-scope follow-ups listed in the issue (progress ring, waveform,
  hover-autoplay, offline cache).

### Enables

- Future UX: progress scrubber, per-preview analytics, offline preview cache.

## References

- [GitHub Issue #83](https://github.com/denhamparry/djrequests/issues/83)
- [MDN: HTMLMediaElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement)
- [Apple HIG: tap targets](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- jsdom issue on HTMLMediaElement: stubbing
  `HTMLMediaElement.prototype.{play,pause,load}` is the well-known workaround.

## Notes

### Key Insights

- The issue text mentions "overlay tap must not bubble to the card (which
  opens the request modal)" — but the current UI has no modal and no
  card-level click handler. The request is triggered via a dedicated
  button. We'll still `stopPropagation` on the overlay as a defensive
  measure, but the concern is theoretical, not current-state.
- `HTMLMediaElement.play()` returns a Promise that can reject (autoplay
  policy, aborted by subsequent `pause`). Always attach `.catch()` —
  unhandled rejection noise in prod is a smell.

### Alternative Approaches Considered

1. **Per-card `<audio>` element** — simpler render but requires manual
   bookkeeping to pause siblings on play. Rejected — more state, same
   net effect. ❌
2. **Auto-play on card hover (desktop)** — fun but annoying; explicitly
   ruled out of scope by the issue. ❌
3. **Native `<audio controls>` element in the card** — ugly, takes
   significant space, no mobile polish. ❌
4. **Single shared audio + playingId state** — chosen. ✅

### Best Practices

- Set `audio.preload = 'none'` to avoid preloading 20 previews on scroll.
- Handle `ended`, `pause`, `error` on the shared audio to keep UI state
  in sync with media state (media is source of truth).
- Always await/catch `audio.play()` to tolerate autoplay rejections.
- Keep SVG icons inline — no dep additions.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved (with required refinements)
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation; address Required Changes
  during Phase 3 (they do not require plan re-revision)

### Strengths

- Correctly identifies that the existing UI has **no card-level click
  handler or modal** — the issue's wording about "bubbling to the card
  which opens the request modal" is a phantom concern, and the plan
  names that out loud while still keeping `stopPropagation` as a
  defensive measure.
- Single-shared-`<audio>` + `playingId` state is the right architectural
  call; it makes the single-player invariant free and avoids 20 audio
  elements on scroll.
- Test strategy correctly anticipates the jsdom
  `HTMLMediaElement.play()` gap.
- Playwright config already includes `mobile-chrome` (Pixel 5), so the
  smoke extension gets mobile coverage for free — worth noting.
- `preload="none"` chosen correctly for mobile data friendliness.
- Scope is tight; all issue out-of-scope items (progress ring, waveform,
  hover-autoplay, offline cache) are deferred.

### Gaps Identified

1. **Gap 1:** aria-label uses only `{title}`, but the issue asks for
   `Preview {track} by {artist}`.
   - **Impact:** Medium (accessibility + disambiguation when two tracks
     share a title).
   - **Recommendation:** Include both title and artist in the aria-label.

2. **Gap 2:** Prototype-level stubbing of
   `HTMLMediaElement.prototype.play/pause/load` pollutes every other
   test in the same Vitest process.
   - **Impact:** Medium (could mask regressions in unrelated tests that
     happen to exercise media, however unlikely in this codebase).
   - **Recommendation:** Use `vi.spyOn(HTMLMediaElement.prototype, 'play')`
     and `.mockRestore()` in `afterEach`, OR move the stubs into a
     dedicated `src/test/setup.ts` wired via `test.setupFiles`. Either
     is fine; spy + restore is lower-blast-radius.

3. **Gap 3:** No explicit handling for the "`play()` was interrupted by
   a call to `pause()`" `AbortError` that fires when users tap rapidly.
   - **Impact:** Low (noisy console in prod, not a functional bug).
   - **Recommendation:** The plan's `.catch()` on `audio.play()` must
     swallow `name === 'AbortError'` silently; everything else gets
     `console.warn`.

### Edge Cases Not Covered

1. **Edge case 1:** Search results re-render with a different track list
   while a preview is playing (e.g. the user types a new query).
   - **Current Plan:** Not addressed — the audio element keeps playing
     because `playingId` still points at a song no longer in `results`.
   - **Recommendation:** Add a `useEffect` in `App.tsx` watching
     `[results]` that, if `playingId` is set and the track is no longer
     in `results`, pauses the audio and clears `playingId`.

2. **Edge case 2:** Audio network error (offline, 404 on preview CDN).
   - **Current Plan:** Silent clear on the `error` event.
   - **Recommendation:** MVP silent-clear is acceptable (request flow
     still works). Optionally surface a brief error icon — not
     required.

3. **Edge case 3:** Playwright `addInitScript` stub must both resolve
   the play Promise AND dispatch the `playing` event on the element;
   otherwise `loadingId` never clears in the real DOM.
   - **Current Plan:** Mentions `dispatches 'playing'` for Vitest but
     less explicit for Playwright.
   - **Recommendation:** Spell out the Playwright stub payload in
     Step 6 (`const p = HTMLMediaElement.prototype.play; ... dispatchEvent(new Event('playing'))`).

### Alternatives Considered (Review)

1. **Alternative: native `<audio controls>` inline in each card.**
   - **Pros:** Zero custom state, full accessibility for free.
   - **Cons:** ~30px tall, clashes with card visual design, inconsistent
     cross-browser styling.
   - **Verdict:** Plan's custom-button choice is correct. ✅

2. **Alternative: dedicated `useAudioPreview` hook.**
   - **Pros:** Extracts audio state/ref, reusable later.
   - **Cons:** Over-engineered for one consumer.
   - **Verdict:** Keep state in `App.tsx`; extract only if reused. ✅

### Risks and Concerns

1. **Risk: visual obstruction of album art.**
   - **Likelihood:** Medium (semi-transparent full-cover overlay could
     hide artwork detail).
   - **Impact:** Low (aesthetic).
   - **Mitigation:** Consider a smaller corner button (28×28 visual,
     44×44 tap target via padding) rather than a full-cover overlay.
     Revisit during CSS implementation.

2. **Risk: autoplay policy rejection on first interaction.**
   - **Likelihood:** Low (click handler counts as user gesture).
   - **Impact:** Low (`.catch()` handles it).
   - **Mitigation:** Already planned.

3. **Risk: iOS ringer switch silencing with no feedback.**
   - **Likelihood:** High for iPhone users with silenced phones.
   - **Impact:** Low–Medium (user confusion).
   - **Mitigation:** Already planned — documented in CLAUDE.md.

### Required Changes

**Must be made during implementation:**

- [x] aria-label includes both title AND artist
- [x] Use `vi.spyOn(...).mockRestore()` or a scoped setup file for
      HTMLMediaElement stubs — do not permanently mutate the prototype
- [x] Add results-change effect that pauses audio and clears
      `playingId` when the currently-playing track drops out of
      results
- [x] The `audio.play()` `.catch()` must silently swallow `AbortError`

### Optional Improvements

- [ ] Smaller corner button (28×28 visual, 44×44 tap target) to avoid
      obscuring artwork — revisit during CSS implementation
- [ ] Extract a `useAudioPreview` hook if/when a second consumer lands
- [ ] Brief error icon on preview network failure (2s auto-dismiss)
      instead of silent clear

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered (no XSS risk — all data from
      our own search function)
- [x] Performance impact assessed (`preload="none"` prevents N×media fetches)
- [x] Test strategy covers critical paths and edge cases (after
      Required Changes)
- [x] Documentation updates planned (CLAUDE.md iOS caveat)
- [x] Related issues/dependencies identified
- [x] Breaking changes documented (none)

**Status change:** Planning → Reviewed (Approved)
