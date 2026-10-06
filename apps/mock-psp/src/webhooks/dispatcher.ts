import type { Logger } from 'pino';
import { backoffFor } from './backoff.ts';
import type { WebhookQueue } from './queue.ts';
import { SIGNATURE_HEADER, signPayload } from './signature.ts';

export type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export type DispatcherOptions = {
  readonly queue: WebhookQueue;
  readonly secret: string;
  readonly logger: Logger;
  readonly url?: string | undefined;
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly fetcher?: Fetcher;
  readonly now?: () => number;
};

export type WebhookDispatcher = {
  tick(): Promise<{ delivered: number; failed: number }>;
  start(): void;
  stop(): void;
};

export function createWebhookDispatcher(options: DispatcherOptions): WebhookDispatcher {
  const { queue, secret, logger, url } = options;
  const intervalMs = options.intervalMs ?? 1_000;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetcher = options.fetcher ?? ((target, init) => fetch(target, init));
  const now = options.now ?? Date.now;

  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function deliver(
    delivery: { id: string; payload: string; attempts: number; event: string },
    at: number,
  ): Promise<boolean> {
    if (!url) return false;

    const signature = signPayload(delivery.payload, secret, Math.floor(at / 1_000));

    try {
      const response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signature },
        body: delivery.payload,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        await queue.markDelivered(delivery.id, at);
        return true;
      }

      await retryLater(delivery, `receiver answered ${response.status}`, at);
      return false;
    } catch (cause) {
      await retryLater(delivery, cause instanceof Error ? cause.message : String(cause), at);
      return false;
    }
  }

  async function retryLater(
    delivery: { id: string; attempts: number; event: string },
    reason: string,
    at: number,
  ): Promise<void> {
    const attempts = delivery.attempts + 1;
    const delay = backoffFor(attempts);

    if (delay === null) {
      logger.error({ delivery: delivery.id, attempts, reason }, 'webhook abandoned');
      await queue.abandon(delivery.id, attempts, reason);
      return;
    }

    logger.warn({ delivery: delivery.id, attempts, reason, delay }, 'webhook retry scheduled');
    await queue.reschedule(delivery.id, attempts, reason, at + delay);
  }

  async function tick(): Promise<{ delivered: number; failed: number }> {
    const at = now();
    const batch = await queue.due(at);
    let delivered = 0;
    let failed = 0;

    for (const delivery of batch) {
      if (await deliver(delivery, at)) delivered += 1;
      else failed += 1;
    }

    return { delivered, failed };
  }

  return {
    tick,

    start() {
      if (timer) return;
      if (!url) {
        logger.info('WEBHOOK_URL is unset, deliveries will be recorded and not sent');
        return;
      }

      timer = setInterval(() => {
        if (running) return;
        running = true;
        void tick()
          .catch((cause: unknown) => logger.error({ err: cause }, 'webhook tick failed'))
          .finally(() => {
            running = false;
          });
      }, intervalMs);

      timer.unref();
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
