# GitHub Issue #19: Disable automatic PR reviews by Claude

**Issue:** [#19](https://github.com/denhamparry/djrequests/issues/19)
**Status:** Complete
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
- Research finding: No separate workflow file found for `@claude` mentions, likely configured at GitHub app/bot level

**Recent workflow runs:**
Analysis of recent `claude-code-review.yml` runs shows:
```json
[
  {"event":"pull_request","headBranch":"dependabot/npm_and_yarn/js-yaml-4.1.1","conclusion":"success"},
  {"event":"pull_request","headBranch":"dependabot/github_actions/actions/checkout-6","conclusion":"failure"},
  {"event":"pull_request","headBranch":"dependabot/npm_and_yarn/glob-10.5.0","conclusion":"failure"},
  {"event":"pull_request","headBranch":"dependabot/npm_and_yarn/multi-4681aa0b5a","conclusion":"failure"},
  {"event":"pull_request","headBranch":"dependabot/npm_and_yarn/js-yaml-4.1.1","conclusion":"cancelled"}
]
```
- All recent runs triggered by `pull_request` events (automatic)
- Multiple runs on Dependabot PRs showing the noise problem
- Some failures/cancellations indicating wasted resources

**Other workflows:**
- `.github/workflows/ci.yml` - Main CI workflow (currently placeholder with no active jobs)
- No conflicts expected with this change

**Current documentation:**
- `CLAUDE.md` has a "Development Workflow" section at line ~128
- No existing documentation about Claude Code Review workflow
- README.md focuses on local setup and testing, no CI/CD documentation

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

**File:** `.github/workflows/claude-code-review.yml` (lines 3-11)

**Current state:**
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

**Implementation:**
Using the Edit tool, replace the `on:` section to comment out the automatic trigger:

```yaml
on:
  # Automatic PR reviews are disabled to reduce noise
  # To request a Claude review, comment '@claude' on any PR
  # The mention-based trigger is configured via GitHub app settings

  # pull_request:
  #   types: [opened, synchronize]
  #   # Optional: Only run on specific file changes
  #   # paths:
  #   #   - "src/**/*.ts"
  #   #   - "src/**/*.tsx"
  #   #   - "src/**/*.js"
  #   #   - "src/**/*.jsx"
```

**Verification:**
```bash
# Check the modified trigger section
grep -A 15 "^on:" .github/workflows/claude-code-review.yml

# Verify workflow is still valid (GitHub Actions will parse on push)
# Note: yamllint is not installed in this environment, validation will happen on push

# Confirm the rest of the workflow (jobs section) is intact
grep -A 5 "^jobs:" .github/workflows/claude-code-review.yml
```

**Expected result:**
- The workflow file remains syntactically valid YAML
- The `on:` key exists but has no active triggers (all commented out)
- The `jobs:` section and all steps remain unchanged
- GitHub Actions will recognize the file but won't trigger it automatically

### Step 2: Update documentation

**File:** `CLAUDE.md`

**Location:** After the "Development Workflow" section (around line 128+)

**Implementation:**
Add a new section documenting the Claude Code Review workflow behavior:

```markdown
## GitHub Actions - Claude Code Review

The repository includes a Claude Code Review workflow (`.github/workflows/claude-code-review.yml`), but automatic PR reviews are **disabled** to reduce noise.

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

**Verification:**
```bash
# Check that the new section is added after Development Workflow
grep -n "## GitHub Actions - Claude Code Review" CLAUDE.md

# Verify the section contains the key information
grep -A 10 "Requesting a Claude Review" CLAUDE.md
```

**Expected result:**
- New section appears in CLAUDE.md around line 130-150
- Documentation clearly explains how to request reviews
- Context about why automatic reviews are disabled
- Technical details about the workflow configuration

### Step 3: Commit changes and create PR

**Actions:**
1. Stage modified files
2. Create conventional commit
3. Push to branch
4. Create PR with issue reference

**Commands:**
```bash
# Stage changes
git add .github/workflows/claude-code-review.yml CLAUDE.md

# Create conventional commit
git commit -m "fix(ci): disable automatic Claude PR reviews

Disable automatic PR review triggers to reduce noise and make
reviews intentional. Claude reviews can still be requested by
commenting '@claude' on any PR.

Changes:
- Comment out pull_request trigger in claude-code-review.yml
- Add documentation to CLAUDE.md explaining how to request reviews
- Preserve workflow file for manual triggering if needed

Fixes #19

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote branch
git push origin HEAD

# Create PR (if not already created)
gh pr create --title "Fix: Disable automatic Claude PR reviews" \
  --body "$(cat <<'EOF'
## Summary

Disables automatic PR reviews by Claude to reduce noise and make reviews intentional.

## Changes

- Commented out `pull_request` trigger in `.github/workflows/claude-code-review.yml`
- Added documentation to `CLAUDE.md` explaining how to request Claude reviews via `@claude` mention
- Preserved workflow configuration for reference and manual triggering

## Testing

- [ ] Verify workflow file is valid YAML (GitHub Actions parses successfully)
- [ ] Confirm no automatic workflow runs on PR events
- [ ] Test `@claude` mention trigger on this PR
- [ ] Verify documentation is clear and accessible

## Related

Fixes #19

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```

**Expected result:**
- Commit follows conventional commit format with `fix(ci):` prefix
- PR references issue #19 in both title and body
- GitHub Actions will validate workflow syntax on push
- PR can be used to test the changes

### Step 4: Verify no automatic trigger

**Testing approach:**
After the PR is created, verify the automatic trigger is disabled:

1. **Check workflow doesn't run automatically:**
   ```bash
   # Wait 30 seconds after creating/updating PR
   sleep 30

   # Check recent workflow runs
   gh run list --workflow=claude-code-review.yml --limit 5 --json databaseId,event,conclusion,createdAt,headBranch

   # Expected: No new 'pull_request' event runs for this branch
   ```

2. **Update the PR to trigger synchronize event:**
   ```bash
   # Make a trivial change to trigger PR update
   echo "# Test" >> .github/workflows/claude-code-review.yml
   git add .github/workflows/claude-code-review.yml
   git commit -m "test: trigger PR synchronize event"
   git push

   # Wait and check again
   sleep 30
   gh run list --workflow=claude-code-review.yml --limit 5

   # Expected: Still no automatic runs

   # Revert the test change
   git reset --soft HEAD~1
   git reset HEAD .github/workflows/claude-code-review.yml
   git checkout -- .github/workflows/claude-code-review.yml
   ```

3. **Verify other workflows still run:**
   ```bash
   # Check that ci.yml or other workflows are not affected
   gh run list --limit 5

   # Expected: Other workflows run normally, only claude-code-review.yml is disabled
   ```

**Expected results:**
- No new workflow runs with `event: pull_request` after changes are pushed
- The workflow does not appear in the "Actions" tab for this PR
- Other workflows (if any) continue to run normally

### Step 5: Test mention-based trigger

**Testing approach:**
Verify that the `@claude` mention functionality still works:

1. **Add mention comment to PR:**
   ```bash
   # Get current PR number
   PR_NUMBER=$(gh pr view --json number -q .number)

   # Add comment with @claude mention
   gh pr comment $PR_NUMBER --body "@claude please review this PR"
   ```

2. **Monitor for Claude response:**
   ```bash
   # Wait for Claude to process (may take 1-2 minutes)
   sleep 120

   # Check for new comments from Claude
   gh pr view $PR_NUMBER --json comments --jq '.comments[] | select(.author.login == "claude" or .author.login == "claude-code") | {author: .author.login, body: .body}'

   # Expected: Claude responds with code review feedback
   ```

3. **Verify review content:**
   - Check that Claude analyzes the workflow changes
   - Verify feedback includes code quality, potential issues, etc.
   - Confirm the review is posted as a PR comment

**Expected results:**
- `@claude` mention triggers a review
- Claude posts feedback as a PR comment within 1-2 minutes
- Review content is relevant to the changes made
- The mention-based trigger is working independently of the automatic trigger

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

### Implementation
- [ ] `.github/workflows/claude-code-review.yml` automatic trigger commented out (lines 3-11)
- [ ] Explanatory comments added to workflow file explaining why it's disabled
- [ ] `jobs:` section and all workflow steps remain intact and unchanged
- [ ] Documentation section added to `CLAUDE.md` after "Development Workflow"
- [ ] Documentation clearly explains how to request reviews with `@claude`
- [ ] Documentation explains why automatic reviews are disabled

### Testing
- [ ] Workflow file passes YAML validation (no GitHub Actions syntax errors)
- [ ] PR created with changes and pushed to remote
- [ ] No automatic `claude-code-review` workflow runs triggered by PR creation
- [ ] No automatic workflow runs triggered by PR updates (synchronize event)
- [ ] Other workflows (if any) continue to run normally
- [ ] `@claude` mention triggers a review on the test PR
- [ ] Claude responds with relevant code review feedback

### Completion
- [ ] All changes committed with conventional commit format
- [ ] PR merged to main branch
- [ ] Issue #19 closed with reference to implementing PR
- [ ] Monitor for 1-2 days to confirm no automatic reviews on other PRs

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

## Research Findings

### Workflow Analysis

**File structure:**
```
.github/workflows/
├── ci.yml                      # Placeholder CI workflow (no active jobs)
└── claude-code-review.yml      # Active automatic review workflow
```

**Current trigger configuration:**
- Triggers on: `pull_request` with types `[opened, synchronize]`
- No path filters active (all commented out)
- No author filters active (all commented out)
- No conditional logic to prevent execution

**Workflow behavior:**
- Uses `anthropics/claude-code-action@v1`
- Requires `CLAUDE_CODE_OAUTH_TOKEN` secret (configured in repo)
- Checkout depth: 1 (shallow clone for performance)
- Restricted bash tools: only `gh` commands allowed
- Posts review via `gh pr comment` command

**Recent activity (last 5 runs):**
- All triggered by automatic `pull_request` events
- Most runs on Dependabot PRs (dependency updates)
- Mix of success/failure/cancelled outcomes
- Evidence of noise and resource waste

### Mention-Based Trigger Investigation

**Findings:**
- No workflow file found with `issue_comment` or `pull_request_review_comment` triggers
- No grep matches for `@claude` in workflow files
- Conclusion: Mention-based trigger is likely configured at GitHub app/bot level, not via workflow files
- This is separate from the workflow-based automatic trigger
- Disabling the automatic trigger will NOT affect the mention-based functionality

### Documentation Analysis

**CLAUDE.md:**
- Comprehensive project documentation
- Sections: Purpose, Commands, Architecture, Testing, Deployment
- "Development Workflow" section at line ~128
- No existing documentation about CI/CD or Claude reviews
- Good location to add new section on Claude Code Review

**README.md:**
- User-facing documentation focused on local setup
- Covers testing, project layout, external configuration
- No CI/CD documentation
- Not the best place for this documentation (CLAUDE.md is better for developer guidance)

### YAML Validation Tools

**Available in environment:**
- `yamllint`: Not installed
- Validation will occur via GitHub Actions parser on push
- GitHub will show workflow syntax errors in Actions tab if invalid

**Manual validation:**
- Can use `grep` to verify structure
- Can check that `on:` key exists with only comments
- Can verify `jobs:` section is intact

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
