# GitHub Issue #139: fix ESLint 10 peer dependency conflict

**Issue:** [#139](https://github.com/denhamparry/djrequests/issues/139)
**Status:** Complete
**Date:** 2026-07-21

## Problem

Dependabot PR #138 updates the lint dependency chain for the `brace-expansion`
security bump, including `eslint` to 10.7.0 and `typescript-eslint` to 8.65.0.
The repo still pins `eslint-plugin-react-hooks` to `^5.1.0-rc.0`, which
resolves to 5.2.0 and only peers against ESLint through v9. A clean `npm ci`
therefore fails with `ERESOLVE` when the ESLint 10 dependency set is installed.

## Acceptance Criteria

- `npm ci` succeeds without `ERESOLVE` with the ESLint 10 dependency set.
- `npm run lint` passes.
- `npm run test:unit` passes.
- `npm run build` passes.
- The PR clearly closes issue #139 and notes that PR #138 can be superseded or
  rebased after this dependency set lands.

## Current State Analysis

- `package.json` currently declares:
  - `eslint`: `^9.7.0`
  - `eslint-plugin-react-hooks`: `^5.1.0-rc.0`
  - `typescript-eslint`: `^8.1.0`
- Current npm metadata confirms:
  - `eslint@10.7.0` is available.
  - `@eslint/js@10.0.1` is the current published package for the flat config
    recommended JS rules imported directly by `eslint.config.js`.
  - `typescript-eslint@8.65.0` peers against `eslint`
    `^8.57.0 || ^9.0.0 || ^10.0.0`.
  - `eslint-plugin-react-hooks@7.1.1` peers against `eslint` through `^10.0.0`.
- `eslint.config.js` imports `@eslint/js` directly and registers the
  `react-hooks` plugin object directly, but no `react-hooks/*` rules are
  enabled today. Validation should confirm the v7 default export still works in
  this config shape.
- `.github/dependabot.yml` only has the npm ecosystem commented out, so there is
  no active npm grouping to update as part of this fix.

## Implementation Steps

1. Update dev dependency ranges to match the installable ESLint 10 set:
   - `@eslint/js` to `^10.0.1`
   - `eslint` to `^10.7.0`
   - `typescript-eslint` to `^8.65.0`
   - `eslint-plugin-react-hooks` to `^7.1.1`
2. Regenerate `package-lock.json` with a normal npm install so the lockfile
   records the same dependency graph that CI will install.
3. Inspect `eslint.config.js` after install only if lint fails because the
   React Hooks plugin export shape changed.
4. Update this plan status and notes if actual changed files differ from the
   expected file list.

## Files Expected To Change

- `docs/plan/issues/139_fix_eslint_10_react_hooks_peer_dependency.md`
- `package.json`
- `package-lock.json`

## Validation Steps

```bash
npm ci
npm run lint
npm run test:unit
npm run build
```

## Implementation Notes

- Added `@eslint/js` as an explicit dev dependency because `eslint.config.js`
  imports it directly and ESLint 10 no longer made that import available
  transitively in this install.
- Regenerated `package-lock.json`; the resolved graph includes:
  - `@eslint/js@10.0.1`
  - `eslint@10.7.0`
  - `eslint-plugin-react-hooks@7.1.1`
  - `typescript-eslint@8.65.0`
  - `brace-expansion@5.0.7` through `minimatch@10.2.5`

## Validation Results

Confirmed on 2026-07-21:

```bash
npm ci
npm run lint
npm run test:unit
npm run build
```

All commands passed. `npm ci` reported npm's existing install-script approval
warning for `fsevents` and `msw`; it did not block install. Unit tests passed
with the repo's known jsdom `HTMLMediaElement.pause()` not-implemented notices.

## Risks And Open Questions

- `eslint-plugin-react-hooks` 7.x is a two-major upgrade from the currently
  resolved 5.2.0 package. The repo does not enable the plugin's rules today, so
  the main risk is plugin export compatibility with the current flat config.
- The `brace-expansion` security bump remains transitive through the updated
  lint dependency graph rather than a direct dependency. The lockfile must show
  the patched versions after regeneration.
