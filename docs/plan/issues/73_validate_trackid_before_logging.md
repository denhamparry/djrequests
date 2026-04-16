# GitHub Issue #73 (+ #72): harden trackId log formatting and broaden PII-negative coverage

**Issues:**

- [#73](https://github.com/denhamparry/djrequests/issues/73) — driver —
  validate/cap trackId length and charset before logging
- [#72](https://github.com/denhamparry/djrequests/issues/72) — folded in —
  extend PII-negative log test across all 5xx code paths

**Status:** Reviewed (Approved)
**Date:** 2026-04-16

## Problem Statement

Two nice-to-have follow-ups from the PR that landed #68 (track-ID structured
logging). Both touch the same file pair (`netlify/functions/request.ts` and
its test file), so they bundle into a single PR with cohesive scope.

### #73 — trackId is unbounded attacker-controlled input at the log boundary

`song.id` reaches the server from client JSON. Validation in `_validate.ts`
rejects non-strings and caps at 500 characters, but does **not** constrain
charset. Once #68 landed, `song.id` flows directly into
`formatLogContext(requestId, song.id)` and from there into `console.error`
lines.

Today this is low risk — stdout is plain text and no downstream sink
interprets the field. But if logs are later routed into a system that
interprets newlines or control chars (Logtail, Splunk, a rendered dashboard,
a JSON log pipeline), an unbounded attacker-controlled string becomes a
log-injection vector. Concrete examples:

- `song.id = "1\n[request] Google Form configuration error (requestId=deadbeef trackId=spoofed)"`
  — forges a second log line.
- `song.id = "a".repeat(10000)` — inflates log volume.
- `song.id = "\x1b[2Jevil"` — smuggles an ANSI escape through to a terminal
  viewer.

### #72 — PII-negative test only covers one of three 5xx sites

The regression test added in #68 (`does not include requester PII in
server-side error logs`) only exercises the `classifyFetchError` path via
`TypeError('fetch failed')`. Two other sites fire `console.error` after
validation with full `requester` in scope:

- Config-error branch (`[request] Google Form configuration error ...`)
- Upstream non-2xx branch (`[request] Google Form responded with status N ...`)

If a future refactor inadvertently added a requester field at either site,
CI would still pass. A parametrised test covering all three sites is a
one-time cost for permanent coverage.

### Current Behavior

- `formatLogContext(requestId, trackId)` returns
  `(requestId=X trackId=Y)` with no sanitisation of `trackId`.
- PII-negative test exists only for the fetch-error site.

### Expected Behavior

- `trackId` in the log line is capped at 64 characters and stripped of any
  characters that could break log-line structure.
- Every 5xx log site is covered by a PII-negative assertion (parametrised).

## Current State Analysis

### Relevant Code/Config

- `netlify/functions/request.ts:10-11` — `formatLogContext` helper. Single
  chokepoint for the fix.
- `netlify/functions/request.ts:128-131, 161-164, 172-174` — three
  `console.error` sites that call `formatLogContext`.
- `netlify/functions/_validate.ts:29-35` — `requireString` (length cap 500,
  no charset check). Deliberately left untouched: the defensive sanitisation
  is a log-boundary concern, not a request-validation concern (a long /
  unusual track ID shouldn't reject the submission, just not pollute logs).
- `netlify/functions/__tests__/request.test.ts:305-330` — existing
  `does not include requester PII in server-side error logs` test; only
  uses the network-error fixture.

### Related Context

- Issue #68 / PR added `trackId=` to every log line and the single-site
  PII-negative test. This work extends that hardening.
- PR #68 review (silent-failure-hunter / comment-analyzer) surfaced both
  follow-ups.

## Solution Design

### Approach

Two small, orthogonal changes in one PR:

1. **#73 fix** — add a private `sanitiseTrackIdForLog` helper applied inside
   `formatLogContext`. Allow only `[a-zA-Z0-9._-]`, replace anything else
   with `_`, cap length at 64. iTunes IDs (pure digits) pass through
   unchanged; pathological inputs are neutralised.
2. **#72 test** — rewrite the PII-negative test as `it.each` over three
   fixtures (config / network / upstream-5xx) so any future log-site that
   leaks a requester field fails at the nearest matching case.

### Trade-offs Considered

**Sanitisation location:**

1. **In `_validate.ts` (reject at boundary)** — Rejected. Rejecting a
   request because its track ID contains a colon would be user-hostile and
   change 500-char validator behaviour for a log-specific concern.
2. **In `formatLogContext` (log-time only)** — **Chosen.** Defensive exactly
   where the risk lives. Sanitised form is only used for logs; the unmodified
   ID still flows to the Google Form field as before.
3. **JSON-structured logging (quote/escape)** — Out of scope. Would require
   reshaping every log line and breaking existing test assertions.

**Charset policy:**

1. **Whitelist `[a-zA-Z0-9._-]`, replace others with `_`** — **Chosen.**
   Matches iTunes numeric IDs exactly; blocks every known log-injection
   vector (newlines, CR, null, ANSI ESC, spaces, parens, equals).
2. **Blacklist only control chars (`\x00-\x1f\x7f`)** — Rejected. Would let
   through `=`, `(`, `)`, and spaces, which could still confuse key=value
   log parsers.
3. **Full Unicode-aware identifier check** — Rejected. Over-engineered and
   slower; iTunes never returns non-ASCII IDs.

**Length cap:** 64 chars. iTunes IDs are ≤10 digits; 64 leaves headroom for
any provider-specific ID format without enabling log-volume abuse.

**Test parametrisation:** `it.each` over `{ scenario, arrange, expectedPrefix }`
fixtures — one test body, three cases. Clearer diff than three copy-pasted
tests.

### Implementation

#### Step 1: Add `sanitiseTrackIdForLog` and apply in `formatLogContext`

**File:** `netlify/functions/request.ts`

Replace the current `formatLogContext` block (lines 9-11):

```ts
// Cap length and strip chars outside a strict charset so attacker-controlled
// song.id values cannot inject newlines/ANSI/etc into structured log lines.
const MAX_LOG_TRACK_ID = 64;
const LOG_TRACK_ID_SAFE = /^[a-zA-Z0-9._-]+$/;
const sanitiseTrackIdForLog = (trackId: string): string => {
  const capped = trackId.slice(0, MAX_LOG_TRACK_ID);
  return LOG_TRACK_ID_SAFE.test(capped) ? capped : capped.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// Keep PII-free: only safe, non-identifying keys (requestId, trackId) belong here.
const formatLogContext = (requestId: string, trackId: string): string =>
  `(requestId=${requestId} trackId=${sanitiseTrackIdForLog(trackId)})`;
```

(Fast path `LOG_TRACK_ID_SAFE.test(capped)` avoids the replace pass for the
common iTunes-digit case.)

No changes to the three `console.error` call sites — the helper is the
single chokepoint.

#### Step 2: Add #73 unit tests

**File:** `netlify/functions/__tests__/request.test.ts`

Add a focused `describe('formatLogContext sanitisation', …)` block. Since
`formatLogContext` is module-private, test it via its observable effect on
the log line — force any 5xx branch and assert the emitted `trackId=` field.

Cases:

- `song.id = "1234567890"` → log contains `trackId=1234567890` (unchanged,
  fast path)
- `song.id = "a".repeat(200)` → log contains `trackId=aaaaaa...` truncated to
  64 chars (assert length via regex)
- `song.id = "1\n[request] spoof"` → log contains `trackId=1__request__spoof`
  (newline + space + `[` + `]` all replaced with `_`); assert no literal
  newline in the log line
- `song.id = "x=y(z)"` → log contains `trackId=x_y_z_` (`=`, `(`, `)` replaced)

#### Step 3: Parametrise #72 PII-negative coverage

**File:** `netlify/functions/__tests__/request.test.ts`

Delete the existing single-case `does not include requester PII in
server-side error logs` (lines 305-330) and replace with an `it.each` over
three scenarios:

```ts
type PIIScenario = {
  scenario: string;
  arrange: () => void;
};

const piiScenarios: PIIScenario[] = [
  {
    scenario: 'config-error branch',
    arrange: () => {
      delete process.env.GOOGLE_FORM_URL;
      delete process.env.VITE_GOOGLE_FORM_URL;
    }
  },
  {
    scenario: 'fetch network-error branch',
    arrange: () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    }
  },
  {
    scenario: 'upstream non-2xx branch',
    arrange: () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    }
  }
];

it.each(piiScenarios)(
  'does not include requester PII in server-side error logs ($scenario)',
  async ({ arrange }) => {
    arrange();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '99', title: 'T', artist: 'A' },
          requester: {
            name: 'Avery Secret',
            contact: 'avery@private.test',
            dedication: 'personal message'
          }
        })
      }),
      {} as any
    );

    const logLine = errorSpy.mock.calls[0][0] as string;
    expect(logLine).toContain('trackId=99');
    expect(logLine).not.toMatch(/Avery Secret/);
    expect(logLine).not.toMatch(/avery@private.test/);
    expect(logLine).not.toMatch(/personal message/);

    errorSpy.mockRestore();
  }
);
```

**Testing:**

```bash
npm run test:unit -- --run netlify/functions/__tests__/request.test.ts
npm run lint
```

### Benefits

- **#73:** neutralises log-injection at the source; iTunes IDs unaffected.
- **#72:** PII guardrail now symmetric across all three 5xx log sites.
- Cost: ~15 lines of production code, one helper, one parametrised test.

## Testing Strategy

### Unit Testing

- 4 new sanitisation cases (fast path, length cap, newline, symbol chars).
- 1 → 3 PII-negative cases (same test body, three scenarios).
- Existing 5 per-label log-line assertions remain green (digit IDs fast-path
  through the sanitiser and the formatted string is byte-identical to today).

### Regression Testing

- 200 success path: no sanitisation (not logged). Form POST body still
  receives the un-sanitised `song.id`.
- 400/429 paths: no log, no sanitisation.
- Client-facing response bodies unchanged.

## Success Criteria

- [ ] `sanitiseTrackIdForLog` helper + constants added to `request.ts`
- [ ] `formatLogContext` applies the sanitiser
- [ ] 4 new sanitisation tests (pass-through, length cap, newline, symbols)
- [ ] PII-negative test parametrised over 3 scenarios
- [ ] `npm run test:unit` passes
- [ ] `npm run lint` passes
- [ ] Pre-commit hooks pass
- [ ] Google Form POST body still sends the original `song.id` (unchanged)

## Files Modified

1. `netlify/functions/request.ts` — add sanitiser, wire into `formatLogContext`
2. `netlify/functions/__tests__/request.test.ts` — add 4 sanitisation tests,
   parametrise the PII-negative test over 3 scenarios

## Related Issues and Tasks

### Depends On

- Issue #68 — introduced `trackId=` in logs; this plan hardens it.

### Related

- Issue #72 — folded into this PR.

### Enables

- Future JSON-structured logging work has a single sanitisation chokepoint
  already in place.

## References

- [Issue #73](https://github.com/denhamparry/djrequests/issues/73)
- [Issue #72](https://github.com/denhamparry/djrequests/issues/72)
- Plan #68 — `docs/plan/issues/68_include_track_id_in_server_error_logs.md`

## Notes

### Key Insights

- Sanitisation at the log boundary (not at validation) keeps the Form POST
  body byte-identical to the submitted `song.id`, preserving whatever
  identifier the downstream Google Sheet / Doc trigger expects.
- The whitelist regex (`[a-zA-Z0-9._-]`) is the same set used by most log
  scrapers for identifier tokens, so sanitised IDs remain grep-friendly.

### Best Practices

- Fast-path with `.test()` before running `.replace()` — avoids a pass over
  the common-case string.
- One chokepoint (`formatLogContext`) — future logging changes land in one
  place.
