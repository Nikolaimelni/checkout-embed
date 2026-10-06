import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/http/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  dts: false,
  // otherwise node:sqlite turns into a package called sqlite
  removeNodeProtocol: false,
  noExternal: [/.*/],
  // express is CommonJS and calls require() for node builtins
  banner: {
    js: "import { createRequire as bannerRequire } from 'node:module'; const require = bannerRequire(import.meta.url);",
  },
});
