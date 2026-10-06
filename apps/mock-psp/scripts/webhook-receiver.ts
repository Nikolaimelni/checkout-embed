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

    response.writeHead(valid ? 200 : 400).end();
  });
});

server.listen(port, () => {
  process.stdout.write(`webhook receiver listening on http://localhost:${port}\n`);
});
