import { expect, test } from '@playwright/test';

test('plays the functional toss flow without external requests', async ({ page }) => {
  const externalRequests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HAND CRICKET' })).toBeVisible();
  await page.getByRole('radio', { name: /hard/i }).check();
  await page.getByLabel(/your name/i).fill('Campus Player');
  await page.getByRole('button', { name: /start game/i }).click();
  await page.getByRole('button', { name: /^odd/i }).click();

  const numberButtons = page.getByRole('button', { name: /choose number/i });
  await numberButtons.first().click();
  await expect(page.getByText(/computer is choosing/i)).toBeVisible();
  await expect(numberButtons.first()).toBeDisabled();
  await expect(page.getByText(/computer chose/i)).toHaveCount(0);

  await expect(page.getByRole('heading', { name: /toss result/i })).toBeVisible();
  await expect(page.getByText(/won the toss/i)).toBeVisible();
  await page.getByRole('button', { name: /continue/i }).click();

  const batFirst = page.getByRole('button', { name: /bat first/i });
  if (await batFirst.isVisible().catch(() => false)) {
    await expect(page.getByRole('button', { name: /bowl first/i })).toBeVisible();
  } else {
    await expect(page.getByText(/computer is choosing/i)).toBeVisible();
    await expect(page.getByText(/computer chose to/i)).toBeVisible();
    await expect(batFirst).toHaveCount(0);
  }

  expect(externalRequests).toEqual([]);
});
