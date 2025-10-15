import type { Handler } from '@netlify/functions';

type ITunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

type SearchResponse = {
  tracks: Array<{
    id: string;
    title: string;
    artist: string;
    album: string | null;
    artworkUrl: string | null;
    previewUrl: string | null;
  }>;
  message?: string;
  error?: string;
};

const USER_AGENT = 'djrequests/1.0 (+https://github.com/denhamparry/djrequests)';
const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

const jsonResponse = (statusCode: number, payload: SearchResponse) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=60',
    'access-control-allow-origin': '*'
  },
  body: JSON.stringify(payload)
});

export const handler: Handler = async (event) => {
  const term = event.queryStringParameters?.term?.trim();

  if (!term) {
    return jsonResponse(400, {
      tracks: [],
      error: 'Missing search term'
    });
  }

  const params = new URLSearchParams({
    term,
    entity: 'song',
    limit: '25'
  });

  let response: Response;

  try {
    response = await fetch(`${ITUNES_SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
  } catch (error) {
    return jsonResponse(502, {
      tracks: [],
      error: `Failed to reach iTunes Search API: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    });
  }

  if (response.status === 429) {
    return jsonResponse(503, {
      tracks: [],
      error: 'The iTunes Search API rate limit has been reached. Please retry shortly.'
    });
  }

  if (!response.ok) {
    return jsonResponse(502, {
      tracks: [],
      error: `iTunes Search API returned status ${response.status}`
    });
  }

  const payload = (await response.json()) as { results?: ITunesTrack[] };
  const results = payload.results ?? [];

  if (results.length === 0) {
    return jsonResponse(200, {
      tracks: [],
      message: `No songs found for "${term}".`
    });
  }

  return jsonResponse(200, {
    tracks: results.map((track) => ({
      id: String(track.trackId),
      title: track.trackName,
      artist: track.artistName,
      album: track.collectionName ?? null,
      artworkUrl: track.artworkUrl100 ?? null,
      previewUrl: track.previewUrl ?? null
    }))
  });
};
