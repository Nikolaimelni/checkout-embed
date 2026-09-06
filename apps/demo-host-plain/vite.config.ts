import { defineConfig } from 'vite';

export default defineConfig({
  // Nothing to compile. The page is HTML and the SDK arrives as a built file, which is
  // the whole point of this host.
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
