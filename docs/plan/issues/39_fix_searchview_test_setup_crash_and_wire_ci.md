# GitHub Issue #39: fix SearchView.test.tsx setup crash blocking UI integration tests

**Issue:** [#39](https://github.com/denhamparry/djrequests/issues/39)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

Issue #39 reports that `src/__tests__/SearchView.test.tsx` crashes at setup with
`TypeError: localStorage.getItem is not a function` originating from
`msw/src/core/utils/cookieStore.ts`, despite the partial fix in commit
`ef09120` (which bumped msw → ^2.13.4 and jsdom → ^29.0.2). The reporter claims
all UI integration tests are blocked from executing in CI.

### Current Behavior

- Reporter: `npm run test:unit` crashes at setup, zero tests run.
- Verified in this branch after a clean `npm install`: **all 22 tests pass**
  (5 in `SearchView.test.tsx`, 17 across apps-script / netlify functions).
- A non-fatal Node.js warning appears during the jsdom run:
  `Warning: --localstorage-file was provided without a valid path`.
- `.github/workflows/ci.yml` is a **placeholder** — it runs only
  `echo "Customize this CI workflow..."`. No linting or tests execute in CI
  today, so UI regressions cannot be caught automatically regardless of whether
  the local suite works.

### Expected Behavior

- `npm run test:unit` runs cleanly from a fresh install with no setup crash
  and no noisy warnings that could be mistaken for errors.
- CI runs `npm ci`, `npm run lint`, and `npm run test:unit` on every PR and
  push to `main`, so any regression in the UI integration suite fails the
  pipeline visibly.

## Current State Analysis

### Relevant Code/Config

- `src/__tests__/SearchView.test.tsx` — MSW + jsdom integration suite. Already
  inlines lifecycle (`beforeAll`/`afterEach`/`afterAll`) after ef09120.
- `src/test/msw-server.ts` — minimal `setupServer()` wrapper.
- `vite.config.ts` — vitest config; `environment: 'jsdom'`, no `setupFiles`
  (removed in ef09120).
- `node_modules/msw/src/core/utils/cookieStore.ts` (msw 2.13.4) — now guards
  with `typeof localStorage.getItem !== 'function'` and returns `{}`, so the
  old crash path cannot fire with the installed version.
- `package.json` — `jsdom ^29.0.2`, `msw ^2.13.4` (both present in lockfile).
- `.github/workflows/ci.yml` — **placeholder only** (no real jobs).

### Root Cause Diagnosis

1. **Reported crash:** reproduces only with stale `node_modules` from before
   ef09120 bumped msw/jsdom. A fresh `npm install` against the current
   `package-lock.json` resolves it — confirmed by running the suite on this
   branch.
2. **Residual noise:** Node.js 22+ emits
   `--localstorage-file was provided without a valid path` when jsdom 29
   initialises its `localStorage` shim under the experimental WebStorage path.
   This is a warning, not an error — but it arrives on stderr right before the
   test output and is easy to mistake for the old crash, which likely fed the
   reporter's impression.
3. **CI is not running tests:** the reporter's "blocked in CI" concern is
   real, but the root cause is the placeholder workflow, not the test itself.

### Related Context

- Commit `ef09120` — earlier fix (msw/jsdom bump + MSW scoped to consumer).
- Commit `57d4c3d` / `2abcaa7` — recent search hook work landed on top of
  ef09120 and did not touch the test setup.
- Issue #36 — original context where #39 was spun out.

## Solution Design

### Approach

Two small, complementary changes:

1. **Wire up CI** to run `npm ci`, `npm run lint`, and `npm run test:unit` on
   pull requests and pushes to `main`. This is the durable guarantee that the
   suite keeps executing — which is the reporter's real ask.
2. **Silence the `--localstorage-file` warning** so a clean `npm run test:unit`
   produces no spurious warning text that could be misread as the old crash.
   Prefer the minimal, local fix: suppress the specific warning via
   `NODE_OPTIONS=--no-warnings=ExperimentalWarning` **only if** it maps to that
   category, otherwise filter by name via `process.noDeprecation`-style guard.
   Fallback: route the warning via `NODE_NO_WARNINGS=1` scoped to the test
   script.

Do **not** rewrite the MSW/jsdom setup — the current code already works with
the installed versions; touching it risks regressing other tests.

### Rationale

- The underlying bug claim does not reproduce on a fresh install, so the
  productive work is ensuring future drift is caught automatically.
- Silencing the warning removes ambiguity so a future reader (or reporter)
  doesn't conflate warning text with the old crash.
- A minimal CI job is cheaper to review and maintain than a full matrix.

### Trade-offs Considered

- **Adding a vitest setup file** to stub `globalThis.localStorage` could also
  make the warning disappear, but it re-introduces the global-setup coupling
  that ef09120 intentionally removed. ❌
- **Pinning Node to 20** in CI would sidestep the warning but diverges from
  local dev. ❌
- **Noop** — just close the issue. ❌ Leaves CI silent on regressions.

## Implementation Plan

### Step 1: Reproduce and confirm baseline

**Commands:**

```bash
cd <worktree>
npm ci
npm run test:unit
```

**Expected:** 22 tests pass, 5 test files. Done — already verified in research.

### Step 2: Replace the placeholder CI workflow

**File:** `.github/workflows/ci.yml`

**Changes:** Replace the placeholder jobs with a real `test` job that:

- Checks out the repo.
- Sets up Node.js 22 (LTS) via `actions/setup-node@v4` with `cache: 'npm'`.
- Runs `npm ci`.
- Runs `npm run lint`.
- Runs `npm run test:unit`.

Run on `pull_request` against `main` and `push` to `main`. Use
`ubuntu-latest`.

Do not add E2E / Playwright here — out of scope for #39 (and would need
browser setup). Leave a comment noting where to add it later.

**Testing:**

- Local: `npx --yes action-validator .github/workflows/ci.yml` (if available)
  or simply lint via pre-commit.
- Remote: the first PR will exercise the workflow; verify the `test` job
  appears on the PR status and passes.

### Step 3: Silence the `--localstorage-file` warning in test runs

**File:** `package.json`

**Changes:** Update `test:unit` (and keep `test:watch` aligned) so the Node
warning does not appear. Minimum-impact choice:

```jsonc
"test:unit": "vitest run --coverage",
"test:watch": "vitest"
```

becomes:

```jsonc
"test:unit": "NODE_NO_WARNINGS=1 vitest run --coverage",
"test:watch": "NODE_NO_WARNINGS=1 vitest"
```

`NODE_NO_WARNINGS=1` silences process-emitted warnings but does **not** hide
`console.warn` from application / test code — assertion warnings from React
Testing Library, MSW's `onUnhandledRequest: 'warn'`, etc. remain visible.

**Testing:**

```bash
npm run test:unit 2>&1 | grep -i "localstorage-file"
# Expected: no output.

npm run test:unit
# Expected: 22 tests pass, clean output.
```

### Step 4: Document the decision

**File:** `CLAUDE.md` — under the "Known Issues & Gotchas" / "Testing Strategy"
section (whichever is nearest), add one short note:

- Node 22+ emits a benign `--localstorage-file` warning from jsdom 29; the
  test scripts pass `NODE_NO_WARNINGS=1` to keep output clean.

Keep to 2-3 lines. No new top-level section.

### Step 5: Verify end-to-end

```bash
npm ci
npm run lint
npm run test:unit
```

All three green locally. Then push and confirm the CI `test` job runs and
passes on the PR.

## Testing Strategy

### Unit Testing

- No new unit tests needed — the existing 5 tests in
  `src/__tests__/SearchView.test.tsx` are the integration suite this issue
  cares about.
- Verify they still pass under the new CI environment (Node 22 on
  `ubuntu-latest`) — the key unknown vs. local macOS Node 25.

### Integration Testing

**Test Case 1: Fresh clone + install + test**

1. `git clone` (or fresh worktree), `npm ci`, `npm run test:unit`.
2. Expected: 5/5 `SearchView.test.tsx`, 22/22 total, exit 0, no
   `localstorage-file` warning.

**Test Case 2: Lint clean**

1. `npm run lint`.
2. Expected: exit 0.

**Test Case 3: CI workflow**

1. Push branch, open PR.
2. Expected: `test` job runs `npm ci` → `npm run lint` → `npm run test:unit`,
   all pass, shows as required status on PR.

### Regression Testing

- Re-run existing apps-script and netlify function tests — must remain green
  (17 tests).
- Confirm `NODE_NO_WARNINGS=1` does not hide legitimate warnings developers
  rely on: try introducing a deliberate React `act()` warning locally and
  confirm it still prints (Testing Library uses `console.error`, not Node
  warnings, so this should be unaffected).

## Success Criteria

- [ ] `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, and
      `npm run test:unit` on PR + push to main.
- [ ] `npm run test:unit` output contains no `localstorage-file` warning.
- [ ] All 22 tests continue to pass locally and in CI.
- [ ] `CLAUDE.md` documents the `NODE_NO_WARNINGS=1` rationale in 2-3 lines.
- [ ] Pre-commit hooks pass on all changed files.
- [ ] Issue #39 closed via PR.

## Files Modified

1. `.github/workflows/ci.yml` — replace placeholder with a real `test` job.
2. `package.json` — prepend `NODE_NO_WARNINGS=1` to `test:unit` / `test:watch`.
3. `CLAUDE.md` — 2-3 line note under Known Issues & Gotchas.
4. `docs/plan/issues/39_fix_searchview_test_setup_crash_and_wire_ci.md` —
   this plan document (authored as part of the workflow).

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None directly. Unblocks future PRs from silently breaking the UI suite.

### Related

- #36 — original issue that spawned #39.
- Commit `ef09120` — prior partial fix (msw/jsdom bump).

### Enables

- Future additions to `SearchView.test.tsx` (e.g. tests for outage UX) will be
  executed in CI automatically.

## References

- [GitHub Issue #39](https://github.com/denhamparry/djrequests/issues/39)
- Commit `ef09120` — `fix(test): scope MSW to its consumer and bump msw/jsdom`.
- [Node.js WebStorage docs](https://nodejs.org/api/webstorage.html) — context
  for `--localstorage-file`.
- [MSW cookieStore guard](https://github.com/mswjs/msw) — `localStorage.getItem`
  guard added upstream in msw 2.13.x.

## Notes

### Key Insights

- The reported "crash" does not reproduce on a clean install — the earlier fix
  (`ef09120`) did in fact resolve the underlying bug. The issue was likely
  filed against stale `node_modules`.
- The remaining risk is **regression drift**: without CI actually running
  tests, any future change can silently re-break the suite. That is the
  durable fix.
- The `--localstorage-file` warning is cosmetic but confusing; silencing it
  removes a red herring for future investigators.

### Alternative Approaches Considered

1. **Rewrite MSW setup (revive global setup file)** — reintroduces the coupling
   ef09120 deliberately removed. ❌
2. **Pin Node 20 in CI** — avoids the warning but diverges from local dev. ❌
3. **Write a custom jsdom localStorage shim in a setup file** — more code,
   same outcome as `NODE_NO_WARNINGS=1`. ❌
4. **Minimal CI + env-var warning silence** ✅ — chosen.

### Best Practices

- CI job uses Node 22 (current LTS) via `actions/setup-node@v4` with `cache:
  'npm'` to keep runs fast.
- Use `npm ci`, not `npm install`, in CI for lockfile-faithful installs.
- Keep this workflow single-job until there's a concrete need for a matrix —
  premature complexity is a maintenance cost.

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved (with one required refinement)
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation after applying Required Change 1

### Strengths

- Correctly identified that the reporter's crash does not reproduce on a fresh
  install — validated empirically by running `npm ci` + `npm run test:unit`
  (22/22 tests pass).
- Traced the residual `--localstorage-file` warning to a specific Node.js
  warning category (verified: it is an `ExperimentalWarning`), rather than
  guessing.
- Identified the real underlying risk — `.github/workflows/ci.yml` is a
  placeholder, so the suite's execution in CI is the ask that actually
  matters.
- Scoped tightly: did not attempt to rewrite MSW setup or revive the global
  setup file that ef09120 deliberately removed.

### Gaps Identified

1. **`NODE_NO_WARNINGS=1` is too broad.**
   - **Impact:** Medium.
   - **Detail:** Verified that the offending warning is categorised as
     `ExperimentalWarning` (silenced by
     `NODE_OPTIONS=--no-warnings=ExperimentalWarning`). `NODE_NO_WARNINGS=1`
     also hides `DeprecationWarning`s that developers want to see when
     upgrading Node or dependencies.
   - **Recommendation:** Use
     `NODE_OPTIONS=--no-warnings=ExperimentalWarning` in the test scripts
     instead. See Required Change 1 below.

### Edge Cases Not Covered

1. **Cross-platform env var syntax.**
   - **Current Plan:** Uses inline `VAR=val command` in npm scripts.
   - **Reality:** Works on macOS/Linux (local dev + GitHub Actions
     `ubuntu-latest`). Does not work in Windows `cmd` without `cross-env`.
   - **Recommendation:** Accept as a known limitation — no Windows
     contributors or CI runners are in scope. Do not add `cross-env` just for
     this. Note in the CLAUDE.md blurb if space allows.

2. **Coverage output in CI.**
   - **Current Plan:** Runs `npm run test:unit`, which invokes
     `vitest run --coverage`. CI will regenerate the `coverage/` directory.
   - **Recommendation:** Accept as-is. The `coverage/` directory is already
     gitignored (`.gitignore` check recommended during implementation; if not,
     it's not a blocker — `npm ci` + GitHub Actions run in a clean workspace).

### Alternatives Considered (Review)

1. **Use `cross-env` for portable env var setting.**
   - **Pros:** Windows support.
   - **Cons:** Extra dependency, no current Windows need.
   - **Verdict:** Not worth it. ❌

2. **Patch jsdom to stop setting the experimental flag.**
   - **Pros:** Addresses root cause.
   - **Cons:** Requires upstream PR or patch-package — disproportionate cost
     for a cosmetic warning. ❌

3. **Accept the warning, document it in CLAUDE.md, skip the env var change.**
   - **Pros:** Zero script churn.
   - **Cons:** The whole reason #39 was filed is that the warning was
     mis-read as a crash. Silencing removes the ambiguity permanently. ❌

### Risks and Concerns

1. **Node 22 vs Node 25 behavior divergence.**
   - **Likelihood:** Low.
   - **Impact:** Medium.
   - **Mitigation:** CI runs on Node 22 (current LTS); local dev on Node 25.
     Both are Node 22+, which is when `localStorage`/jsdom 29 behaviour
     stabilised. Verified: msw 2.13.4's cookieStore already guards
     `typeof localStorage.getItem !== 'function'`. No behaviour difference
     expected, but confirm the CI run passes on the first PR before merge.

2. **Hiding real future warnings.**
   - **Likelihood:** Low.
   - **Impact:** Medium.
   - **Mitigation:** Use `--no-warnings=ExperimentalWarning` (narrow) rather
     than `NODE_NO_WARNINGS=1` (broad). Deprecation warnings still surface.

3. **CI workflow placeholder was intentional.**
   - **Likelihood:** Low.
   - **Impact:** Low.
   - **Mitigation:** Replacing the placeholder is explicitly what #39 asks for
     (and aligns with `CLAUDE.md` which describes the test commands as the
     quality gate). Low risk of stepping on intentional design.

### Required Changes

**Changes that must be made before implementation:**

- [ ] **Change 1:** Swap `NODE_NO_WARNINGS=1` for
      `NODE_OPTIONS=--no-warnings=ExperimentalWarning` in the `test:unit` and
      `test:watch` scripts. Update the Step 3 snippet and the CLAUDE.md note
      in Step 4 accordingly. This narrows the silence to the one warning
      category we actually want hidden.

### Optional Improvements

- [ ] Add a short comment in `.github/workflows/ci.yml` noting where Playwright
      / E2E would be added later, so the next contributor doesn't have to
      re-discover that decision.
- [ ] Verify `coverage/` is gitignored during implementation; add if missing.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
      (reporter's real concern: tests running in CI)
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified
      `vite.config.ts`, `src/__tests__/SearchView.test.tsx`,
      `src/test/msw-server.ts`, `.github/workflows/ci.yml`,
      `node_modules/msw/src/core/utils/cookieStore.ts`)
- [x] Security implications considered (no new attack surface; CI uses pinned
      Node setup action)
- [x] Performance impact assessed (CI job adds ~30-60s wall time on PRs —
      acceptable)
- [x] Test strategy covers critical paths (existing 22-test suite is the
      critical path; no new tests required)
- [x] Documentation updates planned (CLAUDE.md note)
- [x] Related issues/dependencies identified (#36, ef09120)
- [x] Breaking changes documented (none — CI workflow replacement is additive
      from a developer workflow perspective)
