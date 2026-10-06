import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react({ compiler: true })],
  // Relative, because GitHub Pages serves the bench under /<repository>/ rather than at /.
  base: './',
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
