import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node, not jsdom: nothing here may need a DOM
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
