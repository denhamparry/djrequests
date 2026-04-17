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
            requestType: 'karaoke',
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
    expect(params.get(FORM_FIELD_IDS.requestType)).toBe('Karaoke');
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
          requester: { name: 'Avery', requestType: 'song' }
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
          requester: { name: 'Avery', requestType: 'song' }
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
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Request service is temporarily unavailable.');
    expect(body.error).not.toMatch(/GOOGLE_FORM_URL/);
    expect(body.error).not.toMatch(/VITE_GOOGLE_FORM_URL/);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(
      '[request] Google Form configuration error'
    );
    expect(errorSpy.mock.calls[0][0]).toContain(
      `(requestId=${body.requestId} trackId=1)`
    );
    expect(fetchMock).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('logs true network errors with a network label and returns a redacted 502', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND docs.google.com'), {
      code: 'ENOTFOUND'
    });
    const fetchFailure = new TypeError('fetch failed');
    (fetchFailure as { cause?: unknown }).cause = cause;
    fetchMock.mockRejectedValueOnce(fetchFailure);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Failed to reach the request service.');
    expect(body.error).not.toMatch(/ENOTFOUND/);
    expect(body.error).not.toMatch(/getaddrinfo/);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe(
      `[request] Google Form network error (requestId=${body.requestId} trackId=1)`
    );

    errorSpy.mockRestore();
  });

  it('labels AbortError distinctly from network errors', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abort);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(502);
    const abortBody = JSON.parse(response.body);
    expect(abortBody.error).toBe('Failed to reach the request service.');
    expect(abortBody.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe(
      `[request] Google Form fetch aborted (requestId=${abortBody.requestId} trackId=1)`
    );

    errorSpy.mockRestore();
  });

  it('labels non-network fetch failures as invocation errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('unexpected programmer error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(502);
    const invocationBody = JSON.parse(response.body);
    expect(invocationBody.error).toBe('Failed to reach the request service.');
    expect(invocationBody.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe(
      `[request] Google Form fetch invocation error (requestId=${invocationBody.requestId} trackId=1)`
    );

    errorSpy.mockRestore();
  });

  const piiScenarios: Array<{ scenario: string; arrange: () => void }> = [
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
              requestType: 'song',
              contact: 'avery@private.test'
            }
          })
        }),
        {} as any
      );

      const logLine = errorSpy.mock.calls[0][0] as string;
      expect(logLine).toContain('trackId=99');
      expect(logLine).not.toMatch(/Avery Secret/);
      expect(logLine).not.toMatch(/avery@private.test/);

      errorSpy.mockRestore();
    }
  );

  describe('trackId log sanitisation', () => {
    const submit = async (trackId: string) => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler(
        makeEvent({
          body: JSON.stringify({
            song: { id: trackId, title: 'T', artist: 'A' },
            requester: { name: 'Avery', requestType: 'song' }
          })
        }),
        {} as any
      );
      const logLine = errorSpy.mock.calls[0][0] as string;
      errorSpy.mockRestore();
      return logLine;
    };

    it('passes iTunes-style numeric IDs through unchanged', async () => {
      const logLine = await submit('1234567890');
      expect(logLine).toContain('trackId=1234567890');
    });

    it('caps trackId at 64 characters in logs', async () => {
      const longId = 'a'.repeat(200);
      const logLine = await submit(longId);
      const match = logLine.match(/trackId=([^)]+)\)/);
      expect(match).not.toBeNull();
      expect(match![1]).toHaveLength(64);
      expect(match![1]).toBe('a'.repeat(64));
    });

    it('replaces newlines and structural chars with underscores', async () => {
      const logLine = await submit('1\n[request] spoof');
      expect(logLine).toContain('trackId=1__request__spoof');
      // The sanitised log line must not contain a literal newline between the
      // opening `[request]` prefix and the trailing `)` of the context block.
      const ctxMatch = logLine.match(/\(requestId=[^)]+\)/);
      expect(ctxMatch).not.toBeNull();
      expect(ctxMatch![0]).not.toMatch(/\n/);
    });

    it('replaces symbol chars outside the whitelist with underscores', async () => {
      const logLine = await submit('x=y(z)');
      expect(logLine).toContain('trackId=x_y_z_');
    });
  });

  it('returns error when Google Form submission fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'Test', artist: 'Artist' },
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );

    expect(response.statusCode).toBe(502);
    const body = JSON.parse(response.body);
    expect(body.error).toMatch(/responded with status/i);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe(
      `[request] Google Form responded with status 500 (requestId=${body.requestId} trackId=1)`
    );

    errorSpy.mockRestore();
  });

  it('does not include requestId on 2xx/400/429 responses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const okResponse = await handler(
      makeEvent({
        body: JSON.stringify({
          song: { id: '1', title: 'T', artist: 'A' },
          requester: { name: 'Avery', requestType: 'song' }
        })
      }),
      {} as any
    );
    expect(okResponse.statusCode).toBe(200);
    expect(JSON.parse(okResponse.body).requestId).toBeUndefined();

    const badResponse = await handler(
      makeEvent({ body: JSON.stringify({}) }),
      {} as any
    );
    expect(badResponse.statusCode).toBe(400);
    expect(JSON.parse(badResponse.body).requestId).toBeUndefined();
  });

  it('returns 429 with Retry-After after 5 rapid submissions from the same IP', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const body = JSON.stringify({
      song: { id: '1', title: 'T', artist: 'A' },
      requester: { name: 'Avery', requestType: 'song' }
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
      requester: { name: 'Avery', requestType: 'song' }
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
