import { devices, type PlaywrightTestConfig } from '@playwright/test';

export const PSP = 'http://localhost:4000';
export const PLAIN = 'http://localhost:5174';
export const NEXT = 'http://localhost:5175';

export const base: PlaywrightTestConfig = {
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    trace: 'on-first-retry',
    baseURL: PLAIN,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

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
