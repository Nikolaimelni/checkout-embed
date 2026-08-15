import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  sourcemap: true,
  clean: true,
  // Declarations come from tsc, not from tsup. Its dts step bundles its own TypeScript 5.7
  // and crashes against the native TypeScript 7 compiler this workspace uses.
  dts: false,
});
