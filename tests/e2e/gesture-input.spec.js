import { expect, test } from '@playwright/test';

async function installFakeGestureAdapter(page) {
  await page.addInitScript(() => {
    window.__HAND_CRICKET_GESTURE_TEST_FACTORY__ = (options) => {
      let active = false;
      let armed = true;
      let submissions = 0;
      const baseState = {
        status: 'READY',
        cameraStatus: 'GRANTED',
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
        destroy() {
          active = false;
        },
      };
    };
  });
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

test('every bundled MobileNet asset is available locally in production', async ({
  page,
}) => {
  const externalRequests = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(hostname))
      externalRequests.push(request.url());
  });
  await page.goto('/');
  const assetResult = await page.evaluate(async () => {
    const modelResponse = await fetch('/assets/models/mobilenet/model.json');
    const model = await modelResponse.json();
    const paths = model.weightsManifest.flatMap((group) => group.paths);
    const responses = await Promise.all(
      paths.map((path) => fetch(`/assets/models/mobilenet/${path}`)),
    );
    return {
      modelOk: modelResponse.ok,
      shardCount: paths.length,
      allShardsOk: responses.every((response) => response.ok),
    };
  });
  expect(assetResult).toEqual({
    modelOk: true,
    shardCount: 55,
    allShardsOk: true,
  });
  expect(externalRequests).toEqual([]);
});

test('real TensorFlow loader stays local and reports pending calibration', async ({
  page,
}) => {
  const externalRequests = [];
  const modelRequests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
    if (url.pathname.startsWith('/assets/models/mobilenet/')) {
      modelRequests.push(url.pathname);
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: /start game/i }).click();
  await page.getByRole('button', { name: /^odd/i }).click();
  await page.getByRole('button', { name: 'Camera' }).click();
  await page.getByRole('button', { name: /enable camera/i }).click();

  await expect(page.getByText(/calibration is pending/i)).toBeVisible({
    timeout: 20_000,
  });
  expect(modelRequests).toContain('/assets/models/mobilenet/model.json');
  expect(modelRequests).toHaveLength(56);
  expect(externalRequests).toEqual([]);
});
