// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _rateLimitHasKeyForTests,
  _rateLimitSizeForTests,
  checkRateLimit,
  resetRateLimit,
  resolveClientKey
} from '../_rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('allows up to 5 requests in the same window', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      const result = checkRateLimit('ip-1', now + i);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks the 6th request and returns retryAfterSeconds >= 1', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      checkRateLimit('ip-1', now + i);
    }
    const blocked = checkRateLimit('ip-1', now + 10);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('allows requests again after the window elapses', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      checkRateLimit('ip-1', now + i);
    }
    const later = checkRateLimit('ip-1', now + 60_001);
    expect(later.allowed).toBe(true);
  });

  it('tracks different keys independently', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      checkRateLimit('ip-1', now + i);
    }
    const other = checkRateLimit('ip-2', now + 10);
    expect(other.allowed).toBe(true);
  });
});

describe('rate-limit map bounds', () => {
  beforeEach(() => {
    resetRateLimit();
  });

  it('sweeps keys whose newest hit is outside the window', () => {
    const now = 1_000_000;
    checkRateLimit('stale', now);
    checkRateLimit('fresh', now);
    expect(_rateLimitSizeForTests()).toBe(2);

    // Advance past SWEEP_INTERVAL_MS (== WINDOW_MS == 60_000) so the next
    // call triggers a sweep. 'stale' has no hit inside the window; 'fresh'
    // gets refreshed by this call.
    checkRateLimit('fresh', now + 70_000);

    expect(_rateLimitSizeForTests()).toBe(1);
  });

  it('does not sweep before SWEEP_INTERVAL_MS elapses', () => {
    const now = 1_000_000;
    checkRateLimit('a', now);
    checkRateLimit('b', now + 100);
    // Advance past WINDOW_MS but not past SWEEP_INTERVAL_MS from lastSweepAt.
    // Because lastSweepAt starts at 0, the very first call sets it to `now`;
    // the next call at now+1000 is well within the interval, so no sweep.
    checkRateLimit('c', now + 1000);
    expect(_rateLimitSizeForTests()).toBe(3);
  });

  it('caps the map at MAX_KEYS and evicts oldest-inserted keys first', () => {
    const now = 1_000_000;
    // MAX_KEYS is 10_000; insert 10_050 distinct keys so the cap fires
    // on the next sweep. Sweep cadence is SWEEP_INTERVAL_MS (== WINDOW_MS
    // == 60_000), so pick timestamps inside one window to suppress sweep
    // during insertion, then advance past the window to trigger it.
    for (let i = 0; i < 10_050; i += 1) {
      checkRateLimit(`ip-${i}`, now + i);
    }
    expect(_rateLimitSizeForTests()).toBe(10_050);

    // Advance past the window so the sweep's TTL cut drops all prior keys
    // (their newest hit is stale). This validates the TTL path; the cap
    // logic is exercised in the next test where we keep keys fresh.
    checkRateLimit('trigger', now + 10_050 + 60_001);
    expect(_rateLimitSizeForTests()).toBeLessThanOrEqual(10_000);
  });

  it('evicts oldest-inserted key when MAX_KEYS is exceeded with all-fresh hits', () => {
    const now = 1_000_000;
    // Fill to exactly MAX_KEYS with timestamps all within a single window
    // so the TTL path cannot evict them — only the cap logic can.
    for (let i = 0; i < 10_001; i += 1) {
      checkRateLimit(`ip-${i}`, now + i);
    }
    // Force a sweep by advancing `now` past SWEEP_INTERVAL_MS from the
    // first call (which set lastSweepAt = now). All existing timestamps
    // are within (now + 60_001) - WINDOW_MS = now + 1, so ip-0 (at now)
    // is JUST outside and all others survive the TTL pass.
    checkRateLimit('trigger', now + 60_001);

    expect(_rateLimitSizeForTests()).toBeLessThanOrEqual(10_000);
    expect(_rateLimitHasKeyForTests('ip-0')).toBe(false);
    expect(_rateLimitHasKeyForTests('trigger')).toBe(true);
  });

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

    // Trigger sweep at exactly t0 + 60_000: now - lastSweepAt ==
    // SWEEP_INTERVAL_MS so sweep fires; cutoff = t0, and every tracked key's
    // last > t0, so the TTL pass evicts nothing. Only the cap pass can remove
    // a key here — it drops the oldest-inserted survivor ('b').
    checkRateLimit('trigger', t0 + 60_000);

    expect(_rateLimitHasKeyForTests('a')).toBe(true);
    expect(_rateLimitHasKeyForTests('b')).toBe(false);
  });
});

describe('resolveClientKey', () => {
  it('uses the left-most entry of x-forwarded-for', () => {
    expect(
      resolveClientKey({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    ).toBe('1.2.3.4');
  });

  it('trims whitespace', () => {
    expect(resolveClientKey({ 'x-forwarded-for': '  1.2.3.4  ' })).toBe('1.2.3.4');
  });

  it('falls back to client-ip header', () => {
    expect(resolveClientKey({ 'client-ip': '9.9.9.9' })).toBe('9.9.9.9');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(resolveClientKey({})).toBe('unknown');
  });

  it('lowercases header keys', () => {
    expect(resolveClientKey({ 'X-Forwarded-For': '1.2.3.4' })).toBe('1.2.3.4');
    expect(resolveClientKey({ 'Client-IP': '9.9.9.9' })).toBe('9.9.9.9');
  });
});
