import { expect, test } from '@playwright/test';

async function installFakeGestureAdapter(page, { needsCalibration = false } = {}) {
  await page.addInitScript(
    ({ calibrationRequired }) => {
      window.__HAND_CRICKET_GESTURE_TEST_FACTORY__ = (options) => {
        let active = false;
        let armed = true;
        let submissions = 0;
        const baseState = {
          status: 'READY',
          cameraStatus: 'GRANTED',
          calibrationStatus: calibrationRequired ? 'BACKGROUND_REQUIRED' : 'READY',
          rawLabel: null,
          confidence: 0,
          stableLabel: null,
          candidateLabel: null,
          holdProgress: 0,
          cooldown: false,
          error: null,
          lastSubmittedValue: null,
        };
        window.__gestureTest = {
          feedStable(value) {
            if (!active || !armed) return false;
            for (let frame = 1; frame <= 10; frame += 1) {
              options.onStateChange({
                ...baseState,
                rawLabel: String(value),
                candidateLabel: String(value),
                confidence: 0.95,
                holdProgress: frame / 10,
              });
            }
            const accepted = options.onSubmit(value, String(value));
            if (accepted !== false) {
              submissions += 1;
              armed = false;
              options.onStateChange({
                ...baseState,
                cooldown: true,
                lastSubmittedValue: value,
              });
            }
            return accepted;
          },
          removeHand() {
            armed = true;
            options.onStateChange({ ...baseState, rawLabel: 'NO_HAND' });
          },
          get submissions() {
            return submissions;
          },
        };
        return {
          enable() {
            options.onStateChange(baseState);
            return Promise.resolve(true);
          },
          setActive(value) {
            active = value;
          },
          calibrateBackground() {
            options.onStateChange({ ...baseState, calibrationStatus: 'PALM_REQUIRED' });
            return Promise.resolve(true);
          },
          calibratePalm() {
            options.onStateChange({ ...baseState, calibrationStatus: 'READY' });
            return Promise.resolve(true);
          },
          recalibrate() {
            options.onStateChange({
              ...baseState,
              calibrationStatus: 'BACKGROUND_REQUIRED',
            });
          },
          destroy() {
            active = false;
          },
        };
      };
    },
    { calibrationRequired: needsCalibration },
  );
}

test('camera adapter submits once, requires removal, and returns to buttons offline', async ({
  page,
}) => {
  const externalRequests = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname))
      externalRequests.push(request.url());
  });
  await installFakeGestureAdapter(page);
  await page.goto('/');
  await page.getByRole('button', { name: /start game/i }).click();
  await page.getByRole('button', { name: /^odd/i }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await expect(page.getByText(/processed locally/i)).toBeVisible();
  await expect(page.getByText(/wrist at bottom/i)).toBeVisible();
  await page.getByRole('button', { name: /enable camera/i }).click();

  await page.evaluate(() => window.__gestureTest.feedStable(3));
  await expect(page.getByText(/computer is choosing/i)).toBeVisible();
  await page.evaluate(() => window.__gestureTest.feedStable(3));
  expect(await page.evaluate(() => window.__gestureTest.submissions)).toBe(1);

  await page.getByRole('button', { name: 'Buttons', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Buttons', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: /toss result/i })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('camera mode completes background and palm calibration before play', async ({
  page,
}) => {
  await installFakeGestureAdapter(page, { needsCalibration: true });
  await page.goto('/');
  await page.getByRole('button', { name: /start game/i }).click();
  await page.getByRole('button', { name: /^odd/i }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await page.getByRole('button', { name: /enable camera/i }).click();

  await expect(page.getByText(/Step 1 of 2: empty background/i)).toBeVisible();
  await page.getByRole('button', { name: /capture background/i }).click();
  await expect(page.getByText(/Step 2 of 2: open palm/i)).toBeVisible();
  await page.getByRole('button', { name: /capture open palm/i }).click();

  await expect(
    page.getByRole('progressbar', { name: /gesture hold progress/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /recalibrate/i })).toBeVisible();
});
