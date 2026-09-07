import { defineConfig } from '@playwright/test';
import { base } from './playwright.base.ts';

export default defineConfig({ ...base, testMatch: /capture\.spec\.ts/, retries: 0 });
