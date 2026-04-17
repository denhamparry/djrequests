# GitHub Issue #119: Remove Song/Karaoke request type selector from UI

**Issue:** [#119](https://github.com/denhamparry/djrequests/issues/119)
**Status:** Reviewed (Approved)
**Date:** 2026-04-17

## Problem Statement

The request form renders a Song/Karaoke radio selector that is no longer
needed. The selector was introduced in [#93](https://github.com/denhamparry/djrequests/issues/93)
to replace an earlier free-text "dedication" field, but every submission
going forward is implicitly a song request — there is no live use case for
the karaoke option.

### Current Behavior

- `src/App.tsx:267-289` renders a `<fieldset>` with two radio inputs
  (`Song`, `Karaoke`).
- `src/App.tsx:27` maintains `requestType` state defaulting to `'song'`.
- `src/App.tsx:200-203` forwards `requestType` on every submission to
  `/.netlify/functions/request`.
- The function validates `requester.requestType` against `REQUEST_TYPES`
  and maps the value to a display label before sending it to the Google
  Form's `Request type` multiple-choice question (currently marked
  required on the Google Form).

### Expected Behavior

- The fieldset and its state are removed from the UI.
- Every submission is implicitly a song request; no radio selection is
  required or visible.
- The Google Form's `Request type` question is decommissioned in lockstep
  (either deleted from the Form or made optional) so submissions continue
  to succeed.
- Unit, integration, and e2e tests no longer reference the request-type
  concept anywhere.

## Current State Analysis

### Relevant Code/Config

Grep for `request.?type|karaoke|RequestType|request-type` (case-insensitive)
returns 18 files. Call sites by layer:

**UI (React):**

- `src/App.tsx:6` — imports `RequestType` from `shared/types`.
- `src/App.tsx:27` — `useState<RequestType>('song')`.
- `src/App.tsx:200-203` — includes `requestType` in the submission payload.
- `src/App.tsx:267-289` — the visible fieldset + radios.
- `src/styles.css:81-107` — `.request-type`, `.request-type .label-text`,
  `.radio-option` selectors. `.radio-option` is only used by these two
  radios; deleting it alongside is safe.

**Shared contract:**

- `shared/types.ts:14-24` — `RequestType`, `REQUEST_TYPES`,
  `REQUEST_TYPE_LABELS`.
- `shared/types.ts:26-30` — `Requester.requestType` (required field).
- `shared/formFields.ts:9` — `requestType: "entry.1792970976"`.

**Netlify function:**

- `netlify/functions/_validate.ts:1-2, 102-107` — imports `REQUEST_TYPES`,
  validates `requester.requestType` as a required enum.
- `netlify/functions/request.ts:3, 156-160` — imports
  `REQUEST_TYPE_LABELS`, appends the label to the Google Form POST.

**Client submit utility:**

- `src/lib/googleForm.ts:20` — `submitSongRequest(song, details: Requester)`.
  `Requester` currently requires `requestType`; removing the field makes
  the parameter shape shrink to `{ name, contact? }`.

**Apps Script (Doc queue):**

- `apps-script/index.ts:77-81` — reads `namedValues["Request type"]` and
  passes it into `buildDocEntry`.
- `apps-script/format.ts:7-8, 30` — `requestType` field on
  `SongRequestSubmission`, emitted as a `Request type: …` metadata row.

**Tests:**

- `netlify/functions/__tests__/_validate.test.ts:60-136` — multiple tests
  exercise the `requestType` branch (missing, unknown, non-string,
  karaoke, song).
- `netlify/functions/__tests__/request.test.ts` — every payload includes
  `requester.requestType: 'song' | 'karaoke'`; line 116 asserts the form
  gets `Karaoke`.
- `netlify/functions/__tests__/requestTypeLabels.test.ts` — the whole
  file only tests the label map.
- `apps-script/__tests__/format.test.ts:14, 24, 33, 44, 47` — asserts the
  `Request type` metadata row (`'Karaoke'` in happy path, `'—'` when
  missing).
- `tests/e2e/request.spec.ts:52, 75-80` — asserts `requester.requestType`
  is `'karaoke'` on the POST body and drives the Karaoke radio.

**Docs:**

- `README.md:44` — "Multiple choice: `Request type` (required) — options:
  `Song`, `Karaoke`".
- `CLAUDE.md` — "Visible (multiple choice, required): `Request type` —
  options `Song`, `Karaoke`" (in Google Form Configuration Steps).

### Related Context

- #93 introduced the selector (replacing the dedication field).
- #100 colocated the label map to break a circular import.
- The Google Form question is currently **required**. After the backend
  stops sending `entry.1792970976`, any required-mode submission will
  fail with a 400 from Google Forms. The Form must be updated in the
  same release window.

## Solution Design

### Approach

**Chosen: strip end-to-end.** Remove the UI, the shared types, the
validation, the label map, the form field wiring, and all tests that
assert on the concept.

Rationale:

1. The issue's own "Out of Scope" note says *"strictly a removal"*.
2. Global `CLAUDE.md` is explicit: *"Don't design for hypothetical future
   requirements"* and *"If you are certain that something is unused, you
   can delete it completely"*. Keeping dead code (Option B below) is a
   direct backwards-compatibility hack of the kind the repo forbids.
3. The rename/restore cost if karaoke ever returns is small — the types
   and labels can be reintroduced from git history in one commit.
4. Option B (hard-code `'song'` in the function) leaves behind an enum
   with exactly one valid value, a single-entry label map, a validation
   branch that can never trigger a different code path, and a Google
   Form field ID that maps to a question the Form no longer accepts.
   Each of these is a latent bug waiting for a stale change to collide
   with it.

### Implementation

The change spans seven layers: UI, shared types, shared form fields,
Netlify function, Apps Script, tests, and docs. See the Implementation
Plan for step-by-step changes.

**Coordination with Google Form (manual step, out-of-repo):** the Form's
`Request type` question must be deleted or made optional *before* the
Netlify function stops sending it to production. Document this in the
PR body and README so the maintainer performs the Form edit in lockstep.
Locally and in tests this is not an issue — nothing reaches a live
Google Form.

### Benefits

- Smaller surface area in every layer.
- One fewer required field on the submission flow (one less thing a
  guest can mistype or bounce on).
- Types match runtime reality: `Requester` becomes `{ name; contact? }`,
  which is exactly what every caller sends.

## Implementation Plan

### Step 1: Remove the fieldset and request-type state from the UI

**File:** `src/App.tsx`

**Changes:**

- Drop the `RequestType` import on line 6 (leave `Song` in the import).
- Delete `const [requestType, setRequestType] = useState<RequestType>('song');`
  at line 27.
- In `handleRequest`, remove `requestType` from the payload passed to
  `submitSongRequest` (line 202). The call becomes
  `submitSongRequest(song, { name: trimmedName })`.
- Delete the entire `<fieldset className="input-label request-type">…</fieldset>`
  block at lines 267-289.

**Testing:**

```bash
npm run lint
npm run test:unit -- src/__tests__
```

### Step 2: Drop the request-type styling

**File:** `src/styles.css`

**Changes:**

- Delete the `.request-type` rule (lines 81-85).
- Delete the `.request-type .label-text` rule (lines 87-90).
- Delete the `.radio-option` rule (lines 92-97) and
  `.radio-option input[type='radio']` rule (lines 99-107) — confirmed
  via grep that neither selector is used anywhere else.

**Testing:** Visual smoke — `npm run dev` and confirm no orphaned
styling / layout shift on the main form.

### Step 3: Remove the request-type types

**File:** `shared/types.ts`

**Changes:**

- Delete `RequestType`, `REQUEST_TYPES`, and `REQUEST_TYPE_LABELS`
  (lines 14-24).
- Change the `Requester` type (lines 26-30) to
  `{ name: string; contact?: string }`.

**Testing:**

```bash
npm run lint
```

### Step 4: Remove the request-type form field ID

**File:** `shared/formFields.ts`

**Changes:**

- Delete the `requestType: "entry.1792970976",` entry (line 9).

**Testing:** Compile-time — TypeScript will error on any stale
reference.

### Step 5: Remove request-type validation in the Netlify function

**File:** `netlify/functions/_validate.ts`

**Changes:**

- Drop the `RequestType` import and the `REQUEST_TYPES` import (lines 1-2);
  the file no longer needs either.
- Delete the `enumField` helper (lines 47-61) and the `EnumOrError` type
  (line 47 above it) if no longer used. Grep confirms `enumField` is
  only used for `requestType`.
- Update `ValidatedRequester` to `{ name: string; contact: string | null }`.
- Remove the `requestType` block in `validateRequestBody`
  (lines 102-107) and the `requestType` field from the returned
  `requester` object (line 124).

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/_validate.test.ts
```

### Step 6: Remove request-type wiring in request.ts

**File:** `netlify/functions/request.ts`

**Changes:**

- Drop the `REQUEST_TYPE_LABELS` import (line 3).
- Remove the `appendField(params, FORM_FIELD_IDS.requestType, …)` block
  (lines 156-160).

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/request.test.ts
```

### Step 7: Slim down the client submit utility

**File:** `src/lib/googleForm.ts`

**Changes:**

- `Requester` already comes from `shared/types.ts`, so once step 3 lands
  the call signature auto-updates. Verify the TypeScript types flow
  through; no edits required unless a type error surfaces.

**Testing:** `npm run lint` will flag any stale usages.

### Step 8: Remove request-type from the Apps Script

**File:** `apps-script/index.ts`

**Changes:**

- Remove `requestType: namedValues["Request type"]?.[0] ?? null,` from
  the `submission` payload (line 78).

**File:** `apps-script/format.ts`

**Changes:**

- Remove `requestType?: string | null;` from `SongRequestSubmission`
  (lines 7-8).
- Drop the `{ label: 'Request type', value: submission.requestType ?? '—' }`
  entry from the `metadata` array (line 30).

**Testing:**

```bash
npm run test:unit -- apps-script/__tests__/format.test.ts
```

### Step 9: Delete / update tests

**File:** `netlify/functions/__tests__/requestTypeLabels.test.ts`

**Changes:** Delete the file — its entire purpose is the label map
being removed in step 3.

**File:** `netlify/functions/__tests__/_validate.test.ts`

**Changes:**

- Delete the four `requestType`-specific tests at lines 83-136 (accepts
  karaoke, rejects missing, rejects unknown value, rejects non-string).
- Update the happy-path test at lines 60-92 to use payload
  `{ requester: { name: 'Avery' } }` and assert the validated
  `requester` shape is `{ name: 'Avery', contact: null }`.
- Update any remaining tests that currently include
  `requestType: 'song'` in the payload to drop the field.

**File:** `netlify/functions/__tests__/request.test.ts`

**Changes:**

- Strip `requestType` from every fixture payload (~15 occurrences).
- Delete the `params.get(FORM_FIELD_IDS.requestType)` assertion at
  line 116 (and update the normalized-payload test's fixture to drop
  the `karaoke` value at line 93).

**File:** `apps-script/__tests__/format.test.ts`

**Changes:**

- Drop the `requestType:` field from both fixtures (lines 14, 33).
- Remove the `{ label: 'Request type', value: … }` rows from both
  `expect(entry.metadata).toEqual(…)` assertions.

**File:** `tests/e2e/request.spec.ts`

**Changes:**

- Drop the `requestType` assertion on the POST body (line 52).
- Delete the whole "Song/Karaoke radio interaction" block (lines 75-80)
  — the smoke test should drive through requester name, preview, and
  request without the selector.

**Testing:**

```bash
npm run test:unit
npm run test:e2e
```

### Step 10: Update documentation

**File:** `README.md`

**Changes:**

- Replace the `Multiple choice: Request type (required)` bullet
  (line 44) with a note that the Request type question is no longer
  required. Remove the "edit the `Request type` question in place"
  paragraph at lines 47-49.

**File:** `CLAUDE.md`

**Changes:**

- Remove the `Visible (multiple choice, required): Request type`
  bullet from the Google Form Configuration Steps section.

## Testing Strategy

### Unit Testing

- `_validate.test.ts` — verifies the validator accepts
  `{ requester: { name } }` and rejects a missing name; no request-type
  branches remain.
- `request.test.ts` — verifies the Google Form POST params include the
  expected fields and **do not** include `entry.1792970976`.
- `format.test.ts` — verifies `buildDocEntry` no longer emits a
  `Request type` metadata row.

### Integration Testing

**Test Case 1: happy-path submission**

1. `npm run dev`; open the app.
2. Enter a name, search for a track, click Request.
3. Expected: success banner; no JS errors; DevTools POST to
   `/.netlify/functions/request` does not include a `requestType` field.

**Test Case 2: Playwright smoke**

`npm run test:e2e` — the smoke test passes without the request-type
radio.

### Regression Testing

- Preview playback still works (independent feature).
- Requester name persistence (#110) still works.
- Rate limiting still returns 429 after 5 rapid submissions.
- Apps Script output (as asserted by `format.test.ts`) no longer has
  a `Request type` row.

## Success Criteria

- [ ] `<fieldset className="request-type">` removed from `src/App.tsx`.
- [ ] `requestType` state and payload removed from `src/App.tsx`.
- [ ] `RequestType`, `REQUEST_TYPES`, `REQUEST_TYPE_LABELS` removed from
      `shared/types.ts`.
- [ ] `Requester` shape updated to `{ name; contact? }`.
- [ ] `formFields.requestType` removed.
- [ ] `_validate.ts` no longer imports or validates `requestType`.
- [ ] `request.ts` no longer appends the `Request type` form field.
- [ ] `apps-script/index.ts` and `format.ts` no longer reference
      `requestType`.
- [ ] `requestTypeLabels.test.ts` deleted.
- [ ] `request.test.ts`, `_validate.test.ts`, `format.test.ts` no
      longer reference `requestType` or karaoke.
- [ ] `tests/e2e/request.spec.ts` no longer asserts the Karaoke radio.
- [ ] README and CLAUDE.md reflect that the Request type Form question
      is no longer required.
- [ ] `npm run lint`, `npm run test:unit`, `npm run test:e2e` all pass.

## Files Modified

1. `src/App.tsx` — remove fieldset, state, and payload field.
2. `src/styles.css` — remove `.request-type` and `.radio-option` rules.
3. `shared/types.ts` — remove `RequestType`, `REQUEST_TYPES`,
   `REQUEST_TYPE_LABELS`; update `Requester`.
4. `shared/formFields.ts` — remove `requestType` entry.
5. `netlify/functions/_validate.ts` — remove enum validation and
   `enumField` helper if unused.
6. `netlify/functions/request.ts` — remove label import and form-field
   append.
7. `apps-script/index.ts` — remove `requestType` from the submission
   payload.
8. `apps-script/format.ts` — remove `requestType` field and metadata
   row.
9. `netlify/functions/__tests__/requestTypeLabels.test.ts` — deleted.
10. `netlify/functions/__tests__/_validate.test.ts` — drop request-type
    tests, update fixtures.
11. `netlify/functions/__tests__/request.test.ts` — drop request-type
    assertions and fixtures.
12. `apps-script/__tests__/format.test.ts` — drop request-type
    fixtures/assertions.
13. `tests/e2e/request.spec.ts` — drop request-type assertions and
    radio interaction.
14. `README.md` — update Google Form setup docs.
15. `CLAUDE.md` — update Google Form Configuration Steps.

## Related Issues and Tasks

### Depends On

- Manual Google Form change: make the `Request type` question optional
  or delete it before the Netlify function deploy reaches production.
  Document in the PR body.

### Blocks

- None.

### Related

- #93 — original introduction of the Song/Karaoke selector.
- #100 — colocated label map (becomes fully removed here).

### Enables

- A shorter, clearer submission flow for guests.

## References

- [GitHub Issue #119](https://github.com/denhamparry/djrequests/issues/119)
- [GitHub Issue #93](https://github.com/denhamparry/djrequests/issues/93)
- [GitHub Issue #100](https://github.com/denhamparry/djrequests/issues/100)

## Notes

### Key Insights

- `.radio-option` CSS is used **only** for these two radios; grep
  confirms. Removing it with the fieldset avoids leaving a dangling
  selector.
- The Google Form coordination is the only manual out-of-repo step —
  everything else is code.
- Deleting `requestTypeLabels.test.ts` outright is safer than editing
  it down to an empty `describe` block.

### Alternative Approaches Considered

1. **Keep the backend plumbing, hard-code `'song'` in the function** —
   Rejected. Leaves an enum with one member, a label map with one
   entry, a validation branch that can never flip, and a Google Form
   field ID pointing at a question that no longer exists. Violates
   the repo's "no backwards-compatibility hacks" and "don't design for
   hypothetical future requirements" norms. ❌
2. **Keep the Google Form question as optional and let the function
   still send it** — Rejected for the same reason: the codepath would
   never receive a value other than `'song'`, so the choice is
   meaningless. ❌
3. **Strip end-to-end** — Chosen. Matches the issue's "strictly a
   removal" framing and the repo's delete-unused-code norms. If karaoke
   ever returns, the types and labels come back cleanly from git
   history. ✅

### Best Practices

- Land the code change and the Google Form edit in the same deploy
  window. The function no longer sends `entry.1792970976`, so any
  "required" setting on that question will cause production
  submissions to 400.
- No runtime monitoring changes required; the existing `requestId` /
  `trackId` logs remain the source of truth for failures.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- **Decision surfaced and justified.** The issue explicitly asked for a
  call between "strip end-to-end" and "keep backend plumbing". The plan
  picks strip end-to-end and grounds the choice in concrete repo norms
  ("Don't design for hypothetical future requirements", "delete unused
  code completely"), not just personal preference.
- **Call sites enumerated by layer.** Every match from the
  `request.?type|karaoke|RequestType|request-type` grep is accounted
  for. No "and any other references" hand-wave.
- **Google Form coordination called out.** The plan identifies the only
  out-of-repo deploy constraint (the form's `Request type` question is
  currently required; the function dropping `entry.1792970976` will
  400) and puts it in the PR body as a pre-deploy step.
- **Doc symmetry.** Both README and CLAUDE.md are updated — consistent
  with prior issues in this repo that often miss CLAUDE.md.

### Gaps Identified

1. **Gap 1:** Plan Step 10 doesn't specify whether the Form's
   `Request type` question should be **deleted** or **made optional**.
   The issue body says "the form's Request type question should be
   made optional or removed; document the chosen path in CLAUDE.md /
   README."
   - **Impact:** Low (either outcome makes production submissions
     succeed — but the PR body / README instruction should be
     unambiguous so the maintainer doesn't have to guess).
   - **Recommendation:** Pick **"made optional"** (preserves the
     existing `entry.1792970976` binding in case the field is ever
     revived, and requires a smaller Form edit). Update Step 10 to
     say explicitly: "README and CLAUDE.md should state that the
     Request type question is no longer required; the maintainer
     should edit the Google Form to set that question to
     Optional (not delete it) so the `entry.<id>` is preserved for
     future use." This is a plan-level wording fix, not a code
     change.

2. **Gap 2:** Step 7 (`src/lib/googleForm.ts`) says "no edits required
   unless a type error surfaces" but the function signature
   `submitSongRequest(song: Song, details: Requester)` is part of the
   public shape of the client library. After `Requester` loses
   `requestType`, the callable shape changes in a user-visible way
   (App.tsx calls with `{ name: trimmedName }` only).
   - **Impact:** Low — TypeScript will refuse to compile stale calls,
     so anything that still passes `requestType` will fail the lint
     step anyway.
   - **Recommendation:** Implementation can leave Step 7 as
     "verify — no edits expected". Just confirm nothing else in `src/`
     imports `Requester` before landing (grep confirms only
     `App.tsx` and `googleForm.ts` do).

### Edge Cases Not Covered

1. **Stale Apps Script deployment.** If the code ships but the Apps
   Script bound to the Form hasn't been redeployed from the updated
   `apps-script/index.ts`, the stale script will still try to read
   `namedValues["Request type"]`. With the Form question present and
   optional this is harmless (`undefined` → `null` → no-op if the
   stale script still renders a `—` row). With the Form question
   deleted, `namedValues["Request type"]` just isn't there, again
   harmless. But the Doc will temporarily show a `Request type: —`
   row until the script is redeployed.
   - **Current Plan:** Step 8 updates the Apps Script code, but
     there's no deployment ordering guidance in the PR body.
   - **Recommendation:** Add a single bullet to the PR body: "After
     merging, redeploy the Apps Script by copy-pasting
     `apps-script/index.ts` and `apps-script/format.ts` into the
     linked Apps Script project." No plan-section change required —
     this goes in the PR description.

2. **Visual regression.** Removing the fieldset + its CSS (`.request-type`,
   `.radio-option`) could shift layout around the search form. The
   repo has no snapshot or visual regression test.
   - **Current Plan:** Calls for a manual `npm run dev` smoke after
     Step 2.
   - **Recommendation:** Keep the manual smoke as the verification —
     adding a new visual regression test would violate the "don't
     add features beyond what the task requires" norm.

### Alternatives Considered in Review

1. **Alternative 1:** Gate the UI behind a feature flag so the backend
   keeps accepting/requiring `requestType` but the guest never sees
   the radios.
   - **Pros:** Fully reversible without a code change.
   - **Cons:** Introduces a flag for a decision the issue has already
     made; every layer below the UI gets no simpler; dead code grows.
   - **Verdict:** Worse than the chosen approach. Rejected.

2. **Alternative 2:** Keep `Requester.requestType` optional so the
   backend accepts payloads with or without it.
   - **Pros:** Smallest blast radius if the Apps Script or Form
     deploys out of order.
   - **Cons:** Leaves a dead enum, a one-entry label map, and a
     validation branch that only ever sees one value. Same "dead
     code" downsides as the already-rejected Option B.
   - **Verdict:** Still violates repo norms. Rejected in favour of
     clean removal + deploy-ordering guidance.

### Risks and Concerns

1. **Risk 1:** Production Form submissions break between the Netlify
   deploy and the Google Form edit.
   - **Likelihood:** Medium (requires human coordination).
   - **Impact:** Medium (guests see a 502 via the function's
     "Google Form responded with status 400" path).
   - **Mitigation:** Do the Form edit (set `Request type` question
     to Optional) **before** merging the PR. Document this in the
     PR body as the first checkbox on the Test Plan. The existing
     `requestId`/`trackId` logs will make any regression debuggable.

2. **Risk 2:** `enumField` deletion breaks a future refactor that
   assumes the helper exists.
   - **Likelihood:** Low. Grep confirms single caller.
   - **Impact:** Low. Anything that reintroduces enum validation
     can restore the helper from git history in one commit.
   - **Mitigation:** None needed.

### Required Changes

- [ ] Update Step 10 to specify "make the Google Form question
      Optional (do not delete)" so the `entry.<id>` binding is
      preserved. (Documentation-only wording fix.)

### Optional Improvements

- [ ] Add an Apps Script redeploy bullet to the PR description (not
      the plan itself) so the Doc output catches up with the code.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified via grep)
- [x] Security implications considered (no new attack surface; a
      validation branch is removed but the field it guarded is also
      removed, so there is nothing to validate)
- [x] Performance impact assessed (negligible — one fewer form field
      on each POST)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (README + CLAUDE.md)
- [x] Related issues/dependencies identified (#93, #100)
- [x] Breaking changes documented (Google Form coordination)
