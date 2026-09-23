import { describeIssues, IntegritySchema, SecureUrlSchema } from '@checkout-embed/contracts';
import { z } from 'zod';

/**
 * Obvious enough that nobody will mistake it for a real one, and long enough to pass the
 * schema. Production refuses to boot with it.
 */
const DEV_WEBHOOK_SECRET = 'development-webhook-secret-do-not-ship';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** A file path, or :memory: for a database that dies with the process. */
  DATABASE_URL: z.string().min(1).default('./data/mock-psp.db'),
  /** Where the loader is told to fetch the widget bundle from: the plain demo serves it. */
  WIDGET_BUNDLE_URL: SecureUrlSchema.default('http://localhost:5174/sdk/bundle.js'),
  /** sha384-... of that file. Unset means the loader takes the bundle unpinned. */
  WIDGET_BUNDLE_INTEGRITY: IntegritySchema.optional(),
  /** Used to build absolute 3DS challenge links, which have to work inside an iframe. */
  PUBLIC_BASE_URL: SecureUrlSchema.default('http://localhost:4000'),
  /** Unset means webhook deliveries are recorded and never sent. */
  WEBHOOK_URL: SecureUrlSchema.optional(),
  WEBHOOK_SECRET: z.string().min(16).default(DEV_WEBHOOK_SECRET),
  /** Comma separated. A key outside this list gets a 404 from the config route. */
  MERCHANT_KEYS: z.string().min(1).default('mk_test_acme'),
  /** Comma separated origins, or * to answer anyone. An embedded checkout is always
   * cross origin, so this is not optional in the way it is for a normal API. */
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
  // cors compares the Origin header as a string, so a trailing slash or a path would
  // quietly match nothing.
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
