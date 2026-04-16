# GitHub Issue #51: tighten shared Requester.name to string (not optional)

**Issue:** [#51](https://github.com/denhamparry/djrequests/issues/51)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

The shared wire contract in `shared/types.ts` declares `Requester.name` as
optional (`name?: string`), but since PR #44 the Netlify function at
`netlify/functions/_validate.ts` requires it and types it as `string`. The
types have drifted: the server's runtime contract is stricter than the
compile-time contract the client relies on.

### Current Behavior

- `shared/types.ts` allows a caller to omit `requester.name`.
- If a future client call forgets to send `name`, TypeScript does not complain.
- The mistake only surfaces at runtime as a 400 response from
  `/.netlify/functions/request`.

### Expected Behavior

- `shared/types.ts` declares `name: string` as required.
- TypeScript rejects any call to `submitSongRequest` (or any other consumer)
  that constructs a `Requester` without `name`.
- Defence-in-depth runtime validation in `_validate.ts` remains unchanged.

## Current State Analysis

### Relevant Code/Config

- `shared/types.ts:14-18` — `Requester` type with `name?: string`.
- `netlify/functions/_validate.ts:29-35, 83-84` — `requireString` enforces
  `requester.name` at runtime via `ValidatedRequester.name: string`.
- `src/lib/googleForm.ts:7-10` — `submitSongRequest(song, details: Requester = {})`
  defaults `details` to `{}`, which becomes invalid once `name` is required.
- `src/App.tsx:39-54` — the only callsite of `submitSongRequest`, guarded by
  `hasName` (line 41) and always passes `{ name: trimmedName, ... }`.
- `apps-script/index.ts:77` — reads `"Requester Name"` from form submission;
  unaffected (server-side Apps Script, not TypeScript-coupled to shared types).

### Related Context

- Original issue #44 — added server-side requirement that `requester.name` be
  non-empty.
- PR review of #44 flagged this as a nice-to-have follow-up (hence #51).
- `ValidatedRequester` (a separately branded type in `_validate.ts`) is the
  post-validation shape. `Requester` is the pre-validation wire shape — this
  distinction stays intact.

## Solution Design

### Approach

Two coordinated changes:

1. Tighten `Requester.name` from optional to required in `shared/types.ts`.
2. Drop the `= {}` default in `submitSongRequest` (now structurally invalid)
   and require callers to pass a `Requester`.

The App.tsx callsite already satisfies the new signature, so no UI change is
needed.

### Implementation

**`shared/types.ts`**

```ts
export type Requester = {
  name: string;
  dedication?: string;
  contact?: string;
};
```

**`src/lib/googleForm.ts`**

```ts
export async function submitSongRequest(
  song: Song,
  details: Requester
): Promise<RequestResponse> {
  // ...unchanged body
}
```

### Benefits

- Moves part of the client↔server contract from runtime to compile time.
- Catches future regressions where a caller forgets to include `name`.
- Removes dead code (the `= {}` default is never hit — App.tsx always passes
  a populated `Requester`).
- No behaviour change for users; defence-in-depth validation remains.

## Implementation Plan

### Step 1: Tighten `Requester.name` in shared types

**File:** `shared/types.ts`

**Changes:**

- Change `name?: string;` to `name: string;`.
- Leave `dedication` and `contact` as optional.

**Testing:** `npm run lint && npx tsc -p tsconfig.app.json --noEmit`

### Step 2: Drop default parameter in `submitSongRequest`

**File:** `src/lib/googleForm.ts`

**Changes:**

- Replace `details: Requester = {}` with `details: Requester`.

**Testing:** `npm run lint && npx tsc -p tsconfig.app.json --noEmit`

### Step 3: Verify no other callsites regress

**Files checked:**

- `src/App.tsx` — always passes `{ name: trimmedName, dedication }`, guarded by
  `hasName` before calling. ✅
- Test files — no tests import `Requester`; `submitSongRequest` not mocked
  directly.

**Testing:** `npm run test:unit`

### Step 4: Full verification

**Testing:**

```bash
npm run lint
npm run test:unit
```

## Testing Strategy

### Unit Testing

- No new tests required: the change is purely a type tightening, and existing
  `_validate.test.ts` tests already cover runtime enforcement of
  `requester.name`.
- Existing Vitest suite must still pass unchanged.

### Integration Testing

**Test Case 1: TypeScript compile**

1. `npx tsc -p tsconfig.app.json --noEmit`
2. Expected: no errors (App.tsx callsite already supplies `name`).

**Test Case 2: App.tsx callsite**

1. Run `npm run test:unit`.
2. Expected: `SearchView.test.tsx` passes unchanged.

### Regression Testing

- Verify `submitSongRequest` still rejects empty strings at runtime via
  `_validate.ts` — existing test coverage is sufficient.
- Verify UI still disables submit when `hasName` is false — unchanged.

## Success Criteria

- [ ] `shared/types.ts` has `name: string` (required)
- [ ] `src/lib/googleForm.ts` `details` parameter has no default
- [ ] `npm run lint` passes
- [ ] `npm run test:unit` passes
- [ ] `npx tsc -p tsconfig.app.json --noEmit` passes
- [ ] Pre-commit hooks pass

## Files Modified

1. `shared/types.ts` — `Requester.name` becomes required (`name: string`)
2. `src/lib/googleForm.ts` — drop `= {}` default on `details` parameter

## Related Issues and Tasks

### Depends On

- #44 (landed) — introduced server-side requirement for `requester.name`

### Blocks

- None

### Related

- #49 — branded `ValidatedSong`/`ValidatedRequester` (complementary: this
  issue tightens the pre-validation wire type; #49 hardened the
  post-validation type)

### Enables

- Compile-time safety for any future client or integration test that
  constructs a `Requester`

## References

- [GitHub Issue #51](https://github.com/denhamparry/djrequests/issues/51)
- `shared/types.ts` — wire contract
- `netlify/functions/_validate.ts` — runtime validation

## Notes

### Key Insights

- The `= {}` default in `submitSongRequest` is already dead code: App.tsx
  guards on `hasName` and always supplies a populated object. Removing it
  surfaces this invariant in the type system.
- Runtime validation is the authoritative boundary; the type tightening is
  additive compile-time safety, not a replacement.

### Alternative Approaches Considered

1. **Keep `name?` optional, document the runtime requirement** ❌ — Leaves the
   types misleading and defers bugs to runtime 400 responses.
2. **Introduce a second type `ClientRequester` with `name` required** ❌ —
   Over-engineered for a two-field tightening; the shared type is small enough
   to reshape directly.
3. **Tighten `Requester.name` to required and drop dead default** ✅ — Minimal,
   surfaces invariant at compile time, matches server contract.

### Best Practices

- Keep shared wire types aligned with server-enforced runtime validation.
- Prefer removing dead defaults over preserving them when tightening a type.
