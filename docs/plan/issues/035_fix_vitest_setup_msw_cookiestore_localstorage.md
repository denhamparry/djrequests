# GitHub Issue #35: vitest setup crashes in jsdom — MSW CookieStore calls localStorage.getItem

**Issue:** [#35](https://github.com/denhamparry/djrequests/issues/35)
**Status:** Complete
**Date:** 2026-04-16

## Problem Statement

Every `vitest` run fails during setup. The global setup file
(`vitest.setup.ts`) unconditionally imports `src/test/msw-server.ts`, which
calls `setupServer()` from `msw/node`. Even though this is the Node server,
MSW instantiates a `CookieStore` that reads from the ambient `localStorage`.
Under recent jsdom versions `localStorage.getItem` is not callable in that
codepath, so the setup file throws and every test file — including pure-logic
tests in `apps-script/` and `netlify/functions/` that have no MSW or DOM
dependency — is reported as "0 tests, failed".

### Current Behavior

- `npx vitest run apps-script/__tests__/format.test.ts` fails with
  `TypeError: localStorage.getItem is not a function` inside
  `node_modules/msw/src/core/utils/cookieStore.ts`.
- `npm run test:unit` never runs any tests — the whole suite reports as
  failed during setup.
- Surfaced during work on #30 (PR #34); verification had to fall back to
  `lint` + `tsc`.

### Expected Behavior

- All five test files run cleanly under `npm run test:unit`.
- MSW is initialized only for tests that actually need it (currently just
  `src/__tests__/SearchView.test.tsx`).
- Pure Node tests (apps-script, netlify functions) do not touch jsdom or MSW.

## Current State Analysis

### Relevant Code/Config

- **`vite.config.ts`** — `test.environment: 'jsdom'`,
  `test.setupFiles: ['./vitest.setup.ts']` (applied to every test file).
- **`vitest.setup.ts`** — imports `server` from `src/test/msw-server` and
  wires `beforeAll`/`afterEach`/`afterAll` lifecycle for MSW.
- **`src/test/msw-server.ts`** — calls `setupServer()` at module load time.
  The import alone triggers the CookieStore crash.

### Test file inventory

Only one file actually uses MSW:

| File                                             | Needs MSW | Needs DOM |
| ------------------------------------------------ | --------- | --------- |
| `src/__tests__/SearchView.test.tsx`              | yes       | yes       |
| `apps-script/__tests__/format.test.ts`           | no        | no        |
| `apps-script/__tests__/index.test.ts`            | no        | no        |
| `netlify/functions/__tests__/request.test.ts`    | no        | no        |
| `netlify/functions/__tests__/search.test.ts`     | no        | no        |

### Related Context

- `msw@^2.3.1`, `jsdom@^24.1.0`, `vitest@^3.2.4`.
- PR #34 is where this was first observed.
- `@testing-library/jest-dom/vitest` is also loaded from `vitest.setup.ts`
  and is only useful for the React test.

## Solution Design

### Approach

Scope MSW and the DOM environment to the single test file that needs them
(option 1 + option 2 from the issue).

1. Remove the global `vitest.setup.ts` so MSW/CookieStore no longer loads
   for every test.
2. Move the MSW lifecycle into `src/__tests__/SearchView.test.tsx`
   directly — it's the only consumer.
3. Keep `environment: 'jsdom'` as the Vitest default (the React test still
   needs a DOM) but opt the Node-only tests out with a
   `// @vitest-environment node` file directive. This keeps them honest
   (they should never have relied on jsdom) and skips the jsdom overhead.

Option 3 from the issue (bumping MSW/jsdom) is worth doing as a follow-up
but is not required to fix the crash. A follow-up enhancement issue can
track it.

### Trade-offs

- **Chosen:** small, localized change; zero dependency churn; the MSW
  lifecycle lives next to the test that uses it.
- **Rejected — shared helper module for MSW lifecycle:** overkill for one
  consumer; reintroduce only if a second MSW-using test appears.
- **Rejected — keep global setup but guard the import:** fragile; the real
  issue is that Node-only tests were paying the jsdom tax for no reason.

### Benefits

- `apps-script/__tests__/*` and `netlify/functions/__tests__/*` run in a
  real Node environment — faster and more representative of where that
  code actually executes.
- No global side-effects in `vitest.setup.ts` to debug when adding new
  tests.
- Fixes the immediate crash without an MSW/jsdom version bump.

## Implementation Plan

### Step 1: Inline the MSW lifecycle into the React test

**File:** `src/__tests__/SearchView.test.tsx`

**Changes:**

- Add `beforeAll`/`afterEach`/`afterAll` imports from `vitest`.
- Call `server.listen({ onUnhandledRequest: 'warn' })`,
  `server.resetHandlers()`, `server.close()` directly in this file.
- Add a top-of-file import of `@testing-library/jest-dom/vitest` so the
  jest-dom matchers remain available here.

### Step 2: Delete the global setup file and unwire it

**Files:** `vitest.setup.ts`, `vite.config.ts`

**Changes:**

- Delete `vitest.setup.ts`.
- Remove the `setupFiles: ['./vitest.setup.ts']` line from
  `vite.config.ts`.

### Step 3: Opt Node-only tests out of jsdom

**Files:**

- `apps-script/__tests__/format.test.ts`
- `apps-script/__tests__/index.test.ts`
- `netlify/functions/__tests__/request.test.ts`
- `netlify/functions/__tests__/search.test.ts`

**Changes:**

Add the following as the very first line of each file:

```ts
// @vitest-environment node
```

### Step 4: Verify

```bash
npx vitest run apps-script/__tests__/format.test.ts
npx vitest run apps-script/__tests__/index.test.ts
npx vitest run netlify/functions/__tests__/search.test.ts
npx vitest run netlify/functions/__tests__/request.test.ts
npx vitest run src/__tests__/SearchView.test.tsx
npm run test:unit
```

## Testing Strategy

### Unit Testing

All five existing test files must pass. No new tests are introduced — the
change is infrastructural. Coverage numbers should be equal or better
(previously they were zero because nothing ran).

### Integration Testing

**Test Case 1: Pure Node test runs in isolation**

1. `npx vitest run apps-script/__tests__/format.test.ts`
2. Expected: passes, no CookieStore / localStorage errors.

**Test Case 2: MSW-using test still works**

1. `npx vitest run src/__tests__/SearchView.test.tsx`
2. Expected: the debounced-search and modal assertions still pass; MSW
   intercepts the `/search` and `/request` calls.

**Test Case 3: Full suite**

1. `npm run test:unit`
2. Expected: all five files run; coverage report generated in `coverage/`.

### Regression Testing

- E2E tests (`npm run test:e2e`) are unaffected — they use Playwright and a
  live dev server, not Vitest.
- `npm run lint` and `npm run build` still pass.

## Success Criteria

- [x] `npx vitest run apps-script/__tests__/format.test.ts` passes
- [x] `npx vitest run apps-script/__tests__/index.test.ts` passes
- [x] `npx vitest run netlify/functions/__tests__/search.test.ts` passes
- [x] `npx vitest run netlify/functions/__tests__/request.test.ts` passes
- [x] `npx vitest run src/__tests__/SearchView.test.tsx` passes
- [x] `npm run test:unit` runs the full suite without setup-file crashes
- [x] `vitest.setup.ts` is removed from the repo
- [x] `setupFiles` entry is removed from `vite.config.ts`

## Files Modified

1. `vite.config.ts` — remove `setupFiles` entry
2. `vitest.setup.ts` — **deleted**
3. `src/__tests__/SearchView.test.tsx` — inline MSW lifecycle + jest-dom
   import
4. `apps-script/__tests__/format.test.ts` — add `@vitest-environment node`
5. `apps-script/__tests__/index.test.ts` — add `@vitest-environment node`
6. `netlify/functions/__tests__/request.test.ts` — add
   `@vitest-environment node`
7. `netlify/functions/__tests__/search.test.ts` — add
   `@vitest-environment node`
8. `package.json` / `package-lock.json` — bump `msw` from `^2.3.1` to
   latest and `jsdom` from `^24.1.0` to latest (needed during
   implementation: even after scoping, the React test still hit the
   CookieStore/localStorage crash under jsdom. Option 3 from the issue
   turned out to be required, not optional.)

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- Future work that needs a working local test suite (any PR that touches
  code under test).

### Related

- PR #34 (#30) — where the crash was first observed and documented.

### Enables

- Follow-up enhancement: bump `msw` / `jsdom` to a version pair that does
  not hit the CookieStore/localStorage regression (option 3 from the
  issue).

## References

- [GitHub Issue #35](https://github.com/denhamparry/djrequests/issues/35)
- MSW CookieStore source: `node_modules/msw/src/core/utils/cookieStore.ts`
- Vitest per-file environment directive:
  <https://vitest.dev/guide/environment.html#environments-for-specific-files>

## Notes

### Key Insights

- Only one test file in the repo actually needs MSW, so the global setup
  was paying a high tax for a single consumer.
- The Node-only tests (apps-script, netlify functions) being pinned to
  jsdom was already a latent smell — the fix makes them run in the same
  environment they ship to.

### Alternative Approaches Considered

1. **Bump MSW / jsdom to a compatible pair** — may fix the symptom but
   doesn't address the underlying mis-scoping; deferred as a follow-up. ❌
2. **Guard the MSW import with a conditional** — still leaves Node tests
   spinning up jsdom for no reason. ❌
3. **Scope MSW + opt Node tests into the node environment (chosen)** —
   smallest change, addresses both the crash and the underlying mis-scope.
   ✅

### Best Practices

- Keep Vitest `setupFiles` empty (or near-empty) unless a side-effect
  genuinely applies to every test.
- Prefer `// @vitest-environment ...` directives per test file to make
  environment expectations explicit and local.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Correctly identifies the root cause: MSW's `CookieStore` initialization
  during `setupServer()` touches `localStorage`, and the global
  `setupFiles` pays that cost for every test file regardless of need.
- Test-file inventory is verified — `SearchView.test.tsx` is in fact the
  only consumer of `src/test/msw-server.ts`. Grep confirmed (only
  `vitest.setup.ts` and `SearchView.test.tsx` import it).
- Plan preserves the jest-dom matcher import (`toBeInTheDocument` is used
  on lines 37, 39, 40, 62, 84, 127 of `SearchView.test.tsx`) by moving it
  into that file.
- The `// @vitest-environment node` directive is a real, documented Vitest
  feature — no API misuse.
- Minimal change surface (7 files), no dependency churn, follow-up for the
  version bump is captured as a separate enhancement.

### Gaps Identified

None material. The plan correctly captures the MSW lifecycle
(`listen`/`resetHandlers`/`close`) that the current `vitest.setup.ts`
provides; omitting any of those would regress the existing test isolation
between the four `it()` blocks.

### Edge Cases Not Covered

1. **Edge Case:** Future tests under `src/**/*.test.tsx` that also need MSW
   - **Current Plan:** Inlines MSW into the single current consumer.
   - **Recommendation (optional):** Note in the plan that if a second
     MSW-using test is added, extracting a small helper (e.g.
     `src/test/msw-lifecycle.ts` exporting a function that wires the
     hooks) is preferred over reviving a global setup file. Not a blocker.

### Alternatives Evaluated During Review

1. **Alternative: Keep global setup, switch environment to `node` by
   default, opt the React test into `jsdom`.**
   - **Pros:** Only one file would need a per-file environment directive.
   - **Cons:** Still runs MSW setup for the Node tests, which is the
     actual source of the crash — doesn't fix the root cause.
   - **Verdict:** Chosen approach is better.

2. **Alternative: Bump `msw` and `jsdom` to compatible versions.**
   - **Pros:** No test file changes.
   - **Cons:** Doesn't address the mis-scoping; the Node tests still pay
     the jsdom tax; version pair may regress other behaviour.
   - **Verdict:** Defer as a follow-up enhancement (plan already notes
     this).

### Risks and Concerns

1. **Risk:** If `src/__tests__/SearchView.test.tsx` forgets to call
   `server.resetHandlers()` between tests, earlier handlers may bleed
   into later tests.
   - **Likelihood:** Low (plan explicitly includes the `afterEach`).
   - **Impact:** Medium (flaky tests).
   - **Mitigation:** Plan already includes all three lifecycle hooks.

2. **Risk:** Removing `setupFiles` removes the global jest-dom import; if
   any other `*.test.tsx` file under `src/` starts using jest-dom
   matchers, it will silently lack types/runtime.
   - **Likelihood:** Low (only one React test exists).
   - **Impact:** Low (TypeScript error surfaces immediately).
   - **Mitigation:** Acceptable — the explicit import per React test file
     is a common pattern.

### Required Changes

None.

### Optional Improvements

- [ ] Add a one-line comment in `vite.config.ts` (or a short note in
      `CLAUDE.md` testing section) explaining why `setupFiles` is
      intentionally empty, to prevent a future contributor from
      reintroducing a global MSW setup.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered (none — test-only infra)
- [x] Performance impact assessed (Node-env tests now faster; no regression)
- [x] Test strategy covers critical paths (all five existing tests must
      still pass)
- [x] Documentation updates planned (optional CLAUDE.md note)
- [x] Related issues/dependencies identified (PR #34, #30)
- [x] Breaking changes documented (none for users; contributor-facing
      change to `setupFiles`)
