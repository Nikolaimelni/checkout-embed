import express, { Router } from 'express';
import { validate, validated } from '../http/validate.ts';
import {
  type ChallengeForm,
  ChallengeFormSchema,
  type ChallengeQuery,
  ChallengeQuerySchema,
  type IntentParams,
  IntentParamsSchema,
} from '../payments/dto.ts';
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

/** The page inside the 3DS iframe. Its postMessage only saves the widget a poll. */
export function threeDsRouter(service: PaymentsService): Router {
  const router = Router();

  router.use((_request, response, next) => {
    // Framed by merchant pages, so the service-wide headers are replaced here. A real
    // provider would list the merchant's origins instead of *.
    response.removeHeader('X-Frame-Options');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors *",
    );
    next();
  });

  router.get(
    '/:id',
    validate({ params: IntentParamsSchema, query: ChallengeQuerySchema }),
    async (_request, response) => {
      const { params, query } = validated<unknown, IntentParams, ChallengeQuery>(response);
      await service.openChallenge(params.id, query.token);
      const id = escapeHtml(params.id);

      // The token goes back in the form body, so the POST that moves the payment needs it too.
      response.type('html').send(
        page(
          'Confirm your payment',
          `<h1>Confirm your payment</h1>
         <p>Your bank would ask for a code here. This one asks for a click.</p>
         <p><code>${id}</code></p>
         <form method="post" action="/3ds/${id}/complete" class="row">
           <input type="hidden" name="token" value="${escapeHtml(query.token)}">
           <button class="approve" name="approved" value="yes" type="submit">Approve</button>
           <button class="reject" name="approved" value="no" type="submit">Reject</button>
         </form>`,
        ),
      );
    },
  );

  router.post(
    '/:id/complete',
    express.urlencoded({ extended: false, limit: '1kb' }),
    validate({ params: IntentParamsSchema, body: ChallengeFormSchema }),
    async (_request, response) => {
      const { params, body } = validated<ChallengeForm, IntentParams>(response);
      const approved = body.approved === 'yes';

      const intent = await service.completeChallenge(params.id, body.token, approved);

      // '*' because the mock does not know merchant domains. A real provider pins it.
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
