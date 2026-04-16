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
});
