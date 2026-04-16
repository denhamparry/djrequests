// In-memory sliding-window rate limiter.
//
// Limitation: state is per-instance only — not shared across Netlify
// function instances or cold starts. Adequate for casual flood protection
// (e.g. a single event) only.
//
// Memory bound: opportunistic TTL sweep (once per WINDOW_MS) drops keys
// whose newest hit is outside the window. A MAX_KEYS ceiling provides
// defence-in-depth if a burst outpaces the sweep; recency is refreshed on
// every touch (delete + set) so Map insertion order yields LRU eviction.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const MAX_KEYS = 10_000;
const SWEEP_INTERVAL_MS = WINDOW_MS;

const hits = new Map<string, number[]>();
let lastSweepAt = 0;

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

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export const checkRateLimit = (
  key: string,
  now: number = Date.now()
): RateLimitResult => {
  sweep(now);

  const windowStart = now - WINDOW_MS;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  hits.delete(key);

  if (existing.length >= MAX_REQUESTS) {
    hits.set(key, existing);
    const retryAfterMs = existing[0] + WINDOW_MS - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }

  existing.push(now);
  hits.set(key, existing);
  return { allowed: true };
};

export const resetRateLimit = (): void => {
  hits.clear();
  lastSweepAt = 0;
};

export const _rateLimitSizeForTests = (): number => hits.size;

export const _rateLimitHasKeyForTests = (key: string): boolean =>
  hits.has(key);

export const resolveClientKey = (
  headers: Record<string, string | undefined>
): string => {
  const normalised: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalised[key.toLowerCase()] = value;
  }

  const forwarded = normalised['x-forwarded-for'];
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return normalised['client-ip'] ?? 'unknown';
};
