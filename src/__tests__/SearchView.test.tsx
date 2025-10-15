import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { server } from '../test/msw-server';

const searchEndpoint = '/.netlify/functions/search';
const requestEndpoint = '/.netlify/functions/request';

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
    const user = userEvent.setup();

    server.use(
      http.get(searchEndpoint, () => {
        return HttpResponse.json({
          tracks: [
            {
              id: '321',
              title: 'Digital Love',
              artist: 'Daft Punk',
              album: 'Discovery',
              artworkUrl: 'https://example.com/discovery.jpg',
              previewUrl: 'https://example.com/digital-love.m4a'
            }
          ]
        });
      }),
      http.post(requestEndpoint, async ({ request }) => {
        const body = await request.json();
        expect(body.song.id).toBe('321');
        expect(body.song.title).toBe('Digital Love');

        return HttpResponse.json({ message: 'Song request submitted successfully.' });
      })
    );

    render(<App />);

    await user.type(screen.getByLabelText(/Search songs/i), 'digital love');

    const requestButton = await screen.findByRole('button', {
      name: /Request "Digital Love"/i
    });

    await user.click(requestButton);

    expect(
      await screen.findByText(/Request for "Digital Love" sent to the DJ queue./i)
    ).toBeInTheDocument();
  });
});
