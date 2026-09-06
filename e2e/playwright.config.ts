import { defineConfig, devices } from '@playwright/test';

const PSP = 'http://localhost:4000';
const PLAIN = 'http://localhost:5174';
const NEXT = 'http://localhost:5175';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',

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
        WIDGET_BUNDLE_URL: `${PLAIN}/sdk/bundle.js`,
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
      env: { NEXT_PUBLIC_PSP_URL: PSP },
    },
  ],
});
