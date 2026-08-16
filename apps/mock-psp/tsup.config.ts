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
  // The workspace package goes into the bundle: a deploy artifact that needs a pnpm
  // workspace on the other end is not an artifact.
  noExternal: ['@checkout-embed/contracts'],
});
