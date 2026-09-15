import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Patterns rather than a list of names: react/jsx-runtime and react/compiler-runtime are
// subpaths, and a library that bundles either one ships a second copy of React's internals
// and reaches into them at runtime.
const externals = [/^react($|\/)/, /^react-dom($|\/)/, /^@checkout-embed\//, 'zod'];

export default defineConfig({
  // Vite rather than tsup for this package alone: the React Compiler needs a transform
  // step, and tsup's esbuild has nowhere to put one.
  plugins: [react({ compiler: true })],
  build: {
    target: 'es2023',
    sourcemap: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: externals },
  },
  test: {
    // jsdom here and in the SDK, and nowhere below them: core and contracts run in node,
    // which is the arrangement the whole architecture is built around.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/testing/setup.ts'],
  },
});
