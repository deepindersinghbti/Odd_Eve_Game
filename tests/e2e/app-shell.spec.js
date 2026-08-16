import { expect, test } from '@playwright/test';

test('shows the Phase 0 application shell without external requests', async ({
  page,
}) => {
  const externalRequests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'HAND CRICKET' })).toBeVisible();
  await expect(page.getByText('You vs Computer')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Game setup coming next');
  expect(externalRequests).toEqual([]);
});
