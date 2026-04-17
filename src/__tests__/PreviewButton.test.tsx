import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { server } from '../test/msw-server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const searchEndpoint = '/.netlify/functions/search';

type TrackArg = {
  id?: string;
  title?: string;
  artist?: string;
  artworkUrl?: string | null;
  previewUrl?: string | null;
};

const track = (overrides: TrackArg = {}) => ({
  id: '1',
  title: 'Song One',
  artist: 'Artist A',
  album: null,
  artworkUrl: null,
  previewUrl: 'https://example.com/preview1.m4a',
  ...overrides
});

const renderWithTracks = async (
  tracks: ReturnType<typeof track>[],
  searchTerm = 'anything'
) => {
  server.use(http.get(searchEndpoint, () => HttpResponse.json({ tracks })));
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText(/Search songs/i), searchTerm);
  // Wait for results to render by waiting for the first song title
  await screen.findByText(tracks[0].title);
  return { user };
};

describe('Preview button', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(function (this: HTMLMediaElement) {
        queueMicrotask(() => this.dispatchEvent(new Event('playing')));
        return Promise.resolve();
      });
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(function (this: HTMLMediaElement) {
        this.dispatchEvent(new Event('pause'));
      });
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it('hides the preview button when the track has no previewUrl', async () => {
    await renderWithTracks([track({ previewUrl: null })]);
    expect(screen.queryByRole('button', { name: /Preview Song One/i })).not.toBeInTheDocument();
  });

  it('renders the preview button when previewUrl is present', async () => {
    await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles play and pause on click', async () => {
    const { user } = await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });

    await user.click(btn);
    expect(playSpy).toHaveBeenCalledTimes(1);
    // After the playing event fires (via queueMicrotask), aria-pressed becomes true
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));

    await user.click(btn);
    expect(pauseSpy).toHaveBeenCalled();
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
  });

  it('enforces single-player invariant across tracks', async () => {
    const { user } = await renderWithTracks([
      track({ id: '1', title: 'Song One' }),
      track({ id: '2', title: 'Song Two', previewUrl: 'https://example.com/preview2.m4a' })
    ]);

    const btn1 = screen.getByRole('button', { name: /Preview Song One/i });
    const btn2 = screen.getByRole('button', { name: /Preview Song Two/i });

    await user.click(btn1);
    await vi.waitFor(() => expect(btn1).toHaveAttribute('aria-pressed', 'true'));

    await user.click(btn2);
    await vi.waitFor(() => expect(btn2).toHaveAttribute('aria-pressed', 'true'));
    expect(btn1).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the preview button does not trigger a song request', async () => {
    const user = userEvent.setup();
    const requestSpy = vi.fn();
    server.use(
      http.get(searchEndpoint, () => HttpResponse.json({ tracks: [track()] })),
      http.post('/.netlify/functions/request', () => {
        requestSpy();
        return HttpResponse.json({ message: 'ok' });
      })
    );

    render(<App />);
    await user.type(screen.getByLabelText(/Your name/i), 'Avery');
    await user.type(screen.getByLabelText(/Search songs/i), 'anything');
    const previewBtn = await screen.findByRole('button', {
      name: /Preview Song One by Artist A/i
    });
    await user.click(previewBtn);

    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('clears the loading spinner when the audio stalls', async () => {
    // Stub play so it resolves but does NOT dispatch `playing` — simulates a
    // network that gets the request off but never delivers media data.
    playSpy.mockImplementation(function () {
      return Promise.resolve();
    });

    const { user } = await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });

    await user.click(btn);
    await vi.waitFor(() => expect(btn).toHaveAttribute('data-state', 'loading'));

    // Simulate the `stalled` event on the shared audio element. The
    // component should pause and reset both playing + loading state.
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    // jsdom does not mount the <audio> in the DOM since it's created via
    // `new Audio()`; we dispatch directly on the instance via the spy-captured
    // `this` binding. Fall back to finding any media element via a stalled
    // event dispatched to each HTMLMediaElement the spies have seen.
    const stallTarget = audio ?? (playSpy.mock.contexts[0] as HTMLMediaElement);
    stallTarget.dispatchEvent(new Event('stalled'));

    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
    expect(btn).toHaveAttribute('data-state', 'idle');
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('shows error state when play() rejects with a non-AbortError', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    playSpy.mockImplementation(function () {
      const err = new Error('playback blocked');
      err.name = 'NotAllowedError';
      return Promise.reject(err);
    });

    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      server.use(http.get(searchEndpoint, () => HttpResponse.json({ tracks: [track()] })));
      render(<App />);
      await user.type(screen.getByLabelText(/Search songs/i), 'anything');
      const btn = await screen.findByRole('button', {
        name: /Preview Song One by Artist A/i
      });

      await user.click(btn);

      await vi.waitFor(() => expect(btn).toHaveAttribute('data-state', 'error'));
      expect(btn).toHaveAttribute('aria-label', expect.stringMatching(/tap to retry/i));

      await vi.waitFor(() =>
        expect(screen.getByText(/Preview for Song One failed\./i)).toBeInTheDocument()
      );

      vi.advanceTimersByTime(2000);

      await vi.waitFor(() => expect(btn).toHaveAttribute('data-state', 'idle'));
      expect(btn).toHaveAttribute('aria-label', expect.stringMatching(/^Preview Song One/));
      expect(
        screen.queryByText(/Preview for Song One failed\./i)
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not flip to error state for AbortError', async () => {
    playSpy.mockImplementation(function () {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    const { user } = await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });

    await user.click(btn);

    // Give any microtasks a chance to flush.
    await Promise.resolve();
    expect(btn).not.toHaveAttribute('data-state', 'error');
    expect(
      screen.queryByText(/Preview for Song One failed\./i)
    ).not.toBeInTheDocument();
  });

  it('clicking during the error window retries and clears the error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let shouldFail = true;
    playSpy.mockImplementation(function (this: HTMLMediaElement) {
      if (shouldFail) {
        const err = new Error('blocked');
        err.name = 'NotAllowedError';
        return Promise.reject(err);
      }
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    });

    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      server.use(http.get(searchEndpoint, () => HttpResponse.json({ tracks: [track()] })));
      render(<App />);
      await user.type(screen.getByLabelText(/Search songs/i), 'anything');
      const btn = await screen.findByRole('button', {
        name: /Preview Song One by Artist A/i
      });

      await user.click(btn);
      await vi.waitFor(() => expect(btn).toHaveAttribute('data-state', 'error'));

      shouldFail = false;
      await user.click(btn);

      await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));
      expect(btn).toHaveAttribute('data-state', 'playing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the loading spinner after the safety timeout fires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    playSpy.mockImplementation(function () {
      return Promise.resolve();
    });

    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      server.use(http.get(searchEndpoint, () => HttpResponse.json({ tracks: [track()] })));
      render(<App />);
      await user.type(screen.getByLabelText(/Search songs/i), 'anything');
      const btn = await screen.findByRole('button', {
        name: /Preview Song One by Artist A/i
      });

      await user.click(btn);
      await vi.waitFor(() => expect(btn).toHaveAttribute('data-state', 'loading'));

      vi.advanceTimersByTime(8000);

      await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
      expect(btn).toHaveAttribute('data-state', 'idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses and resets when the playing track drops out of results', async () => {
    const { user } = await renderWithTracks([
      track({ id: '1', title: 'Song One' }),
      track({ id: '2', title: 'Song Two', previewUrl: 'https://example.com/preview2.m4a' })
    ]);

    const btn1 = screen.getByRole('button', { name: /Preview Song One/i });
    await user.click(btn1);
    await vi.waitFor(() => expect(btn1).toHaveAttribute('aria-pressed', 'true'));

    pauseSpy.mockClear();

    // Swap search handler so the next debounced fetch returns only Song Two.
    server.use(
      http.get(searchEndpoint, () =>
        HttpResponse.json({
          tracks: [track({ id: '2', title: 'Song Two', previewUrl: 'https://example.com/preview2.m4a' })]
        })
      )
    );

    await user.type(screen.getByLabelText(/Search songs/i), ' more');

    // Wait for Song One to disappear from the DOM — results-change effect fires.
    await vi.waitFor(() => expect(screen.queryByText('Song One')).not.toBeInTheDocument());

    expect(pauseSpy).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /Preview Song Two/i, pressed: true })
    ).not.toBeInTheDocument();
  });

  it('resets state when the audio element emits `ended`', async () => {
    const { user } = await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });

    await user.click(btn);
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));

    const audio = playSpy.mock.contexts[0] as HTMLMediaElement;
    audio.dispatchEvent(new Event('ended'));

    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
    expect(btn).toHaveAttribute('data-state', 'idle');
  });

  it('resets state when the audio element emits `error`', async () => {
    const { user } = await renderWithTracks([track()]);
    const btn = screen.getByRole('button', { name: /Preview Song One by Artist A/i });

    await user.click(btn);
    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'));

    const audio = playSpy.mock.contexts[0] as HTMLMediaElement;
    audio.dispatchEvent(new Event('error'));

    await vi.waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
    expect(btn).toHaveAttribute('data-state', 'idle');
  });

});
