import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import express, { Router } from 'express';
import { buildOpenApiDocument } from './document.ts';

// The package has no exports map, so resolving its manifest is the stable way to find the
// static assets without importing anything from it.
const SWAGGER_UI_PATH = dirname(
  createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'),
);

const INIT_SCRIPT = `
window.ui = SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger',
  deepLinking: true,
  presets: [SwaggerUIBundle.presets.apis],
  layout: 'BaseLayout',
});
`;

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock PSP API</title>
<link rel="stylesheet" href="/docs/static/swagger-ui.css">
</head>
<body>
<div id="swagger"></div>
<script src="/docs/static/swagger-ui-bundle.js"></script>
<script src="/docs/init.js"></script>
</body>
</html>`;

export function docsRouter(publicBaseUrl: string): Router {
  const router = Router();
  const document = buildOpenApiDocument(publicBaseUrl);

  router.use((_request, response, next) => {
    // Swagger UI writes styles into the document as it renders, so this one page needs
    // inline styles. It gets them here rather than the whole service getting them.
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
    );
    next();
  });

  router.get('/openapi.json', (_request, response) => {
    response.json(document);
  });

  router.get('/docs', (_request, response) => {
    response.type('html').send(PAGE);
  });

  router.get('/docs/init.js', (_request, response) => {
    // A file rather than an inline script, so the page needs no script-src exception.
    response.type('js').send(INIT_SCRIPT);
  });

  router.use('/docs/static', express.static(SWAGGER_UI_PATH, { index: false }));

  return router;
}
