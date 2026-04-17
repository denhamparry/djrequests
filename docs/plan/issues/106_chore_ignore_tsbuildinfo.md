# GitHub Issue #106: chore: ignore *.tsbuildinfo in .gitignore

**Issue:** [#106](https://github.com/denhamparry/djrequests/issues/106)
**Status:** Reviewed (Approved)
**Date:** 2026-04-17

## Problem

`tsconfig.node.tsbuildinfo` appears as untracked in the repo. It's TypeScript's
incremental build cache, emitted because `tsconfig.node.json` sets
`composite: true`. The file is machine-specific and regenerates on every
`tsc` / `vite build`, so it has no value in version control — it only creates
noise in `git status` and diffs.

## Proposed Change

Add `*.tsbuildinfo` to `.gitignore` (glob, not exact path) so both the current
`tsconfig.node.tsbuildinfo` and any future variants (e.g.
`tsconfig.app.tsbuildinfo`, `tsconfig.base.tsbuildinfo`) are ignored.

Place it in the "Node dependencies and build outputs" section alongside
`dist/` and `coverage/` — it is a build artefact.

## Files Modified

- `.gitignore` — add `*.tsbuildinfo` line

## Verification

1. `.gitignore` contains `*.tsbuildinfo` in the build-outputs section.
2. `git ls-files | rg tsbuildinfo` returns no matches (nothing currently
   tracked that the new rule would need to untrack). Confirmed 2026-04-17.
3. After `npm run build` in a clean checkout, `git status` shows no
   `*.tsbuildinfo` files as untracked.

## Risks

Low. Single-line `.gitignore` addition. No runtime, build, or test behaviour
changes.
