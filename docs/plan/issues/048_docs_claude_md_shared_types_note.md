# GitHub Issue #48: docs — update CLAUDE.md note about shared types

**Issue:** [#48](https://github.com/denhamparry/djrequests/issues/48)
**Status:** Reviewed (Approved)
**Branch:** denhamparry.co.uk/feat/gh-issue-048
**Date:** 2026-04-16

## Problem

`CLAUDE.md` line 249 in the "File Structure Notes" section states:

> **Shared types** - Interfaces duplicated in functions/frontend due to Netlify isolation

This was disproven by PR #47 (issue #33). `shared/types.ts` now hosts `Song`
and `Requester`, imported from both `src/` and `netlify/functions/`. The
Netlify bundler (esbuild) pulls in `shared/` transitively, so there is no
isolation problem. The stale note will mislead future contributors into
duplicating types unnecessarily.

## Change

Replace the single bullet in `CLAUDE.md` under `## File Structure Notes`:

- Before: `**Shared types** - Interfaces duplicated in functions/frontend due to Netlify isolation`
- After: describe `shared/` as the single source of truth for cross-layer
  types (`Song`, `Requester`), noting that esbuild bundles `shared/` files
  transitively for Netlify functions.

## Files Modified

- `CLAUDE.md` — rewrite the "Shared types" bullet in "File Structure Notes"

## Acceptance Criteria

- Bullet no longer claims types are duplicated.
- Bullet references `shared/types.ts` and the esbuild bundling behaviour.
- No other sections altered.

## Review Summary

**Overall Assessment:** Approved

Trivial documentation-only change. No code paths, tests, or runtime behaviour
affected. Risk is limited to accuracy of the new wording, which matches the
current state of `shared/types.ts`. Proceed directly to implementation.

## Status

Complete
