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
  code?: 'upstream_unavailable';
};

const USER_AGENT = 'djrequests/1.0 (+https://github.com/denhamparry/djrequests)';
const ITUNES_SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

// iTunes Search API has a documented intermittent failure mode where it
// returns HTTP 404 with a `[newNullResponse]` HTML body instead of a real
// response. It is transient, so we retry 404 and 5xx before giving up.
// We never retry 429 — that would amplify a throttle.
//
// MAX_ATTEMPTS is derived from BACKOFF_MS so that tuning the retry count is
// a single-source edit: add or remove a delay and the attempt count follows.
const BACKOFF_MS = [250, 500] as const;
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jsonResponse = (statusCode: number, payload: SearchResponse) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=60',
    'access-control-allow-origin': '*'
  },
  body: JSON.stringify(payload)
});

type UpstreamOutcome =
  | { kind: 'ok'; response: Response }
  | { kind: 'throttled' }
  | { kind: 'failed'; detail: string };

async function fetchFromItunes(url: string): Promise<UpstreamOutcome> {
  let lastDetail = 'unknown error';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (error) {
      lastDetail = `network error: ${
        error instanceof Error ? error.message : 'unknown'
      }`;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      return { kind: 'failed', detail: lastDetail };
    }

    if (response.status === 429) {
      return { kind: 'throttled' };
    }

    if (response.ok) {
      return { kind: 'ok', response };
    }

    const retryable = response.status === 404 || response.status >= 500;
    lastDetail = `iTunes Search API returned status ${response.status}`;

    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }

    return { kind: 'failed', detail: lastDetail };
  }

  return { kind: 'failed', detail: lastDetail };
}

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

  const outcome = await fetchFromItunes(
    `${ITUNES_SEARCH_ENDPOINT}?${params.toString()}`
  );

  if (outcome.kind === 'throttled') {
    return jsonResponse(503, {
      tracks: [],
      error: 'The iTunes Search API rate limit has been reached. Please retry shortly.'
    });
  }

  if (outcome.kind === 'failed') {
    return jsonResponse(503, {
      tracks: [],
      error: outcome.detail,
      code: 'upstream_unavailable'
    });
  }

  const payload = (await outcome.response.json()) as { results?: ITunesTrack[] };
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
