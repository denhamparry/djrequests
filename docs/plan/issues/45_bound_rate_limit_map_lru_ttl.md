# GitHub Issue #45: bound rate-limit Map with LRU / TTL sweep

**Issue:** [#45](https://github.com/denhamparry/djrequests/issues/45)
**Status:** Planning
**Date:** 2026-04-16

## Problem Statement

`netlify/functions/_rateLimit.ts` stores per-IP request timestamps in a
module-level `Map` and only prunes entries lazily (when the same key is touched
again via `checkRateLimit`). On a long-lived warm Netlify instance that sees
many unique client IPs, keys accumulate indefinitely and the Map grows
unbounded — a slow memory leak / DoS amplifier.

### Current Behavior

- `hits` (`Map<string, number[]>`) only shrinks when an existing key is revisited.
- Keys belonging to one-shot clients remain in memory forever (bounded only by
  the process lifetime of the Netlify instance).
- No upper bound on the number of tracked keys.

### Expected Behavior

- Map size is bounded under worst-case traffic (many unique IPs).
- Stale keys (no activity for ≥ `WINDOW_MS`) are periodically reclaimed.
- A hard ceiling (`MAX_KEYS`) provides defence-in-depth if the sweep is
  outpaced by burst traffic.
- Public behaviour of `checkRateLimit` is unchanged for existing clients.

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/_rateLimit.ts` — the limiter itself (55 lines). Module
  globals: `WINDOW_MS = 60_000`, `MAX_REQUESTS = 5`, `hits` Map.
- `netlify/functions/__tests__/_rateLimit.test.ts` — existing unit tests,
  already use `resetRateLimit()` in `beforeEach` and an injectable `now`.

### Related Context

- Issue #32 introduced the rate limiter; this issue is the bounded-memory
  follow-up flagged during that PR's code review.
- Current threat model (a single event) makes this non-urgent but worth doing
  while context is fresh.

## Solution Design

### Approach

Add a **periodic TTL sweep plus a hard `MAX_KEYS` cap with LRU-style
eviction**. This is cheaper and simpler than a full LRU (no doubly-linked
list), and matches the sliding-window semantics: any key whose newest timestamp
is older than `WINDOW_MS` is provably irrelevant.

Sweep cadence: run at most once per `SWEEP_INTERVAL_MS` (default: `WINDOW_MS`),
triggered opportunistically from `checkRateLimit`. No background timer — keeps
the function stateless-friendly and test-deterministic.

Eviction: when `hits.size > MAX_KEYS` after a sweep, drop oldest-first entries
until back under the cap. `Map` iteration order is insertion order in JS; to
approximate recency, re-insert on each touch (delete + set) so the most-recent
entries sit at the end. Iterating from the start then yields the
least-recently-used keys for eviction.

### Implementation

Module constants:

```ts
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const MAX_KEYS = 10_000;
const SWEEP_INTERVAL_MS = WINDOW_MS;

let lastSweepAt = 0;
```

Changes to `checkRateLimit`:

1. After computing `existing`, if the key is already present re-insert it
   (`hits.delete(key); hits.set(key, existing)`) so recency = insertion order.
2. Call `sweep(now)` once per invocation (it no-ops unless the interval has
   elapsed).

New internal helper:

```ts
const sweep = (now: number): void => {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  const cutoff = now - WINDOW_MS;
  for (const [key, timestamps] of hits) {
    const last = timestamps[timestamps.length - 1];
    if (last === undefined || last <= cutoff) hits.delete(key);
  }
  if (hits.size > MAX_KEYS) {
    const toDrop = hits.size - MAX_KEYS;
    let dropped = 0;
    for (const key of hits.keys()) {
      if (dropped >= toDrop) break;
      hits.delete(key);
      dropped += 1;
    }
  }
};
```

`resetRateLimit` also resets `lastSweepAt` to 0.

### Benefits

- Memory bounded to `O(MAX_KEYS)` regardless of unique-IP cardinality.
- No background timers / side-effects; sweep cost is amortised and capped.
- Preserves existing API surface and test contracts.

## Implementation Plan

### Step 1: Extend `_rateLimit.ts`

**File:** `netlify/functions/_rateLimit.ts`

**Changes:** add `MAX_KEYS`, `SWEEP_INTERVAL_MS`, `lastSweepAt`, the `sweep`
helper; re-insert keys on touch; invoke `sweep(now)` inside `checkRateLimit`;
update `resetRateLimit` to also zero `lastSweepAt`.

### Step 2: Extend tests

**File:** `netlify/functions/__tests__/_rateLimit.test.ts`

Add cases (keep using injected `now`):

- Sweep removes keys whose newest hit is older than `WINDOW_MS` once the
  sweep interval has elapsed.
- Sweep does NOT remove keys whose newest hit is within the window.
- When more than `MAX_KEYS` distinct keys are active, oldest-touched keys are
  evicted so `hits.size <= MAX_KEYS` (expose size via a test-only helper
  `_rateLimitSize()` or assert via behaviour — see Testing Strategy).
- Recency is refreshed on touch: a key touched recently survives eviction
  even if inserted early.

### Step 3: Run quality gates

```bash
npm run test:unit
npm run lint
```

## Testing Strategy

### Unit Testing

Prefer **behavioural assertions** over peeking at Map internals. Add a narrow
test-only export:

```ts
export const _rateLimitSizeForTests = (): number => hits.size;
```

(underscore prefix + `ForTests` suffix signals intent; not part of public API).

### Integration Testing

None needed — the limiter is internal to Netlify functions and has no new
external contract.

### Regression Testing

Existing tests in `_rateLimit.test.ts` must still pass unchanged; public
behaviour for ≤ `MAX_KEYS` clients is identical.

## Success Criteria

- [ ] `MAX_KEYS` cap enforced with LRU-style eviction.
- [ ] Stale keys pruned by periodic TTL sweep.
- [ ] Existing tests pass unchanged.
- [ ] New tests cover sweep, cap, recency-on-touch.
- [ ] `npm run lint` and `npm run test:unit` both green.

## Files Modified

1. `netlify/functions/_rateLimit.ts` — add sweep + cap + recency refresh.
2. `netlify/functions/__tests__/_rateLimit.test.ts` — new coverage for sweep
   and eviction.

## Related Issues and Tasks

### Depends On

- None.

### Related

- #32 — original rate-limit introduction (this is its follow-up).

## References

- [GitHub Issue #45](https://github.com/denhamparry/djrequests/issues/45)
- `netlify/functions/_rateLimit.ts`

## Notes

### Key Insights

- JS `Map` preserves insertion order, so delete-then-set cheaply emulates
  "touched most recently = latest position" — enough for eviction without a
  real LRU data structure.
- Sweeping opportunistically from `checkRateLimit` keeps the function
  side-effect-free and testable with an injected `now`, which matches the
  existing test style.

### Alternative Approaches Considered

1. **Full LRU with doubly-linked list** ❌ — more code, marginal benefit for
   this workload.
2. **`setInterval`-driven sweep** ❌ — adds background state that conflicts
   with the stateless-function model and complicates tests.
3. **TTL sweep + MAX_KEYS cap** ✅ — simple, bounded, testable.

### Best Practices

- Keep `MAX_KEYS` generous (10 000) so legitimate traffic never trips it; the
  sweep is the primary defence.
- Document the in-memory, per-instance nature of the limiter unchanged.
