# GitHub Issue #44: Collect requester name in UI so backend can require it

**Issue:** [#44](https://github.com/denhamparry/djrequests/issues/44)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The `request` Netlify function validator (`netlify/functions/_validate.ts`)
currently treats `requester.name` as optional because the UI
(`src/App.tsx`) never collects it. Issue #32 originally listed
`requester.name` as required. Until the UI collects it, anonymous
(empty-name) rows keep landing in the Google Doc queue.

### Current Behavior

- `src/App.tsx` submits a request with `submitSongRequest(song)` — no
  `requester` payload, so `requester.name` is always `undefined`.
- `_validate.ts` uses `optionalString(requester.name, ...)` — accepts
  missing/empty names without error.
- Google Doc queue entries arrive without a requester name; the DJ cannot
  tell who asked for what.

### Expected Behavior

- UI collects a requester name (and optionally a dedication) before the
  request can be sent.
- Backend validator requires `requester.name` — empty/whitespace/missing
  returns a 400 with `requester.name is required`.
- Google Doc queue entries all carry an identifiable requester name.

## Current State Analysis

### Relevant Code

- `src/App.tsx` — single-page UI, inline request buttons (no modal despite
  issue title's wording); calls `submitSongRequest(song)` with no details.
- `src/lib/googleForm.ts` — `submitSongRequest(song, details: Requester = {})`
  already accepts a requester payload; wiring is ready.
- `netlify/functions/_validate.ts` — `optionalString` is used for
  `requester.name`, `requester.dedication`, `requester.contact`. Switching
  `name` to `requireString` tightens the rule.
- `netlify/functions/request.ts` — no change needed; it forwards the
  validated requester to the Google Form via
  `FORM_FIELD_IDS.requesterName`.
- `shared/types.ts` — `Requester.name` is `string | undefined` (optional).
  Leave optional at the type level (frontend sends a string when present);
  backend enforces at runtime.
- `netlify/functions/__tests__/_validate.test.ts` — has tests for
  optional requester fields; needs updating to expect `name` as required.
- `src/__tests__/SearchView.test.tsx` — existing "submits the song
  request" test does not provide a name; needs updating, plus a new test
  for the required-name gate.

### Related Context

- Original issue #32 (backend validation + rate limiting) — the relaxation
  to optional was a pragmatic compromise when #33/#44 were split out.
- The UI has no modal today; the request is a direct per-row button.
  The fix adds a single persistent name input (and optional dedication)
  at the top of the results area rather than introducing a modal.

## Solution Design

### Approach

1. Add a persistent "Your name" input (required) and optional "Dedication"
   input to `src/App.tsx`, stored in component state.
2. Disable the per-song request buttons while the name field is empty /
   whitespace.
3. Pass `{ name, dedication }` into `submitSongRequest` when clicking a
   request button.
4. Flip `requester.name` in `_validate.ts` from optional → required.
5. Update and extend tests to cover both layers.

### Why not a modal

Issue #44's text references "the request modal" but the current UI has
none — each result has its own inline request button. Adding a modal
purely to collect a name is heavier than needed and diverges from the
existing pattern. A persistent inline name field is less friction for
guests at a party and keeps the diff small. The Google Form already
accepts a `Requester Name` field; any layout is compatible.

### Benefits

- Eliminates empty-requester rows in the DJ queue.
- Closes the remaining gap from #32 without changing the submission path.
- Backend validator now matches the original #32 requirement.

## Implementation Plan

### Step 1: Add requester-name state and inputs to `src/App.tsx`

**File:** `src/App.tsx`

**Changes:**

- Add `const [requesterName, setRequesterName] = useState('');` and
  `const [dedication, setDedication] = useState('');`.
- Render a `<label>`/`<input>` for "Your name" (required) above the search
  input, and an optional "Dedication" input below it.
- Compute `const trimmedName = requesterName.trim();` and
  `const hasName = trimmedName.length > 0;`.
- Disable each request button when `!hasName` (in addition to the existing
  `requestingSongId` / `cooldownSongId` checks).
- In `handleRequest`, early-return when `!hasName` and show a friendly
  inline message (or rely on the button being disabled — prefer just
  disabling, keep feedback surface small).
- Change the `submitSongRequest(song)` call to
  `submitSongRequest(song, { name: trimmedName, dedication: dedication.trim() || undefined })`.

**Testing:**

```bash
npm run test:unit -- src/__tests__/SearchView.test.tsx
```

### Step 2: Tighten the backend validator

**File:** `netlify/functions/_validate.ts`

**Changes:**

- Replace
  `const name = optionalString(requester.name, 'requester.name');`
  with `const name = requireString(requester.name, 'requester.name');`.
- The resulting `requester.name` type becomes `string` (not `string | null`);
  update the `ValidatedRequester` type to `name: string;` (keep
  `dedication` and `contact` as `string | null`).
- No change to `request.ts` is needed — `appendField` already accepts
  `string | null | undefined`.

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/_validate.test.ts
npm run test:unit -- netlify/functions/__tests__/request.test.ts
```

### Step 3: Update `_validate.test.ts`

**File:** `netlify/functions/__tests__/_validate.test.ts`

**Changes:**

- In "accepts minimal valid payload without requester", change expectation
  from `ok: true` to `ok: false` with error matching `requester.name is required`.
- In "treats empty-string optional fields as null", include a valid
  `requester.name` so only the remaining optional fields are exercised.
- Add a new test: "rejects missing requester.name".
- Add a new test: "rejects whitespace-only requester.name".
- Keep "accepts full payload with optional fields" as-is (already supplies
  `name: 'Avery'`).

### Step 4: Update `SearchView.test.tsx`

**File:** `src/__tests__/SearchView.test.tsx`

**Changes:**

- Update the "submits the song request" test: after typing the search
  term, also type a requester name into the new "Your name" field before
  clicking the request button, and assert that the POSTed body includes
  `requester.name`.
- Add a new test: "disables request buttons until a name is entered" —
  renders, types a search, expects the request button to be disabled; then
  types a name and expects it to become enabled.

### Step 5: Regression check with full test suite

**Testing:**

```bash
npm run lint
npm run test:unit
npm run build
```

E2E smoke (`npm run test:e2e`) optional — requires Playwright browsers
installed; the test at `tests/e2e/request.spec.ts` may need a name typed.

## Testing Strategy

### Unit Testing

- `_validate.test.ts` covers: missing name, whitespace-only name,
  happy path with name present.
- `SearchView.test.tsx` covers: button disabled without name, submission
  includes requester name.

### Integration Testing

**Test Case 1: Submit without name**

1. Load app
2. Search for a song
3. Try clicking request button → button is disabled, no network call.

**Test Case 2: Submit with name**

1. Load app, type "Avery" into name field
2. Search for a song
3. Click request button
4. Expect POST body to `/request` has `requester.name === 'Avery'`
5. Expect success feedback.

### Regression Testing

- Search flow (`useSongSearch`) unchanged.
- Rate limit behaviour unchanged.
- iTunes function unchanged.

## Success Criteria

- [ ] UI has a visible "Your name" input.
- [ ] Request buttons are disabled when name is empty/whitespace.
- [ ] `submitSongRequest` is called with `{ name: ... }`.
- [ ] `_validate.ts` rejects missing/empty `requester.name` with a 400.
- [ ] `ValidatedRequester.name` is typed as `string`.
- [ ] All existing tests pass; new tests added and passing.
- [ ] `npm run lint`, `npm run test:unit`, `npm run build` all succeed.

## Files Modified

1. `src/App.tsx` — add name/dedication inputs, disable buttons, pass
   requester details to submit call.
2. `netlify/functions/_validate.ts` — require `requester.name`; tighten
   `ValidatedRequester` type.
3. `netlify/functions/__tests__/_validate.test.ts` — update existing tests
   and add new ones for required name.
4. `src/__tests__/SearchView.test.tsx` — type a name in submit test, add
   disabled-without-name test.
5. `docs/plan/issues/44_collect_requester_name_in_ui.md` — this plan.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #32 — original backend validation issue.
- #33 — rate-limit follow-up.

### Enables

- DJ can reliably see who requested each track.

## References

- [GitHub Issue #44](https://github.com/denhamparry/djrequests/issues/44)
- `netlify/functions/_validate.ts`
- `src/App.tsx`

## Notes

### Key Insights

- The UI is a single-page inline-button layout, not a modal — plan uses
  persistent inputs rather than introducing a modal.
- `submitSongRequest` already accepts a `Requester` payload, so the client
  plumbing is a one-line change.

### Alternative Approaches Considered

1. **Introduce a request modal** — heavier UI change, not needed to satisfy
   the issue's intent. ❌
2. **Make name required in the shared `Requester` type** — would force
   `submitSongRequest` callers/tests to supply a name at compile time, but
   the type lives in `shared/types.ts` and is used both client-side (where
   the UI guards it) and by the function (which re-validates at runtime).
   Keeping the shared type permissive and enforcing in the validator is
   simpler and matches the current codebase pattern. ❌
3. **Inline name input, runtime validator tightening** — chosen. ✅

### Best Practices

- Keep UI validation (button disabled) and backend validation (400
  response) both in place — defence in depth.
- Preserve the MSW-based test pattern; no real network calls in tests.
