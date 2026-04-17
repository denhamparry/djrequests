# GitHub Issue #93: Replace "Dedication (optional)" free-text with "Song" / "Karaoke" selection

**Issue:** [#93](https://github.com/denhamparry/djrequests/issues/93)
**Status:** Reviewed (Approved)
**Date:** 2026-04-17

## Problem Statement

The request modal currently exposes a free-text `Dedication (optional)` input
that guests rarely use as intended (a message to the crowd). In practice the
DJ needs to tell requests apart by **type** — regular track vs. karaoke —
since karaoke requests are routed differently during events.

### Current Behavior

- Free-text `<input id="dedication">` rendered in `src/App.tsx` (label
  "Dedication (optional)").
- Value flows as `requester.dedication` through `submitSongRequest` →
  `/.netlify/functions/request` → validated as an optional string (up to 500
  chars) → submitted to Google Form field `entry.1792970976` → surfaced in
  the DJ's Google Doc queue under the `Dedication` row.
- Freeform strings produce low-signal queue entries; karaoke vs. song is not
  recorded at all.

### Expected Behavior

- Request modal shows a required **Song / Karaoke** selector (radio group),
  defaulting to `Song` for minimal friction.
- The selected value is sent through the existing Google Form entry ID
  (`entry.1792970976`), surfaced in the Google Doc queue under a new
  `Request type` row.
- Validation accepts only `song` or `karaoke`; anything else is rejected.

## Current State Analysis

### Relevant Code/Config

- `src/App.tsx:20` — `useState('')` for dedication; `src/App.tsx:247-257` —
  label + input; `src/App.tsx:188, 194-197` — trims and conditionally omits
  the value when submitting.
- `shared/types.ts:14-18` — `Requester.dedication?: string`.
- `shared/formFields.ts:9` — `dedication: "entry.1792970976"`.
- `netlify/functions/_validate.ts:39-44, 85-86, 101-105` — `optionalString`
  used for `requester.dedication`; branded `ValidatedRequester.dedication:
  string | null`.
- `netlify/functions/request.ts:155` — `appendField(params,
  FORM_FIELD_IDS.dedication, requester.dedication)`.
- `apps-script/index.ts:79` — `namedValues["Dedication"]?.[0] ?? null`.
- `apps-script/format.ts:30` — row label `"Dedication"`.
- `src/lib/googleForm.ts` — forwards `Requester` unchanged; no dedication
  logic of its own.
- `tests/e2e/request.spec.ts` — Playwright smoke test; currently does not
  interact with the dedication field.
- `README.md:44` + project `CLAUDE.md` — describe the form field as
  `Dedication / Message` short answer.

### Related Context

- The Google Form entry ID `entry.1792970976` is stable when the question
  type is changed in-place (short answer → multiple choice). The **question
  title** is what Apps Script keys off via `namedValues["Dedication"]` — if
  the title changes, this lookup must change too. Editing the existing
  question avoids both a new entry ID and broken form responses.
- `_validate.ts` uses branded types (`ValidatedRequester`) to separate
  unvalidated input from validated payloads — the new field must preserve
  that pattern.
- No existing plan touches this field. Most recent related work is
  `docs/plan/issues/51_tighten_requester_name_required.md` (required-name
  validation) and `docs/plan/issues/49_brand_validated_types.md` (brand
  pattern).

## Solution Design

### Approach

- Introduce a new domain field `requestType: 'song' | 'karaoke'` on
  `Requester`, **replacing** `dedication`. This is a small, breaking rename
  contained to one repo and one Google Form.
- Rename the `FORM_FIELD_IDS.dedication` key to `FORM_FIELD_IDS.requestType`
  but **keep the entry ID value `entry.1792970976`** — the Google Form
  question stays the same underlying field.
- Default the UI to `Song`; render as a radio group for touch friendliness
  and accessibility (keyboard + screen reader support out of the box).
- Enforce the enum in `_validate.ts` by adding an `enumField` helper; the
  field becomes **required** (no more optional) because we default at the
  UI.
- In `apps-script/index.ts`, update the `namedValues["Dedication"]` lookup
  to `namedValues["Request type"]` so the Apps Script trigger still reads
  the right column after the form question title change. Capitalise the
  form value on the way into the Doc (`Song` / `Karaoke`).
- Rename the Doc row label from `Dedication` to `Request type` in
  `apps-script/format.ts`.

### Implementation

#### Wire values

The UI submits lowercase tokens (`song` / `karaoke`) to the Netlify function.
The function passes them to the Google Form unchanged — Google Forms accepts
the option's label text, so the form options must be **exactly** `Song` and
`Karaoke` (capitalised). To keep wire/form alignment, the Netlify function
will map `song → 'Song'` and `karaoke → 'Karaoke'` before setting the form
param. This keeps the internal type system lowercase-canonical while matching
the form's display labels.

Alternative considered: submit capitalised tokens from the UI. Rejected to
avoid mixing presentation and wire format.

#### Google Form change (manual)

Documented in `README.md` and project `CLAUDE.md`:

1. Edit the existing "Dedication / Message" question (do NOT delete/recreate
   — would invalidate `entry.1792970976`).
2. Change type from Short answer → Multiple choice.
3. Set options: `Song`, `Karaoke`.
4. Rename question title to `Request type`.
5. Mark required (to match backend).

### Benefits

- DJ immediately sees request type in the queue.
- Frees the existing Google Form field for re-use (no new entry ID needed).
- Removes a rarely-useful free-text input that contributed no queue signal.

## Implementation Plan

### Step 1: Shared contract (types + form field rename)

**File:** `shared/types.ts`

**Changes:**

- Replace `dedication?: string` with `requestType: RequestType` on
  `Requester`.
- Export `RequestType = 'song' | 'karaoke'` and `REQUEST_TYPES: readonly
  RequestType[] = ['song', 'karaoke'] as const`.

**File:** `shared/formFields.ts`

**Changes:**

- Rename key `dedication` → `requestType`, keeping value
  `"entry.1792970976"`.

### Step 2: Validation

**File:** `netlify/functions/_validate.ts`

**Changes:**

- Import `REQUEST_TYPES` / `RequestType` from `shared/types`.
- Add a generic `enumField<T extends string>(value, field, allowed)`
  helper that returns the value if it is in `allowed` or an error.
- Update `ValidatedRequester` to:

  ```ts
  {
    name: string;
    requestType: RequestType;
    contact: string | null;
  }
  ```

  (drop `dedication`; `requestType` is required and non-null).

- In `validateRequestBody`, replace the dedication branch with a required
  enum check on `requester.requestType`.

**File:** `netlify/functions/__tests__/_validate.test.ts`

**Changes:**

- Replace dedication-related cases with:
  - accepts `song` and `karaoke`,
  - rejects missing `requestType` (`requester.requestType is required`),
  - rejects unknown value (`requester.requestType must be one of song,
    karaoke` — exact wording to match helper),
  - rejects non-string value (number / object).
- Update the "accepts minimal valid payload" case to include
  `requestType: 'song'`.
- Update the "accepts full payload" case to include `requestType:
  'karaoke'` and remove the `dedication` expectation.
- Update the branded-type compile-time guard to match the new
  `ValidatedRequester` shape (no `dedication`, has `requestType`).

### Step 3: Request function

**File:** `netlify/functions/request.ts`

**Changes:**

- Replace:

  ```ts
  appendField(params, FORM_FIELD_IDS.dedication, requester.dedication);
  ```

  with:

  ```ts
  const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
    song: 'Song',
    karaoke: 'Karaoke'
  };
  appendField(
    params,
    FORM_FIELD_IDS.requestType,
    REQUEST_TYPE_LABEL[requester.requestType]
  );
  ```

- Import `RequestType` from `shared/types`.

**File:** `netlify/functions/__tests__/request.test.ts`

**Changes:**

- Update any fixture that sends `requester.dedication` to use
  `requester.requestType: 'song'` (or `'karaoke'` where relevant).
- Add an assertion that the outgoing URLSearchParams contain
  `entry.1792970976=Song` (or `Karaoke`).

### Step 4: Frontend (request modal)

**File:** `src/App.tsx`

**Changes:**

- Replace `const [dedication, setDedication] = useState('')` with `const
  [requestType, setRequestType] = useState<RequestType>('song')`.
- Replace the `<label htmlFor="dedication">` block with a `<fieldset>` +
  `<legend>` radio group labelled "Request type" with two radios (`Song`,
  `Karaoke`). `Song` is checked by default.
- In `handleRequest`, remove dedication trimming and pass `requestType`
  through:

  ```ts
  await submitSongRequest(song, { name: trimmedName, requestType });
  ```

- Import `RequestType` from `../shared/types`.

**Styling:** Add minimal radio styles if the default layout is ugly; prefer
re-using existing `.input-label` pattern by wrapping radios in a
`<fieldset class="input-label">` so styling stays consistent.

### Step 5: Apps Script (Doc formatter + trigger)

**File:** `apps-script/format.ts`

**Changes:**

- In `SongRequestSubmission`, rename the optional `dedication?: string |
  null` to `requestType?: string | null` (stays optional at this layer
  because the form response could in theory be empty for old rows).
- In `buildDocEntry`, replace the `Dedication` metadata row with:

  ```ts
  { label: 'Request type', value: submission.requestType ?? '—' }
  ```

**File:** `apps-script/index.ts`

**Changes:**

- Replace:

  ```ts
  dedication: namedValues["Dedication"]?.[0] ?? null,
  ```

  with:

  ```ts
  requestType: namedValues["Request type"]?.[0] ?? null,
  ```

**File:** `apps-script/__tests__/format.test.ts`

**Changes:**

- Replace `dedication` fields with `requestType` in both test cases.
- Update expected metadata row label/value accordingly (`Request type` / the
  selected value, `'—'` for the fallback case).

### Step 6: E2E smoke test

**File:** `tests/e2e/request.spec.ts`

**Changes:**

- Before clicking the request button, assert the default `Song` radio is
  checked and the `Karaoke` radio is not, then click `Karaoke`.
- Extend the request-route assertion to check
  `body.requester.requestType === 'karaoke'`.

### Step 7: Docs

**File:** `README.md`

**Changes:**

- In the Google Form setup section (around line 44), replace `Short answer:
  Dedication / Message (optional)` with `Multiple choice: Request type
  (required) — options: Song, Karaoke`.
- Add a note: "Edit the existing question in-place; do not delete/recreate
  it, so `entry.1792970976` stays stable."

**File:** `CLAUDE.md` (repo — symlinked or plain, as present)

**Changes:**

- In "Configuration Steps → Visible fields", update the field list to show
  `Request type (multiple choice: Song / Karaoke)` instead of
  `Dedication`.

## Testing Strategy

### Unit Testing

- `_validate.test.ts` — enum validation (accept both values, reject
  missing, reject unknown, reject wrong type).
- `format.test.ts` — `Request type` row renders correctly for both values
  and falls back to `—` when missing.
- `request.test.ts` — outgoing form body contains
  `entry.1792970976=Song|Karaoke`.

### Integration Testing

**Test Case 1: Song request (default)**

1. Load app, enter name, search, click Request with default selection.
2. Expected: Google Form receives `Song`; Doc shows `Request type: Song`.

**Test Case 2: Karaoke request**

1. Load app, enter name, select `Karaoke`, search, click Request.
2. Expected: Google Form receives `Karaoke`; Doc shows
   `Request type: Karaoke`.

**Test Case 3: Malformed request rejected**

1. POST `{ requester: { name: 'x', requestType: 'shout' } }`.
2. Expected: 400 with error naming `requester.requestType`.

### Regression Testing

- Existing request flow (name required, cooldown, feedback messaging, rate
  limiting, preview playback) unaffected.
- `entry.1792970976` still populated — old Google Form / Sheet rows stay
  addressable.
- CORS / rate-limit branches untouched.

## Success Criteria

- [ ] Request modal shows a Song/Karaoke radio group, not a free-text input.
- [ ] Default selection is `Song`; `Karaoke` can be selected.
- [ ] Both selections produce a valid submission that reaches the Google
      Form response sheet with the chosen label.
- [ ] DJ's Google Doc entry shows `Request type: Song` or `Request type:
      Karaoke`.
- [ ] `_validate.ts` rejects missing / unknown / non-string values with a
      field-qualified error.
- [ ] Unit tests pass (`npm run test:unit`).
- [ ] Playwright smoke test passes (`npm run test:e2e`).
- [ ] `npm run lint` clean.
- [ ] `README.md` and repo `CLAUDE.md` reflect the new field.

## Files Modified

1. `shared/types.ts` — replace `dedication?: string` with `requestType:
   RequestType`; export `RequestType` + `REQUEST_TYPES`.
2. `shared/formFields.ts` — rename key `dedication` → `requestType`, keep
   entry ID.
3. `netlify/functions/_validate.ts` — add `enumField` helper; replace
   dedication validation with required `requestType` enum check; update
   `ValidatedRequester`.
4. `netlify/functions/__tests__/_validate.test.ts` — replace dedication
   cases; add enum cases; update branded-type guard.
5. `netlify/functions/request.ts` — replace dedication append with mapped
   `requestType` label; import type.
6. `netlify/functions/__tests__/request.test.ts` — update fixtures and
   outgoing-body assertions.
7. `src/App.tsx` — replace dedication input with radio group; update
   `handleRequest` payload.
8. `apps-script/format.ts` — rename `dedication` → `requestType` in
   `SongRequestSubmission` and metadata row.
9. `apps-script/index.ts` — change `namedValues["Dedication"]` →
   `namedValues["Request type"]`, rename field.
10. `apps-script/__tests__/format.test.ts` — update both cases for the new
    field name and row label.
11. `tests/e2e/request.spec.ts` — interact with radios; assert outgoing
    request body carries `requestType`.
12. `README.md` — update form-setup field description.
13. `CLAUDE.md` (repo) — update field list in "Configuration Steps".

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- `docs/plan/issues/51_tighten_requester_name_required.md` — prior
  required-field work on `Requester`.
- `docs/plan/issues/49_brand_validated_types.md` — established the brand
  pattern we extend here.
- `docs/plan/issues/033_refactor_share_song_types_dedupe_derive_form_config.md`
  — prior shared-types refactor the new `RequestType` export piggybacks on.

### Enables

- Future per-type routing in the queue (e.g. separate karaoke section in
  the Doc).

## References

- [GitHub Issue #93](https://github.com/denhamparry/djrequests/issues/93)
- `shared/types.ts`, `shared/formFields.ts`, `netlify/functions/_validate.ts`
- `apps-script/index.ts`, `apps-script/format.ts`

## Notes

### Key Insights

- **Google Form entry IDs are stable across question-type edits.** Editing
  the existing question preserves `entry.1792970976` and avoids rewiring
  `formFields.ts`. Deleting + recreating would force a new ID.
- **Apps Script `namedValues` keys on the question _title_, not the entry
  ID.** Changing the title from `Dedication` to `Request type` requires a
  code change in `apps-script/index.ts` — easy to miss.
- **Wire vs. display split.** Keeping the internal enum lowercase
  (`song`/`karaoke`) matches TypeScript conventions; capitalising only at
  the Form boundary keeps presentation concerns out of the type system.

### Alternative Approaches Considered

1. **Keep the field name `dedication` internally, just swap the UI.** ❌
   Preserves surface continuity but misleads every reader of the code —
   the field no longer represents a dedication. Not worth the confusion.
2. **Make `requestType` optional with a `null` / unknown fallback.** ❌
   The whole point is to classify every request; defaulting at the UI is
   simpler and catches form-response drift at the validator.
3. **Add a new Google Form field and leave dedication in place.** ❌
   Duplicates queue surface and doesn't address the "dedication rarely
   used" observation from the issue.
4. **Chosen: Rename field end-to-end, reuse `entry.1792970976`.** ✅
   Clean rename, stable form wiring, explicit validation.

### Best Practices

- Run the E2E smoke test after the Apps Script trigger is updated; the
  `namedValues["Request type"]` key mismatch is silent (writes `—` to the
  Doc instead of throwing).
- After merging, manually edit the live Google Form question **in place**
  before the next event — code alone will not update Google-side state.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation (with the required changes
  below folded in during Phase 3; they do not require a plan revision).

### Strengths

- Root cause correctly identified: the plan replaces a low-signal free-text
  field with a classifier, exactly matching the issue's motivation.
- Entry-ID stability correctly recognised — the plan reuses
  `entry.1792970976` by editing the question in-place rather than
  deleting/recreating it.
- Apps Script title-vs-ID distinction is explicitly called out in the plan
  notes (`namedValues` keys on title, not entry ID) — this silent-failure
  mode is the easiest thing to miss on this change.
- Wire/presentation split (lowercase canonical + capitalised at the Form
  boundary) is idiomatic for this codebase and keeps the type system clean.
- Brand pattern preserved (`ValidatedRequester` updated rather than
  bypassed) — consistent with `docs/plan/issues/49_brand_validated_types.md`.
- Implementation steps are specific, file-scoped, and include code snippets
  where the change is non-trivial.

### Gaps Identified

1. **`tests/e2e/request.spec.ts` preview-stub fixture needs a radio
   interaction, not just an assertion.**
   - **Impact:** Low — the test currently doesn't touch the dedication
     field at all, so "extending" it is new interaction, not an edit.
   - **Recommendation:** Explicitly state in Step 6 that the test must
     locate the `Karaoke` radio by role (`getByRole('radio', { name:
     'Karaoke' })`) and click it before `requestButton.click()`. The
     current plan wording ("extend the request-route assertion") could be
     read as assertion-only.

2. **`src/lib/googleForm.ts` type surface.**
   - **Impact:** Low — this file imports `Requester` from `shared/types`
     and passes it through untouched, so no code change is needed. But the
     plan's "Files Modified" list omits it, which is correct, and nothing
     in the file needs editing. Worth confirming that TypeScript will
     catch any lingering `dedication` usages at compile time.
   - **Recommendation:** During implementation, run `npx tsc --noEmit`
     after the `shared/types.ts` change to flush any other
     `requester.dedication` references (none expected in non-test code
     based on grep, but the compile-time guard is free insurance).

3. **README scope.**
   - **Impact:** Low — the plan lists `README.md` with a single line
     change, but the README's "Google Form Setup" section has several
     adjacent lines (43–45) describing the dedication field and the
     overall form creation flow. The surrounding copy still reads
     naturally after the one-line edit, so this is fine, but worth a
     sanity re-read during implementation.
   - **Recommendation:** When editing, also confirm the "Add
     visitor-facing fields" bullet list flows correctly with the new
     wording.

### Edge Cases Not Covered

1. **Form submission with missing `requestType` from a custom client.**
   - **Current Plan:** Validation rejects with 400 `requester.requestType
     is required` (covered in Step 2).
   - **Recommendation:** No change — explicit test case already required
     in Step 2 ("rejects missing `requestType`"). Covered.

2. **Old Google Sheet rows re-triggered manually.**
   - **Current Plan:** Not addressed.
   - **Recommendation:** Non-issue. `onFormSubmit` only fires on new
     submissions; Apps Script doesn't backfill. Worth a one-line comment
     in the commit message but no code change needed. (If a developer
     manually runs `onFormSubmit` against a historical `namedValues`
     payload during testing, the key lookup will return `—`, which is the
     intended fallback in `format.ts`.)

3. **Capitalisation mismatch between Form option labels and code.**
   - **Current Plan:** Netlify function maps `song → Song` / `karaoke →
     Karaoke` before hitting the Form (Step 3).
   - **Recommendation:** Add an inline comment in `request.ts` next to the
     map noting **exact-match requirement** with Form option labels.
     Silent failure mode: if someone renames the Form option to
     "Song request" but not the code map, Google Forms will reject the
     submission with a 400 and the guest sees the 502 from our function
     with no clue what happened. A defensive integration test isn't
     worth it, but a comment is.

### Alternatives Reconsidered

1. **`<select>` dropdown instead of radios.**
   - **Pros:** Saves vertical space; one-click-less code.
   - **Cons:** Harder to scan at a glance on mobile; radios surface both
     options simultaneously, which is better for a two-option choice
     (UX best practice is radios for ≤3 options).
   - **Verdict:** Plan's choice (radios) is correct.

2. **Keep `dedication` field name internally; only change the UI.**
   - **Pros:** No type-level churn; formFields.ts key stays the same.
   - **Cons:** Every future reader has to mentally translate; the field
     no longer means what it says; tests describe behaviour incorrectly.
   - **Verdict:** Plan's rename is correct. The short-term churn pays for
     itself on the first "what does this do?" moment.

3. **Add a new Form field for request type, leave dedication in place.**
   - **Pros:** Non-breaking; dedication remains available if the DJ ever
     wants it.
   - **Cons:** Two fields for what should be one classification; keeps a
     field the issue explicitly wants removed; queue surface bloats.
   - **Verdict:** Correctly rejected in the plan's "Alternatives" section.

### Risks and Concerns

1. **`.input-label` CSS reuse on `<fieldset>`.**
   - **Likelihood:** Medium — the existing class targets a `<label>`
     wrapping a single `<input>`, and is likely styled with flex/block
     layout assumptions (e.g. label above input). A `<fieldset>` with
     `<legend>` + two radios has a different internal structure.
   - **Impact:** Low — worst case is a visual regression that's easy to
     spot in dev and fix with a one-line CSS rule.
   - **Mitigation:** During implementation, visually verify the radio
     group in the dev server. If `.input-label` doesn't lay out
     correctly on `<fieldset>`, add a scoped class (e.g. `.request-type`)
     with minimal radio-group styling (`display: flex; gap: 0.75rem;`
     for horizontal options) rather than forcing the existing class.

2. **Playwright E2E test timing.**
   - **Likelihood:** Low — the existing test uses `page.waitForTimeout`
     for debounced search, not for form interactions.
   - **Impact:** Low — radios are synchronous.
   - **Mitigation:** None needed.

3. **Google Form manual step is out-of-band.**
   - **Likelihood:** High — code lands before the form is edited.
   - **Impact:** Medium — if the form still has the short-answer
     `Dedication / Message` question when the new code ships, submissions
     from the UI will send `Song` to a short-answer field (still stored,
     but the Doc `Request type` lookup returns `—` because the form
     question is still titled "Dedication / Message"). The next event
     queue looks broken until someone runs the manual form edit.
   - **Mitigation:** The plan's README note is sufficient, but the PR
     description should reiterate the manual step as a release checklist
     item. The `Notes → Best Practices` section of the plan already
     covers this; tighten the wording at PR time.

### Required Changes

**Changes that must be made during implementation (no plan revision
required):**

- [ ] In Step 3 (`netlify/functions/request.ts`), add an inline comment
      above the `REQUEST_TYPE_LABEL` map noting it must match Google Form
      option labels exactly.
- [ ] In Step 6 (`tests/e2e/request.spec.ts`), make the new radio
      interaction explicit (`getByRole('radio', { name: 'Karaoke'
      }).check()` or `.click()`), not just an outgoing-body assertion.
- [ ] During Step 4 (`src/App.tsx`), if `.input-label` does not lay out
      cleanly on `<fieldset>`, add a scoped `.request-type` CSS rule
      rather than forcing the existing class.
- [ ] After the `shared/types.ts` rename, run `npx tsc --noEmit` to
      flush any stray `requester.dedication` references before touching
      test files (cheap compile-time sweep).

### Optional Improvements

- [ ] Add a `// TODO(#93): remove manual form-edit step once infra can
      manage Forms` comment in `README.md` near the new instruction.
  (Not blocking; purely documentation hygiene.)
- [ ] Export the `REQUEST_TYPE_LABEL` map from a shared module so
      `_validate.ts` and `request.ts` agree on the allowed set via a
      single source of truth. (Probably over-engineering for two values;
      mention it in the commit body as a deferred refactor.)

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered (see mapping below)
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified against HEAD)
- [x] Security implications considered (enum validation rejects untrusted
      strings; no new injection surface)
- [x] Performance impact assessed (no change — one more compare in the
      validator)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (README + CLAUDE.md)
- [x] Related issues/dependencies identified (none blocking)
- [x] Breaking changes documented (internal rename;
      `Requester.dedication` removed from wire contract — acceptable, no
      external API consumers)

**Acceptance-criteria mapping (issue → plan):**

| Issue AC                                           | Plan coverage                                    |
| -------------------------------------------------- | ------------------------------------------------ |
| Song/Karaoke selector in modal (not free-text)     | Step 4                                           |
| Submits successfully, Doc shows chosen value       | Steps 3 + 5                                      |
| Unit tests for valid values + rejection            | Steps 2 + 5 (`_validate.test.ts`, `format.test`) |
| Playwright E2E exercises the selector              | Step 6                                           |
| README and CLAUDE.md reflect new field             | Step 7                                           |

**Status update:** `Under Review` → `Reviewed (Approved)`
