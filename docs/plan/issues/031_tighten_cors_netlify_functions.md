---
name: Tighten CORS on Netlify functions
description: Restrict CORS on search and request functions to deployed origin
type: plan
status: Reviewed (Approved)
issue: 31
---

# Issue #31 — Tighten CORS on Netlify functions to deployed origin only

## Problem

Both `netlify/functions/search.ts:46` and `netlify/functions/request.ts:25`
emit `access-control-allow-origin: *`. Any third-party site can proxy iTunes
searches through our Netlify account or submit song requests to our Google
Form from a browser.

## Approach

Resolve the allowed origin at request time from the environment:

1. `ALLOWED_ORIGIN` env var — explicit config (preferred in production)
2. `process.env.URL` — Netlify auto-sets this to the primary deploy URL
3. `*` — final fallback so local `netlify dev` and tests keep working

A small shared helper avoids duplicating the resolution logic across both
functions. Put it in `netlify/functions/_cors.ts` (leading underscore keeps
Netlify from exposing it as a route — Netlify only deploys handlers that
export a `handler` function, so this is a defence-in-depth naming choice
rather than a strict requirement).

## Changes

### `netlify/functions/_cors.ts` (new)

Export:

- `resolveAllowedOrigin()` → reads `ALLOWED_ORIGIN`, then `URL`, else `*`
- `corsHeaders()` → returns the three `access-control-allow-*` headers with
  origin from `resolveAllowedOrigin()`

### `netlify/functions/search.ts`

- Import `corsHeaders` and use it in `jsonResponse`
- Add an `OPTIONS` branch to `handler` that returns 204 with
  `corsHeaders() + allow-methods: GET, OPTIONS` + `allow-headers: Content-Type`

### `netlify/functions/request.ts`

- Replace the module-level `corsHeaders` constant with a call to `corsHeaders()`
  inside `jsonResponse` and the `OPTIONS` branch

### Tests

- `netlify/functions/__tests__/search.test.ts` — add two tests:
  - `OPTIONS` returns 204 with the configured `access-control-allow-origin`
  - `GET` responses reflect `ALLOWED_ORIGIN` when set
- `netlify/functions/__tests__/request.test.ts` — add one test:
  - Responses reflect `ALLOWED_ORIGIN` when set (both on success and OPTIONS)

Use `beforeEach` to stub `process.env.ALLOWED_ORIGIN` and clear it in
`afterEach`.

### Docs

- `README.md` — add `ALLOWED_ORIGIN` to the env-var table/section
- `CLAUDE.md` — add `ALLOWED_ORIGIN` under "Environment Variables"

## Files Modified

- `netlify/functions/_cors.ts` (new)
- `netlify/functions/search.ts`
- `netlify/functions/request.ts`
- `netlify/functions/__tests__/search.test.ts`
- `netlify/functions/__tests__/request.test.ts`
- `README.md`
- `CLAUDE.md`

## Verification

1. `npm run lint`
2. `npm run test:unit` — all existing + new tests pass
3. Manually: `ALLOWED_ORIGIN=https://foo.example npm run dev`, hit
   `/.netlify/functions/search?term=test`, confirm header in response
