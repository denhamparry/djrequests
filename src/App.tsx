import { useState } from 'react';
import { useSongSearch } from './hooks/useSongSearch';
import { submitSongRequest } from './lib/googleForm';

function App() {
  const { query, setQuery, results, status, message, error } = useSongSearch();
  const [requestingSongId, setRequestingSongId] = useState<string | null>(null);
  const [requestFeedback, setRequestFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleRequest = async (songId: string) => {
    const song = results.find((item) => item.id === songId);
    if (!song) {
      return;
    }

    setRequestingSongId(songId);
    setRequestFeedback(null);

    try {
      await submitSongRequest(song);
      setRequestFeedback({
        type: 'success',
        message: `Request for "${song.title}" sent to the DJ queue.`
      });
    } catch (submissionError) {
      const errorMessage =
        submissionError instanceof Error ? submissionError.message : 'Request failed.';
      setRequestFeedback({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setRequestingSongId(null);
    }
  };

  return (
    <main className="app">
      <header>
        <h1>DJ Requests</h1>
        <p className="subtitle">
          Search for a song by title, artist, or album and send it to the DJ booth.
        </p>
      </header>

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
              {song.artworkUrl ? (
                <img src={song.artworkUrl} alt="" width={56} height={56} />
              ) : (
                <div className="artwork-placeholder" aria-hidden />
              )}
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
                disabled={requestingSongId === song.id}
              >
                {requestingSongId === song.id ? 'Sending…' : `Request "${song.title}"`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default App;
