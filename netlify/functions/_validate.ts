import type { Song, RequestType } from '../../shared/types';
import { REQUEST_TYPES } from '../../shared/types';

type Brand<T, B extends string> = T & { readonly __brand: B };

export type ValidatedSong = Brand<Song, 'ValidatedSong'>;

export type ValidatedRequester = Brand<
  {
    name: string;
    requestType: RequestType;
    contact: string | null;
  },
  'ValidatedRequester'
>;

export type ValidatedRequest = {
  song: ValidatedSong;
  requester: ValidatedRequester;
};

export type ValidationResult =
  | { ok: true; value: ValidatedRequest }
  | { ok: false; error: string };

const MAX_STRING = 500;

type StringOrError = string | { error: string };

const requireString = (value: unknown, field: string): StringOrError => {
  if (typeof value !== 'string') return { error: `${field} is required` };
  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required` };
  if (trimmed.length > MAX_STRING) return { error: `${field} is too long` };
  return trimmed;
};

type OptionalStringOrError = string | null | { error: string };

const optionalString = (value: unknown, field: string): OptionalStringOrError => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  if (value.length > MAX_STRING) return { error: `${field} is too long` };
  return value.trim() || null;
};

type EnumOrError<T extends string> = T | { error: string };

const enumField = <T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): EnumOrError<T> => {
  if (typeof value !== 'string' || !value) {
    return { error: `${field} is required` };
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return { error: `${field} must be one of ${allowed.join(', ')}` };
  }
  return value as T;
};

const isErrorResult = (value: unknown): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value;

export const validateRequestBody = (raw: unknown): ValidationResult => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const body = raw as Record<string, unknown>;
  const song = body.song;

  if (!song || typeof song !== 'object' || Array.isArray(song)) {
    return { ok: false, error: 'Song information is required' };
  }

  const requesterRaw = body.requester;
  const requester =
    requesterRaw && typeof requesterRaw === 'object' && !Array.isArray(requesterRaw)
      ? (requesterRaw as Record<string, unknown>)
      : {};

  const songObj = song as Record<string, unknown>;

  const id = requireString(songObj.id, 'song.id');
  if (isErrorResult(id)) return { ok: false, error: id.error };
  const title = requireString(songObj.title, 'song.title');
  if (isErrorResult(title)) return { ok: false, error: title.error };
  const artist = requireString(songObj.artist, 'song.artist');
  if (isErrorResult(artist)) return { ok: false, error: artist.error };

  const album = optionalString(songObj.album, 'song.album');
  if (isErrorResult(album)) return { ok: false, error: album.error };
  const artworkUrl = optionalString(songObj.artworkUrl, 'song.artworkUrl');
  if (isErrorResult(artworkUrl)) return { ok: false, error: artworkUrl.error };
  const previewUrl = optionalString(songObj.previewUrl, 'song.previewUrl');
  if (isErrorResult(previewUrl)) return { ok: false, error: previewUrl.error };

  const name = requireString(requester.name, 'requester.name');
  if (isErrorResult(name)) return { ok: false, error: name.error };
  const requestType = enumField(
    requester.requestType,
    'requester.requestType',
    REQUEST_TYPES
  );
  if (isErrorResult(requestType)) return { ok: false, error: requestType.error };
  const contact = optionalString(requester.contact, 'requester.contact');
  if (isErrorResult(contact)) return { ok: false, error: contact.error };

  return {
    ok: true,
    value: {
      song: {
        id,
        title,
        artist,
        album,
        artworkUrl,
        previewUrl
      } as ValidatedSong,
      requester: {
        name,
        requestType,
        contact
      } as ValidatedRequester
    }
  };
};
