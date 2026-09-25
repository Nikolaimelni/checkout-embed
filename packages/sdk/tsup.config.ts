import { defineConfig } from 'tsup';

const REACT = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];

export default defineConfig([
  {
    // For anyone installing from npm. React stays a peer dependency, because a library
    // that ships its own copy gives the host page two Reacts and one very confusing bug.
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'es2023',
    sourcemap: true,
    clean: true,
    dts: false,
    external: REACT,
  },
  {
    // For the browser. A module script cannot resolve a bare specifier, so this one carries
    // everything it needs and is the only build where bundling React is the right answer.
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
    // Older than the rest: this runs first on any browser a shopper has, and has to live long
    // enough to warn that it cannot help.
    target: 'es2018',
    minify: true,
    sourcemap: true,
    clean: false,
    dts: false,
    outExtension: () => ({ js: '.js' }),
  },
]);
