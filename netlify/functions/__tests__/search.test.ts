import type { Handler } from '@netlify/functions';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { handler as searchHandler } from '../search';

const handler = searchHandler as Handler;

describe('search function', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns 400 when term is missing', async () => {
    const response = await handler({ queryStringParameters: {} } as any, {} as any);

    expect(response.statusCode).toBe(400);
    expect(response.headers?.['content-type']).toBe('application/json');
    expect(response.body).toContain('Missing search term');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes songs from the iTunes API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            trackId: 123,
            trackName: 'Around the World',
            artistName: 'Daft Punk',
            collectionName: 'Homework',
            previewUrl: 'https://example.com/preview.m4a',
            artworkUrl100: 'https://example.com/artwork.jpg'
          }
        ]
      })
    });

    const response = await handler(
      { queryStringParameters: { term: 'daft punk' } } as any,
      {} as any
    );

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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ results: [] })
    });

    const response = await handler(
      { queryStringParameters: { term: 'unknown track' } } as any,
      {} as any
    );

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.tracks).toEqual([]);
    expect(payload.message).toMatch(/No songs found/i);
  });

  it('surfaces a friendly message when upstream is throttled', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({})
    });

    const response = await handler(
      { queryStringParameters: { term: 'beatles' } } as any,
      {} as any
    );

    expect(response.statusCode).toBe(503);
    const payload = JSON.parse(response.body);
    expect(payload.error).toMatch(/rate limit/i);
  });
});
