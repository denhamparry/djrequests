import { test, expect } from '@playwright/test';

test('smoke: user can search and prepare a song request', async ({ page }) => {
  await page.route('**/.netlify/functions/search**', async (route, request) => {
    const url = new URL(request.url());
    if (url.searchParams.get('term') !== 'digital love') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tracks: [], message: 'No songs found.' })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
      })
    });
  });

  await page.route('**/.netlify/functions/request**', async (route, request) => {
    expect(request.method()).toBe('POST');
    const body = request.postDataJSON();
    expect(body.song.id).toBe('321');
    expect(body.song.title).toBe('Digital Love');

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Song request submitted successfully.' })
    });
  });

  await page.goto('/');

  await page.fill('input[aria-label="Search songs"]', 'digital love');
  await page.waitForTimeout(400);

  const resultCard = page.getByRole('listitem').filter({ hasText: 'Digital Love' });
  await expect(resultCard).toBeVisible();
  await expect(resultCard.getByText('Daft Punk • Discovery')).toBeVisible();

  await page.getByRole('button', { name: 'Request "Digital Love"' }).click();

  await expect(
    page.getByText('Request for "Digital Love" sent to the DJ queue.')
  ).toBeVisible();
});
