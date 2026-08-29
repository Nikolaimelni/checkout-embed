import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/bundle.ts'],
    format: ['esm'],
    target: 'es2023',
    sourcemap: true,
    clean: true,
    dts: false,
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  },
  {
    entry: { loader: 'src/loader/loader.ts' },
    format: ['iife'],
    // Older than the rest of the repo on purpose. This file runs before anything else on
    // a merchant's page, on whatever browser their customer turned up with, and it has to
    // survive long enough to report that it cannot help.
    target: 'es2018',
    minify: true,
    sourcemap: true,
    clean: false,
    dts: false,
    outExtension: () => ({ js: '.js' }),
  },
]);
