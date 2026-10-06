import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  sourcemap: true,
  clean: true,
  // tsup's dts step bundles TypeScript 5.7 and fails on 7, so tsc writes the .d.ts
  dts: false,
});
