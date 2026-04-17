// Client ↔ Netlify function wire contract.
// Both the frontend (src/) and Netlify functions (netlify/functions/) import
// from here so the Song shape has a single source of truth.

export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
};

export type RequestType = 'song' | 'karaoke';

export const REQUEST_TYPES: readonly RequestType[] = ['song', 'karaoke'] as const;

export type Requester = {
  name: string;
  requestType: RequestType;
  contact?: string;
};
