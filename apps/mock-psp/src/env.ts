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
  /** Where the loader is told to fetch the widget bundle from. */
  WIDGET_BUNDLE_URL: z.url().default('http://localhost:5173/checkout.js'),
  /** Used to build absolute 3DS challenge links, which have to work inside an iframe. */
  PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
  /** Unset means webhook deliveries are recorded and never sent. */
  WEBHOOK_URL: z.url().optional(),
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

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment is not usable:\n${detail}`);
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.WEBHOOK_SECRET === DEV_WEBHOOK_SECRET) {
    throw new Error('WEBHOOK_SECRET still holds the development default. Set a real one.');
  }

  const list = (value: string): readonly string[] =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

  return {
    ...parsed.data,
    merchantKeys: list(parsed.data.MERCHANT_KEYS),
    allowedOrigins:
      parsed.data.ALLOWED_ORIGINS.trim() === '*' ? '*' : list(parsed.data.ALLOWED_ORIGINS),
  };
}

export const env = load();
