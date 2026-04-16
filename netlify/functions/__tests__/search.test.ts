// @vitest-environment node
import type { Handler } from '@netlify/functions';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handler as searchHandler } from '../search';

const handler = searchHandler as Handler;

const okResponse = (results: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ results })
});

const failureResponse = (status: number) => ({
  ok: false,
  status,
  json: async () => ({})
});

describe('search function', () => {
  const fetchMock = vi.fn();
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    process.env = { ...originalEnv };
    delete process.env.ALLOWED_ORIGIN;
    delete process.env.URL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    process.env = originalEnv;
  });

  it('uses ALLOWED_ORIGIN for CORS header on GET responses', async () => {
    process.env.ALLOWED_ORIGIN = 'https://djrequests.example';
    fetchMock.mockResolvedValueOnce(okResponse([]));

    const promise = handler(
      { queryStringParameters: { term: 'x' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.headers?.['access-control-allow-origin']).toBe(
      'https://djrequests.example'
    );
  });

  it('responds to OPTIONS preflight with 204 and configured origin', async () => {
    process.env.ALLOWED_ORIGIN = 'https://djrequests.example';

    const response = await handler({ httpMethod: 'OPTIONS' } as any, {} as any);

    expect(response.statusCode).toBe(204);
    expect(response.headers?.['access-control-allow-origin']).toBe(
      'https://djrequests.example'
    );
    expect(response.headers?.['access-control-allow-methods']).toMatch(/OPTIONS/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to Netlify URL env var when ALLOWED_ORIGIN is unset', async () => {
    process.env.URL = 'https://auto-deploy.example';
    fetchMock.mockResolvedValueOnce(okResponse([]));

    const promise = handler(
      { queryStringParameters: { term: 'x' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.headers?.['access-control-allow-origin']).toBe(
      'https://auto-deploy.example'
    );
  });

  it('returns 400 when term is missing', async () => {
    const response = await handler({ queryStringParameters: {} } as any, {} as any);

    expect(response.statusCode).toBe(400);
    expect(response.headers?.['content-type']).toBe('application/json');
    expect(response.body).toContain('Missing search term');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes songs from the iTunes API', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([
        {
          trackId: 123,
          trackName: 'Around the World',
          artistName: 'Daft Punk',
          collectionName: 'Homework',
          previewUrl: 'https://example.com/preview.m4a',
          artworkUrl100: 'https://example.com/artwork.jpg'
        }
      ])
    );

    const promise = handler(
      { queryStringParameters: { term: 'daft punk' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://itunes.apple.com/search?'),
      expect.objectContaining({
        headers: { 'User-Agent': expect.stringContaining('djrequests') }
      })
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);

    expect(payload.tracks).toEqual([
      {
        id: '123',
        title: 'Around the World',
        artist: 'Daft Punk',
        album: 'Homework',
        artworkUrl: 'https://example.com/artwork.jpg',
        previewUrl: 'https://example.com/preview.m4a'
      }
    ]);
  });

  it('handles empty results gracefully', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([]));

    const promise = handler(
      { queryStringParameters: { term: 'unknown track' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.tracks).toEqual([]);
    expect(payload.message).toMatch(/No songs found/i);
  });

  it('surfaces a friendly message when upstream is throttled and does not retry', async () => {
    fetchMock.mockResolvedValueOnce(failureResponse(429));

    const promise = handler(
      { queryStringParameters: { term: 'beatles' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(503);
    const payload = JSON.parse(response.body);
    expect(payload.error).toMatch(/rate limit/i);
    expect(payload.code).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on transient upstream 404 and returns tracks when retry succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(failureResponse(404))
      .mockResolvedValueOnce(
        okResponse([
          {
            trackId: 1,
            trackName: 'Hey Jude',
            artistName: 'The Beatles'
          }
        ])
      );

    const promise = handler(
      { queryStringParameters: { term: 'beatles' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(response.body);
    expect(payload.tracks).toHaveLength(1);
  });

  it('retries on upstream 500 and returns tracks when retry succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(failureResponse(500))
      .mockResolvedValueOnce(okResponse([{ trackId: 2, trackName: 'X', artistName: 'Y' }]));

    const promise = handler(
      { queryStringParameters: { term: 'y' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries after a network error and returns tracks when retry succeeds', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(okResponse([{ trackId: 3, trackName: 'A', artistName: 'B' }]));

    const promise = handler(
      { queryStringParameters: { term: 'a' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 503 with upstream_unavailable code after retries are exhausted', async () => {
    fetchMock
      .mockResolvedValueOnce(failureResponse(404))
      .mockResolvedValueOnce(failureResponse(404))
      .mockResolvedValueOnce(failureResponse(404));

    const promise = handler(
      { queryStringParameters: { term: 'beatles' } } as any,
      {} as any
    );
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.statusCode).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const payload = JSON.parse(response.body);
    expect(payload.code).toBe('upstream_unavailable');
    expect(payload.error).toMatch(/404/);
    expect(payload.tracks).toEqual([]);
  });
});
