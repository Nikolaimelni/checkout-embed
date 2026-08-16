import express, { Router } from 'express';
import { validate, validated } from '../http/validate.ts';
import { type IntentParams, IntentParamsSchema } from '../payments/dto.ts';
import type { PaymentsService } from '../payments/service.ts';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

const STYLE = `
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center;
         min-height: 100vh; background: #f4f6f4; color: #141a17; }
  main { background: #fff; border: 1px solid #d9ddd8; padding: 28px 32px; max-width: 380px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p { color: #48514c; margin: 0 0 18px; }
  code { font-family: ui-monospace, monospace; font-size: 12px; color: #79837c; }
  .row { display: flex; gap: 10px; }
  button { font: inherit; padding: 9px 16px; border: 1px solid #0e6b57; cursor: pointer; }
  button.approve { background: #0e6b57; color: #fff; }
  button.reject { background: #fff; color: #96261c; border-color: #96261c; }
`;

function page(title: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body>
</html>`;
}

/**
 * The page a real provider would serve inside the 3DS iframe. It posts a result to the
 * opener so the widget can react without waiting for its next poll; the poll is still the
 * source of truth, because a message from an iframe is a hint and not a receipt.
 */
export function threeDsRouter(service: PaymentsService): Router {
  const router = Router();

  router.use((_request, response, next) => {
    // This page exists to be framed by a merchant. The service-wide headers say the
    // opposite, so they are replaced here rather than loosened everywhere. A real provider
    // would name the origins registered against the merchant key instead of allowing all.
    response.removeHeader('X-Frame-Options');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors *",
    );
    next();
  });

  router.get('/:id', validate({ params: IntentParamsSchema }), (_request, response) => {
    const { params } = validated<unknown, IntentParams>(response);
    const id = escapeHtml(params.id);

    response.type('html').send(
      page(
        'Confirm your payment',
        `<h1>Confirm your payment</h1>
         <p>Your bank would ask for a code here. This one asks for a click.</p>
         <p><code>${id}</code></p>
         <form method="post" action="/3ds/${id}/complete" class="row">
           <button class="approve" name="approved" value="yes" type="submit">Approve</button>
           <button class="reject" name="approved" value="no" type="submit">Reject</button>
         </form>`,
      ),
    );
  });

  router.post(
    '/:id/complete',
    express.urlencoded({ extended: false }),
    validate({ params: IntentParamsSchema }),
    async (request, response) => {
      const { params } = validated<unknown, IntentParams>(response);
      const approved = (request.body as { approved?: unknown }).approved === 'yes';

      const intent = await service.completeChallenge(params.id, approved);

      // The target origin is '*' because a mock provider does not know the merchant's
      // domains. A real one pins it to the origins registered against the merchant key.
      const message = JSON.stringify({
        source: 'checkout-embed-3ds',
        intentId: intent.id,
        approved,
      });

      response.type('html').send(
        page(
          approved ? 'Approved' : 'Declined',
          `<h1>${approved ? 'Approved' : 'Declined'}</h1>
           <p>${approved ? 'You can close this window.' : 'The payment was not authorised.'}</p>`,
          `try { parent.postMessage(${message}, '*'); } catch (error) {}`,
        ),
      );
    },
  );

  return router;
}
