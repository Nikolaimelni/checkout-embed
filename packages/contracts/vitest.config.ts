import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No jsdom anywhere in this package. If something here needs a DOM, it is in the
    // wrong package.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
