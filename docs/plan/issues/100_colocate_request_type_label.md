# GitHub Issue #100: colocate REQUEST_TYPE_LABEL with REQUEST_TYPES in shared/types

**Issue:** [#100](https://github.com/denhamparry/djrequests/issues/100)
**Status:** Complete
**Date:** 2026-04-17

## Problem Statement

`netlify/functions/request.ts` defines a local `REQUEST_TYPE_LABEL` map that
converts the canonical lowercase wire value (`'song'` / `'karaoke'`) to the
exact Google Form option label (`'Song'` / `'Karaoke'`). The mapping lives
next to `RequestType` / `REQUEST_TYPES` conceptually but is physically
isolated in the Netlify function.

### Current Behavior

- `shared/types.ts` exports `RequestType` and `REQUEST_TYPES`.
- `netlify/functions/request.ts:84` defines a private
  `REQUEST_TYPE_LABEL: Record<RequestType, string>`.
- Any future consumer (apps-script, a second Netlify function, or UI code
  that needs the display label) would have to duplicate this map, creating
  a silent drift risk between UI display, code constants, and the Google
  Form option text.

### Expected Behavior

- `REQUEST_TYPE_LABEL` (or equivalent accessor) is exported from
  `shared/types.ts` alongside `RequestType` / `REQUEST_TYPES`.
- `netlify/functions/request.ts` imports it instead of defining its own.
- A unit test pins the label map to `REQUEST_TYPES` so adding a new request
  type without a label fails CI.

## Current State Analysis

### Relevant Code/Config

- `shared/types.ts` — exports `RequestType`, `REQUEST_TYPES`, `Requester`,
  `Song`. Single source of truth for cross-layer wire contracts.
- `netlify/functions/request.ts:84-87` — local `REQUEST_TYPE_LABEL` map
  with a comment noting the labels MUST match the Google Form option
  text exactly.
- `netlify/functions/request.ts:163-167` — only call site of the map.
- `netlify/functions/_validate.ts:2` — already imports `REQUEST_TYPES`
  from `shared/types`, confirming the import pattern.

### Related Context

- Issue #93 introduced the Song/Karaoke selector; issue #100 is the
  nice-to-have follow-up from that PR's review.
- `shared/` files are bundled transitively by esbuild into Netlify
  functions (documented in `CLAUDE.md`), so moving the constant is safe.

## Solution Design

### Approach

Move `REQUEST_TYPE_LABEL` into `shared/types.ts` as a typed constant and
import it from `netlify/functions/request.ts`. Keep the Google Form
compatibility comment with the map (it's the load-bearing invariant).

### Implementation

Add to `shared/types.ts`:

```ts
// Display labels sent to the Google Form. MUST match the multiple-choice
// option text on the Form exactly — Google Forms rejects submissions whose
// value does not match an existing option.
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  song: 'Song',
  karaoke: 'Karaoke'
};
```

Update `netlify/functions/request.ts`:

- Remove the local `REQUEST_TYPE_LABEL` definition (lines 82-87).
- Add `REQUEST_TYPE_LABELS` to the existing `shared/types` import.
- Reference `REQUEST_TYPE_LABELS[requester.requestType]` at line 167.

### Benefits

- Single source of truth for the lowercase ↔ display mapping.
- Future-proofs adding a third option (e.g. "Shoutout") — one file to edit.
- Trivially testable via a unit test pinned to `REQUEST_TYPES`.

## Implementation Plan

### Step 1: Export `REQUEST_TYPE_LABELS` from `shared/types.ts`

**File:** `shared/types.ts`

**Changes:**

- Add `REQUEST_TYPE_LABELS: Record<RequestType, string>` constant after
  `REQUEST_TYPES`, with the existing Google Form compatibility comment.

### Step 2: Consume `REQUEST_TYPE_LABELS` in `request.ts`

**File:** `netlify/functions/request.ts`

**Changes:**

- Update the `shared/types` import to include `REQUEST_TYPE_LABELS`.
- Delete the local `REQUEST_TYPE_LABEL` map.
- Replace the one call site (line 167) to use the shared constant.

### Step 3: Add unit test pinning labels to `REQUEST_TYPES`

**File:** `shared/__tests__/types.test.ts` (new) — or, if a shared tests
dir is not yet used, colocate under
`netlify/functions/__tests__/requestTypeLabels.test.ts`.

**Changes:**

- Assert every value in `REQUEST_TYPES` has a non-empty entry in
  `REQUEST_TYPE_LABELS`.
- Assert exact label values (`song → 'Song'`, `karaoke → 'Karaoke'`) to
  catch accidental label edits that would break the Google Form
  submission.

**Testing:**

```bash
npm run test:unit
```

### Step 4: Verify with existing test suite

**Testing:**

```bash
npm run test:unit   # request.ts tests still pass after refactor
npm run lint
npm run build
```

## Testing Strategy

### Unit Testing

- New test file pins `REQUEST_TYPE_LABELS` to `REQUEST_TYPES`:
  - Every request type has a label.
  - Label values exactly match the Google Form option text
    (`'Song'`, `'Karaoke'`).
- Existing `request.test.ts` continues to pass unchanged — the
  behaviour (form POST body) is identical.

### Regression Testing

- Submit a song request in local dev; confirm the Google Form accepts
  the `entry.<requestType>` value (manual smoke).
- `npm run test:e2e` — Playwright smoke still passes.

## Success Criteria

- [ ] `REQUEST_TYPE_LABELS` exported from `shared/types.ts`.
- [ ] `netlify/functions/request.ts` imports and uses it; local copy
      deleted.
- [ ] New unit test pins labels to `REQUEST_TYPES`.
- [ ] `npm run test:unit`, `npm run lint`, `npm run build` all pass.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `shared/types.ts` — add `REQUEST_TYPE_LABELS` export.
2. `netlify/functions/request.ts` — consume shared constant, remove
   local copy.
3. `netlify/functions/__tests__/requestTypeLabels.test.ts` (new) —
   unit test pinning labels to `REQUEST_TYPES`.

## Related Issues and Tasks

### Depends On

- None.

### Related

- #93 (origin of the code being refactored).

### Enables

- Adding future `RequestType` values (e.g. "Shoutout") without hunting
  for drift across files.

## References

- [GitHub Issue #100](https://github.com/denhamparry/djrequests/issues/100)
- `CLAUDE.md` — "Shared types" section explaining `shared/` bundling.

## Notes

### Key Insights

- The map lives in `request.ts` today because, in the original #93 PR,
  it was the only consumer. With the constant exported from
  `shared/types.ts`, the Google Form compatibility comment travels with
  the labels — keeping the "MUST match Form option text" invariant
  close to the values it constrains.

### Alternative Approaches Considered

1. **Helper function `toRequestTypeLabel(t: RequestType): string`** —
   more indirection for no extra safety beyond the typed record. ❌
2. **Inline the labels at the call site** — loses the type-safe
   exhaustiveness check. ❌
3. **Export the `Record` from `shared/types.ts`** — typed, exhaustive,
   testable, zero runtime cost. ✅

### Best Practices

- Constants whose valid keys are determined by another exported type
  belong in the same module as that type.
- When a constant is "load-bearing" (breaks external integration if
  edited), co-locate a test that pins its values.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-17
**Original Plan Date:** 2026-04-17

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Accurate code references: `REQUEST_TYPE_LABEL` at `request.ts:84`, call
  site at line 167, and `_validate.ts` already importing from
  `shared/types` are all verified correct.
- Correctly identifies that `shared/` files are bundled into Netlify
  functions by esbuild, so the move has no runtime impact.
- Scope is minimal and proportionate to a nice-to-have enhancement.
- The pinning unit test is exactly the right mitigation for the
  "Google Form option text drift" risk the original comment warned
  about.

### Gaps Identified

1. **Gap:** Plan's *primary* test location is
   `shared/__tests__/types.test.ts`, but `vite.config.ts` `test.include`
   does **not** match `shared/**`. A test placed there would silently
   never run.
   - **Impact:** High (false sense of coverage).
   - **Recommendation:** Use the fallback location the plan already
     offers — `netlify/functions/__tests__/requestTypeLabels.test.ts` —
     as the *only* location. Do not attempt the `shared/__tests__/`
     option without also updating `vite.config.ts` `include`, which
     expands scope unnecessarily.

### Edge Cases Not Covered

None material. The refactor is a pure move with no behavioural change;
existing `request.test.ts` coverage (which asserts the POST body)
already guards against accidental regressions.

### Alternative Approaches (Review)

1. **Expand `vite.config.ts` to include `shared/**/*.test.ts`** and
   colocate the test in `shared/__tests__/`.
   - **Pros:** Test sits next to the code it pins.
   - **Cons:** Widens scope; every future shared type test would need
     coverage tooling tweaks too. Overkill for this change.
   - **Verdict:** Defer. Use the existing `netlify/functions/__tests__/`
     location.

2. **Rename `REQUEST_TYPE_LABEL` → `REQUEST_TYPE_LABELS` (plural).**
   - **Pros:** Slightly more idiomatic for a `Record` with multiple
     entries.
   - **Cons:** Cosmetic; the original was singular.
   - **Verdict:** Plan chose plural — fine, no objection.

### Risks and Concerns

1. **Risk:** Test placed in a non-included directory gives false
   coverage.
   - **Likelihood:** Medium (plan lists it as the primary option).
   - **Impact:** High (broken pinning test goes unnoticed).
   - **Mitigation:** During implementation, confirm the new test file
     is picked up by running `npm run test:unit` and verifying the
     test name appears in the output.

### Required Changes

- [x] Treat `netlify/functions/__tests__/requestTypeLabels.test.ts` as
      the *only* test location for Step 3. Remove the
      `shared/__tests__/types.test.ts` option from the plan.

### Optional Improvements

- [ ] After implementation, verify via `npm run test:unit` output that
      the new test actually executes.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered and addressed (no security
      surface change)
- [x] Performance impact assessed (none)
- [x] Test strategy covers critical paths and edge cases
- [x] Documentation updates planned (none needed)
- [x] Related issues/dependencies identified
- [x] Breaking changes documented (none)
