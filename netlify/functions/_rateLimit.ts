// In-memory sliding-window rate limiter.
//
// Limitation: state is per-instance only — not shared across Netlify
// function instances or cold starts. Entries are pruned lazily when the
// same key is touched; there is no TTL sweep. Adequate for casual flood
// protection (e.g. a single event) only.

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export const checkRateLimit = (
  key: string,
  now: number = Date.now()
): RateLimitResult => {
  const windowStart = now - WINDOW_MS;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS) {
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
};

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
