import { defineConfig, devices } from '@playwright/test';

const webUrl = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm start --hostname 127.0.0.1 --port 3100',
    url: `${webUrl}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: 'http://localhost:4100/v1',
      NEXT_PUBLIC_OIDC_ISSUER: 'http://localhost:4400',
      NEXT_PUBLIC_OIDC_CLIENT_ID: 'learnmap-e2e',
      NEXT_PUBLIC_OIDC_AUDIENCE: 'learnmap-api',
      NEXT_PUBLIC_OIDC_REDIRECT_URI: `${webUrl}/en/auth/callback`,
    },
  },
});
