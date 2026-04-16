# GitHub Issue #33: Refactor — share Song/Track types and dedupe deriveFormResponseConfig call

**Issue:** [#33](https://github.com/denhamparry/djrequests/issues/33)
**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

Two code-quality items surfaced during review of earlier PRs:

### Current Behavior

1. **Duplicated Song/Track types.** The Song shape
   (`id`, `title`, `artist`, `album`, `artworkUrl`, `previewUrl`) is declared
   independently in multiple places:
   - `src/hooks/useSongSearch.ts` exports `Song`
   - `src/lib/googleForm.ts` imports `Song` from the hook (cross-layer import)
   - `netlify/functions/search.ts` declares an inline anonymous response-track
     type
   - `netlify/functions/_validate.ts` declares `ValidatedSong`, which mirrors
     the same shape
2. **`deriveFormResponseConfig()` awkwardly wrapped in an IIFE** in
   `netlify/functions/request.ts` (lines 104–110). The issue body described an
   older state where it was called twice; the current code only calls it once
   but wraps it in an unusual IIFE pattern that makes control flow harder to
   follow.

### Expected Behavior

1. A single `shared/types.ts` module exports `Song` and `Requester` types; all
   frontend and Netlify function code imports from there. No cross-layer
   imports (e.g. Netlify function importing from `src/`), no duplicate
   declarations.
2. `deriveFormResponseConfig()` is invoked once via a plain try/catch at the
   natural point in the handler, with no IIFE wrapping.

## Current State Analysis

### Relevant Code/Config

- **`shared/formFields.ts`** — already exists, proves the `shared/` directory
  is resolvable by both Vite (frontend) and esbuild (Netlify functions).
- **`src/hooks/useSongSearch.ts:3-10`** — declares and exports `Song`.
- **`src/lib/googleForm.ts:1`** — imports `Song` from the hook (wrong layer);
  also declares `SongRequestDetails` which duplicates the `Requester` shape.
- **`netlify/functions/search.ts:13-25`** — declares `SearchResponse` with an
  inline anonymous track array; the track shape matches `Song`.
- **`netlify/functions/_validate.ts:1-19`** — declares `ValidatedSong`,
  `ValidatedRequester`, `ValidatedRequest`. These represent the *validated*
  shape (required fields enforced), distinct from the wire shape. They should
  continue to exist for validator semantics but can extend the shared types
  where appropriate.
- **`netlify/functions/request.ts:104-110`** — IIFE that calls
  `deriveFormResponseConfig()` and returns either the config or the thrown
  error.

### Related Context

- Recent PRs (#32 tighten CORS, #31 request validation + rate limit) refactored
  the functions but did not dedupe types.
- No runtime/logic change intended — purely structural.

## Solution Design

### Approach

Introduce `shared/types.ts` as the single source of truth for the
frontend↔function contract. Keep validator-specific types (`Validated*`) local
to `_validate.ts` since they represent a post-validation guarantee, not the
wire shape.

Separately, flatten the IIFE in `request.ts` into a straightforward try/catch
at the handler's natural order.

### Implementation

1. **Create `shared/types.ts`** with:

   ```ts
   export type Song = {
     id: string;
     title: string;
     artist: string;
     album: string | null;
     artworkUrl: string | null;
     previewUrl: string | null;
   };

   export type Requester = {
     name?: string;
     dedication?: string;
     contact?: string;
   };
   ```

2. **Replace duplicate declarations** with imports from `shared/types`.
3. **Flatten IIFE** in `request.ts`:

   ```ts
   let formConfig;
   try {
     formConfig = deriveFormResponseConfig();
   } catch (configError) {
     return jsonResponse(500, {
       error: configError instanceof Error ? configError.message : 'Configuration error'
     });
   }
   ```

### Benefits

- Song shape changes require editing one file, not four.
- No cross-layer imports (Netlify function importing from `src/`).
- `request.ts` handler reads top-to-bottom without an IIFE detour.

## Implementation Plan

### Step 1: Create shared types module

**File:** `shared/types.ts` (new)

Export `Song` and `Requester` as shown above. Include a short comment noting
this is the client↔function wire contract.

**Testing:** No test yet; verified by step 2 compilation.

### Step 2: Update `src/hooks/useSongSearch.ts`

**File:** `src/hooks/useSongSearch.ts`

Remove local `Song` declaration, re-export from the shared module:

```ts
import type { Song } from '../../shared/types';
export type { Song };
```

Rationale for re-export: keeps existing `import { Song } from '.../useSongSearch'`
callers working without churn; we migrate them in step 3.

**Testing:** `npm run lint`, `npm run test:unit` (hook tests still pass).

### Step 3: Update `src/lib/googleForm.ts`

**File:** `src/lib/googleForm.ts`

- Import `Song` and `Requester` from `shared/types` instead of the hook.
- Replace local `SongRequestDetails` with `Requester`.

```ts
import type { Song, Requester } from '../../shared/types';

export async function submitSongRequest(
  song: Song,
  details: Requester = {}
): Promise<{ message?: string }> { /* unchanged body */ }
```

**Testing:** `npm run lint`, unit tests for `submitSongRequest` if any, plus
`npm run test:e2e` smoke test.

### Step 4: Update `netlify/functions/search.ts`

**File:** `netlify/functions/search.ts`

Replace inline `SearchResponse.tracks` anonymous type with `Song[]`:

```ts
import type { Song } from '../../shared/types';

type SearchResponse = {
  tracks: Song[];
  message?: string;
  error?: string;
  code?: 'upstream_unavailable';
};
```

Keep `ITunesTrack` (iTunes API response shape — distinct from our normalised
wire shape).

**Testing:** `npm run test:unit` (search function tests cover mapping).

### Step 5: Update `netlify/functions/request.ts`

**File:** `netlify/functions/request.ts`

1. Flatten the IIFE at lines 104–110 into a plain try/catch immediately after
   validation succeeds.
2. Optionally import `Song`/`Requester` from `shared/types` for any explicit
   type annotations (the handler currently relies on `validation.value`
   destructuring so this may be a no-op).

**Testing:** `npm run test:unit` — existing `request.test.ts` covers the
`Google Form URL not configured` error path; ensure it still returns 500.

### Step 6: Clean up `src/App.tsx` if needed

**File:** `src/App.tsx`

`App.tsx` currently gets `song` via destructuring from `results` (type
inferred). No explicit type import is needed, but verify nothing broke.

**Testing:** `npm run test:e2e`.

### Step 7: Verification

Run the full validation suite:

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

## Testing Strategy

### Unit Testing

- All existing unit tests must continue to pass without modification (pure
  type refactor — no behaviour change).
- Type-only refactor should not require new tests. If any test file has a
  duplicate Song type declaration, update it to import from `shared/types`.

### Integration Testing

**Test Case 1: Search still returns normalised tracks**

1. Run `npm run test:unit` against `netlify/functions/__tests__/search.test.ts`
2. Expected: all existing assertions pass.

**Test Case 2: Request submission wiring unchanged**

1. Run `npm run test:unit` against `netlify/functions/__tests__/request.test.ts`
2. Expected: missing-env-var path still returns 500; happy path still 200.

**Test Case 3: E2E smoke**

1. Run `npm run test:e2e`
2. Expected: Playwright flow (search → select → request modal) passes.

### Regression Testing

- `npm run build` — Vite build must succeed (catches TS path-resolution errors
  between `src/` and `shared/`).
- Manually verify no cross-layer import remains: grep for
  `from '../hooks/useSongSearch'` in `src/lib/` or `netlify/`.

## Success Criteria

- [ ] `shared/types.ts` created with `Song` and `Requester` exports
- [ ] `src/hooks/useSongSearch.ts` re-exports `Song` from shared
- [ ] `src/lib/googleForm.ts` imports `Song` and `Requester` from shared; no
      import from `src/hooks/`
- [ ] `netlify/functions/search.ts` uses `Song[]` in response type
- [ ] `netlify/functions/request.ts` has no IIFE around `deriveFormResponseConfig`
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes
- [ ] `npm run test:e2e` passes
- [ ] `npm run build` succeeds

## Files Modified

1. `shared/types.ts` — new file, exports `Song` and `Requester`
2. `src/hooks/useSongSearch.ts` — import and re-export `Song` from shared
3. `src/lib/googleForm.ts` — import `Song`/`Requester` from shared, drop
   `SongRequestDetails`
4. `netlify/functions/search.ts` — use `Song` in `SearchResponse`
5. `netlify/functions/request.ts` — flatten IIFE; optionally import shared
   types

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- #32 — harden request (validation + rate limit) — recently refactored
  `request.ts`; made the IIFE awkward.
- #31 — tighten CORS — touched same file.

### Enables

- Future Song-shape changes (e.g. adding `duration`, `genre`) become a
  one-file edit.

## References

- [GitHub Issue #33](https://github.com/denhamparry/djrequests/issues/33)
- `shared/formFields.ts` — precedent for the `shared/` pattern

## Notes

### Key Insights

- The issue's "called twice" description is outdated — the duplication was
  removed in PR #32, but the IIFE wrapping remained. This plan addresses the
  residual awkwardness rather than the literal (stale) complaint.
- `Validated*` types in `_validate.ts` are intentionally distinct — they
  represent the validator's post-check guarantees (trimmed strings,
  enforced required fields). Keep them local.

### Alternative Approaches Considered

1. **Move types into `netlify/functions/_types.ts`** — ❌ Netlify functions
   can't easily be imported from `src/` code; the `shared/` dir is the
   established neutral ground.
2. **Inline types per file (status quo)** — ❌ Drift risk grows with each
   feature touch; the issue explicitly calls this out.
3. **Shared module in `shared/types.ts`** — ✅ Chosen; mirrors existing
   `shared/formFields.ts` convention.

### Best Practices

- Keep validator types (`_validate.ts`) local — they represent a different
  layer (post-validation, not wire shape).
- Prefer re-exports over mass import-site edits when the shared module is
  first introduced (reduces diff noise).

## Plan Review

**Reviewer:** Claude Code (workflow-research-plan)
**Review Date:** 2026-04-16
**Original Plan Date:** 2026-04-16

### Review Summary

- **Overall Assessment:** Approved
- **Confidence Level:** High
- **Recommendation:** Proceed to implementation

### Strengths

- Plan correctly identifies that the issue body is partially stale: the
  duplicate `deriveFormResponseConfig()` call was already removed in PR #32.
  Plan addresses the remaining residual awkwardness (IIFE wrapping) rather
  than inventing a non-existent duplicate.
- Correctly scopes `Validated*` types as a distinct layer (post-validation
  guarantees) rather than forcing them into the shared module.
- Uses the established `shared/` pattern (precedent: `shared/formFields.ts`),
  so no tsconfig or bundler changes are needed — relative imports already work
  for both Vite (frontend) and Netlify function esbuild.
- Re-export strategy in `useSongSearch.ts` (step 2) reduces import-site churn.

### Gaps Identified

1. **Gap:** Plan does not mention `src/lib/googleForm.ts`'s `SongRequestDetails`
   is currently `{ name?: string; dedication?: string; contact?: string }`
   (all optional) whereas `_validate.ts`'s `ValidatedRequester` uses
   `string | null`. Plan's proposed `Requester` mirrors the wire shape
   (optional strings), so `googleForm.ts` aligns. Keep this in mind — do not
   accidentally replace `SongRequestDetails` with `ValidatedRequester`.
   - **Impact:** Low (caught by TS if done wrong)
   - **Recommendation:** Document in implementation that `Requester` is the
     pre-validation wire shape.

2. **Gap:** No explicit check on test files. A grep confirmed no duplicate
   `Song`/`Track`/`Requester` type declarations exist in `__tests__/`
   directories — tests rely on inline objects. No action needed.
   - **Impact:** None
   - **Recommendation:** Skip.

### Edge Cases Not Covered

1. **Edge Case:** `tsconfig.app.json` sets `"include": ["src"]`. Does it
   compile `shared/types.ts`?
   - **Current Plan:** Does not explicitly address.
   - **Verified:** Relative imports pull the referenced file into the compile
     graph regardless of `include` (which only narrows the root file set).
     The existing `shared/formFields.ts` import from `netlify/functions/` and
     tests proves this works in practice.
   - **Recommendation:** No change needed.

### Alternatives Considered (Review)

1. **Alternative: Put shared types in `netlify/functions/_types.ts`.**
   - **Pros:** Keeps function concerns in `netlify/`.
   - **Cons:** Frontend can't import cleanly from Netlify function dir; creates
     the same cross-layer problem in reverse.
   - **Verdict:** Plan's `shared/` choice is correct.

### Risks and Concerns

1. **Risk:** Frontend tests may break if `useSongSearch.ts` re-export misses a
   downstream consumer.
   - **Likelihood:** Low
   - **Impact:** Low (TS compile fails loudly)
   - **Mitigation:** Plan already includes `npm run test:unit` and
     `npm run build` in success criteria.

### Required Changes

None.

### Optional Improvements

- [ ] In step 5 (`request.ts`), initialise `formConfig` with an explicit type
      annotation to make the control-flow obvious:
      `let formConfig: ReturnType<typeof deriveFormResponseConfig>;`

### Verification Checklist

- [x] Solution addresses root cause identified in GitHub issue
- [x] All acceptance criteria from issue are covered
- [x] Implementation steps are specific and actionable
- [x] File paths and code references are accurate
- [x] Security implications considered (no behaviour change — N/A)
- [x] Performance impact assessed (type-only refactor — no runtime impact)
- [x] Test strategy covers critical paths (existing tests cover behaviour)
- [x] Documentation updates planned (none needed — internal refactor)
- [x] Related issues/dependencies identified (#31, #32)
- [x] Breaking changes documented (none — internal types only)

### Status Update

**Plan status:** Reviewed (Approved)
