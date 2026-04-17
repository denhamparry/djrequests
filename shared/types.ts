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

// Display labels sent to the Google Form. MUST match the multiple-choice
// option text on the Form exactly — Google Forms rejects submissions whose
// value does not match an existing option.
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  song: 'Song',
  karaoke: 'Karaoke'
};

export type Requester = {
  name: string;
  requestType: RequestType;
  contact?: string;
};
