# GitHub Issue #56: test(rate-limit): add direct test for recency-refresh-on-touch invariant

**Issue:** [#56](https://github.com/denhamparry/djrequests/issues/56)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

`netlify/functions/_rateLimit.ts` uses `hits.delete(key); hits.set(key, …)` on
every touch so that `Map` insertion order approximates LRU recency. When
`MAX_KEYS` is exceeded, the cap eviction drops oldest-inserted keys first.

The existing suite only asserts that the **first-inserted** key (`ip-0`) is
evicted when the cap fires (`_rateLimit.test.ts:104-120`). Nothing asserts that
a **touched** key moves to the tail and therefore survives eviction. A refactor
that removed the `delete` before `set` would silently break the LRU invariant
while every existing test still passes.

### Current Behavior

- `checkRateLimit` (lines 45-68) always calls `hits.delete(key)` before
  `hits.set(key, existing)` — this moves the key to the Map tail.
- Tests cover TTL eviction and cap eviction of the first-inserted key.
- No test distinguishes "oldest by insertion" from "oldest by recency".

### Expected Behavior

A regression gate test asserting that after a touch, the touched key moves
ahead of an earlier-inserted key in cap-eviction order.

## Current State Analysis

### Relevant Code/Config

- **`netlify/functions/_rateLimit.ts:45-68`** — `checkRateLimit`; the
  `hits.delete(key)` on line 54 is the recency-refresh mechanism.
- **`netlify/functions/_rateLimit.ts:20-39`** — `sweep`; TTL pass drops keys
  whose `last <= cutoff`, then cap pass drops oldest-inserted until size
  ≤ `MAX_KEYS`.
- **`netlify/functions/__tests__/_rateLimit.test.ts:86-120`** — existing cap
  tests; none touches a key to verify recency refresh.

### Flaw in the Issue's Suggested Test

The issue suggests:

```ts
checkRateLimit('a', now);
checkRateLimit('b', now + 1);
checkRateLimit('a', now + 2);
// …fill 9_999 ip-* keys…
checkRateLimit('trigger', now + 60_001);
expect(_rateLimitHasKeyForTests('a')).toBe(true);
expect(_rateLimitHasKeyForTests('b')).toBe(false);
```

At `trigger` time, sweep fires with `cutoff = now + 60_001 - 60_000 = now + 1`.
`'b'` has `last = now + 1`, and the TTL condition is `last <= cutoff` — so TTL
deletes `'b'` **regardless of insertion order**. After TTL, `hits.size = 10_000`
so the cap logic never fires. The test passes even if the `delete` before `set`
is removed — it doesn't actually gate the invariant it claims to protect.

### Related Context

- Enhancement from PR #55 review, closing original issue #45.
- `_rateLimitHasKeyForTests` / `_rateLimitSizeForTests` helpers already exist
  for this kind of assertion.

## Solution Design

### Approach

Add a single Vitest case inside the existing `describe('rate-limit map
bounds', …)` block that forces the **cap path** (not the TTL path) to perform
the eviction, and assert that the touched key survives while the untouched
earlier-inserted key is evicted.

Achieve this by choosing timestamps where:

1. The first call sets `lastSweepAt = t0`.
2. All subsequent setup calls stay inside `[t0, t0 + 60_000)` so no early
   sweep fires.
3. The trigger call lands at exactly `t0 + 60_000` so `now - lastSweepAt ==
   SWEEP_INTERVAL_MS` fires a sweep with `cutoff = t0`. Every touched key has
   `last > t0`, so **TTL evicts nothing**.
4. Pre-sweep `hits.size = 10_001 > MAX_KEYS`, so the cap pass drops exactly
   the oldest-inserted key.

With recency refresh intact, insertion order after touching `'a'` is
`[b, a, ip-0, …, ip-9998]`, and the cap drops `'b'`. Without it, order stays
`[a, b, …]` and the cap drops `'a'` — failing the assertion.

### Implementation

Add this test immediately after the existing cap test at
`_rateLimit.test.ts:104-120`, keeping the `describe('rate-limit map bounds',
…)` grouping:

```ts
it('refreshes recency on touch: touched key survives cap eviction', () => {
  const t0 = 1_000_000;

  // First call sets lastSweepAt = t0. All subsequent setup stays inside
  // [t0, t0 + 60_000) so no early sweep fires.
  checkRateLimit('a', t0);
  checkRateLimit('b', t0 + 1);
  // Touch 'a' — with delete-before-set, this moves 'a' to the Map tail.
  // Insertion order becomes: b, a.
  checkRateLimit('a', t0 + 2);

  // Fill 9_999 fresh keys so size = 10_001 (a, b, plus 9_999 ip-*).
  for (let i = 0; i < 9_999; i += 1) {
    checkRateLimit(`ip-${i}`, t0 + 3 + i);
  }
  expect(_rateLimitSizeForTests()).toBe(10_001);

  // Trigger sweep at exactly t0 + 60_000: now - lastSweepAt == SWEEP_INTERVAL_MS
  // so sweep fires; cutoff = t0, and every tracked key's last > t0, so the
  // TTL pass evicts nothing. Only the cap pass can remove a key here.
  checkRateLimit('trigger', t0 + 60_000);

  expect(_rateLimitHasKeyForTests('a')).toBe(true);
  expect(_rateLimitHasKeyForTests('b')).toBe(false);
});
```

### Benefits

- Detects any refactor that removes `hits.delete(key)` before `hits.set(…)` on
  the touch path.
- Complements the existing "evicts oldest-inserted key" test rather than
  replacing it — that test still pins the baseline cap ordering for
  never-touched keys.
- Uses only timestamps already exposed by the existing test helpers; no
  production-code changes needed.

## Implementation Plan

### Step 1: Add the recency-refresh test

**File:** `netlify/functions/__tests__/_rateLimit.test.ts`

**Changes:** append the new `it(…)` block after line 120 (end of the existing
cap-eviction test), inside the `describe('rate-limit map bounds', …)` block.
Do not modify existing tests.

**Testing:**

```bash
npx vitest run netlify/functions/__tests__/_rateLimit.test.ts
```

Expected: all existing tests still pass, plus the new one passes.

### Step 2: Regression verification

Temporarily comment out `hits.delete(key);` on `_rateLimit.ts:54` and re-run:

```bash
npx vitest run netlify/functions/__tests__/_rateLimit.test.ts
```

Expected: the new test fails with `expect(_rateLimitHasKeyForTests('a')).toBe(true)`
receiving `false` (and/or `'b'` still present). Existing tests still pass.

Restore the `delete` line. This step is a one-off local validation — it is not
committed.

## Testing Strategy

### Unit Testing

- Vitest-only change, runs via `npm run test:unit`.
- Uses existing `_rateLimitHasKeyForTests` / `_rateLimitSizeForTests` helpers
  and `resetRateLimit` (already called in the block's `beforeEach`).

### Integration Testing

N/A — pure in-memory module test; no fetch / network / MSW interaction.

### Regression Testing

- Run full test suite (`npm run test:unit`) to confirm no side effects.
- Verify the test fails when `hits.delete(key)` on line 54 of
  `_rateLimit.ts` is removed (manual validation from Step 2 above).

## Success Criteria

- [ ] New test `refreshes recency on touch: touched key survives cap eviction`
      added to `_rateLimit.test.ts` inside the existing `describe('rate-limit
      map bounds', …)` block.
- [ ] `npm run test:unit` passes with the new test green.
- [ ] Test fails if `hits.delete(key)` is removed from `checkRateLimit`
      (manually verified locally).
- [ ] No changes to production code (`netlify/functions/_rateLimit.ts`).
- [ ] Pre-commit hooks pass.

## Files Modified

1. `netlify/functions/__tests__/_rateLimit.test.ts` — add one `it(…)` block
   asserting recency refresh on touch.

## Related Issues and Tasks

### Depends On

None.

### Blocks

None.

### Related

- #45 — original rate-limiter issue.
- #55 — PR that added the rate limiter and surfaced this gap.

### Enables

Safe future refactors of the touch path (e.g. consolidating the two
`hits.set(…)` call sites) without risking silent LRU regression.

## References

- [GitHub Issue #56](https://github.com/denhamparry/djrequests/issues/56)
- `netlify/functions/_rateLimit.ts` (lines 20-68)
- `netlify/functions/__tests__/_rateLimit.test.ts` (existing cap tests
  lines 86-120)

## Notes

### Key Insights

- The issue's suggested timestamps trigger **TTL** eviction of `'b'`, not cap
  eviction, so the suggested test would pass even with a broken invariant.
  Using `t0 + 60_000` exactly as the trigger (instead of `t0 + 60_001`)
  shifts `cutoff` from `now + 1` to `t0`, so every touched key survives TTL
  and only the cap pass can remove anything.
- `Map.set(existingKey, …)` preserves insertion position, so `delete` before
  `set` is the only mechanism moving a key to the tail.
- The cap pass drops `hits.size - MAX_KEYS` keys — with a size of `10_001`
  we evict exactly one (the oldest), which is what the assertion targets.

### Alternative Approaches Considered

1. **Adopt the issue's test verbatim** — ❌ rejected: the TTL path, not the
   cap path, evicts `'b'`, so the test doesn't gate the invariant.
2. **Switch the limiter to an explicit LRU (e.g. a linked list)** — ❌ out of
   scope for a nice-to-have test; production code is fine as-is.
3. **Chosen:** add one targeted cap-path test with timestamps that keep every
   key inside the TTL window, forcing the cap pass to do the eviction ✅.

### Best Practices

- Keep the new test in the `'rate-limit map bounds'` block so related cases
  are co-located and share `beforeEach(resetRateLimit)`.
- Comment the timestamp choice in the test body so future readers understand
  why `t0 + 60_000` (not `+60_001`) is load-bearing.
