import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  sourcemap: true,
  clean: true,
  external: ['@checkout-embed/contracts'],
  // Declarations come from tsc. See the note in the contracts package.
  dts: false,
});
