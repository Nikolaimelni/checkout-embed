import { describe, expect, it } from 'vitest';
import { TRIGGERS } from '../payments/triggers.ts';
import { buildOpenApiDocument } from './document.ts';

const document = buildOpenApiDocument('http://psp.test') as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, Record<string, unknown>> };
  info: { description: string };
};

describe('buildOpenApiDocument', () => {
  it.each([
    '/v1/payment-intents',
    '/v1/payment-intents/{id}',
    '/v1/payment-intents/{id}/confirm',
    '/v1/config/{merchantKey}',
    '/healthz',
  ])('documents %s', (path) => {
    expect(document.paths[path]).toBeDefined();
  });

  it('derives the schemas from Zod rather than restating them', () => {
    const intent = document.components.schemas['PaymentIntent'] ?? {};
    const properties = intent['properties'] as Record<string, unknown>;

    expect(intent).toMatchObject({ type: 'object' });
    expect(properties['status']).toBeDefined();
  });

  it('carries no $schema key, which OpenAPI does not want inside components', () => {
    for (const schema of Object.values(document.components.schemas)) {
      expect(schema['$schema']).toBeUndefined();
    }
  });

  it('lists every trigger amount, so the docs cannot drift from the behaviour', () => {
    for (const trigger of TRIGGERS) {
      expect(document.info.description).toContain((trigger.amountMinor / 100).toFixed(2));
      expect(document.info.description).toContain(trigger.outcome);
    }
  });
});
