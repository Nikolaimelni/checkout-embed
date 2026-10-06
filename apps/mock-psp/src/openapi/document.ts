import { PaymentIntentSchema, RemoteWidgetConfigSchema } from '@checkout-embed/contracts';
import { z } from 'zod';
import {
  ApiErrorBodySchema,
  ConfirmIntentBodySchema,
  CreateIntentBodySchema,
} from '../payments/dto.ts';
import { TRIGGERS } from '../payments/triggers.ts';

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType<unknown>, io: 'input' | 'output'): JsonSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
  }) as JsonSchema;
  void $schema;
  return rest;
}

function triggerTable(): string {
  const rows = TRIGGERS.map(
    ({ amountMinor, outcome }) => `| ${(amountMinor / 100).toFixed(2)} | \`${outcome}\` |`,
  ).join('\n');

  return `| Amount | Outcome |\n| --- | --- |\n${rows}`;
}

const bearer = [{ bearerAuth: [] as string[] }];

const idempotencyKey = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: { type: 'string', maxLength: 255 },
};

const intentId = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

const jsonBody = (schema: JsonSchema) => ({ content: { 'application/json': { schema } } });

export function buildOpenApiDocument(publicBaseUrl: string): Record<string, unknown> {
  const errorBody = jsonSchema(ApiErrorBodySchema, 'output');
  const intent = jsonSchema(PaymentIntentSchema, 'output');

  const errors = (codes: readonly number[]) =>
    Object.fromEntries(
      codes.map((code) => [String(code), { description: describe(code), ...jsonBody(errorBody) }]),
    );

  return {
    openapi: '3.1.0',
    info: {
      title: 'Mock PSP',
      version: '1.0.0',
      description: [
        'A payment provider that behaves like a real one on the paths an embedded checkout',
        'actually walks: idempotent creation, a 3DS challenge, polling, and signed webhooks.',
        '',
        'The outcome of a payment is chosen by its amount, so a demo can be steered:',
        '',
        triggerTable(),
        '',
        'Any other amount succeeds.',
      ].join('\n'),
    },
    servers: [{ url: publicBaseUrl }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas: {
        PaymentIntent: intent,
        CreateIntentBody: jsonSchema(CreateIntentBodySchema, 'input'),
        ConfirmIntentBody: jsonSchema(ConfirmIntentBodySchema, 'input'),
        RemoteWidgetConfig: jsonSchema(RemoteWidgetConfigSchema, 'output'),
        ApiError: errorBody,
      },
    },
    paths: {
      '/v1/payment-intents': {
        post: {
          summary: 'Create a payment intent',
          description:
            'Requires an Idempotency-Key. The same key with the same body replays the original intent and answers 200; the same key with a different body, or from another bearer token, answers 409. A merchant key that is not registered answers 404. The intent belongs to the bearer token that created it, and any other token gets 404 on it.',
          security: bearer,
          parameters: [idempotencyKey],
          requestBody: {
            required: true,
            ...jsonBody({ $ref: '#/components/schemas/CreateIntentBody' }),
          },
          responses: {
            '201': {
              description: 'Created',
              ...jsonBody({ $ref: '#/components/schemas/PaymentIntent' }),
            },
            '200': {
              description: 'Replay of an earlier request with the same key',
              ...jsonBody({ $ref: '#/components/schemas/PaymentIntent' }),
            },
            ...errors([400, 401, 404, 409]),
          },
        },
      },
      '/v1/payment-intents/{id}': {
        get: {
          summary: 'Read a payment intent',
          description: 'A processing intent settles here once its delay has passed.',
          security: bearer,
          parameters: [intentId],
          responses: {
            '200': {
              description: 'The intent',
              ...jsonBody({ $ref: '#/components/schemas/PaymentIntent' }),
            },
            ...errors([401, 404]),
          },
        },
      },
      '/v1/payment-intents/{id}/confirm': {
        post: {
          summary: 'Confirm a payment intent',
          description:
            'Moves the intent out of requires_confirmation. Depending on the trigger amount the answer is requires_action with a challenge link, processing, or failed. Requires an Idempotency-Key: the same key again answers with the intent as it stands, a different key on an intent already confirmed answers 409.',
          security: bearer,
          parameters: [intentId, idempotencyKey],
          requestBody: {
            required: true,
            ...jsonBody({ $ref: '#/components/schemas/ConfirmIntentBody' }),
          },
          responses: {
            '200': {
              description: 'The intent',
              ...jsonBody({ $ref: '#/components/schemas/PaymentIntent' }),
            },
            ...errors([400, 401, 404, 409]),
          },
        },
      },
      '/v1/config/{merchantKey}': {
        get: {
          summary: 'Resolve the widget configuration for a merchant',
          description:
            'What the loader asks for before it fetches a bundle. This is the hook that lets a fix ship without every merchant redeploying.',
          parameters: [
            { name: 'merchantKey', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'The configuration',
              ...jsonBody({ $ref: '#/components/schemas/RemoteWidgetConfig' }),
            },
            ...errors([404]),
          },
        },
      },
      '/healthz': {
        get: {
          summary: 'Liveness and database check',
          responses: {
            '200': {
              description: 'The database answered',
              ...jsonBody({
                type: 'object',
                properties: { status: { const: 'ok' }, database: { const: 'up' } },
              }),
            },
            '503': { description: 'The database did not answer', ...jsonBody(errorBody) },
          },
        },
      },
    },
  };
}

function describe(status: number): string {
  switch (status) {
    case 400:
      return 'The request did not validate';
    case 401:
      return 'No bearer token';
    case 404:
      return 'No such resource';
    case 409:
      return 'The request conflicts with the current state';
    default:
      return 'Error';
  }
}
