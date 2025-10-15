import { useState, useEffect, useRef } from 'react';

export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
};

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

type SearchState = {
  status: SearchStatus;
  results: Song[];
  message: string | null;
  error: string | null;
};

const INITIAL_MESSAGE = 'Start typing to search for tracks.';
const DEBOUNCE_MS = 300;

export function useSongSearch() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({
    status: 'idle',
    results: [],
    message: INITIAL_MESSAGE,
    error: null
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedQuery = query.trim();

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    if (!trimmedQuery) {
      setState({
        status: 'idle',
        results: [],
        message: INITIAL_MESSAGE,
        error: null
      });
      return;
    }

    const timeout = setTimeout(async () => {
      setState((current) => ({
        ...current,
        status: 'loading',
        message: 'Searching songs…',
        error: null
      }));

      try {
        const searchParams = new URLSearchParams({ term: trimmedQuery });
        const response = await fetch(
          `/.netlify/functions/search?${searchParams.toString()}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Search failed');
        }

        const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];

        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setState({
          status: 'success',
          results: tracks,
          message:
            tracks.length === 0
              ? payload?.message ?? `No songs found for “${trimmedQuery}”.`
              : null,
          error: null
        });
      } catch (error) {
        if (requestIdRef.current !== currentRequestId) {
          return;
        }

        setState({
          status: 'error',
          results: [],
          message: null,
          error: error instanceof Error ? error.message : 'Search failed'
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [query]);

  return {
    query,
    setQuery,
    status: state.status,
    results: state.results,
    message: state.message,
    error: state.error
  };
}
