import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from 'vitest';
import App from '../App';
import { server } from '../test/msw-server';
import { __resetStorageProbeForTests } from '../lib/requesterStorage';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
beforeEach(() => {
  window.localStorage.clear();
  __resetStorageProbeForTests();
});
afterEach(() => {
  server.resetHandlers();
  window.localStorage.clear();
  __resetStorageProbeForTests();
});
afterAll(() => server.close());

const searchEndpoint = '/.netlify/functions/search';
const requestEndpoint = '/.netlify/functions/request';

type TrackOverride = Partial<{
  id: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
}>;

const defaultTrack = {
  id: '1',
  artist: 'A',
  album: null as string | null,
  artworkUrl: null as string | null,
  previewUrl: null as string | null
};

const renderAndRequest = async (
  title: string,
  postHandler: HttpResponseResolver,
  opts: { name?: string; searchTerm?: string; track?: TrackOverride } = {}
) => {
  const { name = 'Avery', searchTerm = 'anything', track } = opts;
  const merged = { ...defaultTrack, title, ...track };

  server.use(
    http.get(searchEndpoint, () => HttpResponse.json({ tracks: [merged] })),
    http.post(requestEndpoint, postHandler)
  );

  const user = userEvent.setup();
  render(<App />);

  await user.type(screen.getByLabelText(/Your name/i), name);
  await user.type(screen.getByLabelText(/Search songs/i), searchTerm);
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`Request "${title}"`) })
  );
};

describe('Song search experience', () => {
  it('shows results after a debounced search', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, () => {
        return HttpResponse.json({
          tracks: [
            {
              id: '123',
              title: 'Around the World',
              artist: 'Daft Punk',
              album: 'Homework',
              artworkUrl: 'https://example.com/art.jpg',
              previewUrl: 'https://example.com/preview.m4a'
            }
          ]
        });
      })
    );

    render(<App />);

    const input = screen.getByLabelText(/Search songs/i);

    await user.type(input, 'daft punk');
    expect(screen.queryByText(/Searching songs/i)).not.toBeInTheDocument();

    expect(await screen.findByText('Around the World')).toBeInTheDocument();
    expect(screen.getByText('Daft Punk • Homework')).toBeInTheDocument();
  });

  it('shows an error when the API responds with an error', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, () =>
        HttpResponse.json(
          { error: 'The iTunes Search API rate limit has been reached. Please retry shortly.' },
          { status: 503 }
        )
      )
    );

    render(<App />);

    const input = screen.getByLabelText(/Search songs/i);
    await user.type(input, 'beatles');

    expect(
      await screen.findByText(/The iTunes Search API rate limit/)
    ).toBeInTheDocument();
  });

  it('shows a friendly outage message when the upstream is unavailable', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, () =>
        HttpResponse.json(
          {
            tracks: [],
            error: 'iTunes Search API returned status 404',
            code: 'upstream_unavailable'
          },
          { status: 503 }
        )
      )
    );

    render(<App />);

    await user.type(screen.getByLabelText(/Search songs/i), 'beatles');

    expect(
      await screen.findByText(/Search is temporarily unavailable/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/status 404/i)).not.toBeInTheDocument();
  });

  it('shows a helpful message when there are no results', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('term')).toBe('obscure track');

        return HttpResponse.json({
          tracks: [],
          message: 'No songs found for "obscure track".'
        });
      })
    );

    render(<App />);

    await user.type(screen.getByLabelText(/Search songs/i), 'obscure track');
    await waitFor(() =>
      expect(screen.getByText(/No songs found for "obscure track"./i)).toBeInTheDocument()
    );
  });

  it('submits the song request through the backend and shows confirmation', async () => {
    await renderAndRequest(
      'Digital Love',
      async ({ request }) => {
        const body = await request.json();
        expect(body.song.id).toBe('321');
        expect(body.song.title).toBe('Digital Love');
        expect(body.requester.name).toBe('Avery');

        return HttpResponse.json({ message: 'Song request submitted successfully.' });
      },
      {
        searchTerm: 'digital love',
        track: {
          id: '321',
          artist: 'Daft Punk',
          album: 'Discovery',
          artworkUrl: 'https://example.com/discovery.jpg',
          previewUrl: 'https://example.com/digital-love.m4a'
        }
      }
    );

    expect(
      await screen.findByText(/Request for "Digital Love" sent to the DJ queue./i)
    ).toBeInTheDocument();
  });

  it('trims leading/trailing whitespace from the requester name before submitting', async () => {
    await renderAndRequest(
      'Harder Better Faster Stronger',
      async ({ request }) => {
        const body = (await request.json()) as { requester: { name: string } };
        expect(body.requester.name).toBe('Avery');
        return HttpResponse.json({ message: 'Song request submitted successfully.' });
      },
      {
        name: '  Avery  ',
        searchTerm: 'daft punk',
        track: { id: '777', artist: 'Daft Punk', album: 'Discovery' }
      }
    );

    expect(
      await screen.findByText(
        /Request for "Harder Better Faster Stronger" sent to the DJ queue./i
      )
    ).toBeInTheDocument();
  });

  it('includes the (ref: <id>) suffix when the submission fails with a requestId', async () => {
    await renderAndRequest('T', () =>
      HttpResponse.json(
        { error: 'Failed to reach the request service.', requestId: 'abc12345' },
        { status: 502 }
      )
    );

    expect(await screen.findByText(/\(ref: abc12345\)/)).toBeInTheDocument();
  });

  it('does not include (ref: ...) when the submission fails without a requestId', async () => {
    await renderAndRequest(
      'T2',
      () => HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }),
      { track: { id: '2' } }
    );

    const banner = await screen.findByText(/Invalid JSON payload/);
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).not.toMatch(/\(ref:/);
  });

  it('disables request buttons until a requester name is entered', async () => {
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, () =>
        HttpResponse.json({
          tracks: [
            {
              id: '999',
              title: 'One More Time',
              artist: 'Daft Punk',
              album: 'Discovery',
              artworkUrl: null,
              previewUrl: null
            }
          ]
        })
      )
    );

    render(<App />);

    await user.type(screen.getByLabelText(/Search songs/i), 'daft punk');

    const requestButton = await screen.findByRole('button', {
      name: /Request "One More Time"/i
    });
    expect(requestButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Your name/i), 'Avery');
    expect(requestButton).toBeEnabled();
  });
});
