import { describeIssues, IntegritySchema, SecureUrlSchema } from '@checkout-embed/contracts';
import { z } from 'zod';

const DEV_WEBHOOK_SECRET = 'development-webhook-secret-do-not-ship';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default('./data/mock-psp.db'),
  WIDGET_BUNDLE_URL: SecureUrlSchema.default('http://localhost:5174/sdk/bundle.js'),
  WIDGET_BUNDLE_INTEGRITY: IntegritySchema.optional(),
  PUBLIC_BASE_URL: SecureUrlSchema.default('http://localhost:4000'),
  WEBHOOK_URL: SecureUrlSchema.optional(),
  WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
  MERCHANT_KEYS: z.string().min(1).default('mk_test_acme'),
  ALLOWED_ORIGINS: z.string().min(1).default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof EnvSchema> & {
  readonly merchantKeys: readonly string[];
  readonly allowedOrigins: readonly string[] | '*';
};

export function loadEnv(source: Readonly<Record<string, string | undefined>>): Env {
  const parsed = EnvSchema.safeParse(source);

  if (!parsed.success) {
    const detail = describeIssues(parsed.error).map((line) => `  ${line}`);
    throw new Error(`Environment is not usable:\n${detail.join('\n')}`);
  }

  const production = parsed.data.NODE_ENV === 'production';

  if (production && parsed.data.WEBHOOK_SECRET === DEV_WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET still holds the development default. Set a real one.');
  }

  const anyOrigin = parsed.data.ALLOWED_ORIGINS.trim() === '*';
  if (production && anyOrigin) {
    throw new Error('ALLOWED_ORIGINS is * in production. List the merchant origins instead.');
  }

  const list = (value: string): readonly string[] =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

  const origins = anyOrigin ? [] : list(parsed.data.ALLOWED_ORIGINS);
  // cors compares the Origin header as a string, so a slash or a path would never match
  const malformed = origins.filter((origin) => !isOrigin(origin));
  if (malformed.length > 0) {
    throw new Error(`ALLOWED_ORIGINS has entries that are not origins: ${malformed.join(', ')}`);
  }

  return {
    ...parsed.data,
    merchantKeys: list(parsed.data.MERCHANT_KEYS),
    allowedOrigins: anyOrigin ? '*' : origins,
  };
}

function isOrigin(value: string): boolean {
  return URL.canParse(value) && new URL(value).origin === value;
}

export const env = loadEnv(process.env);
