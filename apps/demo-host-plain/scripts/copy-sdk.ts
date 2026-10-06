import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const sdkDist = join(
  dirname(createRequire(import.meta.url).resolve('@checkout-embed/sdk/package.json')),
  'dist',
);
const target = join(process.cwd(), 'public', 'sdk');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

for (const file of ['loader.js', 'loader.js.map', 'bundle.js', 'bundle.js.map']) {
  copyFileSync(join(sdkDist, file), join(target, file));
}

process.stdout.write(`sdk copied from ${sdkDist}\n`);
