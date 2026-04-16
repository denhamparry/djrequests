// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
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
