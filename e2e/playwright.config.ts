import { defineConfig } from '@playwright/test';
import { base } from './playwright.base.ts';

// The capture run writes the README's images rather than checking anything, so it is left
// out of this one and asked for by name.
export default defineConfig({ ...base, testIgnore: /capture\.spec\.ts/ });
