# GitHub Issue #49: refactor: brand ValidatedSong/ValidatedRequester to enforce validation at the type level

**Issue:** [#49](https://github.com/denhamparry/djrequests/issues/49)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

`ValidatedSong` and `ValidatedRequester` in `netlify/functions/_validate.ts`
are structurally identical to (or nearly identical to) `Song` and `Requester`
in `shared/types.ts`. TypeScript's structural typing means a caller could pass
a raw, unvalidated `Song` into any function that expects a `ValidatedSong`
without a compile error — the type system offers no real protection.

### Current Behavior

- `ValidatedSong` has the same shape as `Song`.
- Anyone can construct a `ValidatedSong` literal directly; `validateRequestBody`
  is not the only path.
- Type system does not enforce that validation actually ran.

### Expected Behavior

- `ValidatedSong` and `ValidatedRequester` carry a nominal brand.
- Only `validateRequestBody` can produce a branded value (via an internal cast).
- Calling code that expects branded input rejects raw `Song` at compile time.

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/_validate.ts` — defines `ValidatedSong`,
  `ValidatedRequester`, `ValidatedRequest`, `ValidationResult`, and
  `validateRequestBody`.
- `shared/types.ts` — defines `Song` (exact structural match with
  `ValidatedSong`) and `Requester` (optional `name`, `dedication`, `contact`
  typed as `string | undefined`, whereas `ValidatedRequester` has required
  `name: string` and `string | null` for the others).
- `netlify/functions/request.ts` — the sole caller of `validateRequestBody`;
  destructures `validation.value.song` / `.requester` and forwards the fields
  into URL-encoded Google Form params. No code needs to change here because
  the brand is transparent when consuming the value.
- `netlify/functions/__tests__/_validate.test.ts` — existing test suite asserts
  structural equality via `.toEqual({ ok: true, value: { song: {...}, ... } })`.
  The phantom `__brand` field is a type-only property (not present at runtime),
  so `toEqual` continues to pass without changes.

### Related Context

- Issue #47 (type-design review) surfaced this gap.
- `shared/types.ts` is the declared source of truth for cross-layer contracts
  (per `CLAUDE.md`), so `ValidatedSong` reusing `Song` keeps things aligned.
- `Requester` in `shared/types.ts` has `name?: string`; the validated form
  requires `name`, so `ValidatedRequester` must keep an explicit shape rather
  than wrapping `Requester` directly.

## Solution Design

### Approach

Introduce a tiny `Brand<T, B>` helper local to `_validate.ts` and apply it to
`ValidatedSong` and `ValidatedRequester`. Reuse `Song` from `shared/types.ts`
for `ValidatedSong`; keep an explicit object shape for `ValidatedRequester`
(required `name`, nullable `dedication`/`contact`) because shared `Requester`
uses optional properties.

`validateRequestBody` already builds the validated object from the trusted
locals; the only change is to assert the brand on the returned values. Because
the brand is a type-only phantom field, runtime behaviour is unchanged and
existing tests pass without modification.

### Implementation

```ts
// _validate.ts
import type { Song } from '../../shared/types';

type Brand<T, B extends string> = T & { readonly __brand: B };

export type ValidatedSong = Brand<Song, 'ValidatedSong'>;

export type ValidatedRequester = Brand<
  {
    name: string;
    dedication: string | null;
    contact: string | null;
  },
  'ValidatedRequester'
>;
```

Inside `validateRequestBody`, change the successful return to cast the
in-place-built objects:

```ts
return {
  ok: true,
  value: {
    song: { id, title, artist, album, artworkUrl, previewUrl } as ValidatedSong,
    requester: { name, dedication, contact } as ValidatedRequester
  }
};
```

The `as` casts are confined to the one validator — the only legitimate
producer of the brand.

### Benefits

- Callers cannot pass raw `Song` where `ValidatedSong` is expected.
- `validateRequestBody` is the compiler-enforced sole constructor.
- `ValidatedSong` now derives from `Song`, making the shared type the single
  source of truth and removing structural duplication.
- No runtime cost: brand is a phantom, compile-time-only property.

### Trade-offs

- Two `as` casts in the validator — acceptable and localised; the whole point
  of a brand is that only the validator may assert it.
- `ValidatedRequester` still defines its shape explicitly rather than reusing
  `Requester`, because the shared `Requester` has optional, non-nullable
  properties that differ from the validated form. Reconciling those is a
  separate concern out of scope for this issue.

## Implementation Plan

### Step 1: Brand the types and import shared `Song`

**File:** `netlify/functions/_validate.ts`

**Changes:**

- Add `import type { Song } from '../../shared/types';`
- Add local helper: `type Brand<T, B extends string> = T & { readonly __brand: B };`
- Redefine `ValidatedSong` as `Brand<Song, 'ValidatedSong'>`.
- Redefine `ValidatedRequester` as
  `Brand<{ name: string; dedication: string | null; contact: string | null }, 'ValidatedRequester'>`.
- In the `return { ok: true, value: ... }` block, cast the inline `song`
  object with `as ValidatedSong` and the inline `requester` object with
  `as ValidatedRequester`.

**Testing:**

```bash
cd /Users/lewis/git/denhamparry/djrequests/gh-issue-049
npm run test:unit -- netlify/functions/__tests__/_validate.test.ts
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
```

### Step 2: Verify downstream callers still compile

**File:** `netlify/functions/request.ts` (no edit expected)

**Rationale:**

`request.ts` destructures `song` and `requester` from `validation.value` and
reads their properties. Consuming a branded type is transparent (the brand is
structurally additive), so no change is required. Verify with `tsc --noEmit`.

**Testing:**

```bash
npx tsc --noEmit -p tsconfig.node.json
npm run test:unit
```

### Step 3: Add a compile-time negative check (optional, documentation-only)

**File:** `netlify/functions/__tests__/_validate.test.ts`

**Changes:**

Add a `// @ts-expect-error` stanza (inside a test that never executes the
assignment) documenting that a raw `Song` literal cannot be assigned to
`ValidatedSong`. This serves as a regression guard: if the brand is ever
removed, the `@ts-expect-error` fails the build.

Example:

```ts
it('brand prevents raw Song from satisfying ValidatedSong (type-level)', () => {
  // Exercises the compile-time contract only. If the brand is removed,
  // @ts-expect-error below becomes an unused-directive error.
  const _probe = (): void => {
    const raw = {
      id: '1',
      title: 't',
      artist: 'a',
      album: null,
      artworkUrl: null,
      previewUrl: null
    };
    // @ts-expect-error raw Song is not a ValidatedSong without validation
    const _v: import('../_validate').ValidatedSong = raw;
    void _v;
  };
  void _probe;
  expect(true).toBe(true);
});
```

**Testing:**

```bash
npm run test:unit -- netlify/functions/__tests__/_validate.test.ts
```

## Testing Strategy

### Unit Testing

- Existing `_validate.test.ts` suite must continue to pass unchanged. The
  `.toEqual(...)` assertions compare runtime-visible fields only, so the
  phantom brand does not affect equality.
- New compile-time negative test (Step 3) provides a regression guard for the
  brand itself.

### Integration Testing

**Test Case 1: `request.ts` still consumes validated output**

1. Run `npm run test:unit` (covers `request.test.ts`).
2. Expect all tests to pass without source changes to `request.ts`.

**Test Case 2: Full build**

1. `npm run build`
2. Expect zero TypeScript errors.

### Regression Testing

- Lint: `npm run lint`
- Full test suite: `npm run test:unit`
- E2E smoke (optional, as no runtime behaviour changes):
  `npm run test:e2e` — only if the environment is already set up.

## Success Criteria

- [ ] `ValidatedSong` is defined as `Brand<Song, 'ValidatedSong'>` importing
      from `shared/types.ts`.
- [ ] `ValidatedRequester` is defined as a branded explicit shape.
- [ ] `validateRequestBody` casts the inline objects to the branded types in
      its successful return.
- [ ] `npm run test:unit` passes without modification to existing tests.
- [ ] `npx tsc --noEmit` across all tsconfigs reports zero errors.
- [ ] `npm run lint` passes.
- [ ] Optional negative-assertion test (Step 3) added to document the contract.

## Files Modified

1. `netlify/functions/_validate.ts` — add `Brand` helper, import `Song`, brand
   `ValidatedSong`/`ValidatedRequester`, cast return values.
2. `netlify/functions/__tests__/_validate.test.ts` — add compile-time negative
   test (Step 3, optional but recommended).

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- PR #47 (type-design review that surfaced this).
- Issue #33 (shared song types) — established `shared/types.ts` as the single
  source of truth for `Song`.

### Enables

- Future tightening of downstream function signatures (e.g. helpers that
  require pre-validated input could declare `ValidatedSong`/`ValidatedRequester`
  parameters and the compiler would enforce it).

## References

- [GitHub Issue #49](https://github.com/denhamparry/djrequests/issues/49)
- `shared/types.ts` — source of truth for `Song`/`Requester`.
- `netlify/functions/_validate.ts` — current validator.
- [TypeScript branded types pattern](https://www.typescriptlang.org/docs/handbook/advanced-types.html#nominal-types-like-behaviors)

## Notes

### Key Insights

- The brand must be `readonly` so accidental structural construction via
  spread is harder (and intent is clear).
- Using `import type` keeps the brand purely a compile-time concern and
  avoids any cross-layer runtime coupling between `shared/` and the Netlify
  function bundle beyond what already exists.
- `shared/Requester` and `ValidatedRequester` differ in both required fields
  and nullability; reconciling them is deliberately out of scope.

### Alternative Approaches Considered

1. **Symbol-keyed brand (`[__brand]: never`)** — Slightly stronger (cannot be
   produced even by an unsafe literal), but ergonomics are worse and the
   payoff vs a string-literal brand is marginal. ❌
2. **Class-based `ValidatedRequest` with private field** — Adds runtime cost
   and awkward JSON serialisation; overkill for a pure wire type. ❌
3. **String-literal phantom brand (`__brand: 'ValidatedSong'`)** — Matches the
   approach in the issue body, minimal ergonomic friction, zero runtime cost.
   ✅

### Best Practices

- Keep the `as` cast confined to the validator — the only place that has
  actually done the work the brand represents.
- Never export the `Brand` helper from `_validate.ts`; keeping it local
  prevents other modules from minting branded values.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Plan faithfully implements the exact pattern requested in the issue body
  (`type ValidatedSong = Song & { readonly __brand: 'ValidatedSong' }`).
- Correctly identifies that `shared/Requester` cannot be reused directly for
  `ValidatedRequester` because required/optional fields and nullability
  differ — keeps an explicit shape rather than forcing alignment.
- Recognises the brand is a compile-time phantom, so the `toEqual` tests in
  `_validate.test.ts` keep working unchanged. No churn to the existing suite.
- Import path `../../shared/types` is verified to work — `search.ts` already
  uses `import type { Song } from '../../shared/types'`, so the same pattern
  is proven under the `tsconfig.node.json` include set.
- The `as` casts are correctly scoped to the single validator, preserving the
  invariant that only `validateRequestBody` can mint branded values.
- Optional Step 3 negative test (`@ts-expect-error`) is an excellent
  regression guard that costs almost nothing.

### Gaps Identified

1. **None blocking.** The plan is complete for the scope described in #49.

### Edge Cases Not Covered

1. **Downstream function signatures that do not yet require the brand.**
   - **Current Plan:** Introduces the brand but does not update any callers
     to declare `ValidatedSong`/`ValidatedRequester` parameters.
   - **Recommendation:** Deliberately out of scope for #49 — the brand exists
     so future refactors _can_ use it. Noted in "Enables". No action needed.

### Alternative Approaches Evaluated

1. **Symbol-keyed brand** — rejected in plan; agree (ergonomic cost > marginal
   safety gain for a wire payload).
2. **Class with private field** — rejected in plan; agree (runtime + JSON
   serialisation overhead unacceptable).
3. **Plan's chosen string-literal phantom brand** — matches the issue body,
   zero runtime cost, maximum ergonomics. ✅

### Risks and Concerns

1. **`as` cast hides a real shape mismatch if `Song` evolves.**
   - **Likelihood:** Low
   - **Impact:** Low (TS still checks the cast is between assignable-related
     types; a new required field on `Song` would surface elsewhere).
   - **Mitigation:** If a new required field is added to `Song` in future,
     `validateRequestBody`'s constructed literal would no longer satisfy
     `Song`, so the `as ValidatedSong` cast would fail to compile — this is
     the desired behaviour. No mitigation required.
2. **`shared/types.ts` lives outside `tsconfig.node.json`'s `include`.**
   - **Likelihood:** Low (already proven in `search.ts`).
   - **Impact:** None — TS follows imports into out-of-include files; the
     root file set just controls the program roots.
   - **Mitigation:** None needed.

### Required Changes

None. The plan is ready for implementation as written.

### Optional Improvements

- [ ] **Keep Step 3 (negative-assertion test).** Not strictly required for
      closing the issue, but it turns the type-level contract into a
      compile-time regression test — cheap insurance.
- [ ] Consider a one-line JSDoc on `Brand<T,B>` explaining the phantom field
      is compile-time only, to help future maintainers.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue (structural
      typing lets raw `Song` satisfy `ValidatedSong`).
- [x] All acceptance criteria from issue are covered (brand applied to both
      types; `validateRequestBody` sole constructor).
- [x] Implementation steps are specific and actionable (exact code snippets
      provided).
- [x] File paths and code references are accurate (`_validate.ts`,
      `request.ts`, import path verified against `search.ts`).
- [x] Security implications considered — none (type-level only).
- [x] Performance impact assessed — zero runtime cost (phantom field).
- [x] Test strategy covers critical paths (existing suite + optional
      compile-time negative test).
- [x] Documentation updates planned — the plan itself is the documentation;
      no README change needed for a private, internal type refactor.
- [x] Related issues/dependencies identified (#33, #47).
- [x] Breaking changes documented — none; the brand is additive at the type
      level and invisible at runtime.
