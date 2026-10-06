import { createDatabase } from '../db/client.ts';
import { applyMigrations } from '../db/migrate.ts';
import { env } from '../env.ts';
import { createRootLogger } from '../observability/context.ts';
import { createIntentRepository } from '../payments/repository.ts';
import { createPaymentsService } from '../payments/service.ts';
import { createWebhookDispatcher } from '../webhooks/dispatcher.ts';
import { createWebhookQueue } from '../webhooks/queue.ts';
import { createApp } from './app.ts';

const DRAIN_TIMEOUT_MS = 10_000;

const logger = createRootLogger(env.LOG_LEVEL);
const database = createDatabase(env.DATABASE_URL);

await applyMigrations(database);

const webhooks = createWebhookQueue(database.db);
const payments = createPaymentsService({
  repository: createIntentRepository(database.db),
  webhooks,
  publicBaseUrl: env.PUBLIC_BASE_URL,
});

const dispatcher = createWebhookDispatcher({
  queue: webhooks,
  secret: env.WEBHOOK_SECRET,
  url: env.WEBHOOK_URL,
  logger,
});

const app = createApp({
  database,
  payments,
  logger,
  merchantKeys: env.merchantKeys,
  bundleUrl: env.WIDGET_BUNDLE_URL,
  bundleIntegrity: env.WIDGET_BUNDLE_INTEGRITY,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  allowedOrigins: env.allowedOrigins,
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, docs: `${env.PUBLIC_BASE_URL}/docs` }, 'mock psp listening');
});

dispatcher.start();

const settler = setInterval(() => {
  void payments.settleDue().catch((cause: unknown) => {
    logger.error({ err: cause }, 'settling due intents failed');
  });
}, 1_000);
settler.unref();

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  clearInterval(settler);
  dispatcher.stop();

  const forced = setTimeout(() => {
    logger.warn('drain timed out, closing remaining connections');
    server.closeAllConnections();
  }, DRAIN_TIMEOUT_MS);
  forced.unref();

  server.close((cause) => {
    clearTimeout(forced);
    if (cause) logger.error({ err: cause }, 'the server did not close cleanly');
    database.close();
    process.exit(cause ? 1 : 0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
