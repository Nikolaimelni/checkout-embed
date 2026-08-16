import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each suite opens its own in-memory database, but they share the migration files
    // on disk, and SQLite is happier when nobody races to read them.
    fileParallelism: false,
  },
});
