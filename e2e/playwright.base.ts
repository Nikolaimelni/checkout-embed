import { devices, type PlaywrightTestConfig } from '@playwright/test';

export const PSP = 'http://localhost:4000';
export const PLAIN = 'http://localhost:5174';
export const NEXT = 'http://localhost:5175';

/**
 * Shared by the check run and the capture run. Both need the same three processes; they
 * differ only in which files they look at.
 */
export const base: PlaywrightTestConfig = {
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  // github writes annotations and nothing else, so the html report goes alongside it:
  // without a file on disk there is nothing for CI to upload when a run fails.
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    trace: 'on-first-retry',
    baseURL: PLAIN,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // One provider and two host pages, because the interesting failures are the ones that
  // only appear when the widget is on somebody else's origin.
  webServer: [
    {
      command: 'node src/http/server.ts',
      cwd: '../apps/mock-psp',
      url: `${PSP}/healthz`,
      reuseExistingServer: !process.env['CI'],
      env: {
        PORT: '4000',
        DATABASE_URL: ':memory:',
        PUBLIC_BASE_URL: PSP,
        // The same file as data-bundle on the page, with a marker only this route hands out,
        // so a test can tell the resolved address from the fallback.
        WIDGET_BUNDLE_URL: `${PLAIN}/sdk/bundle.js?from=config`,
        ALLOWED_ORIGINS: `${PLAIN},${NEXT}`,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm dev',
      cwd: '../apps/demo-host-plain',
      url: PLAIN,
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: 'pnpm dev',
      cwd: '../apps/demo-host-next',
      url: NEXT,
      reuseExistingServer: !process.env['CI'],
      env: { PSP_URL: PSP },
    },
  ],
};
