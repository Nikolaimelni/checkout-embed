import { defineConfig } from 'tsup';

const REACT = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2023',
    sourcemap: true,
    clean: true,
    // tsup's dts step bundles TypeScript 5.7 and fails on 7, so tsc writes the .d.ts
    dts: false,
    external: REACT,
  },
  {
    entry: { bundle: 'src/bundle.ts' },
    format: ['esm'],
    target: 'es2020',
    sourcemap: true,
    clean: false,
    minify: true,
    dts: false,
    noExternal: [/.*/],
    define: { 'process.env.NODE_ENV': '"production"' },
  },
  {
    entry: { loader: 'src/loader/loader.ts' },
    format: ['iife'],
    // older than the rest: the loader has to run on whatever browser shows up
    target: 'es2018',
    minify: true,
    sourcemap: true,
    clean: false,
    dts: false,
    outExtension: () => ({ js: '.js' }),
  },
]);
