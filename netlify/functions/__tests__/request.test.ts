// @vitest-environment node
import type { Handler } from '@netlify/functions';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handler as requestHandler } from '../request';
import { FORM_FIELD_IDS } from '../../../shared/formFields';
import { resetRateLimit } from '../_rateLimit';

const handler = requestHandler as Handler;

const makeEvent = (overrides: Record<string, unknown> = {}) =>
  ({
    httpMethod: 'POST',
    headers: { 'x-forwarded-for': '1.1.1.1' },
    ...overrides
  }) as any;

describe('request function', () => {
  const fetchMock = vi.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    resetRateLimit();
    vi.stubGlobal('fetch', fetchMock);
    process.env = {
      ...originalEnv,
      VITE_GOOGLE_FORM_URL:
        'https://example.com/prefill?fvv=1&entry.1111111111=demo&entry.2222222222=demo&submit=Submit'
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    process.env = originalEnv;
  });

  it('rejects non-POST requests', async () => {
    const response = await handler({ httpMethod: 'GET' } as any, {} as any);

    expect(response.statusCode).toBe(405);
  });

  it('returns 400 when song payload is missing', async () => {
    const response = await handler(
      makeEvent({ body: JSON.stringify({}) }),
      {} as any
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/song information/i);
  });

  it('returns 400 when song.id is missing', async () => {
    const response = await handler(
      makeEvent({
        body: JSON.stringify({ song: { title: 'T', artist: 'A' } })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('song.id is required');
  });

  it('returns 400 when song.artist is a number', async () => {
    const response = await handler(
      makeEvent({
        body: JSON.stringify({ song: { id: '1', title: 'T', artist: 42 } })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('song.artist is required');
  });

  it('submits to the Google Form with normalized payload', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: {
            id: '123',
            title: 'Digital Love',
            artist: 'Daft Punk',
            album: 'Discovery',
            artworkUrl: 'https://example.com/art.jpg',
            previewUrl: 'https://example.com/preview.m4a'
          },
          requester: {
            name: 'Avery',
            dedication: 'For the dance floor',
            contact: 'instagram.com/avery'
          }
        })
      }),
      {} as any
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/formResponse');
    expect(options).toMatchObject({ method: 'POST' });

    const body = options?.body as string;
    const params = new URLSearchParams(body);

    expect(params.get(FORM_FIELD_IDS.trackId)).toBe('123');
    expect(params.get(FORM_FIELD_IDS.trackName)).toBe('Digital Love');
    expect(params.get(FORM_FIELD_IDS.artistName)).toBe('Daft Punk');
    expect(params.get(FORM_FIELD_IDS.albumName)).toBe('Discovery');
    expect(params.get(FORM_FIELD_IDS.artworkUrl)).toBe('https://example.com/art.jpg');
    expect(params.get(FORM_FIELD_IDS.previewUrl)).toBe('https://example.com/preview.m4a');
    expect(params.get(FORM_FIELD_IDS.requesterName)).toBe('Avery');
    expect(params.get(FORM_FIELD_IDS.dedication)).toBe('For the dance floor');
    expect(params.get(FORM_FIELD_IDS.contact)).toBe('instagram.com/avery');
    expect(params.get('fvv')).toBe('1');
    expect(params.get('submit')).toBe('Submit');

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toMatch(/submitted successfully/i);
  });

  it('returns 400 when requester.name is missing', async () => {
    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('requester.name is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a payload with only requester.name', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(200);
    const body = fetchMock.mock.calls[0][1]?.body as string;
    const params = new URLSearchParams(body);
    expect(params.get(FORM_FIELD_IDS.requesterName)).toBe('Avery');
  });

  it('uses ALLOWED_ORIGIN for CORS header on responses and OPTIONS', async () => {
    process.env.ALLOWED_ORIGIN = 'https://djrequests.example';
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const postResponse = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 't', artist: 'a' },
          requester: { name: 'Avery' }
        })
      }),
      {} as any
    );
    expect(postResponse.headers?.['access-control-allow-origin']).toBe(
      'https://djrequests.example'
    );

    const optionsResponse = await handler(
      { httpMethod: 'OPTIONS' } as any,
      {} as any
    );
    expect(optionsResponse.statusCode).toBe(204);
    expect(optionsResponse.headers?.['access-control-allow-origin']).toBe(
      'https://djrequests.example'
    );
  });

  it('logs config errors server-side and returns a generic client message', async () => {
    delete process.env.GOOGLE_FORM_URL;
    delete process.env.VITE_GOOGLE_FORM_URL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Request service is temporarily unavailable.');
    expect(body.error).not.toMatch(/GOOGLE_FORM_URL/);
    expect(body.error).not.toMatch(/VITE_GOOGLE_FORM_URL/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('returns error when Google Form submission fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'Test', artist: 'Artist' },
          requester: { name: 'Avery' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).error).toMatch(/responded with status/i);
  });

  it('returns 429 with Retry-After after 5 rapid submissions from the same IP', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const body = JSON.stringify({
      song: { id: '1', title: 'T', artist: 'A' },
      requester: { name: 'Avery' }
    });

    for (let i = 0; i < 5; i += 1) {
      const ok = await handler(
        makeEvent({ body, headers: { 'x-forwarded-for': '9.9.9.9' } }),
        {} as any
      );
      expect(ok.statusCode).toBe(200);
    }

    const throttled = await handler(
      makeEvent({ body, headers: { 'x-forwarded-for': '9.9.9.9' } }),
      {} as any
    );
    expect(throttled.statusCode).toBe(429);
    expect(throttled.headers?.['retry-after']).toBeDefined();
    expect(Number(throttled.headers?.['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('shares the fallback "unknown" bucket when x-forwarded-for is missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const body = JSON.stringify({
      song: { id: '1', title: 'T', artist: 'A' },
      requester: { name: 'Avery' }
    });

    for (let i = 0; i < 5; i += 1) {
      const ok = await handler(
        makeEvent({ body, headers: {} }),
        {} as any
      );
      expect(ok.statusCode).toBe(200);
    }

    const throttled = await handler(
      makeEvent({ body, headers: {} }),
      {} as any
    );
    expect(throttled.statusCode).toBe(429);
  });
});
