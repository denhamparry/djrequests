# GitHub Issue #77: test(client): parametrise non-string requestId type-guard over null/array/object

**Issue:** [#77](https://github.com/denhamparry/djrequests/issues/77)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The defensive type-guard in `src/lib/googleForm.ts` uses
`typeof payload?.requestId === 'string'` to coerce any non-string `requestId`
returned from the Netlify function to `undefined`. The existing test
(`src/lib/__tests__/googleForm.test.ts:78`) only exercises the numeric
(`123`) case, leaving the invariant "every non-string value resolves to
`undefined`" under-specified.

### Current Behavior

- `googleForm.test.ts` has a single `it('treats non-string requestId as undefined...')` case covering `requestId: 123`.
- Other shapes JSON can produce (`null`, arrays, plain objects) are not tested.
- A future refactor (e.g. replacing the `typeof` guard with `!== null` or duck-typing on `.toString`) could silently pass `[]` or `{}` through as the `requestId`, and tests would not catch the regression.

### Expected Behavior

- A parametrised `it.each` sweep covers `requestId: null`, `requestId: []`, `requestId: {}` alongside the existing `123` case.
- Each parameterised input produces a thrown `RequestError` whose `.requestId` is `undefined`.
- The name of the original single-value test is either replaced or kept alongside the parametrised version without duplicating the numeric assertion.

## Current State Analysis

### Relevant Code/Config

- `src/lib/googleForm.ts:37-39` — the guard:

  ```ts
  const requestId =
    typeof payload?.requestId === 'string' ? payload.requestId : undefined;
  throw new RequestError(errorMessage, requestId);
  ```

- `src/lib/__tests__/googleForm.test.ts:78-92` — the single-value test to replace.

### Related Context

- Enhancement surfaced in PR for #71; this repo uses Vitest (`it.each` is supported natively).
- Other tests in the file already use the `fetchMock.mockResolvedValueOnce(...)` + `try { await submitSongRequest } catch { ... }` pattern; the parametrisation should reuse that shape verbatim.

## Solution Design

### Approach

Replace the existing single-case `it('treats non-string requestId as undefined ...')` block with a parametrised `it.each` that enumerates `123`, `null`, `[]`, `{}` and asserts the same invariant: `RequestError.requestId === undefined`.

**Rationale:**

- Preserves the existing case (`123`) — no coverage regression.
- Locks the invariant for every JSON-producible non-string shape.
- `it.each` is idiomatic in this codebase's test style and doesn't require new imports.

### Trade-offs Considered

1. **Add new cases as separate `it(...)` blocks** — verbose, duplicates setup. ❌
2. **Use `it.each` with inline array of values** — concise, one test per value with clear naming. ✅
3. **Use a property-based library (fast-check)** — overkill for four discrete values. ❌

### Implementation

Replace lines 78-92 of `src/lib/__tests__/googleForm.test.ts` with:

```ts
it.each([
  { label: 'number', value: 123 },
  { label: 'null', value: null },
  { label: 'array', value: [] },
  { label: 'object', value: {} }
])(
  'treats non-string requestId ($label) as undefined (defensive type guard)',
  async ({ value }) => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Oops.', requestId: value })
    });

    try {
      await submitSongRequest(song, requester);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequestError);
      expect((err as RequestError).requestId).toBeUndefined();
    }
  }
);
```

### Benefits

- Pins the type-guard invariant against future refactors.
- No production code changes required — test-only enhancement.
- Zero new dependencies.

## Implementation Plan

### Step 1: Parametrise the non-string requestId test

**File:** `src/lib/__tests__/googleForm.test.ts`

**Changes:**

- Replace the single `it('treats non-string requestId as undefined ...')` block (lines 78-92) with an `it.each([...])` block covering `number`, `null`, `array`, `object`.
- Use `$label` interpolation in the test name so each case is individually identifiable in test output.

**Testing:**

```bash
npm run test:unit -- src/lib/__tests__/googleForm.test.ts
```

Expected: 4 parametrised test cases pass, all other `googleForm.test.ts` tests still pass.

### Step 2: Run full test + lint suite

```bash
npm run test:unit
npm run lint
```

## Testing Strategy

### Unit Testing

- 4 parametrised cases under the `submitSongRequest` describe block, each asserting `RequestError.requestId === undefined`.
- Each case exercises the same `fetchMock` → `submitSongRequest` → `catch` flow with a different non-string `requestId` value.

### Regression Testing

- The existing numeric (`123`) case is preserved as one of the four parameters — no coverage regression.
- Other tests in `googleForm.test.ts` (requestId present, requestId absent, success path) are untouched.

## Success Criteria

- [ ] `it.each` block added to `src/lib/__tests__/googleForm.test.ts` covering `123`, `null`, `[]`, `{}`.
- [ ] Original single-case test removed (no duplicate numeric assertion).
- [ ] `npm run test:unit` passes with all 4 new parametrised cases.
- [ ] `npm run lint` passes.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `src/lib/__tests__/googleForm.test.ts` — replace single non-string requestId test with `it.each` covering four non-string shapes.

## Related Issues and Tasks

### Related

- #71 — Original issue from which this enhancement was surfaced during code review.

## References

- [GitHub Issue #77](https://github.com/denhamparry/djrequests/issues/77)
- Vitest `it.each` docs: <https://vitest.dev/api/#test-each>

## Notes

### Key Insights

- The guard under test is `typeof x === 'string'`, which uniformly rejects every non-string JS value. The parametrised sweep documents that intent.
- JSON can only yield `string | number | boolean | null | array | object` for this field; covering `number`, `null`, `array`, `object` plus the implicit `undefined` (when the field is absent, already tested separately) exhausts the realistic input space. `boolean` is omitted as redundant — it's structurally equivalent to `number` under the `typeof` guard.

### Alternative Approaches Considered

1. **Add three separate `it(...)` blocks** — rejected; `it.each` is more maintainable. ❌
2. **Include `boolean` as a fifth case** — rejected; adds noise without new information under this guard. ❌
3. **Parametrised approach with `it.each`** — chosen. ✅
