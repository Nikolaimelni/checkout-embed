/**
 * A receiver you can point WEBHOOK_URL at to watch deliveries arrive and see the signature
 * check pass or fail with your own eyes. Reads the raw bytes rather than a parsed body,
 * because the signature covers what was sent and not what JSON.parse made of it.
 *
 *   node scripts/webhook-receiver.ts [port]
 *   WEBHOOK_URL=http://localhost:4100/hooks pnpm dev
 */
import { createServer } from 'node:http';
import { env } from '../src/env.ts';
import { SIGNATURE_HEADER, verifySignature } from '../src/webhooks/signature.ts';

const port = Number(process.argv[2] ?? 4100);

if (!Number.isSafeInteger(port) || port <= 0) {
  process.stderr.write(`Not a port: ${process.argv[2]}\n`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];

  request.on('data', (chunk: Buffer) => chunks.push(chunk));

  request.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    const header = request.headers[SIGNATURE_HEADER];
    const signature = Array.isArray(header) ? (header[0] ?? '') : (header ?? '');

    const valid = verifySignature(signature, raw, env.WEBHOOK_SECRET, {
      nowSeconds: Math.floor(Date.now() / 1_000),
    });

    process.stdout.write(
      [
        `${valid ? 'signature ok  ' : 'SIGNATURE BAD '} ${request.method} ${request.url}`,
        `  ${SIGNATURE_HEADER}: ${signature || '(none)'}`,
        `  ${raw}`,
        '',
      ].join('\n'),
    );

    // A receiver that answers anything other than 2xx is telling the provider to retry,
    // which is exactly what you want to try out here.
    response.writeHead(valid ? 200 : 400).end();
  });
});

server.listen(port, () => {
  process.stdout.write(`webhook receiver listening on http://localhost:${port}\n`);
});
