# GitHub Issue #25: chore(docs): update CLAUDE.md to remove stale claude-code-review workflow references

**Issue:** [#25](https://github.com/denhamparry/djrequests/issues/25)
**Status:** Complete
**Date:** 2026-02-28

## Problem Statement

`CLAUDE.md` contains a "GitHub Actions - Claude Code Review" section (lines ~159–188) that
references the now-deleted `.github/workflows/claude-code-review.yml` file. This file was removed
in issue #23 / PR #24. The documentation is now stale and misleading.

Additionally, the issue notes pre-existing markdownlint violations throughout the file that should
be fixed in the same cleanup PR.

### Current Behavior

- Section at lines 159–188 says: _"The repository includes a Claude Code Review workflow
  (`.github/workflows/claude-code-review.yml`)..."_ — the file no longer exists.
- Sub-sections "Why Automatic Reviews Are Disabled" and "Workflow Configuration" describe a
  workflow file that has been deleted.
- Various markdownlint violations exist throughout `CLAUDE.md` (unordered list style, missing blank
  lines before lists, bare URLs, etc.).

### Expected Behavior

- The "GitHub Actions - Claude Code Review" section accurately reflects the current state: reviews
  are opt-in via `@claude` GitHub App mentions; there is no workflow file.
- All markdownlint rules pass on `CLAUDE.md` with no violations.

## Current State Analysis

### Relevant Files

- `CLAUDE.md` — the only file requiring changes
- `.github/workflows/` — only `ci.yml` remains; `claude-code-review.yml` was deleted in #23

### Stale Section (lines 159–188)

```markdown
## GitHub Actions - Claude Code Review

The repository includes a Claude Code Review workflow (`.github/workflows/claude-code-review.yml`),
but automatic PR reviews are **disabled** to reduce noise.

### Requesting a Claude Review
...

### Why Automatic Reviews Are Disabled
...

### Workflow Configuration
The workflow uses the `anthropics/claude-code-action@v1` GitHub Action with:
- Restricted bash tools for GitHub CLI operations (`gh pr comment`, `gh pr diff`, etc.)
- Project-specific guidance from `CLAUDE.md`
- OAuth authentication via `CLAUDE_CODE_OAUTH_TOKEN` secret
```

### Known Markdownlint Issues in Current File

- Lists directly after headings with no blank line (MD032)
- Unordered list items using mixed or bare hyphens inside ordered lists (MD004/MD007)
- Ordered list items not starting at 1 or not incrementing (MD029)
- Bare URLs not wrapped in angle brackets or markdown links (if any)

### Related Context

- Issue #23: deleted `.github/workflows/claude-code-review.yml`
- Plan `docs/plan/issues/023_fix_ci_remove_broken_claude_code_review_workflow.md` — marked
  `.github/workflows/claude-code-review.yml` as DELETED; CLAUDE.md update was listed as a
  "Nice-to-Have" and not completed.

## Solution Design

### Approach

Replace the stale "GitHub Actions - Claude Code Review" section with an accurate, concise
description matching the current reality: Claude reviews are requested via `@claude` mention
using the GitHub App (no workflow file). Then fix all pre-existing markdownlint violations
detected by `markdownlint-cli2` (the pre-commit hook in `.pre-commit-config.yaml`).

### Rationale

- One-file change; no code, no tests, no dependencies impacted.
- Fixing markdownlint issues ensures the pre-commit hook passes cleanly on this file in future
  commits.

### Trade-offs

- Minimal approach: fix only `CLAUDE.md`, touch nothing else.
- No structural reorganisation of CLAUDE.md beyond what is required.

## Implementation Plan

### Step 1: Replace the stale "GitHub Actions - Claude Code Review" section

**File:** `CLAUDE.md`

**Current content (lines ~159–188):**

```markdown
## GitHub Actions - Claude Code Review

The repository includes a Claude Code Review workflow
(`.github/workflows/claude-code-review.yml`), but automatic PR reviews are **disabled**
to reduce noise.

### Requesting a Claude Review

To request a code review from Claude on any PR:

1. Add a comment to the PR with `@claude`
2. Claude will analyze the changes and provide feedback on:
   - Code quality and best practices
   - Potential bugs or issues
   - Performance considerations
   - Security concerns
   - Test coverage

### Why Automatic Reviews Are Disabled

- **Reduces noise**: No reviews on every PR update
- **Intentional reviews**: Reviews only when explicitly requested
- **Cost efficiency**: Fewer GitHub Actions minutes and API calls
- **Better workflow**: The workflow file remains for reference and manual triggering if needed

### Workflow Configuration

The workflow uses the `anthropics/claude-code-action@v1` GitHub Action with:
- Restricted bash tools for GitHub CLI operations (`gh pr comment`, `gh pr diff`, etc.)
- Project-specific guidance from `CLAUDE.md`
- OAuth authentication via `CLAUDE_CODE_OAUTH_TOKEN` secret
```

**Replace with:**

```markdown
## GitHub Actions - Claude Code Review

Automatic PR reviews are **opt-in** via `@claude` mentions (configured via the GitHub App).
There is no workflow file for automatic reviews.

### Requesting a Claude Review

To request a code review from Claude on any PR:

1. Add a comment to the PR with `@claude`
2. Claude will analyze the changes and provide feedback on:
   - Code quality and best practices
   - Potential bugs or issues
   - Performance considerations
   - Security concerns
   - Test coverage
```

### Step 2: Fix pre-existing markdownlint violations in CLAUDE.md

Run markdownlint against the file to identify all violations:

```bash
pre-commit run markdownlint-cli2 --all-files
```

Common violations to fix:

- Add blank lines before unordered lists that follow a heading or paragraph (MD032)
- Ensure ordered list items increment correctly (MD029)
- Add language specifiers to fenced code blocks where missing (MD040)
- Fix any other violations reported by markdownlint-cli2

### Step 3: Verify pre-commit hooks pass

```bash
pre-commit run --all-files
```

All hooks must pass with no failures before committing.

## Testing Strategy

### Verification

1. **Pre-commit hooks pass**: `pre-commit run --all-files` reports no failures
2. **Content accuracy**: Confirm no remaining references to `claude-code-review.yml`
3. **Markdownlint clean**: `markdownlint-cli2` reports zero violations on `CLAUDE.md`

### Regression

- No application code changed; no unit or E2E tests required.
- Confirm `ci.yml` is unmodified (`git diff HEAD -- .github/workflows/ci.yml` is empty).

## Success Criteria

- [ ] Stale "GitHub Actions - Claude Code Review" section replaced with accurate content
- [ ] No references to `claude-code-review.yml` remain in `CLAUDE.md`
- [ ] No references to `anthropics/claude-code-action@v1` or `CLAUDE_CODE_OAUTH_TOKEN` remain
- [ ] `markdownlint-cli2` reports zero violations on `CLAUDE.md`
- [ ] `pre-commit run --all-files` passes cleanly
- [ ] GitHub issue #25 can be closed

## Files Modified

1. `CLAUDE.md` — replace stale workflow section; fix markdownlint violations

## Related Issues and Tasks

### Depends On

- #23 (already merged) — deleted `.github/workflows/claude-code-review.yml`

### Related

- `docs/plan/issues/023_fix_ci_remove_broken_claude_code_review_workflow.md` — original fix plan
  (CLAUDE.md update was listed as nice-to-have, not completed)

## References

- [GitHub Issue #25](https://github.com/denhamparry/djrequests/issues/25)
- [Issue #23](https://github.com/denhamparry/djrequests/issues/23) — removed the workflow file
- [markdownlint-cli2 rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)

## Notes

### Key Insights

- The `.github/workflows/` directory now only contains `ci.yml`; any mention of
  `claude-code-review.yml` in docs is incorrect.
- The GitHub App (`@claude` mentions) is the sole mechanism for Claude reviews — no workflow file
  is involved.

### Alternative Approaches Considered

1. **Delete the entire section** — Rejected; the "Requesting a Claude Review" guidance is still
   useful and accurate. ❌
2. **Replace + fix markdownlint** — Chosen; minimal, targeted, and ensures pre-commit passes. ✅

---

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-02-28
**Original Plan Date:** 2026-02-28

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Correctly identifies all three stale references in `CLAUDE.md` (lines 161, 184, 187) via
  independent grep verification.
- Confirmed `claude-code-review.yml` no longer exists in `.github/workflows/`; only `ci.yml`
  remains.
- Minimal scope: single-file documentation change, no code or test impact.
- Proposed replacement text is accurate and concise.
- Success criteria are measurable and complete.

### Gaps Identified

1. **Markdownlint violation count underestimated**
   - **Impact:** Low (doesn't change the approach, only the scale of effort)
   - **Detail:** The plan mentions "various markdownlint violations" with a short list of guessed
     rule types. Independent research (`npx markdownlint-cli2 CLAUDE.md`) found **47 errors**,
     primarily MD022 (blanks around headings) and MD032 (blanks around lists), spanning the
     entire file. MD004/MD007/MD029 are not the primary issues.
   - **Recommendation:** During implementation, run `npx markdownlint-cli2 CLAUDE.md` first to
     get the exact list, then fix all 47 errors. The plan's Step 2 already says to run the tool
     — just be aware the scope is larger than expected.

### Edge Cases Not Covered

1. **Plan document itself may have markdownlint violations**
   - **Current Plan:** Does not mention linting the plan file.
   - **Recommendation:** Run `pre-commit run --all-files` after editing; the pre-commit hook covers
     all markdown files including docs/plan/. Fix any violations in this plan document too.

### Alternative Approaches Evaluated

1. **Delete the entire "GitHub Actions - Claude Code Review" section**
   - **Pros:** Smallest diff; removes all stale content.
   - **Cons:** Loses useful guidance on how to invoke `@claude` reviews.
   - **Verdict:** Plan's choice to keep the "Requesting a Claude Review" subsection is correct. ✅

2. **Only fix the stale section, skip markdownlint**
   - **Pros:** Minimal change.
   - **Cons:** Pre-commit hook would still fail on `CLAUDE.md` in future commits; defeats the
     purpose of having linting enabled.
   - **Verdict:** Plan's choice to fix markdownlint violations is correct. ✅

### Risks and Concerns

1. **Scale of markdownlint fixes**
   - **Likelihood:** Certain (47 violations confirmed)
   - **Impact:** Low — all fixes are whitespace/blank-line additions, not content changes
   - **Mitigation:** Use `markdownlint-cli2 --fix CLAUDE.md` if auto-fix is supported; otherwise
     fix manually guided by the tool output.

### Required Changes

No required changes to the plan. The solution approach is correct.

### Optional Improvements

- [ ] Note in Implementation Step 2 that there are exactly 47 violations (MD022, MD032 dominant)
      so the implementer has accurate expectations.
- [ ] Consider using `markdownlint-cli2 --fix` for auto-fixable rules to speed up implementation.

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate (verified: stale refs at lines 161, 184, 187)
- [x] Security implications considered (none — docs only)
- [x] Performance impact assessed (none — docs only)
- [x] Test strategy covers critical paths (pre-commit hook run is sufficient)
- [x] Documentation updates planned (this IS the documentation update)
- [x] Related issues/dependencies identified (#23, plan 023)
- [x] Breaking changes documented (none)
