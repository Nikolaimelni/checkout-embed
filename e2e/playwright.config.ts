import { defineConfig } from '@playwright/test';
import { base } from './playwright.base.ts';

export default defineConfig({ ...base, testIgnore: /capture\.spec\.ts/ });
