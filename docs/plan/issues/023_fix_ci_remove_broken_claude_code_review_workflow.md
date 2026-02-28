# Plan: Fix CI - Remove Broken Claude Code Review Workflow

**Status:** Complete
**Issue:** #23 - fix(ci): remove broken claude-code-review workflow
**Plan Document:** docs/plan/issues/023_fix_ci_remove_broken_claude_code_review_workflow.md

## Problem Summary

`.github/workflows/claude-code-review.yml` fails on every push because its `on:` trigger block is completely empty (all triggers are commented out). GitHub requires at least one valid event trigger; without one, the workflow errors on every push to `main`, cluttering Actions history with noise.

**Failed run:** [actions/runs/22527431189](https://github.com/denhamparry/djrequests/actions/runs/22527431189)

## Root Cause

```yaml
on:
  # pull_request:  <- commented out, nothing valid remains
```

GitHub validates that the `on:` block contains at least one event. An empty block causes a workflow file error on every push.

## Current State Analysis

### Files Affected

- `.github/workflows/claude-code-review.yml` — the broken workflow to be removed

### What Exists

The file defines a `Claude Code Review` workflow that:

- Has an empty `on:` block (all triggers commented out)
- Would have run a Claude code review action on pull requests
- Is fully superseded by the `@claude` mention-based trigger via GitHub App

### Why It's Safe to Delete

The CLAUDE.md for the project states:
> "Claude code reviews are already opt-in via `@claude` mentions (configured via GitHub App). This file is redundant and broken."

The `.github/workflows/ci.yml` is the only other workflow and is unaffected.

## Solution Design

Delete `.github/workflows/claude-code-review.yml`.

This is a one-file deletion with no code changes, no dependencies, and no test impact.

## Implementation Steps

### Step 1: Delete the broken workflow file

```bash
rm .github/workflows/claude-code-review.yml
```

### Step 2: Update CLAUDE.md to remove stale workflow references

The section "GitHub Actions - Claude Code Review" (lines ~159-187) in `CLAUDE.md` references the deleted file and describes the workflow configuration. This section should be replaced with a brief note explaining that Claude reviews are requested via `@claude` mentions.

**Files Modified:**

- `.github/workflows/claude-code-review.yml` — DELETED
- `CLAUDE.md` — update "GitHub Actions - Claude Code Review" section to remove stale file references

## Acceptance Criteria

- [x] `.github/workflows/claude-code-review.yml` is removed
- [ ] No failed workflow runs appear on subsequent pushes to `main`

## Risks

- **None** — The file is already broken and non-functional. Removing it only stops error noise.

## Testing

No unit or E2E tests required. Verification is post-merge:

- Push to `main` should not produce a failed `Claude Code Review` workflow run.

## Nice-to-Have Enhancements

- Update CLAUDE.md to remove references to the deleted workflow file if outdated (low priority)
