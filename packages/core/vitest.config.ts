import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node, not jsdom: core must not touch the DOM
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
