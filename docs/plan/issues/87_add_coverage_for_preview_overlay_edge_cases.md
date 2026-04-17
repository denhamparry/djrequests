# GitHub Issue #87: test(ui): add coverage for preview overlay edge cases (results-change, ended, error)

**Issue:** [#87](https://github.com/denhamparry/djrequests/issues/87)
**Status:** Complete
**Date:** 2026-04-17

## Problem Statement

PR #86 (issue #83) introduced a preview-overlay feature on search result
artwork backed by a shared `<audio>` element held in a ref in `src/App.tsx`.
Post-PR review identified three non-trivial runtime branches that have no
unit-test coverage. All three are real regression vectors that can break
silently when future changes touch debounced search, audio teardown, or error
handling.

### Current Behavior

`src/__tests__/PreviewButton.test.tsx` covers:

- Button rendering conditional on `previewUrl`
- Play/pause toggle and `aria-pressed` state
- Single-player invariant across tracks
- Click isolation from song request
- Stall event clearing the loading spinner
- Safety-timeout clearing the loading spinner

Three branches in `src/App.tsx` are untested:

1. **Results-change cleanup effect** (`src/App.tsx:114-121`) — when a new
   query lands and the currently-playing track drops out of `results`, the
   effect calls `audioRef.current?.pause()` and `resetPreviewState()`.
2. **`ended` handler** (`src/App.tsx:51`) — end of a 30s preview must reset
   `playingSongId`/`loadingSongId` so `aria-pressed` flips back to `false`.
3. **`error` handler + `play()` catch branches** (`src/App.tsx:56, 91-97`) —
   `AbortError` is silently swallowed (no state change, no warn); other
   errors reset state and log a warning. The media `error` event also resets
   state.

### Expected Behavior

Each of these three branches has at least one deterministic unit test that
exercises the code path and asserts the observable outcome (DOM state,
`console.warn` calls, spy calls).

## Current State Analysis

### Relevant Code/Config

- **`src/App.tsx:43-66`** — `ensureAudio()` creates the shared `<audio>` and
  wires up `playing`/`ended`/`pause`/`error`/`stalled` listeners.
- **`src/App.tsx:68-98`** — `togglePreview()` contains the `play().catch()`
  branching on `err.name === 'AbortError'`.
- **`src/App.tsx:114-121`** — `useEffect` reacts to `results` and
  `playingSongId`: if the playing track is no longer present, pause + reset.
- **`src/__tests__/PreviewButton.test.tsx`** — existing tests with
  `playSpy`/`pauseSpy` spies on `HTMLMediaElement.prototype`.

### Related Context

The existing suite already uses the pattern `playSpy.mock.contexts[0] as
HTMLMediaElement` to obtain a handle to the `new Audio()` instance (jsdom
does not mount it in the DOM). The new tests will follow the same pattern
to dispatch `ended` and `error` events on the audio element.

`CLAUDE.md` notes that `HTMLMediaElement.play()` and `pause()` are not
implemented in jsdom and must be stubbed via `vi.spyOn` on the prototype
with per-test restore — the existing `beforeEach`/`afterEach` already do
this.

## Solution Design

### Approach

Add three focused unit tests to the existing `describe('Preview button')`
block in `src/__tests__/PreviewButton.test.tsx`. Reuse the existing
`renderWithTracks` helper and the `playSpy`/`pauseSpy` lifecycle. No
production code changes.

For the `AbortError` vs generic-error branches, each test re-implements
`playSpy` inside the test body (like the existing stall/timeout tests) so
the rejected promise is deterministic. A locally scoped `vi.spyOn` on
`console.warn` asserts the warn/silent distinction.

### Benefits

- Closes a real regression surface around debounced search interactions
  with preview playback.
- Locks in the `AbortError`-silent contract so future refactors cannot
  regress the UX (avoids spurious warn spam on rapid search typing).
- No production change ⇒ very low risk; purely additive test coverage.

## Implementation Plan

### Step 1: Add results-change cleanup test

**File:** `src/__tests__/PreviewButton.test.tsx`

**Changes:** Add a new `it(...)` inside the existing `describe('Preview
button')` block:

- Render with two tracks (ids `1` and `2`).
- Click the preview button for `Song One`, wait for `aria-pressed="true"`.
- Reset handlers so the next search returns only `Song Two`, then
  type additional characters into the search input to retrigger fetch.
- Wait for `Song One` to disappear from the DOM.
- Assert `pauseSpy` was called and no button has `aria-pressed="true"`.

Note: the effect depends on `results`, so we must actually swap results
rather than manually mutating state.

### Step 2: Add `ended` event test

**File:** `src/__tests__/PreviewButton.test.tsx`

**Changes:** Add a new `it(...)`:

- Render one track, click the preview button, wait for `aria-pressed="true"`.
- Grab the audio element via `playSpy.mock.contexts[0] as HTMLMediaElement`.
- Dispatch `new Event('ended')` on it.
- Assert `aria-pressed="false"` and `data-state="idle"`.

### Step 3: Add `error` event + `play()` rejection tests

**File:** `src/__tests__/PreviewButton.test.tsx`

**Changes:** Add three new `it(...)` cases:

**3a. `error` event resets state.** Click preview → dispatch
`new Event('error')` on the audio element → assert `aria-pressed="false"`
and `data-state="idle"`.

**3b. `AbortError` from `play()` is silent.** Reassign `playSpy` inside
the test so `play()` returns `Promise.reject(Object.assign(new Error('aborted'),
{ name: 'AbortError' }))`. Spy on `console.warn`. Click preview. Assert
`console.warn` was NOT called. State may briefly show loading; the test
should focus on the warn assertion and on `playingSongId` being set (the
`AbortError` branch intentionally leaves state alone — the next `playing`
or `pause` event drives transitions).

**3c. Generic `play()` rejection resets state + warns.** Reassign
`playSpy` so `play()` returns `Promise.reject(new Error('boom'))`. Spy on
`console.warn`. Click preview. Await a `vi.waitFor` on
`aria-pressed="false"` and `console.warn` being called once with a message
including `'boom'`.

**Testing:**

```bash
cd /Users/lewis/git/denhamparry/djrequests/gh-issue-087
npm run test:unit -- src/__tests__/PreviewButton.test.tsx
```

## Testing Strategy

### Unit Testing

Run the full unit suite to ensure no regression in neighbouring tests:

```bash
npm run test:unit
```

Each new test is deterministic — no `setTimeout` polling beyond existing
`vi.waitFor` patterns, no reliance on real audio hardware.

### Integration Testing

Not required — this is a pure test-coverage enhancement. No production
code changes.

### Regression Testing

- All existing `PreviewButton.test.tsx` tests must still pass.
- Coverage output should show increased line/branch coverage on
  `src/App.tsx` in the `ensureAudio`, `togglePreview`, and results-change
  effect regions.
- `npm run lint` should pass.

## Success Criteria

- [ ] Results-change cleanup test added and passing
- [ ] `ended` event test added and passing
- [ ] `error` event test added and passing
- [ ] `AbortError` silent-branch test added and passing
- [ ] Generic `play()` rejection test added and passing
- [ ] Full unit-test suite passing (`npm run test:unit`)
- [ ] Lint passing (`npm run lint`)
- [ ] Pre-commit hooks passing

## Files Modified

1. `src/__tests__/PreviewButton.test.tsx` — five new `it(...)` cases
   inside the existing `describe('Preview button')` block.
2. `docs/plan/issues/87_add_coverage_for_preview_overlay_edge_cases.md` —
   this plan document.

## Related Issues and Tasks

### Depends On

- PR #86 (preview overlay implementation) — already merged.

### Blocks

None.

### Related

- Issue #83 — original preview overlay feature.
- Issue #84 — preview spinner stall guard (has its own tests).
- PR #86 — where these coverage gaps were surfaced during review.

### Enables

Safer future refactors of the preview audio state machine.

## References

- [GitHub Issue #87](https://github.com/denhamparry/djrequests/issues/87)
- `src/App.tsx:43-121` — code under test
- `src/__tests__/PreviewButton.test.tsx` — target file
- `CLAUDE.md` — "Preview playback on iOS" and jsdom `HTMLMediaElement`
  notes.

## Notes

### Key Insights

- The existing tests already expose a reliable pattern for reaching the
  audio instance: `playSpy.mock.contexts[0] as HTMLMediaElement`. Reusing
  this avoids jsdom DOM-mounting issues.
- The `AbortError` branch intentionally does NOT reset state because an
  abort means a newer `play()` has already taken over — the next `playing`
  event drives the UI. The test must therefore verify absence of side
  effects, not state transitions.

### Alternative Approaches Considered

1. **Extract preview state machine into a testable hook** — cleaner but
   out of scope for a coverage-only ticket; would change production code
   and invite a separate review. ❌
2. **Add tests inline in `PreviewButton.test.tsx` using existing spies** —
   matches surrounding style and keeps the change additive. ✅

### Best Practices

- Each new test should be self-contained (set its own `playSpy`
  implementation if needed, restore afterwards via the shared
  `afterEach`).
- Prefer `vi.waitFor` over arbitrary `await new Promise(setTimeout)` —
  mirrors existing idioms.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation with the clarifications below
  applied during coding (no plan revision needed).

### Strengths

- All code references verified against `src/App.tsx`: line numbers (43-66,
  51, 56, 68-98, 91-97, 114-121) are accurate.
- Scope is correctly constrained: pure test-coverage addition, no
  production-code changes, no architectural churn.
- Reuses existing test infrastructure (`renderWithTracks` helper,
  `playSpy`/`pauseSpy` lifecycle, `playSpy.mock.contexts[0]` pattern) —
  matches established conventions in the file.
- Recognises the important semantic distinction in the `AbortError` branch
  (intentionally does NOT reset state) and plans the right assertion
  (absence of `console.warn`).

### Gaps Identified

1. **Gap: AbortError test needs a deterministic tick to prove `.catch` ran.**
   - **Impact:** Medium
   - **Recommendation:** After clicking the preview button, `await` a
     microtask/macrotask tick (e.g. `await vi.waitFor(() => expect(playSpy)
     .toHaveBeenCalled())` followed by `await Promise.resolve()` or a
     zero-delay `setTimeout` flush) before asserting `console.warn` was
     never called. Otherwise the assertion could pass simply because the
     promise microtask hasn't drained yet, giving a false-negative that
     masks regressions where the branch is removed.

2. **Gap: Results-change test relies on `useSongSearch` debounce (see
   `src/hooks/useSongSearch.ts:44`).**
   - **Impact:** Low-Medium
   - **Recommendation:** Use `await screen.findByText(...)` /
     `waitForElementToBeRemoved` (already imported transitively via
     `@testing-library/react`) to wait for the new results to render after
     the second handler swap. Do not rely on `vi.useFakeTimers` for this
     test — it would fight the `userEvent` setup and MSW. The existing
     `anything`-based fetch pattern already handles debounce implicitly.

### Edge Cases Not Covered

1. **Edge Case: `pause` event firing during `ended` reset.**
   - **Current Plan:** The `ended` test dispatches only `ended`.
   - **Recommendation:** Acceptable as-is — real audio fires `ended`
     without a subsequent `pause`, and the existing `pause` listener
     already clears loading state (tested indirectly). Skip.

2. **Edge Case: `AbortError` followed by a successful `playing` event.**
   - **Current Plan:** Not covered.
   - **Recommendation:** Out of scope for this ticket. The single-player
     invariant test already exercises a rapid-toggle scenario. Skip.

### Alternative Approaches Reviewed

1. **Alternative: Extract preview state machine into a custom hook and
   test that in isolation.**
   - **Pros:** Cleaner unit boundaries, easier to test.
   - **Cons:** Production refactor outside the ticket's scope; invites
     separate review.
   - **Verdict:** Rejected — plan correctly stays additive.

### Risks and Concerns

1. **Risk: Results-change test flakiness from debounce interaction.**
   - **Likelihood:** Low
   - **Impact:** Low (would only affect the one new test)
   - **Mitigation:** Use `findBy*`/`waitFor` with generous default
     timeout (Vitest default 1000ms is usually sufficient, `vi.waitFor`
     can be bumped if needed).

2. **Risk: `console.warn` spy leakage between tests.**
   - **Likelihood:** Low
   - **Impact:** Low
   - **Mitigation:** Each new test that spies on `console.warn` should
     call `.mockRestore()` in a local `try/finally` or use
     `vi.spyOn(console, 'warn').mockImplementation(() => {})` with a
     reference captured in the test scope.

### Required Changes

None block implementation. Apply the two gap-level refinements during
coding:

- [ ] AbortError test: flush microtasks / await `playSpy` call before
      asserting `console.warn` was not called.
- [ ] Results-change test: use `findBy*`/`waitFor` to wait for the new
      result set rather than arbitrary delays.

### Optional Improvements

- [ ] Consider adding a tiny helper `getAudioElement()` returning
      `playSpy.mock.contexts[0] as HTMLMediaElement` to reduce duplication
      across the three new tests.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered (3 branches × ≥1
      test each)
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered (N/A — test-only change)
- [x] Performance impact assessed (N/A — test-only change)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (this plan doc)
- [x] Related issues/dependencies identified (#83, #84, #86)
- [x] Breaking changes documented (none)
