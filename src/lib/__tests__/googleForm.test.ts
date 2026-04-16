import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError, submitSongRequest } from '../googleForm';
import type { Requester, Song } from '../../../shared/types';

const song: Song = {
  id: '1',
  title: 'T',
  artist: 'A',
  album: null,
  artworkUrl: null,
  previewUrl: null
};
const requester: Requester = { name: 'Avery' };

describe('submitSongRequest', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the parsed payload on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ message: 'Song request submitted successfully.' })
    });

    const result = await submitSongRequest(song, requester);

    expect(result).toEqual({ message: 'Song request submitted successfully.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/.netlify/functions/request');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    expect(init.body).toBe(JSON.stringify({ song, requester }));
  });

  it('throws RequestError with requestId when the function returns one', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Upstream failed.', requestId: 'abc12345' })
    });

    await expect(submitSongRequest(song, requester)).rejects.toMatchObject({
      name: 'RequestError',
      message: 'Upstream failed.',
      requestId: 'abc12345'
    });
  });

  it('throws RequestError with undefined requestId when none is returned', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad input.' })
    });

    try {
      await submitSongRequest(song, requester);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RequestError);
      expect((err as RequestError).requestId).toBeUndefined();
      expect((err as RequestError).message).toBe('Bad input.');
    }
  });

  it.each([
    { label: 'number', value: 123 },
    { label: 'null', value: null },
    { label: 'array', value: [] },
    { label: 'object', value: {} }
  ])(
    'treats non-string requestId ($label) as undefined (defensive type guard)',
    async ({ value }) => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Oops.', requestId: value })
      });

      try {
        await submitSongRequest(song, requester);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(RequestError);
        expect((err as RequestError).requestId).toBeUndefined();
      }
    }
  );
});
