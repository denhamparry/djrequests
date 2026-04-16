# GitHub Issue #53: enhancement: assert disabled request button in e2e before typing name

**Issue:** [#53](https://github.com/denhamparry/djrequests/issues/53)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The e2e smoke test (`tests/e2e/request.spec.ts`) fills the requester name input before clicking the request button, but never verifies that the request button is disabled _before_ the name is entered. The UI gate (`!hasName` on the request button in `src/App.tsx:172`) is only covered at the unit-test layer via `SearchView`.

### Current Behavior

- The e2e test fills `input[aria-label="Your name"]` with `'Avery'` _before_ performing the search and clicking the request button.
- There is no assertion on the disabled state of the request button prior to filling the name.

### Expected Behavior

- The e2e test asserts `expect(requestButton).toBeDisabled()` while the name input is empty but a search result is visible.
- After the name is filled, the test confirms the button becomes enabled (implicitly, by clicking it — already covered by the subsequent `click()`), then proceeds with the existing flow.

## Current State Analysis

### Relevant Code/Config

- `src/App.tsx:21` — `const hasName = trimmedName.length > 0;`
- `src/App.tsx:171-176` — request button `disabled` binding includes `!hasName` and shows a tooltip when name is empty.
- `tests/e2e/request.spec.ts:48` — name is filled _before_ the search, so the disabled state is never observable in the e2e run.

### Related Context

- Originating PR: #44 (collect requester name in UI).
- Sibling coverage: `src/__tests__/SearchView.test.tsx` already asserts the disabled state at the unit-test layer.
- Parallel enhancement: #52 (assert whitespace-trimmed name in UI tests) — already landed on `main`.

## Solution Design

### Approach

Reorder the e2e test so that the search is performed _before_ the name is filled. Between the search result becoming visible and the name being filled, assert the request button is disabled. Then fill the name and continue with the existing click + success-message assertion.

### Rationale

- Adds defense-in-depth: if someone removes the `!hasName` condition in `App.tsx`, the SearchView unit test would fail, but previously the e2e would still pass silently.
- Requires no production-code change — only the test is reordered and a single assertion is added.
- Keeps the test's existing network mocks and success assertion intact.

### Trade-offs

- Reordering filling the name to _after_ the search means the `debounce` wait (`waitForTimeout(400)`) sits between search typing and the disabled assertion. This is already present in the current test; we just need to ensure the disabled assertion runs once the result card is visible.

## Implementation Plan

### Step 1: Reorder e2e test to assert disabled request button before name is entered

**File:** `tests/e2e/request.spec.ts`

**Changes:**

1. Remove the early `page.fill('input[aria-label="Your name"]', 'Avery')` on line 48.
2. After the result card becomes visible (`await expect(resultCard).toBeVisible()`), grab the request button locator:

   ```ts
   const requestButton = page.getByRole('button', { name: 'Request "Digital Love"' });
   await expect(requestButton).toBeDisabled();
   ```

3. Then fill the name:

   ```ts
   await page.fill('input[aria-label="Your name"]', 'Avery');
   ```

4. Leave the existing `requestButton.click()` and the success-toast assertion in place.

**Testing:**

```bash
npm run test:e2e
```

## Testing Strategy

### Unit Testing

- No production-code changes, so existing unit tests remain unchanged and must still pass (`npm run test:unit`).

### Integration Testing

**Test Case 1: Disabled state is asserted before name is typed**

1. Run `npm run test:e2e`.
2. Expected: the reordered test passes; the `toBeDisabled()` assertion runs against a visible request button while the name input is empty.

**Test Case 2: Regression — happy path still passes**

1. The final click + success-message assertions must still succeed after the name is filled.

### Regression Testing

- Confirm `npm run lint` still passes.
- Confirm `npm run test:unit` coverage remains unchanged.

## Success Criteria

- [ ] `tests/e2e/request.spec.ts` asserts `toBeDisabled()` on the request button before the name is filled.
- [ ] Name is filled _after_ the disabled assertion.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run lint` passes.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `tests/e2e/request.spec.ts` — reorder steps, add `toBeDisabled()` assertion on request button before name is filled.
2. `docs/plan/issues/053_assert_disabled_request_button_e2e_before_typing_name.md` — this plan document.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #44 — original PR that introduced the requester name field.
- #52 — asserts whitespace-trimmed name in UI tests (already merged).

### Enables

- Stronger confidence that removing the `!hasName` disable gate would be caught at both unit and e2e layers.

## References

- [GitHub Issue #53](https://github.com/denhamparry/djrequests/issues/53)
- `src/App.tsx:172` — `!hasName` disable condition.
- `src/__tests__/SearchView.test.tsx` — sibling unit-test coverage.

## Notes

### Key Insights

- The current test works but has a gap: the UI gate is only enforced at one layer.
- The fix is test-only; no production code changes.

### Alternative Approaches Considered

1. **Add a separate dedicated e2e test for the disabled state** — rejected ❌ because it duplicates setup (route mocks, navigation, search) without meaningfully more coverage; extending the existing smoke test is sufficient.
2. **Chosen: reorder existing smoke test and add one assertion** ✅ — minimal change, covers the gate in both states (disabled → enabled) without duplicating setup.

### Best Practices

- Keep test-only changes scoped and avoid touching production code unless required.
- Prefer extending a single flow to asserting state transitions over adding parallel test fixtures.
