# GitHub Issue #19: Disable automatic PR reviews by Claude

**Issue:** [#19](https://github.com/denhamparry/djrequests/issues/19)
**Status:** Open
**Date:** 2025-12-05

## Problem Statement

Claude is currently automatically reviewing all PRs via GitHub Actions, creating unnecessary noise and reviews for every PR, even when not needed. The mention-based trigger (`@claude`) is already configured and working, but the automatic trigger is still active.

### Current Behavior
- GitHub Actions workflow `.github/workflows/claude-code-review.yml` triggers automatically on PR events:
  - `pull_request.opened`
  - `pull_request.synchronize`
- Claude reviews run for every PR regardless of whether they're requested
- This creates excessive CI runs and notification noise
- Wastes GitHub Actions minutes and Claude Code API quota

### Expected Behavior
- Claude should only review PRs when explicitly mentioned via `@claude` in a comment
- Automatic triggers should be disabled
- The mention-based functionality should continue working (already configured elsewhere)
- Reduce noise and make reviews intentional

## Current State Analysis

### Relevant Code/Config

**File:** `.github/workflows/claude-code-review.yml`

Current trigger configuration (lines 3-11):
```yaml
on:
  pull_request:
    types: [opened, synchronize]
    # Optional: Only run on specific file changes
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"
```

**Issues identified:**
- The `pull_request` trigger with `types: [opened, synchronize]` causes automatic runs
- No condition prevents automatic execution
- The workflow unconditionally runs the Claude Code Review action
- Comments in the file suggest optional filtering (paths, author) but these don't prevent automatic execution

### Related Context

**Labels applied to issue:**
- `documentation` - Documentation updates will be needed
- `enhancement` - New feature request
- `github_actions` - GitHub Actions workflow change
- `ci` - Continuous integration related

**Mention-based trigger:**
- According to the issue, `@claude` mention functionality is already set up and working
- This is likely configured via GitHub's issue_comment or pull_request_review_comment events
- This functionality should remain intact after removing automatic triggers

**Other workflows:**
- `.github/workflows/ci.yml` - Main CI workflow (currently placeholder)
- No conflicts expected

## Solution Design

### Approach

**Disable the automatic trigger** by commenting out or removing the `pull_request` trigger in `.github/workflows/claude-code-review.yml`.

**Rationale:**
1. The mention-based trigger is already working (separate workflow or GitHub app configuration)
2. Simplest solution: remove the automatic trigger entirely
3. Prevents accidental re-enabling through PR synchronization
4. Clean separation between automatic CI and on-demand review

**Alternative approaches considered:**
1. ❌ **Add conditional check** (`if: github.event_name == 'issue_comment'`) - Doesn't prevent workflow from running, just skips job
2. ❌ **Add path filters** - Still runs on matching paths, doesn't solve noise problem
3. ❌ **Add author filters** - Complex to maintain, doesn't address root cause
4. ✅ **Remove automatic trigger** - Clean, simple, achieves goal

### Implementation

**Change:** Comment out the `pull_request` trigger in `.github/workflows/claude-code-review.yml`

**Before:**
```yaml
on:
  pull_request:
    types: [opened, synchronize]
```

**After:**
```yaml
on:
  # Automatic PR reviews disabled - use @claude mentions instead
  # pull_request:
  #   types: [opened, synchronize]
```

**Why comment instead of delete:**
- Preserves original configuration for reference
- Makes intent clear (intentionally disabled)
- Easy to re-enable if needed for debugging
- Documents the decision in the workflow file itself

### Benefits

1. **Reduces noise** - No automatic reviews on every PR
2. **Intentional reviews** - Reviews only when explicitly requested
3. **Cost savings** - Fewer GitHub Actions minutes and Claude API calls
4. **Preserves functionality** - `@claude` mention trigger continues to work
5. **Clear intent** - Commented-out trigger shows this is intentional

## Implementation Plan

### Step 1: Disable automatic PR trigger

**File:** `.github/workflows/claude-code-review.yml`

**Changes:**
- Comment out lines 3-11 (the `on.pull_request` trigger section)
- Add explanatory comment above the commented-out section
- Keep the rest of the workflow intact (job definition, steps)

**Code change:**
```yaml
on:
  # Automatic PR reviews disabled - use @claude mentions in PR comments instead
  # The mention-based trigger is configured separately and will continue to work
  # pull_request:
  #   types: [opened, synchronize]
  #   # Optional: Only run on specific file changes
  #   # paths:
  #   #   - "src/**/*.ts"
  #   #   - "src/**/*.tsx"
  #   #   - "src/**/*.js"
  #   #   - "src/**/*.jsx"
```

**Testing:**
```bash
# Validate YAML syntax
cat .github/workflows/claude-code-review.yml | grep -A 12 "^on:"

# Ensure file is valid YAML
yamllint .github/workflows/claude-code-review.yml || echo "yamllint not installed, skipping"
```

### Step 2: Update documentation

**File:** `CLAUDE.md` or relevant documentation

**Changes:**
- Document the change in behavior
- Explain how to request Claude reviews (`@claude` mention)
- Note the workflow file still exists but automatic trigger is disabled

**Documentation addition:**
```markdown
## GitHub Actions - Claude Code Review

The repository includes a Claude Code Review workflow (`.github/workflows/claude-code-review.yml`), but automatic PR reviews are **disabled** to reduce noise.

**To request a Claude review:**
- Comment `@claude` on any PR to trigger a review
- Claude will analyze the PR and provide feedback on code quality, bugs, performance, security, and tests

**Why automatic reviews are disabled:**
- Reduces unnecessary CI runs
- Makes reviews intentional and on-demand
- The workflow file remains for reference and manual triggering
```

### Step 3: Verify mention-based trigger still works

**Testing approach:**
1. Create a test PR (or use existing PR)
2. Comment `@claude` on the PR
3. Verify Claude responds with a review
4. Confirm no automatic review runs when PR is updated

**Manual verification steps:**
```bash
# Check workflow runs
gh run list --workflow=claude-code-review.yml --limit 5

# Verify no new automatic runs on PR updates
# (after implementing the change)
```

## Testing Strategy

### Unit Testing
Not applicable (workflow configuration change, no code logic)

### Integration Testing

**Test Case 1: Automatic trigger is disabled**
1. Create a new PR or update an existing PR
2. Wait for CI workflows to complete
3. **Expected:** `claude-code-review` workflow does NOT run automatically
4. **Expected:** Only other workflows (like `ci.yml`) run if configured

**Test Case 2: Mention-based trigger still works**
1. On any PR, add a comment with `@claude`
2. Wait for Claude to respond
3. **Expected:** Claude review is posted as a PR comment
4. **Expected:** Review includes feedback on code quality, bugs, performance, security, tests

**Test Case 3: Workflow file is valid**
1. Push changes to `.github/workflows/claude-code-review.yml`
2. Check GitHub Actions tab for syntax errors
3. **Expected:** No workflow syntax errors
4. **Expected:** File appears in workflow list (even if not triggered automatically)

### Regression Testing

**Existing functionality to verify:**
- Other workflows (ci.yml) continue to run normally
- PR status checks still function
- No impact on other GitHub Actions functionality

**Edge cases:**
- Multiple PRs created simultaneously - none should trigger automatic Claude review
- PR with many commits - should not trigger automatic review
- PR from fork - should not trigger automatic review (already restricted by permissions)

## Success Criteria

- [x] `.github/workflows/claude-code-review.yml` automatic trigger commented out
- [x] Explanatory comment added to workflow file
- [ ] Documentation updated (CLAUDE.md or README.md)
- [ ] Test PR created to verify no automatic trigger
- [ ] Test `@claude` mention to verify manual trigger works
- [ ] Workflow file passes YAML validation (GitHub Actions doesn't show errors)
- [ ] Issue #19 closed with reference to implementing PR

## Files Modified

1. `.github/workflows/claude-code-review.yml` - Comment out automatic PR trigger (lines 3-11)
2. `CLAUDE.md` (or documentation) - Document the change and how to request reviews

## Related Issues and Tasks

### Depends On
- None - this is a standalone change

### Blocks
- None - no other tasks waiting on this

### Related
- Issue #19 - This plan implements the requested change
- Mention-based trigger configuration (assumed to be working, may be in GitHub app settings or another workflow)

### Enables
- More intentional code reviews
- Reduced CI noise and costs
- Better developer experience with on-demand reviews

## References

- [GitHub Issue #19](https://github.com/denhamparry/djrequests/issues/19)
- [GitHub Actions - Workflow Triggers](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)
- [Claude Code Action Documentation](https://github.com/anthropics/claude-code-action)

## Notes

### Key Insights

1. **Simplicity wins** - Commenting out the trigger is cleaner than adding conditional logic
2. **Preserve history** - Commenting instead of deleting preserves the original configuration
3. **Mention trigger is separate** - The `@claude` functionality is likely configured via:
   - GitHub app/bot configuration (outside workflow files)
   - Or a separate workflow listening to `issue_comment` events
   - This change doesn't affect that functionality

### Alternative Approaches Considered

1. **Add `if` condition to job** ❌
   - Workflow still runs and shows up in Actions tab
   - Doesn't truly prevent execution, just skips steps
   - Still consumes workflow run quota

2. **Use path filters** ❌
   - Still triggers automatically on matching paths
   - Doesn't solve the core problem of unwanted automatic reviews

3. **Filter by author/association** ❌
   - Complex to maintain allow/deny lists
   - Doesn't make reviews truly on-demand
   - Could accidentally exclude legitimate cases

4. **Delete workflow file entirely** ❌
   - Loses configuration reference
   - May be needed for future re-enabling
   - Doesn't document the intentional decision

5. **Comment out trigger** ✅
   - Clean and simple
   - Preserves configuration for reference
   - Makes intent explicit
   - Easy to re-enable if needed

### Best Practices

**Workflow hygiene:**
- Keep disabled workflows in the repository with clear comments
- Document why features are disabled
- Provide alternative paths (e.g., mention-based trigger)

**Testing approach:**
- Verify negative case (trigger doesn't fire)
- Verify positive case (manual trigger still works)
- Monitor for a few days after deployment

**Monitoring:**
- Check GitHub Actions usage/costs before and after
- Monitor developer feedback on review availability
- Ensure `@claude` mention response time is acceptable
