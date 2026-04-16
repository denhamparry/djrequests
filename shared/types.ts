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

export type Requester = {
  name: string;
  dedication?: string;
  contact?: string;
};
