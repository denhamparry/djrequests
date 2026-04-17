import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Stub HTMLMediaElement.play/pause so Chromium's autoplay policy and the
    // absence of real audio data do not flake the smoke test.
    HTMLMediaElement.prototype.play = function () {
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      this.dispatchEvent(new Event('pause'));
    };
  });
});

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
    expect(body.requester.name).toBe('Avery');
    expect(body.requester.requestType).toBe('karaoke');

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

  const requestButton = page.getByRole('button', { name: 'Request "Digital Love"' });
  await expect(requestButton).toBeDisabled();

  await page.fill('input[aria-label="Your name"]', 'Avery');

  const songRadio = page.getByRole('radio', { name: 'Song' });
  const karaokeRadio = page.getByRole('radio', { name: 'Karaoke' });
  await expect(songRadio).toBeChecked();
  await expect(karaokeRadio).not.toBeChecked();
  await karaokeRadio.check();
  await expect(karaokeRadio).toBeChecked();

  const previewButton = page.getByRole('button', {
    name: 'Preview Digital Love by Daft Punk'
  });
  await expect(previewButton).toHaveAttribute('aria-pressed', 'false');
  await previewButton.click();
  await expect(previewButton).toHaveAttribute('aria-pressed', 'true');
  await previewButton.click();
  await expect(previewButton).toHaveAttribute('aria-pressed', 'false');

  await requestButton.click();

  await expect(
    page.getByText('Request for "Digital Love" sent to the DJ queue.')
  ).toBeVisible();
});

test('persists the requester name across reloads and supports clear', async ({
  page
}) => {
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
            previewUrl: null
          }
        ]
      })
    });
  });

  await page.route('**/.netlify/functions/request**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Song request submitted successfully.' })
    })
  );

  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const nameInput = page.getByLabel('Your name');
  await nameInput.fill('Avery');
  await page.fill('input[aria-label="Search songs"]', 'digital love');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Request "Digital Love"' }).click();
  await expect(
    page.getByText('Request for "Digital Love" sent to the DJ queue.')
  ).toBeVisible();

  await page.reload();
  await expect(nameInput).toHaveValue('Avery');

  const clearButton = page.getByRole('button', { name: 'Not you? Clear' });
  await expect(clearButton).toBeVisible();
  await clearButton.click();
  await expect(nameInput).toHaveValue('');
  await expect(clearButton).toBeHidden();

  await page.reload();
  await expect(nameInput).toHaveValue('');
});
