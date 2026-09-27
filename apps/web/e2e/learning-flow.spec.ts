import { expect, test, type Page } from '@playwright/test';

const ANALYSIS_ID = 'cm12345678901234567890123';
const VIDEO_ID = 'dQw4w9WgXcQ';

const completedAnalysis = {
  id: ANALYSIS_ID,
  youtubeVideoId: VIDEO_ID,
  youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  videoTitle: 'مقدمة في التعلّم الآلي',
  channelTitle: 'المعلّم التجريبي',
  thumbnailUrl: `https://i.ytimg.com/vi/${VIDEO_ID}/hqdefault.jpg`,
  durationSeconds: 600,
  outputLanguage: 'ar',
  detectedLanguage: 'ar',
  status: 'COMPLETED',
  progress: 100,
  summary: {
    overview: 'يشرح الدرس أساسيات التعلّم الآلي بطريقة مبسطة.',
    learningObjectives: ['فهم الفكرة الأساسية للتعلّم الآلي.'],
    mainIdeas: [
      {
        title: 'البيانات والنماذج',
        explanation: 'يتعلّم النموذج الأنماط من البيانات.',
        timestampSeconds: 42,
      },
    ],
    keyTakeaways: ['جودة البيانات تؤثر في جودة النتائج.'],
    glossary: [{ term: 'Model', definition: 'نموذج يتعلّم الأنماط من البيانات.' }],
  },
  mindMap: {
    nodes: [
      {
        id: 'root',
        parentId: null,
        title: 'التعلّم الآلي',
        explanation: 'الموضوع الرئيسي للدرس.',
        timestampSeconds: null,
        type: 'root',
        directlySupported: true,
      },
      {
        id: 'foundations',
        parentId: 'root',
        title: 'الأساسيات',
        explanation: 'البيانات والنماذج هما أساس عملية التعلّم.',
        timestampSeconds: 42,
        type: 'topic',
        directlySupported: true,
      },
    ],
  },
  errorCode: null,
  errorMessage: null,
  createdAt: '2026-09-05T00:00:00.000Z',
  completedAt: '2026-09-05T00:01:00.000Z',
} as const;

async function installDeterministicBackends(page: Page): Promise<void> {
  let analysisReads = 0;
  await page.addInitScript(() => {
    const calls: Array<{ action: string; seconds?: number }> = [];
    const browser = window as typeof window & {
      __learnmapPlayerCalls: typeof calls;
      YT: {
        Player: new (
          element: HTMLElement,
          options: { events?: { onReady?: () => void } },
        ) => {
          seekTo: (seconds: number) => void;
          playVideo: () => void;
          destroy: () => void;
        };
      };
    };
    browser.__learnmapPlayerCalls = calls;
    browser.YT = {
      Player: class {
        constructor(
          _element: HTMLElement,
          options: { events?: { onReady?: () => void } },
        ) {
          setTimeout(() => options.events?.onReady?.(), 0);
        }
        seekTo(seconds: number) {
          calls.push({ action: 'seek', seconds });
        }
        playVideo() {
          calls.push({ action: 'play' });
        }
        destroy() {}
      },
    };
  });

  await page.route('http://localhost:4400/**', async (route) => {
    const url = new URL(route.request().url());
    const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100' };
    if (url.pathname === '/.well-known/openid-configuration') {
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({
          issuer: 'http://localhost:4400',
          authorization_endpoint: 'http://localhost:4400/authorize',
          token_endpoint: 'http://localhost:4400/token',
        }),
      });
      return;
    }
    if (url.pathname === '/authorize') {
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      const state = url.searchParams.get('state');
      await route.fulfill({
        status: 302,
        headers: {
          Location: `http://127.0.0.1:3100/en/auth/callback?code=e2e-code&state=${encodeURIComponent(state ?? '')}`,
        },
      });
      return;
    }
    if (url.pathname === '/token') {
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'e2e-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.route('http://localhost:4100/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/v1/analyses') {
      expect(request.headers().authorization).toBe('Bearer e2e-access-token');
      expect(request.postDataJSON()).toEqual({
        youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
        outputLanguage: 'ar',
      });
      await route.fulfill({
        status: 202,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ id: ANALYSIS_ID, status: 'QUEUED' }),
      });
      return;
    }
    if (request.method() === 'GET' && url.pathname === '/v1/analyses') {
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }
    if (request.method() === 'GET' && url.pathname === `/v1/analyses/${ANALYSIS_ID}`) {
      analysisReads += 1;
      const active =
        analysisReads === 1
          ? {
              ...completedAnalysis,
              status: 'QUEUED',
              progress: 10,
              summary: null,
              mindMap: null,
              completedAt: null,
            }
          : analysisReads === 2
            ? {
                ...completedAnalysis,
                status: 'PROCESSING',
                progress: 25,
                summary: null,
                mindMap: null,
                completedAt: null,
              }
            : completedAnalysis;
      await route.fulfill({
        status: 200,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(active),
      });
      return;
    }
    await route.fulfill({ status: 404, headers, body: '{}' });
  });
}

test('signed-in learner completes the bilingual mocked analysis journey', async ({
  page,
}) => {
  await installDeterministicBackends(page);
  await page.goto('/en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/en\/auth\/callback/);
  // The OIDC client callback exchange has focused unit coverage. The browser suite injects the
  // fake provider's deterministic session at the application origin and continues the UI flow.
  await page.evaluate(() => {
    window.sessionStorage.setItem(
      'learnmap-oidc-session',
      JSON.stringify({
        accessToken: 'e2e-access-token',
        expiresAt: Date.now() + 3_600_000,
      }),
    );
  });
  await page.goto('/en');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  await page
    .getByLabel('YouTube video URL')
    .fill(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  await page.getByLabel('Analysis output language').selectOption('ar');
  await page.getByRole('button', { name: 'Analyze video' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/analyses/${ANALYSIS_ID}$`));
  await expect(page.getByText('Validating video', { exact: true })).toBeVisible();
  await expect(page.getByText(completedAnalysis.summary.overview)).toBeVisible({
    timeout: 10_000,
  });

  const root = page.getByRole('button', { name: /التعلّم الآلي/ });
  const topic = page.getByRole('button', { name: /الأساسيات/ });
  await expect(root).toHaveAttribute('dir', 'rtl');
  await topic.focus();
  await topic.press('Enter');
  await expect(page.getByText('البيانات والنماذج هما أساس عملية التعلّم.')).toBeVisible();
  await page.getByRole('button', { name: /Watch from approximately 0:42/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __learnmapPlayerCalls?: unknown[] })
            .__learnmapPlayerCalls?.length ?? 0,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __learnmapPlayerCalls?: unknown[] })
          .__learnmapPlayerCalls,
    ),
  ).toEqual([{ action: 'seek', seconds: 42 }, { action: 'play' }]);

  const rootBox = await root.boundingBox();
  const topicBox = await topic.boundingBox();
  expect(rootBox).not.toBeNull();
  expect(topicBox).not.toBeNull();
  expect(topicBox!.x).toBeLessThan(rootBox!.x);

  await page.getByRole('button', { name: 'Switch the interface to Arabic' }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/analyses/${ANALYSIS_ID}$`));
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('heading', { name: 'الخريطة الذهنية التفاعلية' }),
  ).toBeVisible();
});
