# GitHub Issue #88: refactor(ui): collapse preview playback state into a discriminated union

**Issue:** [#88](https://github.com/denhamparry/djrequests/issues/88)
**Status:** Complete
**Date:** 2026-04-17

## Problem Statement

In `src/App.tsx` preview playback is tracked via two independent
`useState<string | null>` hooks:

```ts
const [playingSongId, setPlayingSongId] = useState<string | null>(null);
const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
```

The `PreviewState` union in `src/components/PreviewButton.tsx` (`'idle' |
'loading' | 'playing' | 'error'`) implies these are mutually exclusive, but
the storage lets illegal combinations occur (e.g. loading song A while
playing song B). Today React's synchronous batching inside `togglePreview`
hides the hole; any async branch landing between the two setters would
expose it.

### Current Behavior

- Two parallel `string | null` slots encode loading / playing.
- Invariants ("at most one song is loading, at most one playing, never both
  at once on different songs") are enforced by call-site discipline.
- `previewStateFor(songId)` reconstructs the per-song state by priority
  check: loading > playing > errored > idle.

### Expected Behavior

- Playback is stored as a single discriminated union:

  ```ts
  type PlaybackState =
    | { kind: 'idle' }
    | { kind: 'loading'; songId: string }
    | { kind: 'playing'; songId: string };
  ```

- Illegal combinations (loading one song, playing another) become
  unrepresentable at the type level.
- Observable behaviour is unchanged: same UI states, same timers, same
  error flash, same cleanup.

## Current State Analysis

### Relevant Code

- `src/App.tsx` lines 22-23: state declarations.
- `src/App.tsx` lines 40-44: `resetPreviewState` clears both.
- `src/App.tsx` lines 62-85: `ensureAudio` event handlers mutate
  `setLoadingSongId`.
- `src/App.tsx` lines 87-120: `togglePreview` writes both setters.
- `src/App.tsx` lines 108-113: loading-timeout fallback writes both.
- `src/App.tsx` lines 137-144: stale-results effect depends on
  `playingSongId` and calls `resetPreviewState`.
- `src/App.tsx` lines 155-160: `previewStateFor` reads both.
- `src/components/PreviewButton.tsx`: pure, takes `state` prop — **no
  change required**.

### Out of Scope

- `erroredSongId` stays as an independent slot. It's a transient 2s
  overlay flash that can co-exist with idle (it decays back to idle
  without changing playback). Folding it into `PlaybackState` would
  conflate two separate lifecycles. The issue body only calls for
  collapsing `playing` + `loading`.
- `PreviewButton.tsx` keeps its existing `PreviewState` union unchanged —
  it's the rendered projection, which the issue explicitly preserves.

### Test Coverage

Existing tests exercise the three states and should continue to pass
without modification:

- `src/__tests__/PreviewButton.test.tsx` — renders each state from the
  `state` prop (unaffected).
- `src/__tests__/SearchView.test.tsx` — integration tests covering
  play / loading / error flows (should pass unchanged since observable
  DOM is identical).
- `tests/e2e/request.spec.ts` — Playwright smoke (unchanged).

## Solution Design

### Approach

Introduce a local `PlaybackState` union inside `App.tsx`, replace the two
`useState` hooks with a single one, and route every state transition
through `setPlayback` with explicit variant construction. Keep all
side-effect hooks (timers, audio lifecycle, stale-results cleanup)
exactly where they are — only the underlying storage shape changes.

`previewStateFor` becomes a pure projection:

```ts
const previewStateFor = (songId: string): PreviewState => {
  if (playback.kind === 'loading' && playback.songId === songId) return 'loading';
  if (playback.kind === 'playing' && playback.songId === songId) return 'playing';
  if (erroredSongId === songId) return 'error';
  return 'idle';
};
```

### Trade-offs

- **Single `useState`** — one re-render per transition vs two today
  (batched already, so no behaviour change).
- **Slightly more verbose writes** — `setPlayback({ kind: 'loading',
  songId })` vs two setters. Worth it for type-level invariant.
- **Kept `erroredSongId` separate** — simpler and matches issue scope.
  Could be revisited as a follow-up if overlay semantics ever change.

## Implementation Plan

### Step 1: Introduce `PlaybackState` and replace the two `useState` calls

**File:** `src/App.tsx`

**Changes:**

- Add the `PlaybackState` union near the top of the component file (or
  inside the component — either is fine; keep it local).
- Replace:

  ```ts
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [loadingSongId, setLoadingSongId] = useState<string | null>(null);
  ```

  with:

  ```ts
  const [playback, setPlayback] = useState<PlaybackState>({ kind: 'idle' });
  ```

### Step 2: Rewrite `resetPreviewState` and the loading-timer fallback

**File:** `src/App.tsx`

- `resetPreviewState` → `setPlayback({ kind: 'idle' })` (after
  `clearLoadingTimer`).
- The loading-timeout branch in `togglePreview` — currently calls
  `setPlayingSongId(null); setLoadingSongId(null);` after
  `audio.pause()` — becomes `setPlayback({ kind: 'idle' })`.

### Step 3: Rewrite `ensureAudio` event listeners

**File:** `src/App.tsx`

- `playing` listener: currently clears loading; must now transition from
  `{ kind: 'loading', songId }` → `{ kind: 'playing', songId }`. Use
  functional update to avoid staleness:

  ```ts
  audio.addEventListener('playing', () => {
    clearLoadingTimer();
    setPlayback((prev) =>
      prev.kind === 'loading' ? { kind: 'playing', songId: prev.songId } : prev
    );
  });
  ```

- `pause` listener: currently clears loading only (keeps
  `playingSongId`). Preserve semantics — on `pause` we only unstick the
  loading state; `togglePreview`'s explicit branches handle the final
  idle transition via `resetPreviewState`. Use functional update:

  ```ts
  audio.addEventListener('pause', () => {
    clearLoadingTimer();
    setPlayback((prev) =>
      prev.kind === 'loading' ? { kind: 'idle' } : prev
    );
  });
  ```

  **Why functional update:** the listener closure is created once and
  would otherwise capture stale `playback` — it must read the current
  value.

- `ended`, `error`, `stalled` listeners continue to call
  `resetPreviewState`.

### Step 4: Rewrite `togglePreview`

**File:** `src/App.tsx`

Replace the two setter calls in the start-playback branch:

```ts
audio.pause();
audio.src = song.previewUrl;
setPlayback({ kind: 'loading', songId: song.id });
```

The "toggle off" branch (`playingSongId === song.id`) becomes
`playback.kind === 'playing' && playback.songId === song.id`.

### Step 5: Rewrite the stale-results effect

**File:** `src/App.tsx`

Replace:

```ts
useEffect(() => {
  if (!playingSongId) return;
  const stillPresent = results.some((song) => song.id === playingSongId);
  if (!stillPresent) {
    audioRef.current?.pause();
    resetPreviewState();
  }
}, [results, playingSongId]);
```

with a check keyed on whichever song is currently driving playback
(loading OR playing):

```ts
useEffect(() => {
  if (playback.kind === 'idle') return;
  const stillPresent = results.some((song) => song.id === playback.songId);
  if (!stillPresent) {
    audioRef.current?.pause();
    setPlayback({ kind: 'idle' });
    clearLoadingTimer();
  }
}, [results, playback]);
```

**Note:** depending on `playback` (the whole union) is fine — object
identity changes only on state transitions. This is a minor semantics
improvement: previously a loading-but-not-yet-playing song would not be
cleaned up if its result disappeared; now it will.

### Step 6: Rewrite `previewStateFor`

**File:** `src/App.tsx`

```ts
const previewStateFor = (songId: string): PreviewState => {
  if (playback.kind === 'loading' && playback.songId === songId) return 'loading';
  if (playback.kind === 'playing' && playback.songId === songId) return 'playing';
  if (erroredSongId === songId) return 'error';
  return 'idle';
};
```

Note the priority order (loading > playing > error > idle) is preserved
— the union makes loading and playing mutually exclusive for a given
`songId` automatically.

### Step 7: Verify tests

```bash
npm run test:unit
npm run test:e2e
npm run lint
```

All existing tests should pass without modification. If any test was
asserting on internal state by setter spying (unlikely — tests go
through the DOM), adjust accordingly.

## Testing Strategy

### Unit / Integration (Vitest + RTL)

Existing suites cover the observable behaviour and should pass green:

- `PreviewButton.test.tsx` — renders each state (decoupled).
- `SearchView.test.tsx` — full play / loading / error / timeout flows.

No new tests are required: the refactor doesn't add behaviour; it
tightens the type of existing behaviour. The stale-results effect
improvement (cleanup now also fires for loading-state) is covered by
the existing "results change while playing" test, and the analogous
loading-state case is a strict superset.

### E2E (Playwright)

`tests/e2e/request.spec.ts` smoke should pass unchanged.

### Regression Checks

- Start preview → loading spinner → playing → pause toggles back to
  idle.
- Start preview for song A, then click song B → A stops, B loads.
- Filter search so current song disappears → playback cleans up.
- Preview error (audio.play rejects non-Abort) → error flash overlay
  visible for ~2s, then returns to idle.
- Unmount during load → no timer leak (covered by existing cleanup
  effect; unchanged).

## Success Criteria

- [ ] `src/App.tsx` declares a local `PlaybackState` discriminated union
      and uses a single `useState<PlaybackState>`.
- [ ] No references to `playingSongId` or `loadingSongId` remain.
- [ ] `previewStateFor` computed from `playback` + `erroredSongId`.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run lint` passes.
- [ ] `PreviewButton.tsx` is untouched.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `src/App.tsx` — replace two `useState` hooks with a single
   `PlaybackState` discriminated union; update all six transition sites
   (`resetPreviewState`, `ensureAudio` listeners, `togglePreview`,
   loading-timeout, stale-results effect, `previewStateFor`).

## Related Issues and Tasks

### Related

- Original issue: #83 (preview overlay feature)
- Preceding PR: #86 (where the enhancement was surfaced)

## References

- [GitHub Issue #88](https://github.com/denhamparry/djrequests/issues/88)
- `src/App.tsx`
- `src/components/PreviewButton.tsx`

## Notes

### Key Insights

- `erroredSongId` is intentionally out of scope. It's a decoration
  state, not a playback lifecycle state — it overlays and decays
  independently.
- The `pause` event listener needs a functional `setPlayback` update
  because listeners are registered once in `ensureAudio`; a direct
  reference to `playback` would be stale-captured.
- The stale-results effect gains a tiny behaviour improvement (cleanup
  now also fires during loading, not just playing). This is a strict
  superset of previous behaviour and matches the intent.

### Alternative Approaches Considered

1. **Fold `erroredSongId` into `PlaybackState`** — rejected. Error is a
   timed overlay that coexists with idle; merging it would change its
   decay semantics and expand scope beyond the issue. ❌
2. **`useReducer`** — overkill for three variants and one-line
   transitions. The `setPlayback` functional-update pattern covers the
   one closure-stale case cleanly. ❌
3. **Chosen: single `useState<PlaybackState>` with functional updates
   inside audio listeners.** Minimal diff, closes the invariant hole,
   no reducer boilerplate. ✅

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Scope is correctly narrowed to `playingSongId` + `loadingSongId`,
  matching the issue body. `erroredSongId` rationale for staying
  separate is explicit and convincing (2s decay overlay, orthogonal
  lifecycle).
- Functional `setPlayback` inside `ensureAudio` listeners is flagged
  and justified — the listeners are registered once so any direct
  reference to `playback` would stale-capture.
- All six transition sites in `src/App.tsx` are enumerated (state
  decl, `resetPreviewState`, `ensureAudio` listeners, `togglePreview`,
  loading-timeout, stale-results effect, `previewStateFor`).
- Tests (`PreviewButton.test.tsx`, `SearchView.test.tsx`) go through
  the DOM, not through internal state names — verified via grep. No
  test modifications required.
- `PreviewButton.tsx` correctly identified as unaffected.

### Gaps Identified

None blocking. One small observability note only:

1. **`togglePreview` start-branch race with 'pause' event**
   - **Impact:** Low — pre-existing condition, not introduced.
   - **Detail:** When `togglePreview` switches from song A to song B,
     it calls `audio.pause()` then sets new state. The 'pause' event
     fires asynchronously. In current code the `pause` listener
     unconditionally clears `loadingSongId`; the proposed new listener
     does `prev.kind === 'loading' ? { kind: 'idle' } : prev`. If the
     'pause' event arrives AFTER `setPlayback({ kind: 'loading',
     songId: B })`, the new listener would wipe the just-set loading
     state for B.
   - **Recommendation:** Not a regression — old code had an analogous
     race (would clear `loadingSongId` right after setting it) and the
     loading timer + subsequent `'playing'` event already recover. But
     implementer should be aware and verify the existing
     `SearchView.test.tsx` "switch tracks mid-load" coverage still
     passes. If a flake appears, resolve by reading `audio.paused`
     inside the listener (`if (audio.paused && prev.kind ===
     'loading') return { kind: 'idle' }`) — treat only "genuine pause"
     events.

### Edge Cases Not Covered

1. **Unmount during loading** — covered by existing cleanup effect
   (lines 122-135), which pauses audio and clears timers. `setPlayback`
   on an unmounted component is a no-op. No change needed.
2. **`audio.play()` rejection with AbortError** — handled in existing
   catch; plan preserves. No change needed.

### Review of Alternative Approaches

1. **Fold `erroredSongId` into the union** — correctly rejected in
   plan. ✅
2. **`useReducer`** — correctly rejected as overkill. ✅

### Risks and Concerns

1. **Stale-results effect dependency on `playback` object identity**
   - **Likelihood:** Low
   - **Impact:** Low
   - **Detail:** New effect deps `[results, playback]` — `playback`
     identity changes on every transition. That's the intended
     behaviour (effect re-checks on transitions) and matches React
     conventions.
   - **Mitigation:** None required.

### Required Changes

None. Plan may proceed as written.

### Optional Improvements

- [ ] Consider a tiny helper `isPlaybackFor(state, songId)` to avoid
      repeating `kind === 'X' && songId === Y` in `previewStateFor`
      and `togglePreview`. Pure cosmetic — skip if it adds noise.
- [ ] If the implementer observes the "switch tracks mid-load" race
      noted above causing test flakes, narrow the pause listener to
      guard on `audio.paused`.

### Verification Checklist

- [x] Solution addresses root cause (typed invariant hole)
- [x] All acceptance criteria from issue #88 covered
- [x] Implementation steps specific and actionable
- [x] File paths and code references verified against repo
- [x] Security implications: none (pure type refactor)
- [x] Performance: no change (same number of renders)
- [x] Test strategy: existing tests cover observable behaviour
- [x] Documentation: plan itself is sufficient
- [x] Related issues identified (#83, #86)
- [x] Breaking changes: none (internal state refactor)

**Status:** Reviewed (Approved)
