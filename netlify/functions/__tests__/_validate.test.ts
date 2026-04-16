// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validateRequestBody } from '../_validate';

describe('validateRequestBody', () => {
  const baseSong = { id: '1', title: 'Song', artist: 'Artist' };

  it('rejects non-object bodies', () => {
    expect(validateRequestBody(null)).toEqual({
      ok: false,
      error: 'Request body must be an object'
    });
    expect(validateRequestBody('hello')).toEqual({
      ok: false,
      error: 'Request body must be an object'
    });
    expect(validateRequestBody([])).toEqual({
      ok: false,
      error: 'Request body must be an object'
    });
  });

  it('rejects missing song', () => {
    const result = validateRequestBody({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/song information/i);
  });

  it('rejects song as array', () => {
    const result = validateRequestBody({ song: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/song information/i);
  });

  it.each([
    ['id', 'song.id'],
    ['title', 'song.title'],
    ['artist', 'song.artist']
  ])('rejects missing song.%s', (field, expectedName) => {
    const song = { ...baseSong } as Record<string, unknown>;
    delete song[field];
    const result = validateRequestBody({ song });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(`${expectedName} is required`);
  });

  it('rejects non-string song.id', () => {
    const result = validateRequestBody({ song: { ...baseSong, id: 123 } });
    expect(result.ok).toBe(false);
  });

  it('rejects over-length fields', () => {
    const result = validateRequestBody({
      song: { ...baseSong, title: 'x'.repeat(501) }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });

  it('accepts minimal valid payload with requester.name', () => {
    const result = validateRequestBody({
      song: baseSong,
      requester: { name: 'Avery' }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.song).toEqual({
        id: '1',
        title: 'Song',
        artist: 'Artist',
        album: null,
        artworkUrl: null,
        previewUrl: null
      });
      expect(result.value.requester).toEqual({
        name: 'Avery',
        dedication: null,
        contact: null
      });
    }
  });

  it('rejects missing requester.name', () => {
    const result = validateRequestBody({ song: baseSong });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('requester.name is required');
  });

  it('rejects whitespace-only requester.name', () => {
    const result = validateRequestBody({
      song: baseSong,
      requester: { name: '   ' }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('requester.name is required');
  });

  it('trims whitespace on required strings', () => {
    const result = validateRequestBody({
      song: { id: '  1  ', title: ' Song ', artist: ' Artist ' },
      requester: { name: 'Avery' }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.song.id).toBe('1');
      expect(result.value.song.title).toBe('Song');
    }
  });

  it('rejects whitespace-only required strings', () => {
    const result = validateRequestBody({
      song: { ...baseSong, title: '   ' }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('song.title is required');
  });

  it('accepts full payload with optional fields', () => {
    const result = validateRequestBody({
      song: {
        ...baseSong,
        album: 'Album',
        artworkUrl: 'https://example.com/a.jpg',
        previewUrl: 'https://example.com/p.m4a'
      },
      requester: {
        name: 'Avery',
        dedication: 'For the floor',
        contact: '@avery'
      }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.song.album).toBe('Album');
      expect(result.value.requester.name).toBe('Avery');
      expect(result.value.requester.contact).toBe('@avery');
    }
  });

  it('treats empty-string optional fields as null', () => {
    const result = validateRequestBody({
      song: { ...baseSong, album: '' },
      requester: { name: 'Avery', dedication: '' }
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.song.album).toBeNull();
      expect(result.value.requester.dedication).toBeNull();
    }
  });

  it('rejects non-string optional fields', () => {
    const result = validateRequestBody({
      song: { ...baseSong, album: 42 }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/song\.album must be a string/);
  });
});
