# GitHub Issue #30: Fix likely-incorrect Google Doc ID in Apps Script and move to PropertiesService

**Issue:** [#30](https://github.com/denhamparry/djrequests/issues/30)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

`apps-script/index.ts:42-43` hardcodes a `GOOGLE_DOC_ID` constant whose value
starts with `1FAIpQLSe` — the standard prefix for Google **Form** IDs, not Doc
IDs. `DocumentApp.openById()` expects a Doc ID copied from the Doc URL
(`/d/{ID}/edit`). If this value is in fact a Form ID, the form-submit trigger
will fail at runtime and no queue entries will land in the DJ's Doc.

### Current Behavior

- `onFormSubmit` calls `DocumentApp.openById(GOOGLE_DOC_ID)` with a value that
  appears to be a Form ID (`1FAIpQLSe...`).
- If it is indeed a Form ID, `openById` throws at runtime; failures only show
  up in the Apps Script Executions log — the submitter gets no signal.
- Rotating the target Doc requires editing source and re-deploying.

### Expected Behavior

- `GOOGLE_DOC_ID` is read from Apps Script Script Properties at runtime via
  `PropertiesService.getScriptProperties().getProperty('GOOGLE_DOC_ID')`.
- If the property is unset, `onFormSubmit` throws a clear, descriptive error so
  the Executions log immediately surfaces the cause.
- Rotating Docs is a Script Properties edit — no code change or redeploy.
- Docs (`CLAUDE.md` Configuration Steps + Known Issues) explain the Script
  Property workflow.

## Current State Analysis

### Relevant Code/Config

- `apps-script/index.ts:42-43` — hardcoded constant.
- `apps-script/index.ts:49-65` — `onFormSubmit` reads `GOOGLE_DOC_ID` directly.
- `apps-script/__tests__/format.test.ts` — tests only `format.ts` (pure logic);
  no tests cover `index.ts`.
- `CLAUDE.md` → Google Workspace Integration → Configuration Steps (step 5) —
  tells users to "Update `GOOGLE_DOC_ID` constant".
- `CLAUDE.md` → Known Issues → Apps Script Deployment — lists
  "Doc ID is hardcoded" as a gotcha.

### Related Context

- Apps Script `PropertiesService.getScriptProperties()` is the canonical way to
  configure per-deployment values. It's available in all Apps Script runtimes
  and doesn't require OAuth scope additions.
- No local unit tests exercise `onFormSubmit` today — `format.ts` holds the
  testable logic, and `index.ts` is the Apps Script boundary.

## Solution Design

### Approach

1. Introduce a small accessor `getGoogleDocId()` that reads the Script
   Property and throws a descriptive error when unset.
2. Delete the hardcoded constant.
3. Call the accessor inside `onFormSubmit` so the trigger fails fast with a
   readable message.
4. Declare the `PropertiesService` global in the Apps Script type-shim block
   (same pattern used for `DocumentApp`).
5. Update `CLAUDE.md` — both "Configuration Steps" and "Known Issues" —  to
   describe the Script Property.
6. Add a unit test that stubs `PropertiesService` to cover the happy path and
   the "property unset" error path.

### Trade-offs

- **Keep the accessor tiny and local.** Don't add a generic config module — YAGNI;
  one property is the only config today.
- **Throw, don't default.** A silent fallback hides misconfiguration; an
  explicit error in Executions is the fastest way to diagnose a broken queue.
- **Keep `format.ts` untouched.** The bug is entirely at the Apps Script
  boundary.

### Benefits

- Correct runtime behavior once the right Doc ID is set.
- Rotating the queue Doc becomes a Script Properties edit, not a code change.
- Misconfiguration surfaces clearly in the Executions log.

## Implementation Plan

### Step 1: Add `PropertiesService` type shim and accessor

**File:** `apps-script/index.ts`

**Changes:**

- Add a minimal `PropertiesService` declaration alongside the existing
  `DocumentApp` shim.
- Add an exported `getGoogleDocId()` that reads the
  `GOOGLE_DOC_ID` script property and throws when missing.
- Remove the `GOOGLE_DOC_ID` hardcoded constant.
- Call `getGoogleDocId()` from `onFormSubmit`.

**Sketch:**

```ts
type ScriptProperties = {
  getProperty(key: string): string | null;
};

declare const PropertiesService: {
  getScriptProperties(): ScriptProperties;
};

export function getGoogleDocId(): string {
  const id = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_DOC_ID",
  );
  if (!id) {
    throw new Error(
      "Script Property 'GOOGLE_DOC_ID' is not set. Set it via Apps Script " +
        "Project Settings → Script Properties, using the ID from the target " +
        "Doc URL (/d/{ID}/edit).",
    );
  }
  return id;
}
```

`onFormSubmit` becomes:

```ts
const body = DocumentApp.openById(getGoogleDocId()).getBody();
```

### Step 2: Add unit tests for `getGoogleDocId`

**File:** `apps-script/__tests__/index.test.ts` (new)

**Changes:**

- Stub `globalThis.PropertiesService` with a small fake.
- Cover:
  1. Returns the configured value when the property is set.
  2. Throws an `Error` whose message mentions `GOOGLE_DOC_ID` when unset.

**Testing:**

```bash
npm run test:unit -- apps-script/__tests__/index.test.ts
```

### Step 3: Update `CLAUDE.md` docs

**File:** `CLAUDE.md`

**Changes:**

- In Google Workspace Integration → Configuration Steps, replace the bullet
  "Update `GOOGLE_DOC_ID` constant" with:
  > Open Project Settings → Script Properties and add
  > `GOOGLE_DOC_ID` = your Doc ID (from the Doc URL `/d/{ID}/edit`).
- In Known Issues → Apps Script Deployment, replace "Doc ID is hardcoded" with
  a note pointing at the Script Property (and that a missing/incorrect value
  surfaces as a clear error in Executions).

### Step 4: Verify

**Testing:**

```bash
npm run test:unit
npm run lint
```

Optional manual test (requires redeploy + trigger): submit a form, confirm an
entry appears in the configured Doc. Verify unset property yields the expected
error in Executions.

## Testing Strategy

### Unit Testing

- New `apps-script/__tests__/index.test.ts`:
  - Set `globalThis.PropertiesService` with a fake `getScriptProperties`.
  - Happy path: property set → `getGoogleDocId()` returns the value.
  - Error path: property missing → throws with `GOOGLE_DOC_ID` in the message.
- `format.ts` tests remain untouched (no behavior change).

### Integration Testing

**Test Case 1 — Property set:**

1. In Apps Script, set Script Property `GOOGLE_DOC_ID` to the real Doc ID.
2. Submit the form.
3. Expect a new entry at the end of the configured Doc.

**Test Case 2 — Property missing:**

1. Remove the Script Property (or rename it).
2. Submit the form.
3. Expect the trigger to fail and the Executions log to contain the
   `GOOGLE_DOC_ID` error message.

### Regression Testing

- `format.ts` unit tests still pass unchanged.
- `onFormSubmit` still reads the same `namedValues` and produces the same Doc
  entry shape — only the source of the Doc ID changed.

## Success Criteria

- [ ] `GOOGLE_DOC_ID` constant removed from `apps-script/index.ts`.
- [ ] `getGoogleDocId()` reads from Script Properties and throws on missing.
- [ ] `onFormSubmit` uses the accessor.
- [ ] New unit tests cover both code paths.
- [ ] `CLAUDE.md` Configuration Steps + Known Issues updated.
- [ ] `npm run test:unit` and `npm run lint` pass.

## Files Modified

1. `apps-script/index.ts` — remove constant, add type shim, add accessor,
   call it from `onFormSubmit`.
2. `apps-script/__tests__/index.test.ts` — new test file.
3. `CLAUDE.md` — document Script Property in Configuration Steps and Known
   Issues.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- Nothing explicit — but any real DJ event use of the app is effectively
  blocked until the Doc ID is correct.

### Related

- Apps Script trigger setup described in `CLAUDE.md` → Configuration Steps.

## References

- [GitHub Issue #30](https://github.com/denhamparry/djrequests/issues/30)
- Apps Script `PropertiesService` docs (Google developer documentation).

## Notes

### Key Insights

- `1FAIpQLSe` is a Forms ID prefix; Doc IDs don't share it. That alone is
  strong evidence the current constant is wrong.
- The bug is silent to the submitter — failures only appear in Executions.
  Throwing a descriptive error at least keeps the failure loud to the owner.

### Alternative Approaches Considered

1. **Keep a hardcoded constant, just fix the value** — ❌ Doesn't solve the
   rotation-requires-redeploy problem and perpetuates the "secret in source"
   pattern.
2. **Introduce a general config module** — ❌ YAGNI; one property today.
3. **Use a `.env`-style file synced to Apps Script** — ❌ Apps Script has no
   native `.env`; Script Properties is the idiomatic fit.
4. **Chosen: Script Property + accessor with explicit error** — ✅ Idiomatic
   Apps Script, minimal surface area, fails loudly on misconfig.

### Best Practices

- Keep Apps Script entry points thin; put testable logic in pure modules
  (already the pattern with `format.ts`).
- Prefer explicit errors over silent fallbacks for required configuration.
