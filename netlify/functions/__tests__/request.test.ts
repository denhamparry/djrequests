import type { Handler } from '@netlify/functions';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handler as requestHandler } from '../request';
import { FORM_FIELD_IDS } from '../../../shared/formFields';

const handler = requestHandler as Handler;

describe('request function', () => {
  const fetchMock = vi.fn();
  const originalEnv = process.env;

  beforeEach(() => {
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
      { httpMethod: 'POST', body: JSON.stringify({}) } as any,
      {} as any
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/song information/i);
  });

  it('submits to the Google Form with normalized payload', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await handler(
      {
        httpMethod: 'POST',
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
      } as any,
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

  it('returns error when Google Form submission fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const response = await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({
          song: {
            id: '1',
            title: 'Test',
            artist: 'Artist'
          }
        })
      } as any,
      {} as any
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).error).toMatch(/responded with status/i);
  });
});
