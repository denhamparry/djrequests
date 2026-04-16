# GitHub Issue #38: tie BACKOFF_MS length to MAX_ATTEMPTS in search function

**Issue:** [#38](https://github.com/denhamparry/djrequests/issues/38)
**Status:** Complete
**Branch:** denhamparry.co.uk/feat/gh-issue-038
**Date:** 2026-04-16

## Context

`netlify/functions/search.ts` declares two parallel constants with an implicit
invariant:

```ts
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [250, 500];
```

The retry loop uses `BACKOFF_MS[attempt]` guarded by
`attempt < MAX_ATTEMPTS - 1`, so today the code is safe. Bumping
`MAX_ATTEMPTS` in isolation would silently pass `undefined` to `setTimeout`,
producing a zero-delay retry storm without any error. The issue asks us to
remove the drift risk.

## Approach

Make `MAX_ATTEMPTS` **derived** from `BACKOFF_MS.length + 1`. This is strictly
better than a runtime assertion because it makes the invariant unrepresentable
to violate — a future dev can only tune retries by editing the backoff array,
and the attempt count follows automatically.

```ts
const BACKOFF_MS = [250, 500] as const;
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
```

Reorder so `BACKOFF_MS` is declared first (since `MAX_ATTEMPTS` now depends on
it). Add `as const` to freeze the tuple so the semantic intent ("these are the
inter-attempt delays, in order") is enforced by the type system.

Keep the comment block that explains the 404/5xx retry rationale — it is
orthogonal to this change and still accurate.

## Files Modified

- `netlify/functions/search.ts` — reorder constants, derive `MAX_ATTEMPTS`

No test file changes needed: the existing "returns 503 with upstream_unavailable
code after retries are exhausted" test (search.test.ts:177) already pins
`MAX_ATTEMPTS === 3` by asserting `fetchMock` was called 3 times. Because
`MAX_ATTEMPTS` is now derived from `BACKOFF_MS.length`, that test transitively
validates the invariant.

## Tasks

1. Edit `netlify/functions/search.ts`: reorder + derive `MAX_ATTEMPTS`, add
   `as const` to `BACKOFF_MS`.
2. Verify existing unit tests still pass (`npm run test:unit`).
3. Run `npm run lint`.
4. Run pre-commit hooks.
5. Commit + open PR.

## Acceptance Criteria

- `MAX_ATTEMPTS` is no longer a free-standing literal; it is a function of
  `BACKOFF_MS.length`.
- `BACKOFF_MS` is immutable (`as const`).
- All existing tests pass unchanged.
- Lint passes.

## Out of Scope

- Changing the retry count or delay values.
- Introducing a retry-policy abstraction (`retry` library, etc.) — over-design
  for a 2-constant invariant.
- Restructuring the fetch loop.

## Risks

- **Very low.** Pure refactor; call count and runtime behaviour are identical.

## Review Summary

**Overall Assessment: Approved**

Critical review checks:

- **Scope**: matches issue #38 exactly — removes the implicit invariant, no
  scope creep.
- **Approach**: "derive" chosen over "assert" — structurally eliminates the
  bug rather than catching it at runtime. Correct trade-off.
- **Backwards compat**: `MAX_ATTEMPTS` evaluates to the same value (3), loop
  semantics unchanged. Existing tests pass without modification.
- **Type safety**: `as const` upgrade is a small quality win, not a
  behavioural change.
- **Test coverage**: existing retries-exhausted test pins the observable
  invariant; no additional test needed.

Required changes during implementation: none.
