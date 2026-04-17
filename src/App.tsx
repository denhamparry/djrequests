import { useEffect, useRef, useState } from 'react';
import { useSongSearch } from './hooks/useSongSearch';
import { useRequesterName } from './hooks/useRequesterName';
import { RequestError, submitSongRequest } from './lib/googleForm';
import PreviewButton, { type PreviewState } from './components/PreviewButton';
import type { Song, RequestType } from '../shared/types';
import squirrelsImage from '../squirrels.jpeg';

const SUBMIT_COOLDOWN_MS = 3000;
const PREVIEW_LOADING_TIMEOUT_MS = 8000;
const PREVIEW_ERROR_DISPLAY_MS = 2000;

type PlaybackState =
  | { kind: 'idle' }
  | { kind: 'loading'; songId: string }
  | { kind: 'playing'; songId: string };

function App() {
  const { query, setQuery, results, status, message, error } = useSongSearch();
  const {
    name: requesterName,
    setName: setRequesterName,
    persist: persistRequesterName,
    clear: clearRequesterName,
    persistedName
  } = useRequesterName();
  const [requestType, setRequestType] = useState<RequestType>('song');
  const requesterInputRef = useRef<HTMLInputElement | null>(null);
  const [requestingSongId, setRequestingSongId] = useState<string | null>(null);
  const [cooldownSongId, setCooldownSongId] = useState<string | null>(null);
  const [requestFeedback, setRequestFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ kind: 'idle' });
  const [erroredSongId, setErroredSongId] = useState<string | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedName = requesterName.trim();
  const hasName = trimmedName.length > 0;

  const erroredSong =
    erroredSongId != null
      ? (results.find((song) => song.id === erroredSongId) ?? null)
      : null;
  const previewErrorAnnouncement = erroredSong
    ? `Preview for ${erroredSong.title} failed.`
    : '';

  const clearLoadingTimer = () => {
    if (loadingTimer.current) {
      clearTimeout(loadingTimer.current);
      loadingTimer.current = null;
    }
  };

  const resetPreviewState = () => {
    clearLoadingTimer();
    setPlayback({ kind: 'idle' });
  };

  const clearErrorTimer = () => {
    if (errorTimer.current) {
      clearTimeout(errorTimer.current);
      errorTimer.current = null;
    }
  };

  const flashPreviewError = (songId: string) => {
    clearErrorTimer();
    setErroredSongId(songId);
    errorTimer.current = setTimeout(() => {
      errorTimer.current = null;
      setErroredSongId(null);
    }, PREVIEW_ERROR_DISPLAY_MS);
  };

  const ensureAudio = (): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('playing', () => {
      clearLoadingTimer();
      setPlayback((prev) =>
        prev.kind === 'loading' ? { kind: 'playing', songId: prev.songId } : prev
      );
    });
    audio.addEventListener('ended', resetPreviewState);
    audio.addEventListener('pause', () => {
      clearLoadingTimer();
      setPlayback((prev) => (prev.kind === 'loading' ? { kind: 'idle' } : prev));
    });
    audio.addEventListener('error', resetPreviewState);
    // `stalled` fires when the browser is trying to fetch media data but
    // cannot make progress. The load itself is not aborted, so we pause
    // explicitly to stop the buffering attempt and return the UI to idle.
    audio.addEventListener('stalled', () => {
      audio.pause();
      resetPreviewState();
    });
    audioRef.current = audio;
    return audio;
  };

  const togglePreview = (song: Song) => {
    if (!song.previewUrl) return;
    const audio = ensureAudio();

    if (erroredSongId === song.id) {
      clearErrorTimer();
      setErroredSongId(null);
    }

    if (playback.kind === 'playing' && playback.songId === song.id) {
      audio.pause();
      resetPreviewState();
      return;
    }

    audio.pause();
    audio.src = song.previewUrl;
    setPlayback({ kind: 'loading', songId: song.id });

    clearLoadingTimer();
    loadingTimer.current = setTimeout(() => {
      loadingTimer.current = null;
      audio.pause();
      setPlayback({ kind: 'idle' });
    }, PREVIEW_LOADING_TIMEOUT_MS);

    audio.play().catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return;
      resetPreviewState();
      flashPreviewError(song.id);
    });
  };

  useEffect(
    () => () => {
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      clearLoadingTimer();
      clearErrorTimer();
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
        audioRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (playback.kind === 'idle') return;
    const stillPresent = results.some((song) => song.id === playback.songId);
    if (!stillPresent) {
      audioRef.current?.pause();
      resetPreviewState();
    }
  }, [results, playback]);

  useEffect(() => {
    if (!erroredSongId) return;
    const stillPresent = results.some((song) => song.id === erroredSongId);
    if (!stillPresent) {
      clearErrorTimer();
      setErroredSongId(null);
    }
  }, [results, erroredSongId]);

  const previewStateFor = (songId: string): PreviewState => {
    if (playback.kind === 'loading' && playback.songId === songId) return 'loading';
    if (playback.kind === 'playing' && playback.songId === songId) return 'playing';
    if (erroredSongId === songId) return 'error';
    return 'idle';
  };

  const startCooldown = (songId: string) => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    setCooldownSongId(songId);
    cooldownTimer.current = setTimeout(() => {
      setCooldownSongId(null);
      cooldownTimer.current = null;
    }, SUBMIT_COOLDOWN_MS);
  };

  const handleRequest = async (songId: string) => {
    const song = results.find((item) => item.id === songId);
    if (!song || !hasName) {
      return;
    }

    setRequestingSongId(songId);
    setRequestFeedback(null);

    try {
      await submitSongRequest(song, {
        name: trimmedName,
        requestType
      });
      setRequestFeedback({
        type: 'success',
        message: `Request for "${song.title}" sent to the DJ queue.`
      });
      persistRequesterName(trimmedName);
    } catch (submissionError) {
      const baseMessage =
        submissionError instanceof Error ? submissionError.message : 'Request failed.';
      const requestId =
        submissionError instanceof RequestError ? submissionError.requestId : undefined;
      const errorMessage = requestId ? `${baseMessage} (ref: ${requestId})` : baseMessage;
      setRequestFeedback({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setRequestingSongId(null);
      startCooldown(songId);
    }
  };

  return (
    <main className="app">
      <header>
        <img
          src={squirrelsImage}
          alt="Rhiwbina Squirrels crest"
          className="hero-image"
          width={160}
          height={160}
        />
        <h1>DJ Requests</h1>
        <p className="subtitle">
          Search for a song by title, artist, or album and send it to the DJ booth.
        </p>
      </header>

      <label className="input-label" htmlFor="requester-name">
        <span className="label-text">Your name</span>
        <input
          id="requester-name"
          ref={requesterInputRef}
          aria-label="Your name"
          placeholder="So the DJ knows who requested it"
          value={requesterName}
          autoComplete="name"
          required
          onChange={(event) => setRequesterName(event.target.value)}
        />
        {persistedName !== null && persistedName === requesterName && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearRequesterName();
              requesterInputRef.current?.focus();
            }}
          >
            Not you? Clear
          </button>
        )}
      </label>

      <fieldset className="input-label request-type">
        <legend className="label-text">Request type</legend>
        <label className="radio-option">
          <input
            type="radio"
            name="request-type"
            value="song"
            checked={requestType === 'song'}
            onChange={() => setRequestType('song')}
          />
          <span>Song</span>
        </label>
        <label className="radio-option">
          <input
            type="radio"
            name="request-type"
            value="karaoke"
            checked={requestType === 'karaoke'}
            onChange={() => setRequestType('karaoke')}
          />
          <span>Karaoke</span>
        </label>
      </fieldset>

      <label className="input-label" htmlFor="song-search">
        <span className="label-text">Search songs</span>
        <input
          id="song-search"
          aria-label="Search songs"
          placeholder="Search by song, artist, or album"
          value={query}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {status === 'loading' && (
        <p role="status" className="status">
          Searching songs…
        </p>
      )}

      {error && (
        <p role="alert" className="status error">
          {error}
        </p>
      )}

      {message && status !== 'loading' && (
        <p className="status message">{message}</p>
      )}

      {/* Always-rendered live region: AT engines only announce updates to
          regions that existed before the text changed. Keeping the <p> in
          the tree (empty when idle) ensures the first preview-error
          announcement is picked up. Transitioning through "" on retry is
          intentional — it guarantees re-announcement when the same track
          errors twice. */}
      <p role="status" aria-live="polite" className="sr-only">
        {previewErrorAnnouncement}
      </p>

      {requestFeedback && (
        <p
          role="status"
          className={`status request-feedback ${requestFeedback.type}`}
          aria-live="polite"
        >
          {requestFeedback.message}
        </p>
      )}

      {results.length > 0 && (
        <ul className="results" aria-live="polite">
          {results.map((song) => (
            <li key={song.id}>
              <div className="artwork">
                {song.artworkUrl ? (
                  <img src={song.artworkUrl} alt="" width={56} height={56} />
                ) : (
                  <div className="artwork-placeholder" aria-hidden />
                )}
                {song.previewUrl && (
                  <PreviewButton
                    state={previewStateFor(song.id)}
                    trackLabel={`${song.title} by ${song.artist}`}
                    onClick={() => togglePreview(song)}
                  />
                )}
              </div>
              <div>
                <p className="song-title">{song.title}</p>
                <p className="song-meta">
                  {song.artist}
                  {song.album ? ` • ${song.album}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="request-button"
                onClick={() => handleRequest(song.id)}
                disabled={
                  !hasName ||
                  requestingSongId === song.id ||
                  cooldownSongId === song.id
                }
                title={!hasName ? 'Enter your name to request a song' : undefined}
              >
                {requestingSongId === song.id
                  ? 'Sending…'
                  : cooldownSongId === song.id
                    ? 'Just sent'
                    : `Request "${song.title}"`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;
