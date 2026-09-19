import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/http/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  dts: false,
  // tsup strips the node: prefix by default, for the benefit of bundlers that predate it.
  // node:sqlite is only reachable with the prefix, so a stripped import resolves to a
  // package called sqlite that does not exist and the bundle dies on its first line.
  removeNodeProtocol: false,
  // Everything goes into the bundle, the workspace package included, so the image runs it
  // without installing anything: the versions are the ones the lockfile resolved, and no
  // dependency gets to run an install script on the way in.
  noExternal: [/.*/],
  // Express and friends are CommonJS and call require() for node builtins. An ESM bundle has
  // no require of its own, so it gets a real one.
  banner: {
    js: "import { createRequire as bannerRequire } from 'node:module'; const require = bannerRequire(import.meta.url);",
  },
});
