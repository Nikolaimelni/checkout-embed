import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// regexes, so react/jsx-runtime and react/compiler-runtime stay external too
const externals = [/^react($|\/)/, /^react-dom($|\/)/, /^@checkout-embed\//, 'zod'];

export default defineConfig({
  plugins: [react({ compiler: true })],
  build: {
    target: 'es2023',
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: externals },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/testing/setup.ts'],
  },
});
