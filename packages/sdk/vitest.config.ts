import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The SDK is the layer that finally touches window, document and fetch, so this is
    // the second and last package in the repo that needs a DOM.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
